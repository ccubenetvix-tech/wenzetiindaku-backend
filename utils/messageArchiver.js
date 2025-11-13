const { supabaseAdmin } = require('../config/supabase');

/**
 * Archive old messages to reduce main table size
 * Moves messages older than specified days to archive table
 * @param {number} daysOld - Number of days (default: 90)
 * @returns {Promise<{archived: number, error?: string}>}
 */
async function archiveOldMessages(daysOld = 90) {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    // Get old messages
    const { data: oldMessages, error: fetchError } = await supabaseAdmin
      .from('messages')
      .select('*')
      .lt('created_at', cutoffDate.toISOString());

    if (fetchError) {
      console.error('Error fetching old messages:', fetchError);
      return { archived: 0, error: fetchError.message };
    }

    if (!oldMessages || oldMessages.length === 0) {
      return { archived: 0 };
    }

    // Insert into archive table
    const { error: archiveError } = await supabaseAdmin
      .from('messages_archive')
      .insert(oldMessages.map(msg => ({
        ...msg,
        archived_at: new Date().toISOString()
      })));

    if (archiveError) {
      console.error('Error archiving messages:', archiveError);
      return { archived: 0, error: archiveError.message };
    }

    // Delete from main table
    const { error: deleteError } = await supabaseAdmin
      .from('messages')
      .delete()
      .lt('created_at', cutoffDate.toISOString());

    if (deleteError) {
      console.error('Error deleting archived messages:', deleteError);
      return { archived: oldMessages.length, error: 'Archived but failed to delete from main table' };
    }

    console.log(`Archived ${oldMessages.length} messages older than ${daysOld} days`);
    return { archived: oldMessages.length };
  } catch (error) {
    console.error('Archive messages error:', error);
    return { archived: 0, error: error.message };
  }
}

/**
 * Get archived messages for a conversation
 * @param {string} conversationId - Conversation ID
 * @param {number} limit - Number of messages to retrieve
 * @param {number} offset - Offset for pagination
 * @returns {Promise<{messages: Array, error?: string}>}
 */
async function getArchivedMessages(conversationId, limit = 50, offset = 0) {
  try {
    const { data: messages, error } = await supabaseAdmin
      .from('messages_archive')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('Error fetching archived messages:', error);
      return { messages: [], error: error.message };
    }

    return { messages: messages || [] };
  } catch (error) {
    console.error('Get archived messages error:', error);
    return { messages: [], error: error.message };
  }
}

/**
 * Restore archived messages back to main table
 * @param {Array<string>} messageIds - Array of message IDs to restore
 * @returns {Promise<{restored: number, error?: string}>}
 */
async function restoreArchivedMessages(messageIds) {
  try {
    // Get archived messages
    const { data: archivedMessages, error: fetchError } = await supabaseAdmin
      .from('messages_archive')
      .select('*')
      .in('id', messageIds);

    if (fetchError) {
      console.error('Error fetching archived messages:', fetchError);
      return { restored: 0, error: fetchError.message };
    }

    if (!archivedMessages || archivedMessages.length === 0) {
      return { restored: 0 };
    }

    // Remove archived_at field and insert into main table
    const messagesToRestore = archivedMessages.map(({ archived_at, ...msg }) => msg);

    const { error: insertError } = await supabaseAdmin
      .from('messages')
      .insert(messagesToRestore);

    if (insertError) {
      console.error('Error restoring messages:', insertError);
      return { restored: 0, error: insertError.message };
    }

    // Delete from archive
    const { error: deleteError } = await supabaseAdmin
      .from('messages_archive')
      .delete()
      .in('id', messageIds);

    if (deleteError) {
      console.error('Error deleting from archive:', deleteError);
      return { restored: archivedMessages.length, error: 'Restored but failed to delete from archive' };
    }

    return { restored: archivedMessages.length };
  } catch (error) {
    console.error('Restore archived messages error:', error);
    return { restored: 0, error: error.message };
  }
}

/**
 * Get storage statistics
 * @returns {Promise<{active: number, archived: number, activeSize: string, archivedSize: string}>}
 */
async function getStorageStats() {
  try {
    // Get active messages count and size
    const { data: activeMessages, error: activeError } = await supabaseAdmin
      .from('messages')
      .select('encrypted_content');

    if (activeError) {
      console.error('Error fetching active messages:', activeError);
    }

    // Get archived messages count and size
    const { data: archivedMessages, error: archivedError } = await supabaseAdmin
      .from('messages_archive')
      .select('encrypted_content');

    if (archivedError) {
      console.error('Error fetching archived messages:', archivedError);
    }

    const activeCount = activeMessages?.length || 0;
    const archivedCount = archivedMessages?.length || 0;

    const activeSize = activeMessages?.reduce((sum, msg) => sum + (msg.encrypted_content?.length || 0), 0) || 0;
    const archivedSize = archivedMessages?.reduce((sum, msg) => sum + (msg.encrypted_content?.length || 0), 0) || 0;

    return {
      active: activeCount,
      archived: archivedCount,
      activeSize: formatBytes(activeSize),
      archivedSize: formatBytes(archivedSize)
    };
  } catch (error) {
    console.error('Get storage stats error:', error);
    return { active: 0, archived: 0, activeSize: '0 B', archivedSize: '0 B' };
  }
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

module.exports = {
  archiveOldMessages,
  getArchivedMessages,
  restoreArchivedMessages,
  getStorageStats
};

