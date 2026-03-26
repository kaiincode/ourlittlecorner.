-- Fix RLS policies for tiktok_messages
DROP POLICY IF EXISTS "Allow public read access" ON tiktok_messages;
DROP POLICY IF EXISTS "Allow public insert access" ON tiktok_messages;
DROP POLICY IF EXISTS "Allow public update access" ON tiktok_messages;
DROP POLICY IF EXISTS "Allow public delete access" ON tiktok_messages;

-- Create comprehensive policies
CREATE POLICY "Allow public read access" ON tiktok_messages FOR SELECT USING (true);
CREATE POLICY "Allow public insert access" ON tiktok_messages FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update access" ON tiktok_messages FOR UPDATE USING (true);
CREATE POLICY "Allow public delete access" ON tiktok_messages FOR DELETE USING (true);

-- Fix RLS policies for tiktok_stats
DROP POLICY IF EXISTS "Allow public read access" ON tiktok_stats;
DROP POLICY IF EXISTS "Allow public insert access" ON tiktok_stats;
DROP POLICY IF EXISTS "Allow public update access" ON tiktok_stats;
DROP POLICY IF EXISTS "Allow public delete access" ON tiktok_stats;

-- Create comprehensive policies for stats
CREATE POLICY "Allow public read access" ON tiktok_stats FOR SELECT USING (true);
CREATE POLICY "Allow public insert access" ON tiktok_stats FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update access" ON tiktok_stats FOR UPDATE USING (true);
CREATE POLICY "Allow public delete access" ON tiktok_stats FOR DELETE USING (true);
