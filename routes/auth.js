const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const passport = require('passport');
const { v4: uuidv4 } = require('uuid');

const { supabaseAdmin } = require('../config/supabase');
const { authenticateToken } = require('../middleware/auth');
const emailService = require('../utils/email');
const { generateOTP, isOTPExpired, generateOTPExpiry, isValidOTP } = require('../utils/otp');
const { validateCustomerSignup, validateVendorSignup, sanitizeString } = require('../utils/validation');

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
 * @route   POST /api/auth/customer/signup
 * @desc    Register a new customer
 * @access  Public
 */
router.post('/customer/signup', async (req, res) => {
  try {
    const { firstName, lastName, email, password, agreeToTerms } = req.body;

    // Validate input
    const validation = validateCustomerSignup(req.body);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Validation failed',
          details: validation.errors
        }
      });
    }

    if (!agreeToTerms) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'You must agree to the terms and conditions'
        }
      });
    }

    // Check if customer already exists
    const { data: existingCustomer } = await supabaseAdmin
      .from('customers')
      .select('id')
      .eq('email', email.toLowerCase())
      .single();

    if (existingCustomer) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Customer with this email already exists'
        }
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Generate OTP
    const otp = generateOTP();
    const otpExpiry = generateOTPExpiry();

    // Create customer
    const customerData = {
      id: uuidv4(),
      first_name: sanitizeString(firstName),
      last_name: sanitizeString(lastName),
      email: email.toLowerCase(),
      password: hashedPassword,
      role: 'customer',
      verified: false,
      otp,
      otp_expiry: new Date(otpExpiry).toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { data: customer, error } = await supabaseAdmin
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

    // Send OTP email
    try {
      await emailService.sendOTPEmail(email, otp, 'verification');
    } catch (emailError) {
      console.error('Error sending OTP email:', emailError);
      // Don't fail the signup if email fails
    }

    res.status(201).json({
      success: true,
      message: 'Customer account created successfully. Please check your email for verification code.',
      data: {
        customerId: customer.id,
        email: customer.email,
        verified: customer.verified
      }
    });

  } catch (error) {
    console.error('Customer signup error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Internal server error'
      }
    });
  }
});

/**
 * @route   POST /api/auth/customer/verify-otp
 * @desc    Verify customer OTP
 * @access  Public
 */
router.post('/customer/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Email and OTP are required'
        }
      });
    }

    if (!isValidOTP(otp)) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Invalid OTP format'
        }
      });
    }

    // Get customer
    const { data: customer, error } = await supabaseAdmin
      .from('customers')
      .select('*')
      .eq('email', email.toLowerCase())
      .single();

    if (error || !customer) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Customer not found'
        }
      });
    }

    if (customer.verified) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Account already verified'
        }
      });
    }

    // Check OTP
    if (customer.otp !== otp) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Invalid OTP'
        }
      });
    }

    // Check if OTP is expired
    if (isOTPExpired(new Date(customer.otp_expiry).getTime())) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'OTP has expired. Please request a new one.'
        }
      });
    }

    // Verify customer
    const { error: updateError } = await supabaseAdmin
      .from('customers')
      .update({
        verified: true,
        otp: null,
        otp_expiry: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', customer.id);

    if (updateError) {
      console.error('Error verifying customer:', updateError);
      return res.status(500).json({
        success: false,
        error: {
          message: 'Failed to verify account'
        }
      });
    }

    // Send welcome email
    try {
      await emailService.sendWelcomeEmail(email, `${customer.first_name} ${customer.last_name}`, 'customer');
    } catch (emailError) {
      console.error('Error sending welcome email:', emailError);
    }

    res.json({
      success: true,
      message: 'Account verified successfully'
    });

  } catch (error) {
    console.error('OTP verification error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Internal server error'
      }
    });
  }
});

/**
 * @route   POST /api/auth/customer/login
 * @desc    Login customer
 * @access  Public
 */
router.post('/customer/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Email and password are required'
        }
      });
    }

    // Get customer
    const { data: customer, error } = await supabaseAdmin
      .from('customers')
      .select('*')
      .eq('email', email.toLowerCase())
      .single();

    if (error || !customer) {
      return res.status(401).json({
        success: false,
        error: {
          message: 'Invalid credentials'
        }
      });
    }

    // Check if account is verified
    if (!customer.verified) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Please verify your email before logging in'
        }
      });
    }

    // Check password
    const isPasswordValid = await bcrypt.compare(password, customer.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        error: {
          message: 'Invalid credentials'
        }
      });
    }

    // Generate token
    const token = generateToken(customer.id, 'customer');

    // Update last login
    await supabaseAdmin
      .from('customers')
      .update({ last_login: new Date().toISOString() })
      .eq('id', customer.id);

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        token,
        user: {
          id: customer.id,
          firstName: customer.first_name,
          lastName: customer.last_name,
          email: customer.email,
          role: customer.role,
          verified: customer.verified,
          profile_completed: customer.profile_completed,
          profilePhoto: customer.profile_photo,
          gender: customer.gender,
          address: customer.address,
          phoneNumber: customer.phone_number,
          dateOfBirth: customer.date_of_birth,
          createdAt: customer.created_at
        }
      }
    });

  } catch (error) {
    console.error('Customer login error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Internal server error'
      }
    });
  }
});

/**
 * @route   POST /api/auth/customer/resend-otp
 * @desc    Resend OTP for customer
 * @access  Public
 */
router.post('/customer/resend-otp', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Email is required'
        }
      });
    }

    // Get customer
    const { data: customer, error } = await supabaseAdmin
      .from('customers')
      .select('*')
      .eq('email', email.toLowerCase())
      .single();

    if (error || !customer) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Customer not found'
        }
      });
    }

    if (customer.verified) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Account already verified'
        }
      });
    }

    // Generate new OTP
    const otp = generateOTP();
    const otpExpiry = generateOTPExpiry();

    // Update customer with new OTP
    const { error: updateError } = await supabaseAdmin
      .from('customers')
      .update({
        otp,
        otp_expiry: new Date(otpExpiry).toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', customer.id);

    if (updateError) {
      console.error('Error updating OTP:', updateError);
      return res.status(500).json({
        success: false,
        error: {
          message: 'Failed to generate new OTP'
        }
      });
    }

    // Send OTP email
    try {
      await emailService.sendOTPEmail(email, otp, 'verification');
    } catch (emailError) {
      console.error('Error sending OTP email:', emailError);
      return res.status(500).json({
        success: false,
        error: {
          message: 'Failed to send OTP email'
        }
      });
    }

    res.json({
      success: true,
      message: 'New OTP sent to your email'
    });

  } catch (error) {
    console.error('Resend OTP error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Internal server error'
      }
    });
  }
});

/**
 * @route   POST /api/auth/vendor/signup
 * @desc    Register a new vendor
 * @access  Public
 */
router.post('/vendor/signup', async (req, res) => {
  try {
    const {
      businessName, businessEmail, businessPhone, businessWebsite,
      businessAddress, city, state, country, postalCode,
      businessType, description, categories, password, agreeToTerms, agreeToVendorTerms
    } = req.body;

    // Validate input
    const validation = validateVendorSignup(req.body);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Validation failed',
          details: validation.errors
        }
      });
    }

    if (!agreeToTerms || !agreeToVendorTerms) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'You must agree to both terms and conditions and vendor agreement'
        }
      });
    }

    // Check if vendor already exists
    const { data: existingVendor } = await supabaseAdmin
      .from('vendors')
      .select('id')
      .eq('business_email', businessEmail.toLowerCase())
      .single();

    if (existingVendor) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Vendor with this email already exists'
        }
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Generate OTP
    const otp = generateOTP();
    const otpExpiry = generateOTPExpiry();

    // Create vendor
    const vendorData = {
      id: uuidv4(),
      business_name: sanitizeString(businessName),
      business_email: businessEmail.toLowerCase(),
      business_phone: businessPhone,
      business_website: businessWebsite || null,
      business_address: sanitizeString(businessAddress),
      city: sanitizeString(city),
      state: sanitizeString(state),
      country: sanitizeString(country),
      postal_code: sanitizeString(postalCode),
      business_type: sanitizeString(businessType),
      description: sanitizeString(description),
      categories: categories,
      password: hashedPassword,
      role: 'vendor',
      verified: false,
      approved: false,
      otp,
      otp_expiry: new Date(otpExpiry).toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { data: vendor, error } = await supabaseAdmin
      .from('vendors')
      .insert([vendorData])
      .select()
      .single();

    if (error) {
      console.error('Error creating vendor:', error);
      return res.status(500).json({
        success: false,
        error: {
          message: 'Failed to create vendor account'
        }
      });
    }

    // Send OTP email
    try {
      await emailService.sendOTPEmail(businessEmail, otp, 'verification');
    } catch (emailError) {
      console.error('Error sending OTP email:', emailError);
      // Don't fail the signup if email fails
    }

    res.status(201).json({
      success: true,
      message: 'Vendor account created successfully. Please check your email for verification code.',
      data: {
        vendorId: vendor.id,
        businessEmail: vendor.business_email,
        verified: vendor.verified,
        approved: vendor.approved
      }
    });

  } catch (error) {
    console.error('Vendor signup error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Internal server error'
      }
    });
  }
});

/**
 * @route   POST /api/auth/vendor/verify-otp
 * @desc    Verify vendor OTP
 * @access  Public
 */
router.post('/vendor/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Email and OTP are required'
        }
      });
    }

    if (!isValidOTP(otp)) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Invalid OTP format'
        }
      });
    }

    // Get vendor
    const { data: vendor, error } = await supabaseAdmin
      .from('vendors')
      .select('*')
      .eq('business_email', email.toLowerCase())
      .single();

    if (error || !vendor) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Vendor not found'
        }
      });
    }

    if (vendor.verified) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Account already verified'
        }
      });
    }

    // Check OTP
    if (vendor.otp !== otp) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Invalid OTP'
        }
      });
    }

    // Check if OTP is expired
    if (isOTPExpired(new Date(vendor.otp_expiry).getTime())) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'OTP has expired. Please request a new one.'
        }
      });
    }

    // Verify vendor
    const { error: updateError } = await supabaseAdmin
      .from('vendors')
      .update({
        verified: true,
        otp: null,
        otp_expiry: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', vendor.id);

    if (updateError) {
      console.error('Error verifying vendor:', updateError);
      return res.status(500).json({
        success: false,
        error: {
          message: 'Failed to verify account'
        }
      });
    }

    // Send welcome email
    try {
      await emailService.sendWelcomeEmail(email, vendor.business_name, 'vendor');
    } catch (emailError) {
      console.error('Error sending welcome email:', emailError);
    }

    res.json({
      success: true,
      message: 'Account verified successfully. Your application is now under review.'
    });

  } catch (error) {
    console.error('Vendor OTP verification error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Internal server error'
      }
    });
  }
});

/**
 * @route   POST /api/auth/vendor/login
 * @desc    Login vendor
 * @access  Public
 */
router.post('/vendor/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Email and password are required'
        }
      });
    }

    // Get vendor
    const { data: vendor, error } = await supabaseAdmin
      .from('vendors')
      .select('*')
      .eq('business_email', email.toLowerCase())
      .single();

    if (error || !vendor) {
      return res.status(401).json({
        success: false,
        error: {
          message: 'Invalid credentials'
        }
      });
    }

    // Check if account is verified
    if (!vendor.verified) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Please verify your email before logging in'
        }
      });
    }

    // Check if account is approved
    if (!vendor.approved) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Your vendor application is still under review. Please wait for approval.'
        }
      });
    }

    // Check password
    const isPasswordValid = await bcrypt.compare(password, vendor.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        error: {
          message: 'Invalid credentials'
        }
      });
    }

    // Generate token
    const token = generateToken(vendor.id, 'vendor');

    // Update last login
    await supabaseAdmin
      .from('vendors')
      .update({ last_login: new Date().toISOString() })
      .eq('id', vendor.id);

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        token,
        user: {
          id: vendor.id,
          businessName: vendor.business_name,
          businessEmail: vendor.business_email,
          businessPhone: vendor.business_phone,
          businessWebsite: vendor.business_website,
          businessAddress: vendor.business_address,
          city: vendor.city,
          state: vendor.state,
          country: vendor.country,
          postalCode: vendor.postal_code,
          businessType: vendor.business_type,
          description: vendor.description,
          categories: vendor.categories,
          role: vendor.role,
          verified: vendor.verified,
          approved: vendor.approved,
          createdAt: vendor.created_at
        }
      }
    });

  } catch (error) {
    console.error('Vendor login error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Internal server error'
      }
    });
  }
});

/**
 * @route   POST /api/auth/vendor/resend-otp
 * @desc    Resend OTP for vendor
 * @access  Public
 */
router.post('/vendor/resend-otp', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Email is required'
        }
      });
    }

    // Get vendor
    const { data: vendor, error } = await supabaseAdmin
      .from('vendors')
      .select('*')
      .eq('business_email', email.toLowerCase())
      .single();

    if (error || !vendor) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Vendor not found'
        }
      });
    }

    if (vendor.verified) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Account already verified'
        }
      });
    }

    // Generate new OTP
    const otp = generateOTP();
    const otpExpiry = generateOTPExpiry();

    // Update vendor with new OTP
    const { error: updateError } = await supabaseAdmin
      .from('vendors')
      .update({
        otp,
        otp_expiry: new Date(otpExpiry).toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', vendor.id);

    if (updateError) {
      console.error('Error updating OTP:', updateError);
      return res.status(500).json({
        success: false,
        error: {
          message: 'Failed to generate new OTP'
        }
      });
    }

    // Send OTP email
    try {
      await emailService.sendOTPEmail(email, otp, 'verification');
    } catch (emailError) {
      console.error('Error sending OTP email:', emailError);
      return res.status(500).json({
        success: false,
        error: {
          message: 'Failed to send OTP email'
        }
      });
    }

    res.json({
      success: true,
      message: 'New OTP sent to your email'
    });

  } catch (error) {
    console.error('Resend OTP error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Internal server error'
      }
    });
  }
});

/**
 * @route   GET /api/auth/me
 * @desc    Get current user profile
 * @access  Private
 */
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const { id, role } = req.user;

    let user;
    if (role === 'customer') {
      const { data, error } = await supabaseAdmin
        .from('customers')
        .select('*')
        .eq('id', id)
        .single();

      if (error || !data) {
        return res.status(404).json({
          success: false,
          error: {
            message: 'Customer not found'
          }
        });
      }

      user = {
        id: data.id,
        firstName: data.first_name,
        lastName: data.last_name,
        email: data.email,
        role: data.role,
        verified: data.verified,
        createdAt: data.created_at
      };
    } else if (role === 'vendor') {
      const { data, error } = await supabaseAdmin
        .from('vendors')
        .select('*')
        .eq('id', id)
        .single();

      if (error || !data) {
        return res.status(404).json({
          success: false,
          error: {
            message: 'Vendor not found'
          }
        });
      }

      user = {
        id: data.id,
        businessName: data.business_name,
        businessEmail: data.business_email,
        businessPhone: data.business_phone,
        businessWebsite: data.business_website,
        businessAddress: data.business_address,
        city: data.city,
        state: data.state,
        country: data.country,
        postalCode: data.postal_code,
        businessType: data.business_type,
        description: data.description,
        categories: data.categories,
        role: data.role,
        verified: data.verified,
        approved: data.approved,
        createdAt: data.created_at
      };
    }

    res.json({
      success: true,
      data: { user }
    });

  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Internal server error'
      }
    });
  }
});

module.exports = router;

