-- Remove the unique constraint on (customer_id, label) to allow multiple addresses with the same label
-- Run this in your Supabase SQL editor

-- First, drop the existing unique constraint if it exists
ALTER TABLE customer_addresses 
DROP CONSTRAINT IF EXISTS customer_addresses_customer_id_label_key;

-- Note: Users can now have multiple addresses with the same label (e.g., multiple "Home" addresses)
-- The is_default flag will still ensure only one default address exists

