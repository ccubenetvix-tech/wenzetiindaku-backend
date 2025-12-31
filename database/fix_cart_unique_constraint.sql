-- Remove the restrictive unique constraint that only checks product_id
ALTER TABLE cart DROP CONSTRAINT IF EXISTS cart_customer_id_product_id_key;

-- Add a new unique index that includes size and color
-- We use COALESCE to handle NULL values (treating them as empty strings for uniqueness purposes)
-- This allows:
-- 1. Product A (Size: S, Color: Red)
-- 2. Product A (Size: M, Color: Blue)
-- 3. Product A (No Size, No Color) - Treated as distinct from variants
CREATE UNIQUE INDEX IF NOT EXISTS idx_cart_unique_variant 
ON cart (customer_id, product_id, COALESCE(size, ''), COALESCE(color, ''));
