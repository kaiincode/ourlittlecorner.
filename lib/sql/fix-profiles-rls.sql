-- Fix profiles RLS policies to allow public read access
-- Run this SQL in your Supabase database

-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Users can view their own profile" ON profiles;

-- Create new policy that allows everyone to read all profiles (for displaying usernames)
CREATE POLICY "Public read profiles" ON profiles FOR SELECT USING (true);

-- Keep the existing update and insert policies (users can only modify their own)
-- These should already exist and be correct
