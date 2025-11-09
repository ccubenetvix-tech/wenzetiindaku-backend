const { supabaseAdmin } = require('../config/supabase');

const ROLE_LABELS = {
  customer: 'Customer',
  vendor: 'Vendor'
};

const getRoleLabel = (role) => ROLE_LABELS[role] || 'Account';

const normalizeEmail = (email) => (email || '').trim().toLowerCase();

const fetchAccountByEmail = async (table, column, email) => {
  const { data, error } = await supabaseAdmin
    .from(table)
    .select('id')
    .eq(column, email)
    .maybeSingle();

  if (error && error.code !== 'PGRST116') {
    console.error(`Error querying ${table} by email:`, error);
    throw error;
  }

  return data;
};

const checkEmailRegistration = async (rawEmail) => {
  const normalizedEmail = normalizeEmail(rawEmail);

  if (!normalizedEmail) {
    return {
      normalizedEmail,
      exists: false,
      role: null,
      message: null
    };
  }

  const [customerAccount, vendorAccount] = await Promise.all([
    fetchAccountByEmail('customers', 'email', normalizedEmail),
    fetchAccountByEmail('vendors', 'business_email', normalizedEmail)
  ]);

  if (customerAccount) {
    return {
      normalizedEmail,
      exists: true,
      role: 'customer',
      message: 'This email is already registered as a Customer. Please use a different email.'
    };
  }

  if (vendorAccount) {
    return {
      normalizedEmail,
      exists: true,
      role: 'vendor',
      message: 'This email is already registered as a Vendor. Please use a different email.'
    };
  }

  return {
    normalizedEmail,
    exists: false,
    role: null,
    message: null
  };
};

module.exports = {
  checkEmailRegistration,
  getRoleLabel,
  normalizeEmail
};


