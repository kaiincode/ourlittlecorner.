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
  totalDays: number;
  averagePerDay: number;
  longestStreak: number;
  currentStreak: number;
  messagesByDay: { [key: string]: number };
  messagesByHour: { [key: string]: number };
  topWords: { word: string; count: number }[];
  senderStats: { [key: string]: number };
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

export function parseTikTokMessages(content: string, targetUserId: string): TikTokMessage[] {
  const lines = content.split('\n');
  const messages: TikTokMessage[] = [];
  let currentChat = '';
  
  for (const line of lines) {
    // Check if this is a new chat
    if (line.includes('>>> Chat History with')) {
      const match = line.match(/>>> Chat History with (.+)::/);
      if (match) {
        currentChat = match[1];
      }
      continue;
    }
    
    // Skip empty lines
    if (!line.trim()) continue;
    
    // Parse message line
    const messageMatch = line.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC) (.+): (.+)$/);
    if (messageMatch) {
      const [, timestamp, sender, content] = messageMatch;
      
      // Only include messages from the target user or pana_c0tta
      if (sender === targetUserId || sender === 'pana_c0tta') {
        const date = new Date(timestamp);
        const message: TikTokMessage = {
          id: `${timestamp}-${sender}-${Math.random()}`,
          timestamp,
          sender,
          content,
          date: date.toISOString().split('T')[0],
          time: date.toTimeString().split(' ')[0],
          isLink: content.includes('http'),
          isEmoji: /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]/u.test(content),
          isMedia: content.includes('tenor.com') || content.includes('tiktokv.com')
        };
        
        messages.push(message);
      }
    }
  }
  
  return messages.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}

export function calculateMessageStats(messages: TikTokMessage[]): MessageStats {
  const stats: MessageStats = {
    totalMessages: messages.length,
    totalDays: 0,
    averagePerDay: 0,
    longestStreak: 0,
    currentStreak: 0,
    messagesByDay: {},
    messagesByHour: {},
    topWords: [],
    senderStats: {}
  };
  
  // Calculate basic stats
  const uniqueDays = new Set(messages.map(m => m.date));
  stats.totalDays = uniqueDays.size;
  stats.averagePerDay = stats.totalDays > 0 ? Math.round(stats.totalMessages / stats.totalDays) : 0;
  
  // Messages by day
  messages.forEach(message => {
    stats.messagesByDay[message.date] = (stats.messagesByDay[message.date] || 0) + 1;
    
    const hour = new Date(message.timestamp).getHours();
    stats.messagesByHour[hour.toString()] = (stats.messagesByHour[hour.toString()] || 0) + 1;
    
    stats.senderStats[message.sender] = (stats.senderStats[message.sender] || 0) + 1;
  });
  
  // Calculate streaks
  const sortedDates = Array.from(uniqueDays).sort();
  let currentStreak = 0;
  let longestStreak = 0;
  let tempStreak = 0;
  
  for (let i = 0; i < sortedDates.length; i++) {
    const currentDate = new Date(sortedDates[i]);
    const nextDate = i < sortedDates.length - 1 ? new Date(sortedDates[i + 1]) : null;
    
    if (nextDate) {
      const diffDays = Math.floor((nextDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays === 1) {
        tempStreak++;
      } else {
        longestStreak = Math.max(longestStreak, tempStreak + 1);
        tempStreak = 0;
      }
    } else {
      longestStreak = Math.max(longestStreak, tempStreak + 1);
    }
  }
  
  // Calculate current streak (from the end)
  let currentStreakCount = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  for (let i = sortedDates.length - 1; i >= 0; i--) {
    const messageDate = new Date(sortedDates[i]);
    const diffDays = Math.floor((today.getTime() - messageDate.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays === currentStreakCount) {
      currentStreakCount++;
    } else {
      break;
    }
  }
  
  stats.currentStreak = currentStreakCount;
  stats.longestStreak = longestStreak;
  
  // Top words
  const wordCount: { [key: string]: number } = {};
  messages.forEach(message => {
    const words = message.content
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 2);
    
    words.forEach(word => {
      wordCount[word] = (wordCount[word] || 0) + 1;
    });
  });
  
  stats.topWords = Object.entries(wordCount)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 10)
    .map(([word, count]) => ({ word, count }));
  
  return stats;
}

export function calculateStreakInfo(messages: TikTokMessage[]): StreakInfo {
  const uniqueDays = new Set(messages.map(m => m.date));
  const sortedDates = Array.from(uniqueDays).sort();
  
  let currentStreak = 0;
  let longestStreak = 0;
  let tempStreak = 0;
  
  // Calculate streaks
  for (let i = 0; i < sortedDates.length; i++) {
    const currentDate = new Date(sortedDates[i]);
    const nextDate = i < sortedDates.length - 1 ? new Date(sortedDates[i + 1]) : null;
    
    if (nextDate) {
      const diffDays = Math.floor((nextDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays === 1) {
        tempStreak++;
      } else {
        longestStreak = Math.max(longestStreak, tempStreak + 1);
        tempStreak = 0;
      }
    } else {
      longestStreak = Math.max(longestStreak, tempStreak + 1);
    }
  }
  
  // Calculate current streak from today backwards
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  for (let i = sortedDates.length - 1; i >= 0; i--) {
    const messageDate = new Date(sortedDates[i]);
    const diffDays = Math.floor((today.getTime() - messageDate.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays === currentStreak) {
      currentStreak++;
    } else {
      break;
    }
  }
  
  return {
    current: currentStreak,
    longestStreak: longestStreak,
    milestones: {
      three: currentStreak >= 3,
      ten: currentStreak >= 10,
      thirty: currentStreak >= 30,
      hundred: currentStreak >= 100
    }
  };
}

export function filterMessages(
  messages: TikTokMessage[],
  searchTerm: string,
  selectedDate: string | null,
  senderFilter: string | null
): TikTokMessage[] {
  return messages.filter(message => {
    // Search filter
    if (searchTerm && !message.content.toLowerCase().includes(searchTerm.toLowerCase())) {
      return false;
    }
    
    // Date filter
    if (selectedDate && message.date !== selectedDate) {
      return false;
    }
    
    // Sender filter
    if (senderFilter && message.sender !== senderFilter) {
      return false;
    }
    
    return true;
  });
}

export function getDaysSinceFirstMessage(messages: TikTokMessage[]): number {
  if (messages.length === 0) return 0;
  
  const firstMessage = messages[0];
  const firstDate = new Date(firstMessage.timestamp);
  const today = new Date();
  
  return Math.floor((today.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24));
}
