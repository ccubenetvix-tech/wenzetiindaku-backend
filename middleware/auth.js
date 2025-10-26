const jwt = require('jsonwebtoken');
const { supabaseAdmin } = require('../config/supabase');

/**
 * Middleware to verify JWT token and authenticate user
 */
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN


    if (!token) {
      return res.status(401).json({
        success: false,
        error: {
          message: 'Access token required'
        }
      });
    }

    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    
    // Handle admin authentication
    if (decoded.role === 'admin') {
      req.user = {
        id: decoded.adminId || 'admin',
        email: 'wenzetiindaku@gmail.com',
        role: 'admin'
      };
    } else {
      // Get user from database for customers and vendors
      const userId = decoded.userId || decoded.adminId;
      const { data: user, error } = await supabaseAdmin
        .from(decoded.role === 'vendor' ? 'vendors' : 'customers')
        .select('*')
        .eq('id', userId)
        .single();

      if (error || !user) {
        return res.status(401).json({
          success: false,
          error: {
            message: 'Invalid token or user not found'
          }
        });
      }

      // Add user info to request
      req.user = {
        id: user.id,
        email: user.email || user.business_email,
        role: decoded.role,
        ...user
      };
      
    }

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        error: {
          message: 'Invalid token'
        }
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: {
          message: 'Token expired'
        }
      });
    }

    return res.status(500).json({
      success: false,
      error: {
        message: 'Authentication error'
      }
    });
  }
};

/**
 * Middleware to check if user has specific role
 */
const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: {
          message: 'Authentication required'
        }
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Insufficient permissions'
        }
      });
    }
    next();
  };
};

/**
 * Middleware to check if user is verified
 */
const requireVerification = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: {
        message: 'Authentication required'
      }
    });
  }

  if (!req.user.verified) {
    return res.status(403).json({
      success: false,
      error: {
        message: 'Account not verified. Please verify your email first.'
      }
    });
  }

  next();
};

// Alias for backward compatibility
const protect = authenticateToken;
const authorize = (role) => requireRole([role]);

module.exports = {
  authenticateToken,
  protect,
  requireRole,
  authorize,
  requireVerification
};
