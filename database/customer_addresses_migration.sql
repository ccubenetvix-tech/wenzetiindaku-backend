-- Create customer_addresses table for storing multiple addresses per customer
-- Run this in your Supabase SQL editor

CREATE TABLE IF NOT EXISTS customer_addresses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    label VARCHAR(50) DEFAULT 'Home', -- Home, Work, Other, etc.
    full_name VARCHAR(200) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    street1 VARCHAR(255) NOT NULL,
    street2 VARCHAR(255),
    city VARCHAR(100) NOT NULL,
    state VARCHAR(100) NOT NULL,
    postal_code VARCHAR(20) NOT NULL,
    country VARCHAR(100) NOT NULL DEFAULT 'India',
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(customer_id, label) -- One address per label per customer
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_customer_addresses_customer_id ON customer_addresses(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_addresses_default ON customer_addresses(customer_id, is_default) WHERE is_default = TRUE;

-- Enable RLS
ALTER TABLE customer_addresses ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Customers can only see their own addresses
CREATE POLICY "Customers can view their own addresses"
    ON customer_addresses FOR SELECT
    USING (auth.uid()::text = customer_id::text);

-- RLS Policy: Customers can insert their own addresses
CREATE POLICY "Customers can insert their own addresses"
    ON customer_addresses FOR INSERT
    WITH CHECK (auth.uid()::text = customer_id::text);

-- RLS Policy: Customers can update their own addresses
CREATE POLICY "Customers can update their own addresses"
    ON customer_addresses FOR UPDATE
    USING (auth.uid()::text = customer_id::text);

-- RLS Policy: Customers can delete their own addresses
CREATE POLICY "Customers can delete their own addresses"
    ON customer_addresses FOR DELETE
    USING (auth.uid()::text = customer_id::text);

