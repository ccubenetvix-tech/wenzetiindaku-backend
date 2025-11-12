-- Reviews System Migration
-- Run this in your Supabase SQL editor

-- Create reviews table
CREATE TABLE IF NOT EXISTS reviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(customer_id, product_id) -- One review per customer per product
);

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_reviews_product_id ON reviews(product_id);
CREATE INDEX IF NOT EXISTS idx_reviews_customer_id ON reviews(customer_id);
CREATE INDEX IF NOT EXISTS idx_reviews_vendor_id ON reviews(vendor_id);
CREATE INDEX IF NOT EXISTS idx_reviews_order_id ON reviews(order_id);
CREATE INDEX IF NOT EXISTS idx_reviews_rating ON reviews(rating);

-- Create trigger for updated_at
CREATE TRIGGER update_reviews_updated_at BEFORE UPDATE ON reviews
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for reviews
CREATE POLICY "Anyone can view published reviews" ON reviews
    FOR SELECT USING (true);

CREATE POLICY "Customers can create own reviews" ON reviews
    FOR INSERT WITH CHECK (auth.uid()::text = customer_id::text);

CREATE POLICY "Customers can update own reviews" ON reviews
    FOR UPDATE USING (auth.uid()::text = customer_id::text);

CREATE POLICY "Customers can delete own reviews" ON reviews
    FOR DELETE USING (auth.uid()::text = customer_id::text);

-- Ensure rating and review_count columns exist in products table
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

-- Function to update product rating and review count
CREATE OR REPLACE FUNCTION update_product_rating()
RETURNS TRIGGER AS $$
BEGIN
    -- Check if columns exist before updating
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'products' 
        AND column_name = 'rating'
    ) AND EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'products' 
        AND column_name = 'review_count'
    ) THEN
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
    END IF;
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Create triggers to update product rating on review changes
CREATE TRIGGER update_product_rating_on_insert
    AFTER INSERT ON reviews
    FOR EACH ROW
    EXECUTE FUNCTION update_product_rating();

CREATE TRIGGER update_product_rating_on_update
    AFTER UPDATE ON reviews
    FOR EACH ROW
    EXECUTE FUNCTION update_product_rating();

CREATE TRIGGER update_product_rating_on_delete
    AFTER DELETE ON reviews
    FOR EACH ROW
    EXECUTE FUNCTION update_product_rating();

-- Add comment to document the table
COMMENT ON TABLE reviews IS 'Product reviews from customers who have ordered the product';
COMMENT ON COLUMN reviews.order_id IS 'Reference to the order that allowed this review';

