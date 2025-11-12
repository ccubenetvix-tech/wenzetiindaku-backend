-- Quick fix: Add rating and review_count columns to products table
-- Run this in your Supabase SQL editor to fix the review submission error

-- Add rating column if it doesn't exist
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS rating DECIMAL(3,2) DEFAULT 4.5;

-- Add review_count column if it doesn't exist
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS review_count INTEGER DEFAULT 0;

-- Update existing products with default values
UPDATE products 
SET 
    rating = COALESCE(rating, 4.5),
    review_count = COALESCE(review_count, 0)
WHERE rating IS NULL OR review_count IS NULL;

-- Recreate the trigger function with proper error handling
CREATE OR REPLACE FUNCTION update_product_rating()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE products
    SET 
        rating = (
            SELECT COALESCE(AVG(rating::numeric), 0)
            FROM reviews
            WHERE product_id = COALESCE(NEW.product_id, OLD.product_id)
        ),
        review_count = (
            SELECT COUNT(*)
            FROM reviews
            WHERE product_id = COALESCE(NEW.product_id, OLD.product_id)
        ),
        updated_at = NOW()
    WHERE id = COALESCE(NEW.product_id, OLD.product_id);
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

