-- Add missing username fields to profiles table
-- Run this SQL in your Supabase database

-- Add display_name column
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS display_name TEXT;

-- Add username column  
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS username TEXT;

-- Add full_name column
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS full_name TEXT;

-- Update existing profiles to use 'name' as display_name if display_name is null
UPDATE profiles 
SET display_name = name 
WHERE display_name IS NULL AND name IS NOT NULL;

-- Update existing profiles to use email prefix as username if username is null
UPDATE profiles 
SET username = SPLIT_PART(email, '@', 1)
WHERE username IS NULL AND email IS NOT NULL;

-- Update existing profiles to use 'name' as full_name if full_name is null
UPDATE profiles 
SET full_name = name 
WHERE full_name IS NULL AND name IS NOT NULL;
