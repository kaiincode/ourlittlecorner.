const { createClient } = require('@supabase/supabase-js');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

// Supabase configuration
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Function to clear all data
async function clearAllData() {
  try {
    console.log('🔄 Clearing all data...');
    
    // Clear messages
    const { error: messagesError } = await supabase
      .from('tiktok_messages')
      .delete()
      .neq('id', 'dummy');
    
    if (messagesError) {
      console.error('❌ Error clearing messages:', messagesError);
      return false;
    }
    
    // Clear stats
    const { error: statsError } = await supabase
      .from('tiktok_stats')
      .delete()
      .neq('id', 0);
    
    if (statsError) {
      console.error('❌ Error clearing stats:', statsError);
      return false;
    }
    
    console.log('✅ All data cleared successfully');
    return true;
  } catch (error) {
    console.error('❌ Error clearing data:', error);
    return false;
  }
}

// Function to update data with new messages
async function updateData(newMessagesData) {
  try {
    console.log('🔄 Updating data...');
    
    // Clear existing data
    await clearAllData();
    
    // Upload new messages
    const batchSize = 1000;
    const batches = [];
    
    for (let i = 0; i < newMessagesData.messages.length; i += batchSize) {
      batches.push(newMessagesData.messages.slice(i, i + batchSize));
    }
    
    console.log(`📦 Processing ${batches.length} batches...`);
    
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      console.log(`📤 Uploading batch ${i + 1}/${batches.length}...`);
      
      const { error } = await supabase
        .from('tiktok_messages')
        .insert(batch.map(msg => ({
          id: msg.id,
          timestamp: msg.timestamp,
          sender: msg.sender,
          content: msg.content,
          date: msg.date,
          time: msg.time,
          is_link: msg.isLink,
          is_emoji: msg.isEmoji,
          is_media: msg.isMedia
        })));
      
      if (error) {
        console.error(`❌ Error uploading batch ${i + 1}:`, error);
        return false;
      }
    }
    
    // Upload new stats
    const { error: statsError } = await supabase
      .from('tiktok_stats')
      .insert([{
        total_messages: newMessagesData.stats.totalMessages,
        total_days: newMessagesData.stats.totalDays,
        average_per_day: newMessagesData.stats.averagePerDay,
        current_streak: newMessagesData.streakInfo.current,
        longest_streak: newMessagesData.streakInfo.longestStreak,
        days_since_first: newMessagesData.daysSinceFirst,
        milestones: newMessagesData.streakInfo.milestones,
        sender_stats: newMessagesData.stats.senderStats,
        messages_by_hour: newMessagesData.stats.messagesByHour,
        top_words: newMessagesData.stats.topWords
      }]);
    
    if (statsError) {
      console.error('❌ Error uploading stats:', statsError);
      return false;
    }
    
    console.log('✅ Data updated successfully');
    return true;
  } catch (error) {
    console.error('❌ Error updating data:', error);
    return false;
  }
}

// Function to get data summary
async function getDataSummary() {
  try {
    console.log('📊 Getting data summary...');
    
    // Get message count
    const { count: messageCount, error: messageError } = await supabase
      .from('tiktok_messages')
      .select('*', { count: 'exact', head: true });
    
    if (messageError) {
      console.error('❌ Error getting message count:', messageError);
      return;
    }
    
    // Get stats
    const { data: stats, error: statsError } = await supabase
      .from('tiktok_stats')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    
    if (statsError) {
      console.error('❌ Error getting stats:', statsError);
      return;
    }
    
    console.log('📊 Data Summary:');
    console.log(`   - Total messages: ${messageCount}`);
    console.log(`   - Total days: ${stats?.total_days || 0}`);
    console.log(`   - Current streak: ${stats?.current_streak || 0}`);
    console.log(`   - Longest streak: ${stats?.longest_streak || 0}`);
    console.log(`   - Days since first: ${stats?.days_since_first || 0}`);
    
  } catch (error) {
    console.error('❌ Error getting data summary:', error);
  }
}

// Function to delete specific date range
async function deleteDateRange(startDate, endDate) {
  try {
    console.log(`🔄 Deleting messages from ${startDate} to ${endDate}...`);
    
    const { error } = await supabase
      .from('tiktok_messages')
      .delete()
      .gte('date', startDate)
      .lte('date', endDate);
    
    if (error) {
      console.error('❌ Error deleting date range:', error);
      return false;
    }
    
    console.log('✅ Date range deleted successfully');
    return true;
  } catch (error) {
    console.error('❌ Error deleting date range:', error);
    return false;
  }
}

// Export functions for use in other scripts
module.exports = {
  clearAllData,
  updateData,
  getDataSummary,
  deleteDateRange
};

// CLI usage
if (require.main === module) {
  const command = process.argv[2];
  
  switch (command) {
    case 'clear':
      clearAllData();
      break;
    case 'summary':
      getDataSummary();
      break;
    case 'delete-range':
      const startDate = process.argv[3];
      const endDate = process.argv[4];
      if (startDate && endDate) {
        deleteDateRange(startDate, endDate);
      } else {
        console.log('Usage: node supabaseDataManager.js delete-range <startDate> <endDate>');
      }
      break;
    default:
      console.log('Usage:');
      console.log('  node supabaseDataManager.js clear');
      console.log('  node supabaseDataManager.js summary');
      console.log('  node supabaseDataManager.js delete-range <startDate> <endDate>');
  }
}
