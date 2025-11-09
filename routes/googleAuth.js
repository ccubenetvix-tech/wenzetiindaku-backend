const express = require('express');
const passport = require('passport');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

const { supabaseAdmin } = require('../config/supabase');
const emailService = require('../utils/email');
const { checkEmailRegistration, normalizeEmail } = require('../utils/accountRegistration');

const router = express.Router();

/**
 * Generate JWT token
 */
const generateToken = (userId, role) => {
  return jwt.sign(
    { userId, role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
};

/**
 * @route   GET /api/auth/google
 * @desc    Google OAuth login
 * @access  Public
 */
router.get('/google', passport.authenticate('google', {
  scope: ['profile', 'email']
}));

/**
 * @route   GET /api/auth/google/callback
 * @desc    Google OAuth callback
 * @access  Public
 */
router.get('/google/callback', 
  passport.authenticate('google', { session: false }),
  async (req, res) => {
    try {
      const { id, displayName, emails, photos } = req.user;
      const email = emails[0].value;
      const normalizedEmail = normalizeEmail(email);
      const photo = photos[0]?.value || null;

      const emailStatus = await checkEmailRegistration(normalizedEmail);

      if (emailStatus.exists && emailStatus.role !== 'customer') {
        const frontendBase = process.env.FRONTEND_URL || process.env.CLIENT_URL || 'http://localhost:5173';
        const redirectUrl = new URL('/customer/login', frontendBase);
        redirectUrl.searchParams.set('error', 'account_type_conflict');
        redirectUrl.searchParams.set(
          'message',
          emailStatus.message || 'This email is already registered under a different account type. Please use another email.'
        );
        return res.redirect(redirectUrl.toString());
      }

      // Check if customer already exists
      const { data: existingCustomer } = await supabaseAdmin
        .from('customers')
        .select('*')
        .eq('email', normalizedEmail)
        .maybeSingle();

      let customer;
      let isNewUser = false;

      if (existingCustomer) {
        // Update existing customer
        const { data: updatedCustomer, error } = await supabaseAdmin
          .from('customers')
          .update({
            google_id: id,
            profile_photo: photo,
            last_login: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', existingCustomer.id)
          .select()
          .single();

        if (error) {
          console.error('Error updating customer:', error);
          return res.redirect(`${process.env.FRONTEND_URL}/login?error=update_failed`);
        }

        customer = updatedCustomer;
      } else {
        // Create new customer
        const nameParts = displayName.split(' ');
        const firstName = nameParts[0] || '';
        const lastName = nameParts.slice(1).join(' ') || '';

        const customerData = {
          id: uuidv4(),
          first_name: firstName,
          last_name: lastName,
          email: normalizedEmail,
          google_id: id,
          profile_photo: photo,
          role: 'customer',
          verified: true, // Google accounts are pre-verified
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

        const { data: newCustomer, error } = await supabaseAdmin
          .from('customers')
          .insert([customerData])
          .select()
          .single();

        if (error) {
          console.error('Error creating customer:', error);
          return res.redirect(`${process.env.FRONTEND_URL}/login?error=creation_failed`);
        }

        customer = newCustomer;
        isNewUser = true;

        // Send welcome email for new users
        try {
          await emailService.sendWelcomeEmail(normalizedEmail, displayName, 'customer');
        } catch (emailError) {
          console.error('Error sending welcome email:', emailError);
        }
      }

      // Generate token
      const token = generateToken(customer.id, 'customer');

      // Redirect to frontend with token
      const redirectUrl = `${process.env.FRONTEND_URL}/auth/callback?token=${token}&isNewUser=${isNewUser}`;
      res.redirect(redirectUrl);

    } catch (error) {
      console.error('Google OAuth callback error:', error);
      res.redirect(`${process.env.FRONTEND_URL}/login?error=oauth_failed`);
    }
  }
);

/**
 * @route   POST /api/auth/google/verify-token
 * @desc    Verify Google OAuth token (for mobile apps)
 * @access  Public
 */
router.post('/google/verify-token', async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Google token is required'
        }
      });
    }

    // Verify Google token (you would use Google's API to verify the token)
    // For now, we'll assume the token is valid and contains user info
    // In production, you should verify the token with Google's API

    // This is a simplified version - in production, verify with Google
    const userInfo = {
      id: 'google_user_id',
      email: 'user@example.com',
      name: 'User Name',
      picture: 'profile_picture_url'
    };

    const normalizedEmail = normalizeEmail(userInfo.email);

    const emailStatus = await checkEmailRegistration(normalizedEmail);

    if (emailStatus.exists && emailStatus.role !== 'customer') {
      return res.status(403).json({
        success: false,
        error: {
          message: emailStatus.message || 'This email is already registered under a different account type. Please use another email.'
        }
      });
    }

    // Check if customer exists
    const { data: existingCustomer } = await supabaseAdmin
      .from('customers')
      .select('*')
      .eq('email', normalizedEmail)
      .maybeSingle();

    let customer;
    let isNewUser = false;

    if (existingCustomer) {
      customer = existingCustomer;
    } else {
      // Create new customer
      const nameParts = userInfo.name.split(' ');
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';

      const customerData = {
        id: uuidv4(),
        first_name: firstName,
        last_name: lastName,
        email: normalizedEmail,
        google_id: userInfo.id,
        profile_photo: userInfo.picture,
        role: 'customer',
        verified: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const { data: newCustomer, error } = await supabaseAdmin
        .from('customers')
        .insert([customerData])
        .select()
        .single();

      if (error) {
        console.error('Error creating customer:', error);
        return res.status(500).json({
          success: false,
          error: {
            message: 'Failed to create customer account'
          }
        });
      }

      customer = newCustomer;
      isNewUser = true;
    }

    // Generate JWT token
    const jwtToken = generateToken(customer.id, 'customer');

    res.json({
      success: true,
      message: isNewUser ? 'Account created successfully' : 'Login successful',
      data: {
        token: jwtToken,
        user: {
          id: customer.id,
          firstName: customer.first_name,
          lastName: customer.last_name,
          email: customer.email,
          profilePhoto: customer.profile_photo,
          role: customer.role,
          verified: customer.verified,
          createdAt: customer.created_at
        },
        isNewUser
      }
    });

  } catch (error) {
    console.error('Google token verification error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Internal server error'
      }
    });
  }
});

module.exports = router;

