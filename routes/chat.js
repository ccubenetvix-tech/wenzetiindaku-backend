const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { supabaseAdmin } = require('../config/supabase');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// Import validation and error handling utilities
const {
  validateConversationId,
  validateMessageContent,
  validateVendorId,
  validateMessageId,
  sanitizeMessageContent,
  isValidRole
} = require('../utils/chatValidation');

const {
  handleDatabaseError,
  handleEncryptionError,
  handleValidationError,
  createErrorResponse
} = require('../utils/chatErrorHandler');

// Handle OPTIONS requests for CORS preflight
router.options('*', (req, res) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.sendStatus(200);
});

// Apply authentication middleware to all routes
router.use(authenticateToken);

// Import shared encryption utilities
const { encrypt, decrypt } = require('../utils/encryption');

/**
 * @route   GET /api/chat/conversations
 * @desc    Get all conversations for the current user
 * @access  Private (Customer or Vendor)
 */
router.get('/conversations', async (req, res) => {
  try {
    const { id, role } = req.user;
    
    // Validate role
    if (!isValidRole(role)) {
      const { status, response } = createErrorResponse(403, 'Invalid role for chat access');
      return res.status(status).json(response);
    }
    
    // Validate user ID
    if (!id || typeof id !== 'string') {
      const { status, response } = createErrorResponse(400, 'Invalid user ID');
      return res.status(status).json(response);
    }
    
    let conversations;
    const timeout = 10000; // 10 second timeout
    
    try {
      if (role === 'customer') {
        // Get conversations for customer - fetch conversations first, then get vendor details
        const convPromise = supabaseAdmin
          .from('conversations')
          .select('*')
          .eq('customer_id', id)
          .order('last_message_at', { ascending: false, nullsFirst: false });
        
        const { data: convs, error: convError } = await Promise.race([
          convPromise,
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Database query timeout')), timeout)
          )
        ]);
        
        if (convError) {
          console.error('Error fetching customer conversations:', convError);
          const { status, response } = handleDatabaseError(convError);
          return res.status(status).json(response);
        }
        
        // Fetch vendor details for each conversation with error handling
        conversations = await Promise.allSettled((convs || []).map(async (conv) => {
          try {
            const { data: vendor, error: vendorError } = await supabaseAdmin
              .from('vendors')
              .select('id, business_name, business_email')
              .eq('id', conv.vendor_id)
              .single();
            
            if (vendorError || !vendor) {
              console.warn(`Error fetching vendor ${conv.vendor_id}:`, vendorError);
              return { ...conv, vendor: null };
            }
            
            return { ...conv, vendor };
          } catch (error) {
            console.error(`Error processing conversation ${conv.id}:`, error);
            return { ...conv, vendor: null };
          }
        })).then(results => 
          results.map(result => result.status === 'fulfilled' ? result.value : null)
            .filter(conv => conv !== null)
        );
      } else if (role === 'vendor') {
        // Get conversations for vendor - fetch conversations first, then get customer details
        const convPromise = supabaseAdmin
          .from('conversations')
          .select('*')
          .eq('vendor_id', id)
          .order('last_message_at', { ascending: false, nullsFirst: false });
        
        const { data: convs, error: convError } = await Promise.race([
          convPromise,
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Database query timeout')), timeout)
          )
        ]);
        
        if (convError) {
          console.error('Error fetching vendor conversations:', convError);
          const { status, response } = handleDatabaseError(convError);
          return res.status(status).json(response);
        }
        
        // Fetch customer details for each conversation with error handling
        conversations = await Promise.allSettled((convs || []).map(async (conv) => {
          try {
            const { data: customer, error: customerError } = await supabaseAdmin
              .from('customers')
              .select('id, first_name, last_name, email, profile_photo')
              .eq('id', conv.customer_id)
              .single();
            
            if (customerError || !customer) {
              console.warn(`Error fetching customer ${conv.customer_id}:`, customerError);
              return { ...conv, customer: null };
            }
            
            return { ...conv, customer };
          } catch (error) {
            console.error(`Error processing conversation ${conv.id}:`, error);
            return { ...conv, customer: null };
          }
        })).then(results => 
          results.map(result => result.status === 'fulfilled' ? result.value : null)
            .filter(conv => conv !== null)
        );
      }
    } catch (timeoutError) {
      console.error('Database query timeout:', timeoutError);
      const { status, response } = createErrorResponse(504, 'Request timeout. Please try again.');
      return res.status(status).json(response);
    }
    
    // Format conversations with null safety
    const formattedConversations = (conversations || []).map(conv => {
      if (!conv) return null;
      
      try {
        if (role === 'customer') {
          // For customers, show vendor info
          if (!conv.vendor || !conv.vendor.id) {
            console.warn('Conversation missing vendor data:', conv.id);
            return null;
          }
          return {
            id: conv.id,
            otherParty: {
              id: conv.vendor.id,
              name: (conv.vendor.business_name || 'Unknown Vendor').trim(),
              email: (conv.vendor.business_email || '').trim(),
              profilePhoto: null
            },
            unreadCount: Math.max(0, conv.customer_unread_count || 0),
            lastMessageAt: conv.last_message_at || null,
            createdAt: conv.created_at || new Date().toISOString(),
            updatedAt: conv.updated_at || new Date().toISOString()
          };
        } else {
          // For vendors, show customer info
          if (!conv.customer || !conv.customer.id) {
            console.warn('Conversation missing customer data:', conv.id);
            return null;
          }
          const fullName = `${conv.customer.first_name || ''} ${conv.customer.last_name || ''}`.trim();
          return {
            id: conv.id,
            otherParty: {
              id: conv.customer.id,
              name: fullName || (conv.customer.email || 'Unknown Customer').trim(),
              email: (conv.customer.email || '').trim(),
              profilePhoto: conv.customer.profile_photo || null
            },
            unreadCount: Math.max(0, conv.vendor_unread_count || 0),
            lastMessageAt: conv.last_message_at || null,
            createdAt: conv.created_at || new Date().toISOString(),
            updatedAt: conv.updated_at || new Date().toISOString()
          };
        }
      } catch (formatError) {
        console.error(`Error formatting conversation ${conv.id}:`, formatError);
        return null;
      }
    }).filter(conv => conv !== null);
    
    res.json({
      success: true,
      data: { conversations: formattedConversations || [] }
    });
  } catch (error) {
    console.error('Get conversations error:', error);
    const { status, response } = handleDatabaseError(error);
    res.status(status).json(response);
  }
});

/**
 * @route   GET /api/chat/conversations/:conversationId/messages
 * @desc    Get messages for a specific conversation
 * @access  Private (Customer or Vendor)
 */
router.get('/conversations/:conversationId/messages', async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { id, role } = req.user;
    
    // Validate conversation ID
    const convIdValidation = validateConversationId(conversationId);
    if (!convIdValidation.valid) {
      const { status, response } = createErrorResponse(400, convIdValidation.error);
      return res.status(status).json(response);
    }
    
    // Validate user ID and role
    if (!id || typeof id !== 'string' || !isValidRole(role)) {
      const { status, response } = createErrorResponse(400, 'Invalid user credentials');
      return res.status(status).json(response);
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
      
      const { data, error: convError } = result;
      
      if (convError || !data) {
        const { status, response } = createErrorResponse(404, 'Conversation not found');
        return res.status(status).json(response);
      }
      
      conversation = data;
    } catch (timeoutError) {
      console.error('Database query timeout:', timeoutError);
      const { status, response } = createErrorResponse(504, 'Request timeout. Please try again.');
      return res.status(status).json(response);
    }
    
    // Security check: ensure user is part of this conversation
    if (role === 'customer' && conversation.customer_id !== id) {
      const { status, response } = createErrorResponse(403, 'Access denied');
      return res.status(status).json(response);
    }
    
    if (role === 'vendor' && conversation.vendor_id !== id) {
      const { status, response } = createErrorResponse(403, 'Access denied');
      return res.status(status).json(response);
    }
    
    // Get messages with timeout
    let messages;
    try {
      const msgPromise = supabaseAdmin
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })
        .limit(1000); // Limit to prevent huge responses
      
      const result = await Promise.race([
        msgPromise,
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Database query timeout')), timeout)
        )
      ]);
      
      const { data, error: msgError } = result;
      
      if (msgError) {
        const { status, response } = handleDatabaseError(msgError);
        return res.status(status).json(response);
      }
      
      messages = data || [];
    } catch (timeoutError) {
      console.error('Database query timeout:', timeoutError);
      const { status, response } = createErrorResponse(504, 'Request timeout. Please try again.');
      return res.status(status).json(response);
    }
    
    // Decrypt messages (async for compression support) with error handling
    const decryptedMessages = await Promise.allSettled(messages.map(async (msg) => {
      try {
        // Validate message structure
        if (!msg || !msg.id) {
          console.warn('Invalid message structure:', msg);
          return null;
        }
        
        // Skip decryption if encrypted_content is null or empty
        if (!msg.encrypted_content || typeof msg.encrypted_content !== 'string') {
          console.warn(`Message ${msg.id} has no encrypted content`);
          return {
            id: msg.id,
            content: '[Message content missing]',
            senderId: msg.sender_id || '',
            senderRole: (msg.sender_role === 'customer' || msg.sender_role === 'vendor') ? msg.sender_role : 'customer',
            isRead: Boolean(msg.is_read),
            readAt: msg.read_at || null,
            createdAt: msg.created_at || new Date().toISOString(),
            _error: true
          };
        }
        
        // Decrypt with timeout
        const decryptedContent = await Promise.race([
          decrypt(msg.encrypted_content),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Decryption timeout')), 5000)
          )
        ]);
        
        return {
          id: msg.id,
          content: typeof decryptedContent === 'string' ? decryptedContent : '[Decryption failed]',
          senderId: msg.sender_id || '',
          senderRole: (msg.sender_role === 'customer' || msg.sender_role === 'vendor') ? msg.sender_role : 'customer',
          isRead: Boolean(msg.is_read),
          readAt: msg.read_at || null,
          createdAt: msg.created_at || new Date().toISOString()
        };
      } catch (error) {
        console.error(`Decryption error for message ${msg?.id}:`, error.message);
        // Return message with error indicator - this happens for old messages encrypted with random key
        return {
          id: msg?.id || 'unknown',
          content: '[This message was encrypted with an old key and cannot be decrypted]',
          senderId: msg?.sender_id || '',
          senderRole: (msg?.sender_role === 'customer' || msg?.sender_role === 'vendor') ? msg.sender_role : 'customer',
          isRead: Boolean(msg?.is_read),
          readAt: msg?.read_at || null,
          createdAt: msg?.created_at || new Date().toISOString(),
          _decryptionError: true
        };
      }
    })).then(results => 
      results
        .map(result => result.status === 'fulfilled' ? result.value : null)
        .filter(msg => msg !== null)
    );
    
    res.json({
      success: true,
      data: { messages: decryptedMessages || [] }
    });
  } catch (error) {
    console.error('Get messages error:', error);
    const { status, response } = handleDatabaseError(error);
    res.status(status).json(response);
  }
});

/**
 * @route   POST /api/chat/conversations
 * @desc    Create a new conversation (only customers can initiate)
 * @access  Private (Customer only)
 */
router.post('/conversations', requireRole(['customer']), async (req, res) => {
  try {
    const { vendorId } = req.body;
    const { id: customerId } = req.user;
    
    // Validate customer ID
    if (!customerId || typeof customerId !== 'string') {
      const { status, response } = createErrorResponse(400, 'Invalid customer ID');
      return res.status(status).json(response);
    }
    
    // Validate vendor ID
    const vendorIdValidation = validateVendorId(vendorId);
    if (!vendorIdValidation.valid) {
      const { status, response } = createErrorResponse(400, vendorIdValidation.error);
      return res.status(status).json(response);
    }
    
    // Prevent self-conversation (customer can't chat with themselves)
    if (customerId === vendorId) {
      const { status, response } = createErrorResponse(400, 'Cannot create conversation with yourself');
      return res.status(status).json(response);
    }
    
    const timeout = 10000; // 10 second timeout
    
    // Verify vendor exists
    let vendor;
    try {
      const vendorPromise = supabaseAdmin
        .from('vendors')
        .select('id, approved, verified')
        .eq('id', vendorId)
        .single();
      
      const result = await Promise.race([
        vendorPromise,
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Database query timeout')), timeout)
        )
      ]);
      
      const { data, error: vendorError } = result;
      
      if (vendorError || !data) {
        const { status, response } = createErrorResponse(404, 'Vendor not found');
        return res.status(status).json(response);
      }
      
      vendor = data;
    } catch (timeoutError) {
      console.error('Database query timeout:', timeoutError);
      const { status, response } = createErrorResponse(504, 'Request timeout. Please try again.');
      return res.status(status).json(response);
    }
    
    // Check if conversation already exists (with timeout)
    let existingConv;
    try {
      const existingConvPromise = supabaseAdmin
        .from('conversations')
        .select('id')
        .eq('customer_id', customerId)
        .eq('vendor_id', vendorId)
        .single();
      
      const result = await Promise.race([
        existingConvPromise,
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Database query timeout')), timeout)
        )
      ]);
      
      const { data, error } = result;
      // Error is expected if conversation doesn't exist, so we only check for data
      if (data && !error) {
        existingConv = data;
      }
    } catch (timeoutError) {
      console.error('Database query timeout:', timeoutError);
      const { status, response } = createErrorResponse(504, 'Request timeout. Please try again.');
      return res.status(status).json(response);
    }
    
    if (existingConv) {
      return res.json({
        success: true,
        data: { conversationId: existingConv.id }
      });
    }
    
    // Create new conversation with error handling
    try {
      const convPromise = supabaseAdmin
        .from('conversations')
        .insert({
          customer_id: customerId,
          vendor_id: vendorId
        })
        .select()
        .single();
      
      const result = await Promise.race([
        convPromise,
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Database query timeout')), timeout)
        )
      ]);
      
      const { data: conversation, error: convError } = result;
      
      if (convError) {
        // Handle unique constraint violation (race condition)
        if (convError.code === '23505') {
          // Try to fetch the existing conversation
          const { data: existing } = await supabaseAdmin
            .from('conversations')
            .select('id')
            .eq('customer_id', customerId)
            .eq('vendor_id', vendorId)
            .single();
          
          if (existing) {
            return res.json({
              success: true,
              data: { conversationId: existing.id }
            });
          }
        }
        
        const { status, response } = handleDatabaseError(convError);
        return res.status(status).json(response);
      }
      
      if (!conversation || !conversation.id) {
        const { status, response } = createErrorResponse(500, 'Failed to create conversation');
        return res.status(status).json(response);
      }
      
      res.status(201).json({
        success: true,
        data: { conversationId: conversation.id }
      });
    } catch (timeoutError) {
      console.error('Database query timeout:', timeoutError);
      const { status, response } = createErrorResponse(504, 'Request timeout. Please try again.');
      return res.status(status).json(response);
    }
  } catch (error) {
    console.error('Create conversation error:', error);
    const { status, response } = handleDatabaseError(error);
    res.status(status).json(response);
  }
});

/**
 * @route   POST /api/chat/conversations/:conversationId/messages
 * @desc    Send a message in a conversation
 * @access  Private (Customer or Vendor)
 */
router.post('/conversations/:conversationId/messages', async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { content } = req.body;
    const { id, role } = req.user;
    
    // Validate conversation ID
    const convIdValidation = validateConversationId(conversationId);
    if (!convIdValidation.valid) {
      const { status, response } = createErrorResponse(400, convIdValidation.error);
      return res.status(status).json(response);
    }
    
    // Validate message content
    const contentValidation = validateMessageContent(content);
    if (!contentValidation.valid) {
      const { status, response } = createErrorResponse(400, contentValidation.error);
      return res.status(status).json(response);
    }
    
    // Validate user credentials
    if (!id || typeof id !== 'string' || !isValidRole(role)) {
      const { status, response } = createErrorResponse(400, 'Invalid user credentials');
      return res.status(status).json(response);
    }
    
    // Sanitize content
    const sanitizedContent = sanitizeMessageContent(content);
    
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
      
      const { data, error: convError } = result;
      
      if (convError || !data) {
        const { status, response } = createErrorResponse(404, 'Conversation not found');
        return res.status(status).json(response);
      }
      
      conversation = data;
    } catch (timeoutError) {
      console.error('Database query timeout:', timeoutError);
      const { status, response } = createErrorResponse(504, 'Request timeout. Please try again.');
      return res.status(status).json(response);
    }
    
    // Security check: ensure user is part of this conversation
    if (role === 'customer' && conversation.customer_id !== id) {
      const { status, response } = createErrorResponse(403, 'Access denied');
      return res.status(status).json(response);
    }
    
    if (role === 'vendor' && conversation.vendor_id !== id) {
      const { status, response } = createErrorResponse(403, 'Access denied');
      return res.status(status).json(response);
    }
    
    // Encrypt message (with compression if enabled) with error handling
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
      const { status, response } = handleEncryptionError(encryptionError);
      return res.status(status).json(response);
    }
    
    // Validate encryption result
    if (!encrypted || !hash) {
      const { status, response } = createErrorResponse(500, 'Failed to encrypt message');
      return res.status(status).json(response);
    }
    
    // Create message with timeout
    let message;
    try {
      const msgPromise = supabaseAdmin
        .from('messages')
        .insert({
          conversation_id: conversationId,
          sender_id: id,
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
      
      const { data, error: msgError } = result;
      
      if (msgError) {
        const { status, response } = handleDatabaseError(msgError);
        return res.status(status).json(response);
      }
      
      if (!data || !data.id) {
        const { status, response } = createErrorResponse(500, 'Failed to save message');
        return res.status(status).json(response);
      }
      
      message = data;
    } catch (timeoutError) {
      console.error('Database query timeout:', timeoutError);
      const { status, response } = createErrorResponse(504, 'Request timeout. Please try again.');
      return res.status(status).json(response);
    }
    
    // Decrypt for response with error handling
    let decryptedContent;
    try {
      decryptedContent = await Promise.race([
        decrypt(message.encrypted_content),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Decryption timeout')), 5000)
        )
      ]);
    } catch (decryptionError) {
      console.error('Decryption error for response:', decryptionError);
      // Use sanitized content as fallback
      decryptedContent = sanitizedContent;
    }
    
    res.status(201).json({
      success: true,
      data: {
        message: {
          id: message.id,
          content: typeof decryptedContent === 'string' ? decryptedContent : sanitizedContent,
          senderId: message.sender_id || id,
          senderRole: message.sender_role || role,
          isRead: Boolean(message.is_read),
          createdAt: message.created_at || new Date().toISOString()
        }
      }
    });
  } catch (error) {
    console.error('Send message error:', error);
    const { status, response } = handleDatabaseError(error);
    res.status(status).json(response);
  }
});

/**
 * @route   PUT /api/chat/conversations/:conversationId/messages/:messageId/read
 * @desc    Mark a message as read
 * @access  Private (Customer or Vendor)
 */
router.put('/conversations/:conversationId/messages/:messageId/read', async (req, res) => {
  try {
    const { conversationId, messageId } = req.params;
    const { id, role } = req.user;
    
    // Validate inputs
    const convIdValidation = validateConversationId(conversationId);
    if (!convIdValidation.valid) {
      const { status, response } = createErrorResponse(400, convIdValidation.error);
      return res.status(status).json(response);
    }
    
    const msgIdValidation = validateMessageId(messageId);
    if (!msgIdValidation.valid) {
      const { status, response } = createErrorResponse(400, msgIdValidation.error);
      return res.status(status).json(response);
    }
    
    // Validate user credentials
    if (!id || typeof id !== 'string' || !isValidRole(role)) {
      const { status, response } = createErrorResponse(400, 'Invalid user credentials');
      return res.status(status).json(response);
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
      
      const { data, error: convError } = result;
      
      if (convError || !data) {
        const { status, response } = createErrorResponse(404, 'Conversation not found');
        return res.status(status).json(response);
      }
      
      conversation = data;
    } catch (timeoutError) {
      console.error('Database query timeout:', timeoutError);
      const { status, response } = createErrorResponse(504, 'Request timeout. Please try again.');
      return res.status(status).json(response);
    }
    
    // Security check: ensure user is part of this conversation
    if (role === 'customer' && conversation.customer_id !== id) {
      const { status, response } = createErrorResponse(403, 'Access denied');
      return res.status(status).json(response);
    }
    
    if (role === 'vendor' && conversation.vendor_id !== id) {
      const { status, response } = createErrorResponse(403, 'Access denied');
      return res.status(status).json(response);
    }
    
    // Mark message as read (only if user is not the sender)
    let message;
    try {
      const msgPromise = supabaseAdmin
        .from('messages')
        .select('*')
        .eq('id', messageId)
        .eq('conversation_id', conversationId)
        .single();
      
      const result = await Promise.race([
        msgPromise,
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Database query timeout')), timeout)
        )
      ]);
      
      const { data: msgData, error: msgError } = result;
      
      if (msgError || !msgData) {
        // Message not found or doesn't belong to conversation
        return res.json({
          success: true,
          data: { message: 'Message not found or already processed' }
        });
      }
      
      message = msgData;
    } catch (timeoutError) {
      console.error('Database query timeout:', timeoutError);
      const { status, response } = createErrorResponse(504, 'Request timeout. Please try again.');
      return res.status(status).json(response);
    }
    
    // Don't mark own messages as read
    if (message.sender_id === id) {
      return res.json({
        success: true,
        data: { message: 'Cannot mark your own message as read' }
      });
    }
    
    // Update message
    try {
      const updatePromise = supabaseAdmin
        .from('messages')
        .update({
          is_read: true,
          read_at: new Date().toISOString()
        })
        .eq('id', messageId);
      
      await Promise.race([
        updatePromise,
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Database query timeout')), timeout)
        )
      ]);
    } catch (timeoutError) {
      console.error('Database update timeout:', timeoutError);
      const { status, response } = createErrorResponse(504, 'Request timeout. Please try again.');
      return res.status(status).json(response);
    }
    
    res.json({
      success: true,
      data: { message: 'Message marked as read' }
    });
  } catch (error) {
    console.error('Mark message as read error:', error);
    const { status, response } = handleDatabaseError(error);
    res.status(status).json(response);
  }
});

/**
 * @route   PUT /api/chat/conversations/:conversationId/read
 * @desc    Mark all messages in a conversation as read
 * @access  Private (Customer or Vendor)
 */
router.put('/conversations/:conversationId/read', async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { id, role } = req.user;
    
    // Validate inputs
    const convIdValidation = validateConversationId(conversationId);
    if (!convIdValidation.valid) {
      const { status, response } = createErrorResponse(400, convIdValidation.error);
      return res.status(status).json(response);
    }
    
    // Validate user credentials
    if (!id || typeof id !== 'string' || !isValidRole(role)) {
      const { status, response } = createErrorResponse(400, 'Invalid user credentials');
      return res.status(status).json(response);
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
      
      const { data, error: convError } = result;
      
      if (convError || !data) {
        const { status, response } = createErrorResponse(404, 'Conversation not found');
        return res.status(status).json(response);
      }
      
      conversation = data;
    } catch (timeoutError) {
      console.error('Database query timeout:', timeoutError);
      const { status, response } = createErrorResponse(504, 'Request timeout. Please try again.');
      return res.status(status).json(response);
    }
    
    // Security check: ensure user is part of this conversation
    if (role === 'customer' && conversation.customer_id !== id) {
      const { status, response } = createErrorResponse(403, 'Access denied');
      return res.status(status).json(response);
    }
    
    if (role === 'vendor' && conversation.vendor_id !== id) {
      const { status, response } = createErrorResponse(403, 'Access denied');
      return res.status(status).json(response);
    }
    
    // Mark all unread messages from the other party as read
    const otherPartyRole = role === 'customer' ? 'vendor' : 'customer';
    
    try {
      const updatePromise = supabaseAdmin
        .from('messages')
        .update({
          is_read: true,
          read_at: new Date().toISOString()
        })
        .eq('conversation_id', conversationId)
        .eq('sender_role', otherPartyRole)
        .eq('is_read', false);
      
      const result = await Promise.race([
        updatePromise,
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Database query timeout')), timeout)
        )
      ]);
      
      const { error: updateError } = result;
      
      if (updateError) {
        const { status, response } = handleDatabaseError(updateError);
        return res.status(status).json(response);
      }
    } catch (timeoutError) {
      console.error('Database update timeout:', timeoutError);
      const { status, response } = createErrorResponse(504, 'Request timeout. Please try again.');
      return res.status(status).json(response);
    }
    
    res.json({
      success: true,
      data: { message: 'All messages marked as read' }
    });
  } catch (error) {
    console.error('Mark conversation as read error:', error);
    const { status, response } = handleDatabaseError(error);
    res.status(status).json(response);
  }
});

/**
 * @route   GET /api/chat/unread-count
 * @desc    Get total unread message count for current user
 * @access  Private (Customer or Vendor)
 */
router.get('/unread-count', async (req, res) => {
  try {
    const { id, role } = req.user;
    
    // Validate user credentials
    if (!id || typeof id !== 'string' || !isValidRole(role)) {
      const { status, response } = createErrorResponse(400, 'Invalid user credentials');
      return res.status(status).json(response);
    }
    
    const timeout = 10000; // 10 second timeout
    let unreadCount = 0;
    
    try {
      if (role === 'customer') {
        const countPromise = supabaseAdmin
          .from('conversations')
          .select('customer_unread_count')
          .eq('customer_id', id);
        
        const result = await Promise.race([
          countPromise,
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Database query timeout')), timeout)
          )
        ]);
        
        const { data, error } = result;
        
        if (error) {
          const { status, response } = handleDatabaseError(error);
          return res.status(status).json(response);
        }
        
        unreadCount = (data || []).reduce((sum, conv) => {
          const count = typeof conv.customer_unread_count === 'number' ? conv.customer_unread_count : 0;
          return sum + Math.max(0, count);
        }, 0);
      } else if (role === 'vendor') {
        const countPromise = supabaseAdmin
          .from('conversations')
          .select('vendor_unread_count')
          .eq('vendor_id', id);
        
        const result = await Promise.race([
          countPromise,
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Database query timeout')), timeout)
          )
        ]);
        
        const { data, error } = result;
        
        if (error) {
          const { status, response } = handleDatabaseError(error);
          return res.status(status).json(response);
        }
        
        unreadCount = (data || []).reduce((sum, conv) => {
          const count = typeof conv.vendor_unread_count === 'number' ? conv.vendor_unread_count : 0;
          return sum + Math.max(0, count);
        }, 0);
      } else {
        const { status, response } = createErrorResponse(403, 'Invalid role for chat access');
        return res.status(status).json(response);
      }
    } catch (timeoutError) {
      console.error('Database query timeout:', timeoutError);
      const { status, response } = createErrorResponse(504, 'Request timeout. Please try again.');
      return res.status(status).json(response);
    }
    
    // Ensure unreadCount is a non-negative integer
    unreadCount = Math.max(0, Math.floor(unreadCount));
    
    res.json({
      success: true,
      data: { unreadCount }
    });
  } catch (error) {
    console.error('Get unread count error:', error);
    const { status, response } = handleDatabaseError(error);
    res.status(status).json(response);
  }
});

module.exports = router;

