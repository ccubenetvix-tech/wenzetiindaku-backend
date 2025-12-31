-- Add multiple images and variants to products table
ALTER TABLE products ADD COLUMN IF NOT EXISTS images text[] DEFAULT '{}';
ALTER TABLE products ADD COLUMN IF NOT EXISTS sizes text[] DEFAULT '{}';
ALTER TABLE products ADD COLUMN IF NOT EXISTS colors text[] DEFAULT '{}';

-- Add variant selection to cart table
ALTER TABLE cart ADD COLUMN IF NOT EXISTS size text;
ALTER TABLE cart ADD COLUMN IF NOT EXISTS color text;
