const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

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

// Function to create messages table
async function createMessagesTable() {
  try {
    console.log('🔄 Creating messages table...');
    
    // Try to create table by inserting a dummy record first
    const { error: insertError } = await supabase
      .from('tiktok_messages')
      .insert([{
        id: 'dummy',
        timestamp: '2025-01-01 00:00:00 UTC',
        sender: 'dummy',
        content: 'dummy',
        date: '2025-01-01',
        time: '00:00:00',
        is_link: false,
        is_emoji: false,
        is_media: false
      }]);
    
    if (insertError && insertError.code === 'PGRST116') {
      console.log('📝 Table does not exist, please create it manually in Supabase SQL Editor:');
      console.log(`
CREATE TABLE tiktok_messages (
  id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  sender TEXT NOT NULL,
  content TEXT NOT NULL,
  date TEXT NOT NULL,
  time TEXT NOT NULL,
  is_link BOOLEAN DEFAULT FALSE,
  is_emoji BOOLEAN DEFAULT FALSE,
  is_media BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_tiktok_messages_date ON tiktok_messages(date);
CREATE INDEX idx_tiktok_messages_sender ON tiktok_messages(sender);
CREATE INDEX idx_tiktok_messages_timestamp ON tiktok_messages(timestamp);
      `);
      return false;
    }
    
    if (insertError) {
      console.error('❌ Error creating table:', insertError);
      return false;
    }
    
    console.log('✅ Messages table exists');
    return true;
  } catch (error) {
    console.error('❌ Error creating table:', error);
    return false;
  }
}

// Function to clear existing data
async function clearExistingData() {
  try {
    console.log('🔄 Clearing existing data...');
    
    const { error } = await supabase
      .from('tiktok_messages')
      .delete()
      .neq('id', 'dummy'); // Delete all records
    
    if (error) {
      console.error('❌ Error clearing data:', error);
      return false;
    }
    
    console.log('✅ Existing data cleared');
    return true;
  } catch (error) {
    console.error('❌ Error clearing data:', error);
    return false;
  }
}

// Function to upload messages in batches
async function uploadMessages(messages) {
  try {
    console.log(`🔄 Uploading ${messages.length} messages...`);
    
    const batchSize = 1000;
    const batches = [];
    
    // Split messages into batches
    for (let i = 0; i < messages.length; i += batchSize) {
      batches.push(messages.slice(i, i + batchSize));
    }
    
    console.log(`📦 Processing ${batches.length} batches...`);
    
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      console.log(`📤 Uploading batch ${i + 1}/${batches.length} (${batch.length} messages)...`);
      
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
    
    console.log('✅ All messages uploaded successfully');
    return true;
  } catch (error) {
    console.error('❌ Error uploading messages:', error);
    return false;
  }
}

// Function to create stats table
async function createStatsTable() {
  try {
    console.log('🔄 Creating stats table...');
    
    // Try to insert a dummy record first
    const { error: insertError } = await supabase
      .from('tiktok_stats')
      .insert([{
        total_messages: 0,
        total_days: 0,
        average_per_day: 0,
        current_streak: 0,
        longest_streak: 0,
        days_since_first: 0,
        milestones: {},
        sender_stats: {},
        messages_by_hour: {},
        top_words: []
      }]);
    
    if (insertError && insertError.code === 'PGRST116') {
      console.log('📝 Stats table does not exist, please create it manually in Supabase SQL Editor:');
      console.log(`
CREATE TABLE tiktok_stats (
  id SERIAL PRIMARY KEY,
  total_messages INTEGER NOT NULL,
  total_days INTEGER NOT NULL,
  average_per_day DECIMAL(10,2) NOT NULL,
  current_streak INTEGER NOT NULL,
  longest_streak INTEGER NOT NULL,
  days_since_first INTEGER NOT NULL,
  milestones JSONB NOT NULL,
  sender_stats JSONB NOT NULL,
  messages_by_hour JSONB NOT NULL,
  top_words JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
      `);
      return false;
    }
    
    if (insertError) {
      console.error('❌ Error creating stats table:', insertError);
      return false;
    }
    
    console.log('✅ Stats table exists');
    return true;
  } catch (error) {
    console.error('❌ Error creating stats table:', error);
    return false;
  }
}

// Function to upload stats
async function uploadStats(stats, streakInfo, daysSinceFirst) {
  try {
    console.log('🔄 Uploading stats...');
    
    // Clear existing stats
    await supabase.from('tiktok_stats').delete().neq('id', 0);
    
    const { error } = await supabase
      .from('tiktok_stats')
      .insert([{
        total_messages: stats.totalMessages,
        total_days: stats.totalDays,
        average_per_day: stats.averagePerDay,
        current_streak: streakInfo.current,
        longest_streak: streakInfo.longestStreak,
        days_since_first: daysSinceFirst,
        milestones: streakInfo.milestones,
        sender_stats: stats.senderStats,
        messages_by_hour: stats.messagesByHour,
        top_words: stats.topWords
      }]);
    
    if (error) {
      console.error('❌ Error uploading stats:', error);
      return false;
    }
    
    console.log('✅ Stats uploaded successfully');
    return true;
  } catch (error) {
    console.error('❌ Error uploading stats:', error);
    return false;
  }
}

// Main function
async function uploadToSupabase() {
  try {
    console.log('🚀 Starting Supabase upload...');
    
    // Read the processed data
    const dataPath = path.join(__dirname, '..', 'public', 'messages-data.json');
    const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    
    console.log(`📊 Found ${data.messages.length} messages to upload`);
    
    // Create tables
    const tableCreated = await createMessagesTable();
    if (!tableCreated) return;
    
    const statsTableCreated = await createStatsTable();
    if (!statsTableCreated) return;
    
    // Clear existing data
    const dataCleared = await clearExistingData();
    if (!dataCleared) return;
    
    // Upload messages
    const messagesUploaded = await uploadMessages(data.messages);
    if (!messagesUploaded) return;
    
    // Upload stats
    const statsUploaded = await uploadStats(data.stats, data.streakInfo, data.daysSinceFirst);
    if (!statsUploaded) return;
    
    console.log('🎉 All data uploaded to Supabase successfully!');
    console.log('📊 You can now query the data using:');
    console.log('   - tiktok_messages table for messages');
    console.log('   - tiktok_stats table for statistics');
    
  } catch (error) {
    console.error('❌ Error uploading to Supabase:', error);
  }
}

// Run the upload
uploadToSupabase();
