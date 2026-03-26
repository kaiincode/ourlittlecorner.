-- Ensure required extensions are present (idempotent)
create extension if not exists pgcrypto;

-- Create profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT,
  name TEXT,
  bio TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Create policies
DROP POLICY IF EXISTS "Users can view their own profile" ON profiles;
CREATE POLICY "Users can view their own profile" ON profiles FOR SELECT USING (auth.uid() = id);
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
CREATE POLICY "Users can update their own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;
CREATE POLICY "Users can insert their own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Create a function to handle updated_at
CREATE OR REPLACE FUNCTION handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at
DROP TRIGGER IF EXISTS profiles_updated_at ON profiles;
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION handle_updated_at();

-- Migration: Create profiles for existing users who don't have them yet
-- Run this AFTER creating the profiles table

INSERT INTO profiles (id, email, name, bio, created_at, updated_at)
SELECT 
  au.id,
  au.email,
  COALESCE(
    au.raw_user_meta_data->>'name', 
    SPLIT_PART(au.email, '@', 1)
  ) as name,
  au.raw_user_meta_data->>'bio' as bio,
  au.created_at,
  NOW()
FROM auth.users au
LEFT JOIN profiles p ON au.id = p.id
WHERE p.id IS NULL  -- Only users without existing profiles
AND au.email IS NOT NULL;

-- Verify the migration worked
SELECT 
  COUNT(*) as total_users_in_auth,
  (SELECT COUNT(*) FROM profiles) as total_profiles_created,
  (SELECT COUNT(*) FROM auth.users WHERE id NOT IN (SELECT id FROM profiles)) as missing_profiles
FROM auth.users;

-- ---------------------------------------------
-- Storage: Avatars bucket and RLS policies
-- ---------------------------------------------

-- Create a public bucket named 'avatars' (id and name must match)
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- Public read for objects in the avatars bucket
drop policy if exists "Public read avatars" on storage.objects;
create policy "Public read avatars"
on storage.objects for select
to public
using (bucket_id = 'avatars');

-- Authenticated users can upload files into their own folder "<uid>/filename"
drop policy if exists "Users can upload their own avatar" on storage.objects;
create policy "Users can upload their own avatar"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and split_part(name, '/', 1) = auth.uid()::text
);

-- Authenticated users can update files in their own folder
drop policy if exists "Users can update their own avatar" on storage.objects;
create policy "Users can update their own avatar"
on storage.objects for update
to authenticated
using (
  bucket_id = 'avatars'
  and split_part(name, '/', 1) = auth.uid()::text
)
with check (
  bucket_id = 'avatars'
  and split_part(name, '/', 1) = auth.uid()::text
);

-- Authenticated users can delete files in their own folder
drop policy if exists "Users can delete their own avatar" on storage.objects;
create policy "Users can delete their own avatar"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'avatars'
  and split_part(name, '/', 1) = auth.uid()::text
);

-- ---------------------------------------------
-- Storage: Gallery bucket for albums (public read)
-- ---------------------------------------------

-- Public bucket for gallery content
insert into storage.buckets (id, name, public)
values ('gallery', 'gallery', true)
on conflict (id) do nothing;

-- Public read
drop policy if exists "Public read gallery" on storage.objects;
create policy "Public read gallery"
on storage.objects for select
to public
using (bucket_id = 'gallery');

-- Anyone authenticated can upload to gallery (optional folder prefixes)
drop policy if exists "Authenticated upload to gallery" on storage.objects;
create policy "Authenticated upload to gallery"
on storage.objects for insert
to authenticated
with check (bucket_id = 'gallery');

-- Allow authenticated updates & deletes on their own uploads
drop policy if exists "Authenticated update own gallery objects" on storage.objects;
create policy "Authenticated update own gallery objects"
on storage.objects for update
to authenticated
using (bucket_id = 'gallery' and owner = auth.uid())
with check (bucket_id = 'gallery' and owner = auth.uid());

drop policy if exists "Authenticated delete own gallery objects" on storage.objects;
create policy "Authenticated delete own gallery objects"
on storage.objects for delete
to authenticated
using (bucket_id = 'gallery');

-- ---------------------------------------------
-- Table: gallery_items to store titles/metadata
-- ---------------------------------------------

create table if not exists public.gallery_items (
  id uuid primary key default gen_random_uuid(),
  bucket text not null default 'gallery',
  path text not null unique,
  title text,
  folder text,
  owner uuid references auth.users(id) on delete set null,
  url text,
  created_at timestamp with time zone default now()
);

alter table public.gallery_items enable row level security;

-- Everyone can see all gallery items (public read)
drop policy if exists "Public read gallery_items" on public.gallery_items;
create policy "Public read gallery_items" on public.gallery_items for select using (true);

drop policy if exists "Insert own gallery_items" on public.gallery_items;
create policy "Insert own gallery_items" on public.gallery_items for insert to authenticated with check (owner = auth.uid());

drop policy if exists "Update own gallery_items" on public.gallery_items;
create policy "Update own gallery_items" on public.gallery_items for update to authenticated using (owner = auth.uid()) with check (owner = auth.uid());

-- ---------------------------------------------
-- Table: special_days (per-user special dates with notes)
-- ---------------------------------------------

create table if not exists public.special_days (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  date date not null,
  kind text default 'other',
  title text,
  note text,
  created_at timestamp with time zone default now()
);

alter table public.special_days enable row level security;

-- Everyone can see all special days (public read)
drop policy if exists "Select own special_days" on public.special_days;
create policy "Public read special_days" on public.special_days for select using (true);

-- Insert rows only for yourself; if user_id omitted, default to auth.uid() via trigger
drop policy if exists "Insert own special_days" on public.special_days;
create policy "Insert own special_days" on public.special_days for insert to authenticated with check (coalesce(user_id, auth.uid()) = auth.uid());

-- Update only your own rows
drop policy if exists "Update own special_days" on public.special_days;
create policy "Update own special_days" on public.special_days for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Delete only your own rows
drop policy if exists "Delete own special_days" on public.special_days;
create policy "Delete own special_days" on public.special_days for delete to authenticated using (user_id = auth.uid());

-- Ensure user_id defaults to current user when inserting
create or replace function public.set_special_days_user_id()
returns trigger as $$
begin
  if new.user_id is null then
    new.user_id = auth.uid();
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_set_special_days_user_id on public.special_days;
create trigger trg_set_special_days_user_id
  before insert on public.special_days
  for each row execute function public.set_special_days_user_id();

-- Backfill/compat: if table existed without kind, add it and enforce constraint
alter table if exists public.special_days add column if not exists kind text;
alter table if exists public.special_days alter column kind set default 'other';
update public.special_days set kind = 'other' where kind is null;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'chk_special_days_kind' and conrelid = 'public.special_days'::regclass
  ) then
    alter table public.special_days
      add constraint chk_special_days_kind check (kind in ('birthday','anniversary','other'));
  end if;
end$$;

-- Indexes for fast lookup (after ensuring kind exists)
create index if not exists idx_special_days_user_date on public.special_days(user_id, date);
create index if not exists idx_special_days_kind on public.special_days(kind);
 
-- ---------------------------------------------
-- Table: journals (notes with optional image and spotify track)
-- ---------------------------------------------

create table if not exists public.journals (
  id uuid primary key default gen_random_uuid(),
  author uuid references auth.users(id) on delete set null,
  title text,
  content text,
  cover_url text,
  spotify_track_id text,
  spotify_track_name text,
  spotify_artists text,
  spotify_image text,
  spotify_preview_url text,
  created_at timestamp with time zone default now()
);

alter table public.journals enable row level security;

-- Everyone can see all journals (public read)
drop policy if exists "Public read journals" on public.journals;
create policy "Public read journals" on public.journals for select using (true);

drop policy if exists "Insert own journals" on public.journals;
create policy "Insert own journals" on public.journals for insert to authenticated with check (author = auth.uid());

drop policy if exists "Update own journals" on public.journals;
create policy "Update own journals" on public.journals for update to authenticated using (author = auth.uid()) with check (author = auth.uid());

drop policy if exists "Delete own journals" on public.journals;
create policy "Delete own journals" on public.journals for delete to authenticated using (author = auth.uid());

create or replace function public.set_journal_author()
returns trigger as $$
begin
  if new.author is null then
    new.author = auth.uid();
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_set_journal_author on public.journals;
create trigger trg_set_journal_author
  before insert on public.journals
  for each row execute function public.set_journal_author();

create index if not exists idx_journals_created_at on public.journals(created_at desc);