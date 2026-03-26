'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Navbar from '@/components/navbar';
import Footer from '@/components/footer';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Search, 
  Filter, 
  TrendingUp, 
  MessageSquare, 
  Clock, 
  Users, 
  BarChart3,
  MessageCircle,
  Activity,
  Target,
  Zap,
  Calendar,
  PieChart,
  TrendingDown,
  Heart,
  Star
} from 'lucide-react';
import { format } from 'date-fns';
import { filterMessages } from '@/lib/utils';
import { loadMessagesFromSupabase, searchMessages, getAvailableDates } from '@/lib/supabase/supabaseMessages';
import { supabase } from '@/lib/supabase/supabaseClient';
import { ResponsiveContainer, PieChart as RechartsPieChart, Pie, Cell, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, Label } from 'recharts';
import { ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent } from '@/components/ui/chart';

interface ProcessedData {
  messages: any[];
  stats: any;
  streakInfo: any;
  daysSinceFirst: number;
  processedAt: string;
}

export default function MessagesDashboard() {
  const [messages, setMessages] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [streakInfo, setStreakInfo] = useState<any>(null);
  const [daysSinceFirst, setDaysSinceFirst] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [senderFilter, setSenderFilter] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showMessages, setShowMessages] = useState(false);
  const [dayFilter, setDayFilter] = useState<string>('all');
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [filteredMessages, setFilteredMessages] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [chartKey, setChartKey] = useState(0);
  
  // Load data from Supabase
  useEffect(() => {
    const loadAllMessages = async () => {
      try {
        setIsLoading(true);
        console.log('🔄 Loading ALL messages from Supabase...');
        
        // Load ALL messages from Supabase with pagination to get everything
        let allMessages: any[] = [];
        let from = 0;
        const limit = 1000;
        let hasMore = true;
        
        while (hasMore) {
          const { data: batch, error: messagesError } = await supabase
            .from('tiktok_messages')
            .select('*')
            .order('timestamp', { ascending: false })
            .range(from, from + limit - 1);
          
          if (messagesError) {
            throw new Error(`Error loading messages: ${messagesError.message}`);
          }
          
          if (batch && batch.length > 0) {
            allMessages = [...allMessages, ...batch];
            from += limit;
            console.log(`📊 Loaded ${allMessages.length} messages so far...`);
          } else {
            hasMore = false;
          }
        }
        
        console.log(`📊 Loaded ${allMessages.length} total messages from Supabase`);
        
        // Transform messages
        const transformedMessages = allMessages.map(msg => ({
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
        
        setMessages(transformedMessages);
        
        // Load stats
        const { data: statsData, error: statsError } = await supabase
          .from('tiktok_stats')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(1)
          .single();
        
        if (statsData) {
          setStats({
            totalMessages: statsData.total_messages,
            averagePerDay: statsData.average_per_day,
            totalDays: statsData.total_days,
            messagesByHour: statsData.messages_by_hour,
            topWords: statsData.top_words,
            senderStats: statsData.sender_stats
          });
          
          setStreakInfo({
            current: statsData.current_streak,
            longestStreak: statsData.longest_streak,
            milestones: statsData.milestones
          });
          
          setDaysSinceFirst(statsData.days_since_first);
        }
        
        // Get available dates from loaded messages
        const uniqueDates = [...new Set(transformedMessages.map(m => m.date))].sort();
        setAvailableDates(uniqueDates);
        
        console.log('✅ All data loaded successfully');
        
      } catch (error) {
        console.error('❌ Error loading data:', error);
        // Fallback to JSON if Supabase fails
        try {
          console.log('🔄 Falling back to JSON data...');
          const response = await fetch('/messages-optimized.json');
          const data = await response.json();
          
          setStats(data.stats);
          setStreakInfo(data.streakInfo);
          setDaysSinceFirst(data.daysSinceFirst);
          
          const messageMetadata = data.messageMetadata.map((meta: any) => ({
            ...meta,
            content: meta.contentPreview
          }));
          setMessages(messageMetadata);
          
          console.log('✅ Fallback to JSON successful');
          
        } catch (jsonError) {
          console.error('❌ Error loading JSON fallback:', jsonError);
        }
      } finally {
        setIsLoading(false);
      }
    };

    loadAllMessages();
  }, []);

  // Filter messages locally from loaded data
  useEffect(() => {
    const performLocalFilter = () => {
      if (!selectedDate && !selectedYear && !selectedMonth && !selectedDay && !senderFilter && dayFilter === 'all') {
        // No filters, show all messages
        setFilteredMessages(messages);
        return;
      }

      console.log('🔍 Applying local filters:', { selectedDate, selectedYear, selectedMonth, selectedDay, senderFilter, dayFilter });
      
      let filtered = [...messages];
      
      // Apply date filter
      if (selectedDate) {
        filtered = filtered.filter(message => message.date === selectedDate);
      }
      
      // Apply year/month/day filters
      if (selectedYear || selectedMonth || selectedDay) {
        filtered = filtered.filter(message => {
          const [year, month, day] = message.date.split('-');
          return (!selectedYear || year === selectedYear) &&
                 (!selectedMonth || month === selectedMonth) &&
                 (!selectedDay || day === selectedDay);
        });
      }
      
      // Apply sender filter
      if (senderFilter) {
        filtered = filtered.filter(message => message.sender === senderFilter);
      }
      
      // Apply day filter
      if (dayFilter !== 'all') {
        const dayLimit = parseInt(dayFilter);
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - dayLimit);
        const cutoffDateString = cutoffDate.toISOString().split('T')[0];
        
        filtered = filtered.filter(message => message.date >= cutoffDateString);
      }
      
      // Sort messages by timestamp (newest first)
      const sortedFiltered = filtered.sort((a, b) => {
        const dateA = new Date(a.timestamp);
        const dateB = new Date(b.timestamp);
        return dateB.getTime() - dateA.getTime();
      });
      
      console.log(`✅ Filtered to ${sortedFiltered.length} messages`);
      setFilteredMessages(sortedFiltered);
    };

    performLocalFilter();
  }, [selectedDate, selectedYear, selectedMonth, selectedDay, senderFilter, dayFilter, messages]);

  // Get unique senders
  const senders = useMemo(() => {
    const uniqueSenders = new Set(messages.map(m => m.sender));
    return Array.from(uniqueSenders);
  }, [messages]);

  // Memoize chart data to prevent re-renders
  const messagesByHourData = useMemo(() => {
    if (!stats?.messagesByHour) return [];
    const totalMessages = Object.values(stats.messagesByHour).reduce((sum: number, val) => sum + (val as number), 0);
    return Object.entries(stats.messagesByHour).map(([hour, count], index) => {
      const proportion = totalMessages > 0 ? ((count as number) / totalMessages * 100).toFixed(1) : '0';
      return {
        hour: `${hour}:00`,
        messages: count as number,
        name: `hour-${hour}-${index}`,
        proportion: parseFloat(proportion),
        totalMessages
      };
    });
  }, [stats?.messagesByHour]);


  const senderStatsData = useMemo(() => {
    if (!stats?.senderStats) return [];
    return Object.entries(stats.senderStats).map(([sender, count], index) => ({
      name: sender,
      value: count as number,
      color: sender === 'vxnp615' ? '#ff6b9d' : '#4f46e5',
      id: `sender-${sender}-${index}`
    }));
  }, [stats?.senderStats]);

  // Calculate filtered stats from ALL data up to selected date/streak
  const filteredStats = useMemo(() => {
    if (filteredMessages.length === 0) return null;
    
    // Get all messages from the beginning up to the filtered date range
    let statsMessages = [...messages];
    
    // If day filter is applied, get messages from beginning to that point
    if (dayFilter !== 'all') {
      const dayLimit = parseInt(dayFilter);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - dayLimit);
      const cutoffDateString = cutoffDate.toISOString().split('T')[0];
      
      // Get all messages from beginning to cutoff date
      statsMessages = messages.filter(message => message.date >= cutoffDateString);
    }
    
    // If specific date is selected, get messages from beginning to that date
    if (selectedDate) {
      statsMessages = messages.filter(message => message.date <= selectedDate);
    }
    
     if (senderFilter) {
       statsMessages = statsMessages.filter(message => message.sender === senderFilter);
     }
    
    const totalMessages = statsMessages.length;
    
    // Calculate unique days from stats messages
    const uniqueDays = new Set(statsMessages.map(m => m.date)).size;
    const averagePerDay = uniqueDays > 0 ? totalMessages / uniqueDays : 0;
    
    // Calculate sender stats from stats messages
    const senderStats: { [key: string]: number } = {};
    statsMessages.forEach(message => {
      senderStats[message.sender] = (senderStats[message.sender] || 0) + 1;
    });
    
    // Calculate messages by hour from stats messages
    const messagesByHour: { [key: string]: number } = {};
    statsMessages.forEach(message => {
      const hour = new Date(message.timestamp).getHours();
      messagesByHour[hour] = (messagesByHour[hour] || 0) + 1;
    });
    
    // Calculate current streak from stats messages
    const sortedDates = Array.from(new Set(statsMessages.map(m => m.date))).sort();
    let currentStreak = 0;
    let longestStreak = 0;
    let tempStreak = 0;
    
    for (let i = 0; i < sortedDates.length; i++) {
      if (i === 0) {
        tempStreak = 1;
      } else {
        const prevDate = new Date(sortedDates[i - 1]);
        const currDate = new Date(sortedDates[i]);
        const diffDays = Math.floor((currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24));
        
        if (diffDays === 1) {
          tempStreak++;
        } else {
          longestStreak = Math.max(longestStreak, tempStreak);
          tempStreak = 1;
        }
      }
    }
    longestStreak = Math.max(longestStreak, tempStreak);
    currentStreak = tempStreak;
    
    // Calculate participants count
    const participants = Object.keys(senderStats).length;
    
    console.log(`📊 Stats calculated from ${statsMessages.length} messages (from beginning to selected period)`);
    
    return {
      totalMessages,
      totalDays: uniqueDays,
      averagePerDay: Math.round(averagePerDay * 100) / 100,
      senderStats,
      messagesByHour,
      currentStreak,
      longestStreak,
      participants
    };
   }, [filteredMessages, messages, dayFilter, selectedDate, senderFilter]);

  // Force chart re-render when data changes
  useEffect(() => {
    setChartKey(prev => prev + 1);
  }, [messagesByHourData, senderStatsData]);

  // availableDates is now managed as state from Supabase

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white">
        <Navbar currentPage="messages" />
        <div className="flex items-center justify-center min-h-[80vh]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-gray-300 border-t-gray-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading messages...</p>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <Navbar currentPage="messages" />

      {/* Title Section */}
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6 }}
        >
          <h1 className="font-handwriting text-3xl sm:text-5xl md:text-6xl text-black">
            Messages
          </h1>
          <p className="mt-2 text-gray-600 text-base sm:text-lg font-light">
            Our TikTok conversation archive
          </p>
        </motion.div>
      </div>

      {/* Global Filters */}
      <motion.div
        className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-8"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.2 }}
      >
        <Card className="bg-white border border-gray-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-gray-900">
              <Filter className="h-5 w-5 text-gray-500" />
              Global Filters
            </CardTitle>
            <CardDescription className="text-gray-600">
              Filter all statistics and messages by time range
            </CardDescription>
          </CardHeader>
          <CardContent>
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
               <Select value={senderFilter || 'all'} onValueChange={(value) => setSenderFilter(value === 'all' ? null : value)}>
                 <SelectTrigger className="border-gray-200 focus:border-black">
                   <SelectValue placeholder="Select sender" />
                 </SelectTrigger>
                 <SelectContent>
                   <SelectItem value="all">All Senders</SelectItem>
                   {senders.map(sender => (
                     <SelectItem key={sender} value={sender}>{sender}</SelectItem>
                   ))}
                 </SelectContent>
               </Select>

               <Select value={dayFilter} onValueChange={setDayFilter}>
                 <SelectTrigger className="border-gray-200 focus:border-black">
                   <SelectValue placeholder="Select time range" />
                 </SelectTrigger>
                 <SelectContent>
                   <SelectItem value="all">All Time</SelectItem>
                   <SelectItem value="116">Last 116 days (current streak)</SelectItem>
                   <SelectItem value="100">Last 100 days</SelectItem>
                   <SelectItem value="30">Last 30 days</SelectItem>
                   <SelectItem value="10">Last 10 days</SelectItem>
                   <SelectItem value="7">Last 7 days</SelectItem>
                 </SelectContent>
               </Select>

               <div className="grid grid-cols-3 gap-2">
                 <Select value={selectedYear || 'all'} onValueChange={(value) => setSelectedYear(value === 'all' ? null : value)}>
                   <SelectTrigger className="border-gray-200 focus:border-black">
                     <SelectValue placeholder="Year" />
                   </SelectTrigger>
                   <SelectContent className="max-h-[200px] overflow-y-auto">
                     <SelectItem value="all">All Years</SelectItem>
                     {[...new Set(availableDates.map(date => date.split('-')[0]))].sort().map(year => (
                       <SelectItem key={year} value={year}>{year}</SelectItem>
                     ))}
                   </SelectContent>
                 </Select>
                 
                 <Select value={selectedMonth || 'all'} onValueChange={(value) => setSelectedMonth(value === 'all' ? null : value)}>
                   <SelectTrigger className="border-gray-200 focus:border-black">
                     <SelectValue placeholder="Month" />
                   </SelectTrigger>
                   <SelectContent className="max-h-[200px] overflow-y-auto">
                     <SelectItem value="all">All Months</SelectItem>
                     {[...new Set(availableDates.map(date => date.split('-')[1]))].sort().map(month => (
                       <SelectItem key={month} value={month}>
                         {format(new Date(2024, parseInt(month) - 1, 1), 'MMM')}
                       </SelectItem>
                     ))}
                   </SelectContent>
                 </Select>
                 
                 <Select value={selectedDay || 'all'} onValueChange={(value) => setSelectedDay(value === 'all' ? null : value)}>
                   <SelectTrigger className="border-gray-200 focus:border-black">
                     <SelectValue placeholder="Day" />
                   </SelectTrigger>
                   <SelectContent className="max-h-[200px] overflow-y-auto">
                     <SelectItem value="all">All Days</SelectItem>
                     {[...new Set(availableDates.map(date => date.split('-')[2]))].sort().map(day => (
                       <SelectItem key={day} value={day}>{day}</SelectItem>
                     ))}
                   </SelectContent>
                 </Select>
               </div>
            </div>
            
            {(selectedDate || selectedYear || selectedMonth || selectedDay || senderFilter || dayFilter !== 'all') && (
              <div className="mt-4 flex gap-2 items-center">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => {
                    setSelectedDate(null);
                    setSelectedYear(null);
                    setSelectedMonth(null);
                    setSelectedDay(null);
                    setSenderFilter(null);
                    setDayFilter('all');
                  }}
                  className="border-gray-200 hover:border-black"
                >
                  Clear filters
                </Button>
                <Badge variant="secondary" className="bg-gray-100 text-gray-800">
                  {filteredMessages.length} messages
                </Badge>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20 sm:pb-12">

        {/* Stats Overview */}
        <motion.div 
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <Card className="bg-white border border-gray-200 hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-700">Total Messages</CardTitle>
              <MessageSquare className="h-4 w-4 text-gray-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-black">{filteredStats?.totalMessages?.toLocaleString() || 0}</div>
              <p className="text-xs text-gray-500">
                Avg {filteredStats?.averagePerDay || 0} per day
              </p>
            </CardContent>
          </Card>

          <Card className="bg-white border border-gray-200 hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-700">Days Active</CardTitle>
              <Clock className="h-4 w-4 text-gray-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-black">{filteredStats?.totalDays || 0}</div>
              <p className="text-xs text-gray-500">
                Active days
              </p>
            </CardContent>
          </Card>

          <Card className="bg-white border border-gray-200 hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-700">Current Streak</CardTitle>
              <TrendingUp className="h-4 w-4 text-gray-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-black">{filteredStats?.currentStreak || 0}</div>
              <p className="text-xs text-gray-500">
                Longest: {filteredStats?.longestStreak || 0}
              </p>
            </CardContent>
          </Card>

          <Card className="bg-white border border-gray-200 hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-700">Participants</CardTitle>
              <Users className="h-4 w-4 text-gray-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-black">{filteredStats?.participants || 0}</div>
              <p className="text-xs text-gray-500">
                {filteredStats?.senderStats && Object.entries(filteredStats.senderStats).map(([sender, count]) => (
                  <span key={sender} className="block">
                    {sender}: {count as number} msgs
                  </span>
                ))}
              </p>
            </CardContent>
          </Card>
        </motion.div>


        {/* Charts Section */}
        <motion.div
          className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
        >
           {/* Message Distribution Chart */}
           <Card className="flex flex-col bg-white border border-gray-200">
             <CardHeader className="items-center pb-0">
               <CardTitle className="text-gray-900">Message Distribution</CardTitle>
               <CardDescription className="text-gray-600">Total messages by sender</CardDescription>
             </CardHeader>
            <CardContent className="flex-1 pb-0">
              <ChartContainer
                config={{
                  messages: {
                    label: "Messages",
                  },
                  vxnp615: {
                    label: "vxnp615",
                    color: "var(--rose-500)",
                  },
                  pana_c0tta: {
                    label: "pana_c0tta", 
                    color: "var(--rose-700)",
                  },
                } satisfies ChartConfig}
                className="mx-auto aspect-square max-h-[250px]"
              >
                <RechartsPieChart>
                  <ChartTooltip
                    cursor={false}
                    content={<ChartTooltipContent hideLabel />}
                  />
                  <Pie
                    data={filteredStats ? Object.entries(filteredStats.senderStats).map(([sender, count]) => ({
                      sender: sender,
                      messages: count as number,
                      fill: sender === 'vxnp615' ? 'var(--rose-500)' : 'var(--rose-700)'
                    })) : senderStatsData.map(item => ({
                      sender: item.name,
                      messages: item.value,
                      fill: item.color
                    }))}
                    dataKey="messages"
                    nameKey="sender"
                    innerRadius={60}
                    strokeWidth={5}
                  >
                    <Label
                      content={({ viewBox }) => {
                        if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                          const totalMessages = filteredStats ? filteredStats.totalMessages : (senderStatsData.reduce((acc, curr) => acc + curr.value, 0));
                          return (
                            <text
                              x={viewBox.cx}
                              y={viewBox.cy}
                              textAnchor="middle"
                              dominantBaseline="middle"
                            >
                              <tspan
                                x={viewBox.cx}
                                y={viewBox.cy}
                                className="fill-foreground text-3xl font-bold"
                              >
                                {totalMessages.toLocaleString()}
                              </tspan>
                              <tspan
                                x={viewBox.cx}
                                y={(viewBox.cy || 0) + 24}
                                className="fill-muted-foreground"
                              >
                                Messages
                              </tspan>
                            </text>
                          )
                        }
                      }}
                    />
                  </Pie>
                </RechartsPieChart>
              </ChartContainer>
            </CardContent>
          </Card>

           {/* Activity by Hour Chart */}
           <Card className="bg-white border border-gray-200">
             <CardHeader>
               <CardTitle className="text-gray-900">Activity by Hour</CardTitle>
               <CardDescription className="text-gray-600">Messages sent by hour of day</CardDescription>
             </CardHeader>
            <CardContent>
              <ChartContainer 
                config={{
                  messages: {
                    label: "Messages",
                    color: "var(--rose-500)",
                  },
                  hour: {
                    label: "Hour",
                  },
                } satisfies ChartConfig}
              >
                <BarChart accessibilityLayer data={filteredStats ? Object.entries(filteredStats.messagesByHour).map(([hour, count]) => {
                  const totalMessages = Object.values(filteredStats.messagesByHour).reduce((sum, val) => sum + (val as number), 0);
                  const proportion = totalMessages > 0 ? ((count as number) / totalMessages * 100).toFixed(1) : 0;
                  return {
                    hour: `${hour}:00`,
                    messages: count as number,
                    proportion: `${proportion}%`,
                    totalMessages
                  };
                }) : messagesByHourData.map(item => ({
                  hour: item.hour,
                  messages: item.messages,
                  proportion: `${item.proportion}%`,
                  totalMessages: item.totalMessages
                }))}>
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey="hour"
                    tickLine={false}
                    tickMargin={10}
                    axisLine={false}
                    tickFormatter={(value) => value.slice(0, 5)}
                  />
                  <ChartTooltip 
                    content={<ChartTooltipContent 
                      formatter={(value, name, props) => [
                        `${value} messages (${props.payload.proportion}%)`,
                        'Messages'
                      ]}
                    />} 
                  />
                  <Bar
                    dataKey="messages"
                    radius={[4, 4, 0, 0]}
                  >
                     {filteredStats ? Object.entries(filteredStats.messagesByHour).map(([hour, count], index) => {
                       const roseColors = ['#fda4af', '#fb7185', '#f43f5e', '#e11d48', '#be123c'];
                       return (
                         <Cell 
                           key={`cell-${hour}`} 
                           fill={roseColors[index % roseColors.length]} 
                         />
                       );
                     }) : messagesByHourData.map((item, index) => {
                       const roseColors = ['#fda4af', '#fb7185', '#f43f5e', '#e11d48', '#be123c'];
                       return (
                         <Cell 
                           key={`cell-${item.hour}`} 
                           fill={roseColors[index % roseColors.length]} 
                         />
                       );
                     })}
                  </Bar>
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
        </motion.div>


         {/* Streak Milestones */}
         <motion.div
           initial={{ opacity: 0, y: 20 }}
           animate={{ opacity: 1, y: 0 }}
           transition={{ duration: 0.6, delay: 0.4 }}
         >
           <Card className="mb-8 bg-white border border-gray-200">
             <CardHeader>
               <CardTitle className="flex items-center gap-2 text-gray-900">
                 <Target className="h-5 w-5 text-gray-500" />
                 Streak Milestones
               </CardTitle>
               <CardDescription className="text-gray-600">
                 Your conversation achievements
               </CardDescription>
             </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className={`p-4 rounded-lg text-center border transition-all duration-300 ${
                  streakInfo?.milestones?.three 
                    ? 'bg-rose-400 text-white border-rose-400' 
                    : 'bg-white text-rose-400 border-rose-200'
                }`}>
                  <div className="w-12 h-12 mx-auto mb-2 bg-white/20 rounded-full flex items-center justify-center">
                    <span className="text-xl font-bold">3</span>
                  </div>
                  <div className="text-sm font-medium">Days</div>
                  {streakInfo?.milestones?.three && (
                    <Badge className="mt-2 bg-white text-rose-600">Achieved</Badge>
                  )}
                </div>
                
                <div className={`p-4 rounded-lg text-center border transition-all duration-300 ${
                  streakInfo?.milestones?.ten 
                    ? 'bg-rose-500 text-white border-rose-500' 
                    : 'bg-white text-rose-400 border-rose-200'
                }`}>
                  <div className="w-12 h-12 mx-auto mb-2 bg-white/20 rounded-full flex items-center justify-center">
                    <span className="text-xl font-bold">10</span>
                  </div>
                  <div className="text-sm font-medium">Days</div>
                  {streakInfo?.milestones?.ten && (
                    <Badge className="mt-2 bg-white text-rose-700">Achieved</Badge>
                  )}
                </div>
                
                <div className={`p-4 rounded-lg text-center border transition-all duration-300 ${
                  streakInfo?.milestones?.thirty 
                    ? 'bg-rose-600 text-white border-rose-600' 
                    : 'bg-white text-rose-400 border-rose-200'
                }`}>
                  <div className="w-12 h-12 mx-auto mb-2 bg-white/20 rounded-full flex items-center justify-center">
                    <span className="text-xl font-bold">30</span>
                  </div>
                  <div className="text-sm font-medium">Days</div>
                  {streakInfo?.milestones?.thirty && (
                    <Badge className="mt-2 bg-white text-rose-800">Achieved</Badge>
                  )}
                </div>
                
                <div className={`p-4 rounded-lg text-center border transition-all duration-300 ${
                  streakInfo?.milestones?.hundred 
                    ? 'bg-rose-700 text-white border-rose-700' 
                    : 'bg-white text-rose-400 border-rose-200'
                }`}>
                  <div className="w-12 h-12 mx-auto mb-2 bg-white/20 rounded-full flex items-center justify-center">
                    <span className="text-xl font-bold">100</span>
                  </div>
                  <div className="text-sm font-medium">Days</div>
                  {streakInfo?.milestones?.hundred && (
                    <Badge className="mt-2 bg-white text-rose-900">Achieved</Badge>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>


        {/* Messages and Analytics */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.8 }}
        >
           <div className="space-y-6">
               {/* Top Words */}
               <Card className="bg-white border border-gray-200">
                 <CardHeader>
                   <CardTitle className="flex items-center gap-2 text-gray-900">
                     <Activity className="h-5 w-5 text-gray-500" />
                     Top Words
                   </CardTitle>
                   <CardDescription className="text-gray-600">
                     Most frequently used words in your conversations
                   </CardDescription>
                 </CardHeader>
                 <CardContent>
                   <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                     {stats?.topWords?.map((word: any, index: number) => (
                       <motion.div 
                         key={word.word} 
                         className="text-center p-4 bg-gray-50 rounded-lg border border-gray-200 hover:shadow-md transition-all duration-200"
                         initial={{ opacity: 0, scale: 0.9 }}
                         animate={{ opacity: 1, scale: 1 }}
                         transition={{ delay: index * 0.1 }}
                       >
                         <div className="text-2xl font-bold text-black mb-1">{word.count}</div>
                         <div className="text-sm text-gray-600 font-medium">{word.word}</div>
                       </motion.div>
                     ))}
                   </div>
                 </CardContent>
               </Card>
           </div>
         </motion.div>
      </div>
      <Footer />
    </div>
  );
}
