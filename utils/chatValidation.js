const { v4: uuidv4, validate: isValidUUID } = require('uuid');

/**
 * Validate UUID format
 * @param {string} id - UUID to validate
 * @returns {boolean}
 */
function isValidUUIDFormat(id) {
  if (!id || typeof id !== 'string') {
    return false;
  }
  return isValidUUID(id);
}

/**
 * Validate conversation ID
 * @param {string} conversationId - Conversation ID to validate
 * @returns {{valid: boolean, error?: string}}
 */
function validateConversationId(conversationId) {
  if (!conversationId) {
    return { valid: false, error: 'Conversation ID is required' };
  }
  
  if (typeof conversationId !== 'string') {
    return { valid: false, error: 'Conversation ID must be a string' };
  }
  
  if (!isValidUUIDFormat(conversationId)) {
    return { valid: false, error: 'Invalid conversation ID format' };
  }
  
  return { valid: true };
}

/**
 * Validate message content
 * @param {string} content - Message content to validate
 * @returns {{valid: boolean, error?: string}}
 */
function validateMessageContent(content) {
  if (content === undefined || content === null) {
    return { valid: false, error: 'Message content is required' };
  }
  
  if (typeof content !== 'string') {
    return { valid: false, error: 'Message content must be a string' };
  }
  
  const trimmed = content.trim();
  
  if (trimmed.length === 0) {
    return { valid: false, error: 'Message content cannot be empty' };
  }
  
  if (trimmed.length > 5000) {
    return { valid: false, error: 'Message is too long (max 5000 characters)' };
  }
  
  // Check for potentially malicious content (very basic)
  if (trimmed.length > 10000) {
    return { valid: false, error: 'Message content is suspiciously long' };
  }
  
  return { valid: true };
}

/**
 * Validate vendor ID
 * @param {string} vendorId - Vendor ID to validate
 * @returns {{valid: boolean, error?: string}}
 */
function validateVendorId(vendorId) {
  if (!vendorId) {
    return { valid: false, error: 'Vendor ID is required' };
  }
  
  if (typeof vendorId !== 'string') {
    return { valid: false, error: 'Vendor ID must be a string' };
  }
  
  if (!isValidUUIDFormat(vendorId)) {
    return { valid: false, error: 'Invalid vendor ID format' };
  }
  
  return { valid: true };
}

/**
 * Validate message ID
 * @param {string} messageId - Message ID to validate
 * @returns {{valid: boolean, error?: string}}
 */
function validateMessageId(messageId) {
  if (!messageId) {
    return { valid: false, error: 'Message ID is required' };
  }
  
  if (typeof messageId !== 'string') {
    return { valid: false, error: 'Message ID must be a string' };
  }
  
  if (!isValidUUIDFormat(messageId) && !messageId.startsWith('temp-')) {
    return { valid: false, error: 'Invalid message ID format' };
  }
  
  return { valid: true };
}

/**
 * Sanitize message content (basic)
 * @param {string} content - Content to sanitize
 * @returns {string}
 */
function sanitizeMessageContent(content) {
  if (typeof content !== 'string') {
    return '';
  }
  
  // Trim whitespace
  let sanitized = content.trim();
  
  // Remove null bytes and other control characters (except newlines and tabs)
  sanitized = sanitized.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '');
  
  // Normalize line endings
  sanitized = sanitized.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  
  // Limit consecutive newlines
  sanitized = sanitized.replace(/\n{4,}/g, '\n\n\n');
  
  return sanitized;
}

/**
 * Validate role
 * @param {string} role - Role to validate
 * @returns {boolean}
 */
function isValidRole(role) {
  return role === 'customer' || role === 'vendor';
}

module.exports = {
  isValidUUIDFormat,
  validateConversationId,
  validateMessageContent,
  validateVendorId,
  validateMessageId,
  sanitizeMessageContent,
  isValidRole
};

