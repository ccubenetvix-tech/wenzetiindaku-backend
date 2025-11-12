require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

// Import routes
const authRoutes = require('./routes/auth');
const googleAuthRoutes = require('./routes/googleAuth');
const customerRoutes = require('./routes/customer');
const vendorRoutes = require('./routes/vendor');
const adminRoutes = require('./routes/admin');
const productRoutes = require('./routes/products');
const cartRoutes = require('./routes/cart');
const reviewRoutes = require('./routes/reviews');

// Import passport configuration
require('./config/passport');

// Import middleware
const { errorHandler } = require('./middleware/errorHandler');

const app = express();
app.set('trust proxy', 1);
// CORS configuration (must be BEFORE any middleware that may terminate the request)
app.use(cors({
  origin: [
    process.env.FRONTEND_URL || 'http://localhost:5173',
    'https://elegant-pothos-5c2a00.netlify.app',
    'https://wenzetiindaku-frontend-8z159plbu-ccubenetvix-techs-projects.vercel.app/',
    'https://wenze-tii-ndaku.netlify.app',
    'https://wenzetiindaku-marketplace.netlify.app',
    'http://localhost:5173',
    'http://localhost:3000',
    'https://wenzetiindaku.vercel.app',
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin', 'Cache-Control', 'Pragma'],
  optionsSuccessStatus: 200,
  preflightContinue: false
}));

// Ensure preflight handled for all routes
app.options('*', cors());

// Security middleware
app.use(helmet());

// Rate limiting (disabled or relaxed in development, JSON handler)
const isProd = (process.env.NODE_ENV || 'development') === 'production';
if (isProd) {
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.method === 'OPTIONS',
    handler: (req, res) => {
      res.status(429).json({ error: 'Too many requests' });
    },
  });
  app.use(limiter);
}

// Logging middleware
app.use(morgan('combined'));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    message: 'WENZE TII NDAKU Backend API is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/auth', googleAuthRoutes);
app.use('/api/customer', customerRoutes);
app.use('/api/vendor', vendorRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/products', productRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/reviews', reviewRoutes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Welcome to WENZE TII NDAKU Backend API',
    version: '1.0.0',
    documentation: '/api/docs',
    health: '/health'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    message: `Cannot ${req.method} ${req.originalUrl}`,
    timestamp: new Date().toISOString()
  });
});

// Error handling middleware (must be last)
app.use(errorHandler);

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 WENZE TII NDAKU Backend Server running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🌐 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:5173'}`);
  console.log(`🔗 Health Check: http://localhost:${PORT}/health`);
});

module.exports = app;
