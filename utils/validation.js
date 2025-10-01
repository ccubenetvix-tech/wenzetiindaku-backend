const validator = require('validator');

/**
 * Validation utility functions
 */

/**
 * Validate email format
 */
const isValidEmail = (email) => {
  return validator.isEmail(email);
};

/**
 * Validate password strength
 */
const isValidPassword = (password) => {
  // At least 8 characters, 1 uppercase, 1 lowercase, 1 number
  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d@$!%*?&]{8,}$/;
  return passwordRegex.test(password);
};

/**
 * Validate phone number (basic validation)
 */
const isValidPhone = (phone) => {
  // Remove all non-digit characters
  const cleanPhone = phone.replace(/\D/g, '');
  // Check if it's between 10-15 digits
  return cleanPhone.length >= 10 && cleanPhone.length <= 15;
};

/**
 * Validate business name
 */
const isValidBusinessName = (name) => {
  return name && name.trim().length >= 2 && name.trim().length <= 100;
};

/**
 * Validate URL format
 */
const isValidURL = (url) => {
  if (!url) return true; // Optional field
  return validator.isURL(url, { protocols: ['http', 'https'] });
};

/**
 * Sanitize input string
 */
const sanitizeString = (str) => {
  if (!str) return '';
  return validator.escape(str.trim());
};

/**
 * Validate required fields
 */
const validateRequiredFields = (data, requiredFields) => {
  const missingFields = [];
  
  for (const field of requiredFields) {
    if (!data[field] || (typeof data[field] === 'string' && !data[field].trim())) {
      missingFields.push(field);
    }
  }
  
  return {
    isValid: missingFields.length === 0,
    missingFields
  };
};

/**
 * Validate customer signup data
 */
const validateCustomerSignup = (data) => {
  const errors = [];
  
  // Required fields
  const requiredFields = ['firstName', 'lastName', 'email', 'password'];
  const { isValid, missingFields } = validateRequiredFields(data, requiredFields);
  
  if (!isValid) {
    errors.push(`Missing required fields: ${missingFields.join(', ')}`);
  }
  
  // Email validation
  if (data.email && !isValidEmail(data.email)) {
    errors.push('Invalid email format');
  }
  
  // Password validation
  if (data.password && !isValidPassword(data.password)) {
    errors.push('Password must be at least 8 characters with uppercase, lowercase, and number');
  }
  
  // Name validation
  if (data.firstName && data.firstName.trim().length < 2) {
    errors.push('First name must be at least 2 characters');
  }
  
  if (data.lastName && data.lastName.trim().length < 2) {
    errors.push('Last name must be at least 2 characters');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
};

/**
 * Validate vendor signup data
 */
const validateVendorSignup = (data) => {
  const errors = [];
  
  // Required fields
  const requiredFields = [
    'businessName', 'businessEmail', 'businessPhone', 'businessAddress',
    'city', 'state', 'country', 'postalCode', 'businessType', 'description', 'password'
  ];
  
  const { isValid, missingFields } = validateRequiredFields(data, requiredFields);
  
  if (!isValid) {
    errors.push(`Missing required fields: ${missingFields.join(', ')}`);
  }
  
  // Email validation
  if (data.businessEmail && !isValidEmail(data.businessEmail)) {
    errors.push('Invalid business email format');
  }
  
  // Password validation
  if (data.password && !isValidPassword(data.password)) {
    errors.push('Password must be at least 8 characters with uppercase, lowercase, and number');
  }
  
  // Business name validation
  if (data.businessName && !isValidBusinessName(data.businessName)) {
    errors.push('Business name must be between 2-100 characters');
  }
  
  // Phone validation
  if (data.businessPhone && !isValidPhone(data.businessPhone)) {
    errors.push('Invalid phone number format');
  }
  
  // Website validation
  if (data.businessWebsite && !isValidURL(data.businessWebsite)) {
    errors.push('Invalid website URL format');
  }
  
  // Categories validation
  if (!data.categories || !Array.isArray(data.categories) || data.categories.length === 0) {
    errors.push('At least one product category must be selected');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
};

module.exports = {
  isValidEmail,
  isValidPassword,
  isValidPhone,
  isValidBusinessName,
  isValidURL,
  sanitizeString,
  validateRequiredFields,
  validateCustomerSignup,
  validateVendorSignup
};

