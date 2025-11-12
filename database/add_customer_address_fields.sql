-- Add address and phone_number columns to customers table if they don't exist
-- Run this in your Supabase SQL editor

-- Add address column if it doesn't exist
ALTER TABLE customers 
ADD COLUMN IF NOT EXISTS address TEXT;

-- Add phone_number column if it doesn't exist
ALTER TABLE customers 
ADD COLUMN IF NOT EXISTS phone_number VARCHAR(20);

-- Add other profile fields if they don't exist
ALTER TABLE customers 
ADD COLUMN IF NOT EXISTS gender VARCHAR(20);

ALTER TABLE customers 
ADD COLUMN IF NOT EXISTS date_of_birth DATE;

ALTER TABLE customers 
ADD COLUMN IF NOT EXISTS profile_completed BOOLEAN DEFAULT FALSE;

