#!/usr/bin/env node

/**
 * Script to archive old chat messages
 * Run this periodically (e.g., via cron job) to reduce storage costs
 * 
 * Usage:
 *   node scripts/archive-messages.js [days] [--dry-run]
 * 
 * Examples:
 *   node scripts/archive-messages.js 90          # Archive messages older than 90 days
 *   node scripts/archive-messages.js 90 --dry-run # Preview what would be archived
 */

require('dotenv').config();
const { archiveOldMessages, getStorageStats } = require('../utils/messageArchiver');

const args = process.argv.slice(2);
const daysOld = parseInt(args[0]) || 90;
const isDryRun = args.includes('--dry-run');

async function main() {
  console.log('='.repeat(50));
  console.log('Chat Message Archiver');
  console.log('='.repeat(50));
  
  if (isDryRun) {
    console.log('🔍 DRY RUN MODE - No changes will be made\n');
  }

  // Get current stats
  console.log('📊 Current Storage Statistics:');
  const statsBefore = await getStorageStats();
  console.log(`   Active messages: ${statsBefore.active.toLocaleString()}`);
  console.log(`   Active size: ${statsBefore.activeSize}`);
  console.log(`   Archived messages: ${statsBefore.archived.toLocaleString()}`);
  console.log(`   Archived size: ${statsBefore.archivedSize}\n`);

  if (isDryRun) {
    console.log(`✅ Would archive messages older than ${daysOld} days`);
    console.log('   (Run without --dry-run to actually archive)');
    return;
  }

  console.log(`🔄 Archiving messages older than ${daysOld} days...\n`);
  
  const result = await archiveOldMessages(daysOld);
  
  if (result.error) {
    console.error('❌ Error:', result.error);
    process.exit(1);
  }

  console.log(`✅ Successfully archived ${result.archived.toLocaleString()} messages\n`);

  // Get updated stats
  console.log('📊 Updated Storage Statistics:');
  const statsAfter = await getStorageStats();
  console.log(`   Active messages: ${statsAfter.active.toLocaleString()}`);
  console.log(`   Active size: ${statsAfter.activeSize}`);
  console.log(`   Archived messages: ${statsAfter.archived.toLocaleString()}`);
  console.log(`   Archived size: ${statsAfter.archivedSize}\n`);

  const saved = statsBefore.active - statsAfter.active;
  if (saved > 0) {
    console.log(`💾 Freed up ${saved.toLocaleString()} messages from main table`);
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

