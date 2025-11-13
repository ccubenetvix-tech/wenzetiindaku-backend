-- Chat System Database Schema
-- This migration creates tables for secure end-to-end encrypted messaging

-- Create conversations table
-- Each conversation is between a customer and a vendor
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_message_at TIMESTAMP WITH TIME ZONE,
    customer_unread_count INTEGER DEFAULT 0,
    vendor_unread_count INTEGER DEFAULT 0,
    -- Ensure one conversation per customer-vendor pair
    UNIQUE(customer_id, vendor_id)
);

-- Create messages table
-- Messages are encrypted before storage
-- Note: Sender validation is handled at the application level in backend routes
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL, -- Can be customer_id or vendor_id
    sender_role VARCHAR(20) NOT NULL CHECK (sender_role IN ('customer', 'vendor')),
    encrypted_content TEXT NOT NULL, -- Encrypted message content
    content_hash TEXT NOT NULL, -- Hash for integrity verification
    is_read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_conversations_customer_id ON conversations(customer_id);
CREATE INDEX IF NOT EXISTS idx_conversations_vendor_id ON conversations(vendor_id);
CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON conversations(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_is_read ON messages(is_read) WHERE is_read = FALSE;

-- Create function to update conversation updated_at and last_message_at
CREATE OR REPLACE FUNCTION update_conversation_on_message()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE conversations
    SET 
        updated_at = NOW(),
        last_message_at = NEW.created_at,
        customer_unread_count = CASE 
            WHEN NEW.sender_role = 'vendor' AND NEW.is_read = FALSE 
            THEN customer_unread_count + 1 
            ELSE customer_unread_count 
        END,
        vendor_unread_count = CASE 
            WHEN NEW.sender_role = 'customer' AND NEW.is_read = FALSE 
            THEN vendor_unread_count + 1 
            ELSE vendor_unread_count 
        END
    WHERE id = NEW.conversation_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update conversation when message is inserted
CREATE TRIGGER trigger_update_conversation_on_message
    AFTER INSERT ON messages
    FOR EACH ROW
    EXECUTE FUNCTION update_conversation_on_message();

-- Create function to update unread counts when message is read
CREATE OR REPLACE FUNCTION update_unread_counts_on_read()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_read = TRUE AND OLD.is_read = FALSE THEN
        UPDATE conversations
        SET 
            customer_unread_count = CASE 
                WHEN NEW.sender_role = 'vendor' 
                THEN GREATEST(0, customer_unread_count - 1)
                ELSE customer_unread_count
            END,
            vendor_unread_count = CASE 
                WHEN NEW.sender_role = 'customer' 
                THEN GREATEST(0, vendor_unread_count - 1)
                ELSE vendor_unread_count
            END
        WHERE id = NEW.conversation_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update unread counts when message is marked as read
CREATE TRIGGER trigger_update_unread_counts_on_read
    AFTER UPDATE OF is_read ON messages
    FOR EACH ROW
    WHEN (NEW.is_read IS DISTINCT FROM OLD.is_read)
    EXECUTE FUNCTION update_unread_counts_on_read();

-- Enable Row Level Security (RLS)
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies for conversations
-- Customers can only see their own conversations
CREATE POLICY "Customers can view own conversations" ON conversations
    FOR SELECT USING (
        customer_id IN (
            SELECT id FROM customers WHERE id::text = current_setting('app.current_user_id', true)
        )
    );

-- Vendors can only see their own conversations
CREATE POLICY "Vendors can view own conversations" ON conversations
    FOR SELECT USING (
        vendor_id IN (
            SELECT id FROM vendors WHERE id::text = current_setting('app.current_user_id', true)
        )
    );

-- RLS Policies for messages
-- Users can only see messages from their conversations
CREATE POLICY "Users can view messages from own conversations" ON messages
    FOR SELECT USING (
        conversation_id IN (
            SELECT id FROM conversations 
            WHERE customer_id::text = current_setting('app.current_user_id', true)
               OR vendor_id::text = current_setting('app.current_user_id', true)
        )
    );

-- Note: The RLS policies above use a setting that needs to be set in the application
-- For now, we'll rely on application-level security checks in the backend routes

