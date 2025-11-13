/**
 * Script to re-encrypt old messages that were encrypted with a random key
 * Run this once after setting up the fixed encryption key
 * 
 * Usage: node scripts/reencrypt_messages.js
 */

require('dotenv').config();
const { supabaseAdmin } = require('../config/supabase');
const { encrypt, decrypt } = require('../utils/encryption');

async function reencryptMessages() {
  console.log('Starting message re-encryption...');
  
  try {
    // Get all messages
    const { data: messages, error } = await supabaseAdmin
      .from('messages')
      .select('*')
      .order('created_at', { ascending: true });
    
    if (error) {
      console.error('Error fetching messages:', error);
      return;
    }
    
    console.log(`Found ${messages.length} messages to process`);
    
    let successCount = 0;
    let failCount = 0;
    let skipCount = 0;
    
    for (const message of messages) {
      try {
        // Try to decrypt with current key
        try {
          const decrypted = decrypt(message.encrypted_content);
          
          // If decryption succeeds, re-encrypt with current key to ensure consistency
          const { encrypted: newEncrypted, hash: newHash } = encrypt(decrypted);
          
          // Only update if the encrypted content changed (key might be the same)
          if (newEncrypted !== message.encrypted_content) {
            await supabaseAdmin
              .from('messages')
              .update({
                encrypted_content: newEncrypted,
                content_hash: newHash
              })
              .eq('id', message.id);
            
            successCount++;
            console.log(`✓ Re-encrypted message ${message.id}`);
          } else {
            skipCount++;
          }
        } catch (decryptError) {
          // Can't decrypt - message was encrypted with old random key
          console.log(`⚠ Cannot decrypt message ${message.id} - likely encrypted with old key`);
          console.log(`  This message will show "[Message could not be decrypted]" to users`);
          failCount++;
        }
      } catch (error) {
        console.error(`Error processing message ${message.id}:`, error);
        failCount++;
      }
    }
    
    console.log('\n=== Re-encryption Summary ===');
    console.log(`✓ Successfully re-encrypted: ${successCount}`);
    console.log(`⊘ Skipped (already correct): ${skipCount}`);
    console.log(`✗ Failed (old key): ${failCount}`);
    console.log(`\nNote: Failed messages were encrypted with a random key and cannot be recovered.`);
    console.log('New messages will work correctly with the fixed encryption key.');
    
  } catch (error) {
    console.error('Fatal error:', error);
  }
}

// Run if called directly
if (require.main === module) {
  reencryptMessages()
    .then(() => {
      console.log('\nRe-encryption complete!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Re-encryption failed:', error);
      process.exit(1);
    });
}

module.exports = { reencryptMessages };

