import { createClient } from '@supabase/supabase-js';

function sanitizeSupabaseUrl(url?: string): string {
  if (!url) return 'https://placeholder.supabase.co';
  let cleaned = url.trim().replace(/\/+$/, '');
  cleaned = cleaned.replace(/\/rest\/v1\/?$/i, '');
  return cleaned || 'https://placeholder.supabase.co';
}

const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseUrl = sanitizeSupabaseUrl(rawUrl);
const supabaseAnonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key').trim();

export const supabase = createClient(supabaseUrl, supabaseAnonKey);


