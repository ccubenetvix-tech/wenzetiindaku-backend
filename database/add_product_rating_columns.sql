-- Add rating and review_count columns to products table if they don't exist
-- Run this in your Supabase SQL editor

-- Add rating column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'products' 
        AND column_name = 'rating'
    ) THEN
        ALTER TABLE products 
        ADD COLUMN rating DECIMAL(3,2) DEFAULT 4.5;
    END IF;
END $$;

-- Add review_count column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'products' 
        AND column_name = 'review_count'
    ) THEN
        ALTER TABLE products 
        ADD COLUMN review_count INTEGER DEFAULT 0;
    END IF;
END $$;

-- Update existing products with default values if needed
UPDATE products 
SET 
    rating = COALESCE(rating, 4.5),
    review_count = COALESCE(review_count, 0)
WHERE rating IS NULL OR review_count IS NULL;

