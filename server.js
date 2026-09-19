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
const categoryRoutes = require('./routes/categories');
const cartRoutes = require('./routes/cart');
const reviewRoutes = require('./routes/reviews');
const chatRoutes = require('./routes/chat');
const paymentRoutes = require('./routes/payment');

// Import passport configuration
require('./config/passport');

// Import middleware
const { errorHandler } = require('./middleware/errorHandler');
const { allowedOrigins } = require('./config/allowedOrigins');

// Swagger UI (dev/local only — never mounted in production)
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./config/swagger');

const app = express();
app.set('trust proxy', 1);

// CORS configuration (must be BEFORE any middleware that may terminate the request)
// Security middleware
app.use(helmet());

// Rate limiting
// Rate limiting
const isProd = (process.env.NODE_ENV || 'development') === 'production';

// In development/local: 10,000 requests per 15 mins (effectively unlimited for dev)
// In production: 1000 requests per 15 mins (stricter)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProd ? 1000 : 10000,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === 'OPTIONS', // Skip OPTIONS requests (CORS preflight)
});

app.use(limiter);

// CORS configuration

app.use(cors({
  origin: (origin, callback) => {
    // Allow mobile (no origin) and whitelisted web origins
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin', 'Cache-Control', 'Pragma'],
  optionsSuccessStatus: 200,
  preflightContinue: false
}));

// Ensure preflight handled for all routes
app.options('*', cors());

// Logging middleware
app.use(morgan('combined'));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check endpoint
app.get('/health', async (req, res) => {
  const checks = { server: 'OK', database: 'unknown' };
  let statusCode = 200;

  try {
    const { supabaseAdmin } = require('./config/supabase');
    const { error } = await supabaseAdmin.from('customers').select('id').limit(1);
    checks.database = error ? 'DOWN' : 'OK';
    if (error) statusCode = 503;
  } catch (err) {
    checks.database = 'DOWN';
    statusCode = 503;
  }

  res.status(statusCode).json({
    status: statusCode === 200 ? 'OK' : 'DEGRADED',
    message: 'WENZE TII NDAKU Backend API health check',
    checks,
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// API docs (dev/local only — fails closed: only enabled when NODE_ENV is explicitly
// 'development', so a missing/misconfigured NODE_ENV never accidentally exposes it)
if (process.env.NODE_ENV === 'development') {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
}

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/auth', googleAuthRoutes);
app.use('/api/customer', customerRoutes);
app.use('/api/vendor', vendorRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/products', productRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/payment', paymentRoutes);

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

// Start HTTP server
const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  console.log(`🚀 WENZE TII NDAKU Backend Server running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🌐 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:5173'}`);
  console.log(`🔗 Health Check: http://localhost:${PORT}/health`);
});

// Initialize WebSocket server
const { initializeSocket } = require('./socket');
const io = initializeSocket(server);
console.log(`🔌 WebSocket server initialized`);

module.exports = { app, server, io };

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('UNHANDLED REJECTION! 💥 Shutting down...');
  console.error(err.name, err.message);
  console.error(err.stack);
  server.close(() => {
    process.exit(1);
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION! 💥 Shutting down...');
  console.error(err.name, err.message);
  console.error(err.stack);
  process.exit(1);
});
