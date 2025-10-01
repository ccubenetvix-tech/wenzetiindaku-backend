#!/usr/bin/env node

/**
 * Setup script for WENZE TII NDAKU Backend
 * This script helps set up the development environment
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

async function setup() {
  console.log('🚀 WENZE TII NDAKU Backend Setup');
  console.log('================================\n');

  // Check if .env file exists
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    console.log('✅ .env file already exists');
    const overwrite = await question('Do you want to overwrite it? (y/N): ');
    if (overwrite.toLowerCase() !== 'y') {
      console.log('Setup cancelled.');
      rl.close();
      return;
    }
  }

  console.log('\n📝 Please provide the following information:\n');

  // Collect environment variables
  const supabaseUrl = await question('Supabase URL: ');
  const supabaseAnonKey = await question('Supabase Anon Key: ');
  const supabaseServiceKey = await question('Supabase Service Role Key: ');
  const jwtSecret = await question('JWT Secret (or press Enter for auto-generated): ') || generateJWTSecret();
  const googleClientId = await question('Google OAuth Client ID: ');
  const googleClientSecret = await question('Google OAuth Client Secret: ');
  const emailUser = await question('Gmail address for sending emails: ');
  const emailPass = await question('Gmail App Password: ');
  const frontendUrl = await question('Frontend URL (default: http://localhost:5173): ') || 'http://localhost:5173';

  // Create .env file
  const envContent = `# Supabase Configuration
SUPABASE_URL=${supabaseUrl}
SUPABASE_ANON_KEY=${supabaseAnonKey}
SUPABASE_SERVICE_ROLE_KEY=${supabaseServiceKey}

# JWT Configuration
JWT_SECRET=${jwtSecret}
JWT_EXPIRES_IN=7d

# Server Configuration
PORT=5000
NODE_ENV=development

# Google OAuth Configuration
GOOGLE_CLIENT_ID=${googleClientId}
GOOGLE_CLIENT_SECRET=${googleClientSecret}

# Email Configuration
EMAIL_USER=${emailUser}
EMAIL_PASS=${emailPass}

# CORS Configuration
FRONTEND_URL=${frontendUrl}
`;

  fs.writeFileSync(envPath, envContent);
  console.log('\n✅ .env file created successfully!');

  // Create database setup instructions
  console.log('\n📊 Database Setup Instructions:');
  console.log('1. Go to your Supabase project dashboard');
  console.log('2. Navigate to the SQL Editor');
  console.log('3. Run the SQL commands from database/schema.sql');
  console.log('4. This will create all necessary tables, indexes, and RLS policies');

  console.log('\n🎉 Setup completed! You can now run:');
  console.log('  npm install  # Install dependencies');
  console.log('  npm run dev  # Start development server');

  rl.close();
}

function generateJWTSecret() {
  const crypto = require('crypto');
  return crypto.randomBytes(64).toString('base64');
}

setup().catch(console.error);

