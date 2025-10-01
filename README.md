# WENZE TII NDAKU Backend API

A secure, scalable Node.js + Express backend API for the WENZE TII NDAKU marketplace, built with Supabase integration.

## Features

- 🔐 **Secure Authentication**: JWT-based authentication with email verification
- 👥 **Dual User System**: Separate customer and vendor authentication
- 🔑 **Google OAuth**: Social login integration for customers
- 📧 **Email Verification**: OTP-based email verification system
- 🛡️ **Security**: Rate limiting, CORS, Helmet security headers
- 📊 **Database**: Supabase PostgreSQL with Row Level Security
- 🚀 **Scalable**: Modular architecture with proper error handling

## Tech Stack

- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Database**: Supabase (PostgreSQL)
- **Authentication**: JWT + Passport.js
- **Email**: Nodemailer
- **Security**: Helmet, CORS, Rate Limiting
- **Validation**: Custom validation utilities

## Prerequisites

- Node.js 18 or higher
- npm or yarn
- Supabase account and project
- Google OAuth credentials (for Google login)
- Gmail account (for sending emails)

## Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd backend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment Setup**
   Create a `.env` file in the root directory with the following variables:
   ```env
   # Supabase Configuration
   SUPABASE_URL=your_supabase_url_here
   SUPABASE_ANON_KEY=your_supabase_anon_key_here
   SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key_here

   # JWT Configuration
   JWT_SECRET=your_jwt_secret_here
   JWT_EXPIRES_IN=7d

   # Server Configuration
   PORT=5000
   NODE_ENV=development

   # Google OAuth Configuration
   GOOGLE_CLIENT_ID=your_google_client_id_here
   GOOGLE_CLIENT_SECRET=your_google_client_secret_here

   # Email Configuration
   EMAIL_USER=your_email@gmail.com
   EMAIL_PASS=your_app_password_here

   # CORS Configuration
   FRONTEND_URL=http://localhost:5173
   ```

4. **Database Setup**
   - Go to your Supabase project dashboard
   - Navigate to the SQL Editor
   - Run the SQL commands from `database/schema.sql`
   - This will create all necessary tables, indexes, and RLS policies

5. **Start the server**
   ```bash
   # Development mode
   npm run dev

   # Production mode
   npm start
   ```

## API Endpoints

### Authentication Routes (`/api/auth`)

#### Customer Authentication
- `POST /customer/signup` - Register new customer
- `POST /customer/verify-otp` - Verify email with OTP
- `POST /customer/login` - Customer login
- `POST /customer/resend-otp` - Resend verification OTP

#### Vendor Authentication
- `POST /vendor/signup` - Register new vendor
- `POST /vendor/verify-otp` - Verify email with OTP
- `POST /vendor/login` - Vendor login
- `POST /vendor/resend-otp` - Resend verification OTP

#### Google OAuth
- `GET /google` - Initiate Google OAuth
- `GET /google/callback` - Google OAuth callback
- `POST /google/verify-token` - Verify Google token (mobile)

#### General
- `GET /me` - Get current user profile

### Customer Routes (`/api/customer`)
- `GET /profile` - Get customer profile
- `PUT /profile` - Update customer profile
- `GET /orders` - Get customer orders
- `GET /orders/:orderId` - Get specific order
- `GET /wishlist` - Get wishlist
- `POST /wishlist` - Add to wishlist
- `DELETE /wishlist/:productId` - Remove from wishlist

### Vendor Routes (`/api/vendor`)
- `GET /profile` - Get vendor profile
- `PUT /profile` - Update vendor profile
- `GET /dashboard` - Get dashboard data
- `GET /products` - Get vendor products
- `POST /products` - Create new product
- `PUT /products/:productId` - Update product
- `DELETE /products/:productId` - Delete product
- `GET /orders` - Get vendor orders
- `PUT /orders/:orderId/status` - Update order status

## Database Schema

### Tables
- **customers**: Customer user data
- **vendors**: Vendor business data
- **products**: Product catalog
- **orders**: Order management
- **order_items**: Order line items
- **wishlist**: Customer wishlist
- **cart**: Shopping cart

### Security Features
- Row Level Security (RLS) enabled on all tables
- JWT-based authentication
- Password hashing with bcrypt
- Rate limiting on all endpoints
- CORS protection
- Input validation and sanitization

## Authentication Flow

### Customer Registration
1. Customer submits signup form
2. System validates input and checks for existing email
3. Password is hashed and customer record created
4. OTP is generated and sent via email
5. Customer verifies email with OTP
6. Account is activated

### Vendor Registration
1. Vendor submits detailed business information
2. System validates all required fields
3. Password is hashed and vendor record created
4. OTP is generated and sent via email
5. Vendor verifies email with OTP
6. Application is submitted for admin review
7. Admin approves/rejects application

### Google OAuth
1. Customer clicks "Login with Google"
2. Redirected to Google OAuth consent screen
3. Google redirects back with authorization code
4. System exchanges code for user info
5. Customer account is created/updated
6. JWT token is generated and returned

## Error Handling

The API uses a centralized error handling middleware that:
- Logs all errors for debugging
- Returns consistent error response format
- Handles different error types appropriately
- Provides helpful error messages to clients

## Security Considerations

- All passwords are hashed using bcrypt
- JWT tokens have expiration times
- Rate limiting prevents abuse
- CORS is configured for specific origins
- Helmet provides security headers
- Input validation prevents injection attacks
- Row Level Security protects data access

## Development

### Project Structure
```
backend/
├── config/          # Configuration files
├── database/        # Database schema and migrations
├── middleware/      # Express middleware
├── routes/          # API route handlers
├── utils/           # Utility functions
├── server.js        # Main application file
└── package.json     # Dependencies and scripts
```

### Adding New Features
1. Create route handlers in appropriate route files
2. Add middleware for authentication/authorization
3. Update database schema if needed
4. Add proper error handling
5. Write tests for new functionality

## Deployment

### Environment Variables
Ensure all required environment variables are set in production:
- Supabase credentials
- JWT secret (use a strong, random string)
- Google OAuth credentials
- Email service credentials
- Frontend URL for CORS

### Database
- Run the schema.sql file in your Supabase project
- Ensure RLS policies are properly configured
- Set up proper indexes for performance

### Security
- Use HTTPS in production
- Set secure JWT secrets
- Configure proper CORS origins
- Enable rate limiting
- Monitor logs for suspicious activity

## Support

For issues or questions:
1. Check the logs for error details
2. Verify environment variables are set correctly
3. Ensure database schema is properly set up
4. Check Supabase project configuration

## License

This project is licensed under the MIT License.

