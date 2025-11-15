-- Add profile_photo column to vendors table
ALTER TABLE vendors 
ADD COLUMN IF NOT EXISTS profile_photo TEXT;

