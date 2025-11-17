-- Add alt_phone column to customer_addresses table
-- Run this in your Supabase SQL editor

ALTER TABLE customer_addresses 
ADD COLUMN IF NOT EXISTS alt_phone VARCHAR(20);

-- Add comment to document the field
COMMENT ON COLUMN customer_addresses.alt_phone IS 'Optional alternate phone number for the address';

