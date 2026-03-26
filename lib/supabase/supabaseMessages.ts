import { supabase } from '@/lib/supabase/supabaseClient';

export interface TikTokMessage {
  id: string;
  timestamp: string;
  sender: string;
  content: string;
  date: string;
  time: string;
  isLink: boolean;
  isEmoji: boolean;
  isMedia: boolean;
}

export interface MessageStats {
  totalMessages: number;
  averagePerDay: number;
  totalDays: number;
  messagesByHour: Record<string, number>;
  topWords: Array<{ word: string; count: number }>;
  senderStats: Record<string, number>;
}

export interface StreakInfo {
  current: number;
  longestStreak: number;
  milestones: {
    three: boolean;
    ten: boolean;
    thirty: boolean;
    hundred: boolean;
  };
}

export interface ProcessedData {
  messages: TikTokMessage[];
  stats: MessageStats;
  streakInfo: StreakInfo;
  daysSinceFirst: number;
}

// Function to load messages from Supabase
export async function loadMessagesFromSupabase(): Promise<ProcessedData> {
  try {
    console.log('🔄 Loading messages from Supabase...');
    
    // Load messages
    const { data: messages, error: messagesError } = await supabase
      .from('tiktok_messages')
      .select('*')
      .order('timestamp', { ascending: true });
    
    if (messagesError) {
      throw new Error(`Error loading messages: ${messagesError.message}`);
    }
    
    // Load stats
    const { data: statsData, error: statsError } = await supabase
      .from('tiktok_stats')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    
    if (statsError) {
      throw new Error(`Error loading stats: ${statsError.message}`);
    }
    
    // Transform data
    const transformedMessages: TikTokMessage[] = messages.map(msg => ({
      id: msg.id,
      timestamp: msg.timestamp,
      sender: msg.sender,
      content: msg.content,
      date: msg.date,
      time: msg.time,
      isLink: msg.is_link,
      isEmoji: msg.is_emoji,
      isMedia: msg.is_media
    }));
    
    const stats: MessageStats = {
      totalMessages: statsData.total_messages,
      averagePerDay: statsData.average_per_day,
      totalDays: statsData.total_days,
      messagesByHour: statsData.messages_by_hour,
      topWords: statsData.top_words,
      senderStats: statsData.sender_stats
    };
    
    const streakInfo: StreakInfo = {
      current: statsData.current_streak,
      longestStreak: statsData.longest_streak,
      milestones: statsData.milestones
    };
    
    console.log('✅ Messages loaded from Supabase successfully');
    console.log(`📊 Loaded ${transformedMessages.length} messages`);
    
    return {
      messages: transformedMessages,
      stats,
      streakInfo,
      daysSinceFirst: statsData.days_since_first
    };
    
  } catch (error) {
    console.error('❌ Error loading from Supabase:', error);
    throw error;
  }
}

// Function to search messages - load ALL data and filter
export async function searchMessages(
  searchTerm: string,
  selectedDate: string | null,
  senderFilter: string | null,
  dayFilter: string
): Promise<TikTokMessage[]> {
  try {
    console.log('🔍 Searching messages with filters:', { searchTerm, selectedDate, senderFilter, dayFilter });
    
    // Load ALL messages first
    const { data: allMessages, error: allError } = await supabase
      .from('tiktok_messages')
      .select('*')
      .order('timestamp', { ascending: false });
    
    if (allError) {
      throw new Error(`Error loading all messages: ${allError.message}`);
    }
    
    console.log(`📊 Loaded ${allMessages.length} total messages from Supabase`);
    
    // Transform to TikTokMessage format
    let filteredMessages = allMessages.map(msg => ({
      id: msg.id,
      timestamp: msg.timestamp,
      sender: msg.sender,
      content: msg.content,
      date: msg.date,
      time: msg.time,
      isLink: msg.is_link,
      isEmoji: msg.is_emoji,
      isMedia: msg.is_media
    }));
    
    // Apply filters
    if (searchTerm) {
      filteredMessages = filteredMessages.filter(msg => 
        msg.content.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    
    if (selectedDate) {
      filteredMessages = filteredMessages.filter(msg => msg.date === selectedDate);
    }
    
    if (senderFilter) {
      filteredMessages = filteredMessages.filter(msg => msg.sender === senderFilter);
    }
    
    if (dayFilter !== 'all') {
      const dayLimit = parseInt(dayFilter);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - dayLimit);
      const cutoffDateString = cutoffDate.toISOString().split('T')[0];
      
      filteredMessages = filteredMessages.filter(msg => msg.date >= cutoffDateString);
    }
    
    console.log(`✅ Filtered to ${filteredMessages.length} messages`);
    return filteredMessages;
    
  } catch (error) {
    console.error('❌ Error searching messages:', error);
    throw error;
  }
}

// Function to get available dates
export async function getAvailableDates(): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from('tiktok_messages')
      .select('date')
      .order('date', { ascending: false });
    
    if (error) {
      throw new Error(`Error getting dates: ${error.message}`);
    }
    
    return [...new Set(data.map(item => item.date))].sort();
    
  } catch (error) {
    console.error('❌ Error getting available dates:', error);
    throw error;
  }
}
