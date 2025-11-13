-- Chat Storage Optimization
-- This migration adds archiving and optimization features for chat messages

-- ============================================
-- OPTION 1: Message Archiving Table
-- ============================================
-- Archive old messages (e.g., older than 90 days) to a separate table
-- This keeps recent messages fast while reducing main table size

CREATE TABLE IF NOT EXISTS messages_archive (
    id UUID PRIMARY KEY,
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL,
    sender_role VARCHAR(20) NOT NULL CHECK (sender_role IN ('customer', 'vendor')),
    encrypted_content TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE,
    archived_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_archive_conversation_id ON messages_archive(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_archive_created_at ON messages_archive(created_at);

-- ============================================
-- OPTION 2: Message Compression Support
-- ============================================
-- Add compression flag to track compressed messages
-- Note: Compression is handled in application code before encryption

ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_compressed BOOLEAN DEFAULT FALSE;
ALTER TABLE messages_archive ADD COLUMN IF NOT EXISTS is_compressed BOOLEAN DEFAULT FALSE;

-- ============================================
-- OPTION 3: Message Retention Policy
-- ============================================
-- Function to automatically delete messages older than specified period
-- WARNING: This permanently deletes messages - use with caution!

CREATE OR REPLACE FUNCTION delete_old_messages(days_old INTEGER DEFAULT 365)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM messages 
    WHERE created_at < NOW() - (days_old || ' days')::INTERVAL;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- OPTION 4: Message Metadata Optimization
-- ============================================
-- Add message size tracking for monitoring

ALTER TABLE messages ADD COLUMN IF NOT EXISTS content_size INTEGER;
ALTER TABLE messages_archive ADD COLUMN IF NOT EXISTS content_size INTEGER;

-- Function to update content size
CREATE OR REPLACE FUNCTION update_message_size()
RETURNS TRIGGER AS $$
BEGIN
    NEW.content_size = LENGTH(NEW.encrypted_content);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update content size
DROP TRIGGER IF EXISTS trigger_update_message_size ON messages;
CREATE TRIGGER trigger_update_message_size
    BEFORE INSERT OR UPDATE ON messages
    FOR EACH ROW
    EXECUTE FUNCTION update_message_size();

DROP TRIGGER IF EXISTS trigger_update_message_size_archive ON messages_archive;
CREATE TRIGGER trigger_update_message_size_archive
    BEFORE INSERT OR UPDATE ON messages_archive
    FOR EACH ROW
    EXECUTE FUNCTION update_message_size();

-- ============================================
-- OPTION 5: Storage Statistics Function
-- ============================================
-- Function to get storage statistics

CREATE OR REPLACE FUNCTION get_chat_storage_stats()
RETURNS TABLE (
    active_messages BIGINT,
    archived_messages BIGINT,
    active_size_bytes BIGINT,
    archived_size_bytes BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        (SELECT COUNT(*) FROM messages)::BIGINT as active_messages,
        (SELECT COUNT(*) FROM messages_archive)::BIGINT as archived_messages,
        (SELECT COALESCE(SUM(LENGTH(encrypted_content)), 0) FROM messages)::BIGINT as active_size_bytes,
        (SELECT COALESCE(SUM(LENGTH(encrypted_content)), 0) FROM messages_archive)::BIGINT as archived_size_bytes;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- USAGE EXAMPLES:
-- ============================================

-- Get storage statistics:
-- SELECT * FROM get_chat_storage_stats();

-- Delete messages older than 1 year (permanent):
-- SELECT delete_old_messages(365);

-- Check storage usage:
-- SELECT 
--     COUNT(*) as total_messages,
--     pg_size_pretty(SUM(LENGTH(encrypted_content))) as total_content_size,
--     pg_size_pretty(pg_total_relation_size('messages')) as table_size
-- FROM messages;

