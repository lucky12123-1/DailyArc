-- Supabase Database Schema for DailyArc

-- 1. Profiles Table (User accounts)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  openai_api_key TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Active Days Table (Current ongoing active day per user)
CREATE TABLE IF NOT EXISTS public.active_days (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  "wakeTime" TEXT,
  sleep NUMERIC,
  "sleepTime" TEXT,
  "startPoints" NUMERIC,
  tasks JSONB DEFAULT '[]'::jsonb,
  "screenTime" NUMERIC DEFAULT 0,
  exercise BOOLEAN DEFAULT FALSE,
  reflection TEXT DEFAULT '',
  "dailyProgramming" JSONB DEFAULT '{}'::jsonb,
  goals JSONB DEFAULT '[]'::jsonb,
  schedule JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Day Records Table (Archived/Completed day history)
CREATE TABLE IF NOT EXISTS public.day_records (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  "wakeTime" TEXT,
  "sleepTime" TEXT,
  score NUMERIC DEFAULT 0,
  sleep NUMERIC DEFAULT 0,
  "wastedHours" NUMERIC DEFAULT 0,
  exercise BOOLEAN DEFAULT FALSE,
  note TEXT DEFAULT '',
  tasks JSONB DEFAULT '[]'::jsonb,
  "screenTime" NUMERIC DEFAULT 0,
  goals JSONB DEFAULT '[]'::jsonb,
  "deepWork" NUMERIC DEFAULT 0,
  phone NUMERIC DEFAULT 0,
  focus NUMERIC DEFAULT 0,
  coding NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_day_records_user_id ON public.day_records(user_id);
CREATE INDEX IF NOT EXISTS idx_day_records_date ON public.day_records(user_id, date);
