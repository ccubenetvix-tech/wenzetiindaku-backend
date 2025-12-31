-- 1. Ensure columns exist (Safely adds them if missing)
ALTER TABLE products ADD COLUMN IF NOT EXISTS images text[] DEFAULT '{}';
ALTER TABLE products ADD COLUMN IF NOT EXISTS sizes text[] DEFAULT '{}';
ALTER TABLE products ADD COLUMN IF NOT EXISTS colors text[] DEFAULT '{}';
ALTER TABLE cart ADD COLUMN IF NOT EXISTS size text;
ALTER TABLE cart ADD COLUMN IF NOT EXISTS color text;

-- 2. Remove the old, restrictive constraint
ALTER TABLE cart DROP CONSTRAINT IF EXISTS cart_customer_id_product_id_key;

-- 3. Add the new flexible constraint (allows multiple variants)
-- We drop it first to be safe if you ran a previous version
DROP INDEX IF EXISTS idx_cart_unique_variant;

-- Create valid unique index that treats NULLs as empty strings for uniqueness
CREATE UNIQUE INDEX idx_cart_unique_variant 
ON cart (customer_id, product_id, COALESCE(size, ''), COALESCE(color, ''));
