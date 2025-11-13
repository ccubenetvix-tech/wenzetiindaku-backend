/**
 * Chat-specific error handler utilities
 */

/**
 * Handle database errors with user-friendly messages
 * @param {Error} error - Database error
 * @returns {{status: number, message: string}}
 */
function handleDatabaseError(error) {
  console.error('Database error:', error);
  
  // Supabase specific errors
  if (error.code === 'PGRST116') {
    return { status: 404, message: 'Resource not found' };
  }
  
  if (error.code === '23505') { // Unique constraint violation
    return { status: 409, message: 'Resource already exists' };
  }
  
  if (error.code === '23503') { // Foreign key violation
    return { status: 400, message: 'Invalid reference to related resource' };
  }
  
  if (error.code === 'PGRST301') { // Too many requests
    return { status: 429, message: 'Too many requests. Please try again later.' };
  }
  
  // Network/timeout errors
  if (error.message && error.message.includes('timeout')) {
    return { status: 504, message: 'Request timeout. Please try again.' };
  }
  
  if (error.message && error.message.includes('ECONNREFUSED')) {
    return { status: 503, message: 'Database connection failed. Please try again later.' };
  }
  
  // Default
  return { status: 500, message: 'Database operation failed' };
}

/**
 * Handle encryption/decryption errors
 * @param {Error} error - Encryption error
 * @returns {{status: number, message: string}}
 */
function handleEncryptionError(error) {
  console.error('Encryption error:', error);
  
  if (error.message && error.message.includes('decrypt')) {
    return { status: 500, message: 'Failed to process message encryption' };
  }
  
  if (error.message && error.message.includes('Invalid')) {
    return { status: 400, message: 'Invalid encrypted data format' };
  }
  
  return { status: 500, message: 'Encryption operation failed' };
}

/**
 * Handle validation errors
 * @param {string} error - Validation error message
 * @returns {{status: number, message: string}}
 */
function handleValidationError(error) {
  return { status: 400, message: error || 'Validation failed' };
}

/**
 * Handle rate limiting errors
 * @returns {{status: number, message: string}}
 */
function handleRateLimitError() {
  return { 
    status: 429, 
    message: 'Too many requests. Please slow down and try again in a moment.' 
  };
}

/**
 * Create standardized error response
 * @param {number} status - HTTP status code
 * @param {string} message - Error message
 * @param {any} details - Additional error details
 * @returns {Object}
 */
function createErrorResponse(status, message, details = null) {
  const response = {
    success: false,
    error: {
      message,
      ...(details && { details })
    }
  };
  
  return { status, response };
}

/**
 * Wrap async route handler with error handling
 * @param {Function} handler - Async route handler
 * @returns {Function}
 */
function asyncHandler(handler) {
  return async (req, res, next) => {
    try {
      await handler(req, res, next);
    } catch (error) {
      console.error('Route handler error:', error);
      
      const { status, message } = handleDatabaseError(error);
      res.status(status).json(createErrorResponse(status, message).response);
    }
  };
}

module.exports = {
  handleDatabaseError,
  handleEncryptionError,
  handleValidationError,
  handleRateLimitError,
  createErrorResponse,
  asyncHandler
};

