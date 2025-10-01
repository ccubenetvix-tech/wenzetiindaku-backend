/**
 * OTP utility functions
 */

/**
 * Generate a 6-digit OTP
 */
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * Check if OTP is expired
 */
const isOTPExpired = (otpExpiry) => {
  return Date.now() > otpExpiry;
};

/**
 * Generate OTP expiry time (5 minutes from now)
 */
const generateOTPExpiry = () => {
  return Date.now() + (5 * 60 * 1000); // 5 minutes
};

/**
 * Validate OTP format
 */
const isValidOTP = (otp) => {
  return /^\d{6}$/.test(otp);
};

module.exports = {
  generateOTP,
  isOTPExpired,
  generateOTPExpiry,
  isValidOTP
};

