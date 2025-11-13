const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { supabaseAdmin } = require('./config/supabase');

// Import shared encryption utilities
const { encrypt, decrypt } = require('./utils/encryption');

// Import validation utilities
const {
  validateConversationId,
  validateMessageContent,
  sanitizeMessageContent
} = require('./utils/chatValidation');

// Store active users and their socket connections
const activeUsers = new Map(); // userId -> Set of socketIds
const socketToUser = new Map(); // socketId -> { userId, role, conversationIds }

// Rate limiting: track message sending per user
const messageRateLimit = new Map(); // userId -> { count, resetTime }
const MAX_MESSAGES_PER_MINUTE = 30; // Prevent spam
const RATE_LIMIT_WINDOW = 60000; // 1 minute

// Helper function to check rate limit
function checkRateLimit(userId) {
  const now = Date.now();
  const userLimit = messageRateLimit.get(userId);
  
  if (!userLimit || now > userLimit.resetTime) {
    // Reset or initialize
    messageRateLimit.set(userId, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return { allowed: true };
  }
  
  if (userLimit.count >= MAX_MESSAGES_PER_MINUTE) {
    return { allowed: false, resetTime: userLimit.resetTime };
  }
  
  userLimit.count++;
  return { allowed: true };
}

function initializeSocket(server) {
  const io = new Server(server, {
    cors: {
      origin: [
        process.env.FRONTEND_URL || 'http://localhost:5173',
        'https://elegant-pothos-5c2a00.netlify.app',
        'https://wenzetiindaku-frontend-8z159plbu-ccubenetvix-techs-projects.vercel.app',
        'https://wenze-tii-ndaku.netlify.app',
        'https://wenzetiindaku-marketplace.netlify.app',
        'http://localhost:5173',
        'http://localhost:3000',
        'https://wenzetiindaku.vercel.app',
      ],
      credentials: true,
      methods: ['GET', 'POST']
    },
    transports: ['websocket', 'polling']
  });

  // Authentication middleware for Socket.io
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];
      
      if (!token) {
        return next(new Error('Authentication token required'));
      }

      // Verify JWT token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      if (decoded.role === 'admin') {
        socket.user = {
          id: decoded.adminId || 'admin',
          email: 'wenzetiindaku@gmail.com',
          role: 'admin'
        };
      } else {
        // Get user from database
        const userId = decoded.userId || decoded.adminId;
        const { data: user, error } = await supabaseAdmin
          .from(decoded.role === 'vendor' ? 'vendors' : 'customers')
          .select('*')
          .eq('id', userId)
          .single();

        if (error || !user) {
          return next(new Error('Invalid token or user not found'));
        }

        socket.user = {
          id: user.id,
          email: user.email || user.business_email,
          role: decoded.role,
          ...user
        };
      }

      next();
    } catch (error) {
      console.error('Socket authentication error:', error);
      next(new Error('Authentication failed'));
    }
  });

  io.on('connection', (socket) => {
    const { id: userId, role } = socket.user;
    
    console.log(`User connected: ${userId} (${role})`);

    // Track active user
    if (!activeUsers.has(userId)) {
      activeUsers.set(userId, new Set());
    }
    activeUsers.get(userId).add(socket.id);
    socketToUser.set(socket.id, { userId, role, conversationIds: new Set() });

    // Join user's room for notifications
    socket.join(`user:${userId}`);

    // Handle joining a conversation
    socket.on('join_conversation', async (data) => {
      try {
        // Validate input
        if (!data || typeof data !== 'object') {
          socket.emit('error', { message: 'Invalid request data' });
          return;
        }

        const { conversationId } = data;
        
        // Validate conversation ID
        const convIdValidation = validateConversationId(conversationId);
        if (!convIdValidation.valid) {
          socket.emit('error', { message: convIdValidation.error });
          return;
        }

        const timeout = 10000; // 10 second timeout

        // Verify user has access to this conversation
        let conversation;
        try {
          const convPromise = supabaseAdmin
            .from('conversations')
            .select('*')
            .eq('id', conversationId)
            .single();
          
          const result = await Promise.race([
            convPromise,
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Database query timeout')), timeout)
            )
          ]);
          
          const { data: convData, error } = result;

          if (error || !convData) {
            socket.emit('error', { message: 'Conversation not found' });
            return;
          }

          conversation = convData;
        } catch (timeoutError) {
          console.error('Database query timeout:', timeoutError);
          socket.emit('error', { message: 'Request timeout. Please try again.' });
          return;
        }

        // Security check: ensure user is part of this conversation
        if (role === 'customer' && conversation.customer_id !== userId) {
          socket.emit('error', { message: 'Access denied' });
          return;
        }

        if (role === 'vendor' && conversation.vendor_id !== userId) {
          socket.emit('error', { message: 'Access denied' });
          return;
        }

        // Join conversation room
        socket.join(`conversation:${conversationId}`);
        const userData = socketToUser.get(socket.id);
        if (userData) {
          userData.conversationIds.add(conversationId);
        }

        socket.emit('joined_conversation', { conversationId });
        console.log(`User ${userId} joined conversation ${conversationId}`);
      } catch (error) {
        console.error('Error joining conversation:', error);
        socket.emit('error', { 
          message: error.message || 'Failed to join conversation. Please try again.' 
        });
      }
    });

    // Handle leaving a conversation
    socket.on('leave_conversation', (data) => {
      try {
        if (!data || typeof data !== 'object') {
          return; // Silently fail for invalid data
        }

        const { conversationId } = data;
        
        // Basic validation
        if (!conversationId || typeof conversationId !== 'string') {
          return;
        }

        socket.leave(`conversation:${conversationId}`);
        const userData = socketToUser.get(socket.id);
        if (userData) {
          userData.conversationIds.delete(conversationId);
        }
        socket.emit('left_conversation', { conversationId });
      } catch (error) {
        console.error('Error leaving conversation:', error);
        // Silently fail - this is not critical
      }
    });

    // Handle sending a message
    socket.on('send_message', async (data) => {
      try {
        // Validate input data
        if (!data || typeof data !== 'object') {
          socket.emit('error', { message: 'Invalid message data format' });
          return;
        }

        const { conversationId, content } = data;

        // Validate conversation ID
        const convIdValidation = validateConversationId(conversationId);
        if (!convIdValidation.valid) {
          socket.emit('error', { message: convIdValidation.error });
          return;
        }

        // Validate message content
        const contentValidation = validateMessageContent(content);
        if (!contentValidation.valid) {
          socket.emit('error', { message: contentValidation.error });
          return;
        }

        // Check rate limit
        const rateLimitCheck = checkRateLimit(userId);
        if (!rateLimitCheck.allowed) {
          const waitTime = Math.ceil((rateLimitCheck.resetTime - Date.now()) / 1000);
          socket.emit('error', { 
            message: `Rate limit exceeded. Please wait ${waitTime} seconds before sending more messages.` 
          });
          return;
        }

        const timeout = 10000; // 10 second timeout

        // Verify user has access to this conversation
        let conversation;
        try {
          const convPromise = supabaseAdmin
            .from('conversations')
            .select('*')
            .eq('id', conversationId)
            .single();
          
          const result = await Promise.race([
            convPromise,
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Database query timeout')), timeout)
            )
          ]);
          
          const { data: convData, error: convError } = result;

          if (convError || !convData) {
            socket.emit('error', { message: 'Conversation not found' });
            return;
          }

          conversation = convData;
        } catch (timeoutError) {
          console.error('Database query timeout:', timeoutError);
          socket.emit('error', { message: 'Request timeout. Please try again.' });
          return;
        }

        // Security check
        if (role === 'customer' && conversation.customer_id !== userId) {
          socket.emit('error', { message: 'Access denied' });
          return;
        }

        if (role === 'vendor' && conversation.vendor_id !== userId) {
          socket.emit('error', { message: 'Access denied' });
          return;
        }

        // Sanitize content
        const sanitizedContent = sanitizeMessageContent(content);

        // Encrypt message (with compression if enabled) with timeout
        let encrypted, hash, isCompressed;
        try {
          const encryptionResult = await Promise.race([
            encrypt(sanitizedContent),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Encryption timeout')), 5000)
            )
          ]);
          
          encrypted = encryptionResult.encrypted;
          hash = encryptionResult.hash;
          isCompressed = encryptionResult.isCompressed || false;
        } catch (encryptionError) {
          console.error('Encryption error:', encryptionError);
          socket.emit('error', { message: 'Failed to encrypt message. Please try again.' });
          return;
        }

        if (!encrypted || !hash) {
          socket.emit('error', { message: 'Failed to encrypt message' });
          return;
        }

        // Save message to database with timeout
        let message;
        try {
          const msgPromise = supabaseAdmin
            .from('messages')
            .insert({
              conversation_id: conversationId,
              sender_id: userId,
              sender_role: role,
              encrypted_content: encrypted,
              content_hash: hash,
              is_compressed: isCompressed
            })
            .select()
            .single();

          const result = await Promise.race([
            msgPromise,
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Database query timeout')), timeout)
            )
          ]);
          
          const { data: msgData, error: msgError } = result;

          if (msgError) {
            console.error('Error saving message:', msgError);
            socket.emit('error', { message: 'Failed to save message. Please try again.' });
            return;
          }

          if (!msgData || !msgData.id) {
            socket.emit('error', { message: 'Failed to save message' });
            return;
          }

          message = msgData;
        } catch (timeoutError) {
          console.error('Database query timeout:', timeoutError);
          socket.emit('error', { message: 'Request timeout. Please try again.' });
          return;
        }

        // Prepare message for clients (decrypted)
        const messageData = {
          id: message.id,
          content: sanitizedContent,
          senderId: message.sender_id || userId,
          senderRole: message.sender_role || role,
          isRead: Boolean(message.is_read),
          readAt: message.read_at || null,
          createdAt: message.created_at || new Date().toISOString()
        };

        // Emit to all users in the conversation room
        io.to(`conversation:${conversationId}`).emit('new_message', {
          conversationId,
          message: messageData
        });

        // Update conversation list for both users
        io.to(`user:${conversation.customer_id}`).emit('conversation_updated', {
          conversationId
        });
        io.to(`user:${conversation.vendor_id}`).emit('conversation_updated', {
          conversationId
        });

        console.log(`Message sent in conversation ${conversationId} by ${userId}`);
      } catch (error) {
        console.error('Error sending message:', error);
        socket.emit('error', { 
          message: error.message || 'Failed to send message. Please try again.' 
        });
      }
    });

    // Handle marking messages as read
    socket.on('mark_read', async (data) => {
      try {
        // Validate input
        if (!data || typeof data !== 'object') {
          return; // Silently fail for invalid data
        }

        const { conversationId } = data;

        // Validate conversation ID
        const convIdValidation = validateConversationId(conversationId);
        if (!convIdValidation.valid) {
          return; // Silently fail for invalid conversation ID
        }

        const timeout = 10000; // 10 second timeout

        // Verify access
        let conversation;
        try {
          const convPromise = supabaseAdmin
            .from('conversations')
            .select('*')
            .eq('id', conversationId)
            .single();
          
          const result = await Promise.race([
            convPromise,
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Database query timeout')), timeout)
            )
          ]);
          
          const { data: convData } = result;

          if (!convData) return;

          conversation = convData;
        } catch (timeoutError) {
          console.error('Database query timeout in mark_read:', timeoutError);
          return; // Silently fail on timeout
        }

        // Security check
        if (role === 'customer' && conversation.customer_id !== userId) return;
        if (role === 'vendor' && conversation.vendor_id !== userId) return;

        // Mark all unread messages from the other party as read
        const otherPartyRole = role === 'customer' ? 'vendor' : 'customer';

        try {
          await Promise.race([
            supabaseAdmin
              .from('messages')
              .update({
                is_read: true,
                read_at: new Date().toISOString()
              })
              .eq('conversation_id', conversationId)
              .eq('sender_role', otherPartyRole)
              .eq('is_read', false),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Database query timeout')), timeout)
            )
          ]);
        } catch (updateError) {
          console.error('Error updating read status:', updateError);
          return; // Silently fail
        }

        // Notify other user that messages were read
        const otherUserId = role === 'customer' ? conversation.vendor_id : conversation.customer_id;
        io.to(`user:${otherUserId}`).emit('messages_read', {
          conversationId
        });
      } catch (error) {
        console.error('Error marking messages as read:', error);
        // Silently fail - this is not critical
      }
    });

    // Handle disconnection
    socket.on('disconnect', (reason) => {
      console.log(`User disconnected: ${userId} (reason: ${reason})`);
      
      try {
        const userData = socketToUser.get(socket.id);
        if (userData) {
          // Remove socket from user's active connections
          const userSockets = activeUsers.get(userId);
          if (userSockets) {
            userSockets.delete(socket.id);
            if (userSockets.size === 0) {
              activeUsers.delete(userId);
              // Clean up rate limit data if user has no active connections
              messageRateLimit.delete(userId);
            }
          }
          socketToUser.delete(socket.id);
        }
      } catch (error) {
        console.error('Error during disconnect cleanup:', error);
      }
    });
  });

  return io;
}

module.exports = { initializeSocket };

