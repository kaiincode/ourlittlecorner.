-- Create tiktok_messages table
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

-- Create indexes for better performance
CREATE INDEX idx_tiktok_messages_date ON tiktok_messages(date);
CREATE INDEX idx_tiktok_messages_sender ON tiktok_messages(sender);
CREATE INDEX idx_tiktok_messages_timestamp ON tiktok_messages(timestamp);

-- Create tiktok_stats table
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

-- Enable Row Level Security (RLS)
ALTER TABLE tiktok_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE tiktok_stats ENABLE ROW LEVEL SECURITY;

-- Create policies for public access (adjust as needed)
CREATE POLICY "Allow public read access" ON tiktok_messages FOR SELECT USING (true);
CREATE POLICY "Allow public read access" ON tiktok_stats FOR SELECT USING (true);
