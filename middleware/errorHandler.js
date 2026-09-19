/**
 * Global error handling middleware
 * Handles all errors in the application and provides consistent error responses
 */

const errorHandler = (err, req, res, next) => {
  console.error('Error:', err);

  // Default error. Only pass the raw err.message through when it came from an
  // intentionally-thrown operational error (one that set its own statusCode) or
  // in development — otherwise an unexpected exception (e.g. a bug in a route with
  // no try/catch) could leak raw DB/driver internals to the client in production.
  const isOperationalError = typeof err.statusCode === 'number';
  let error = {
    message: (isOperationalError || process.env.NODE_ENV === 'development')
      ? (err.message || 'Internal Server Error')
      : 'Internal Server Error',
    statusCode: err.statusCode || 500
  };

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors).map(val => val.message).join(', ');
    error = {
      message: `Validation Error: ${message}`,
      statusCode: 400
    };
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    error = {
      message: 'Invalid token',
      statusCode: 401
    };
  }

  if (err.name === 'TokenExpiredError') {
    error = {
      message: 'Token expired',
      statusCode: 401
    };
  }

  // Supabase errors
  if (err.code && err.code.startsWith('PGRST')) {
    error = {
      message: 'Database error',
      statusCode: 500
    };
  }

  // Rate limit errors
  if (err.statusCode === 429) {
    error = {
      message: 'Too many requests, please try again later',
      statusCode: 429
    };
  }

  // Send error response
  res.status(error.statusCode).json({
    success: false,
    error: {
      message: error.message,
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    },
    timestamp: new Date().toISOString()
  });
};

module.exports = { errorHandler };

