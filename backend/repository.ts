import "server-only";
import { supabase } from "@/lib/supabase";
import type { ActiveDay, DayRecord } from "@/lib/types";

export type StoredUser = { id: string; name: string; openaiApiKey?: string; passwordHash?: string };

export async function getUser(id: string) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  
  if (error || !data) return null;
  return { id: data.id, name: data.name, openaiApiKey: data.openai_api_key } as StoredUser;
}

export async function createUser(name: string, passwordHash: string) {
  // 1. Check if name already exists
  const { data: existing } = await supabase
    .from('profiles')
    .select('id')
    .ilike('name', name)
    .maybeSingle();

  if (existing) throw new Error("That display name is already registered.");

  // 2. Create the profile (using Supabase just as a DB)
  const newUserId = crypto.randomUUID();
  const { data: profile, error } = await supabase
    .from('profiles')
    .insert({ id: newUserId, name, password_hash: passwordHash })
    .select()
    .single();

  if (error) throw new Error(typeof error === "string" ? error : (error as any)?.message || "Failed to create user profile in database.");
  if (!profile) throw new Error("Failed to create user profile.");
  return { id: profile.id, name: profile.name, passwordHash } as StoredUser;
}


export async function getUserByName(name: string) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .ilike('name', name)
    .maybeSingle();

  if (error || !data) return null;
  return { id: data.id, name: data.name, passwordHash: data.password_hash } as StoredUser;
}


export async function updateUser(id: string, updateFn: (user: any) => void) {
  // This is a simplified version. In Supabase, we'd fetch, apply updateFn, then update.
  const user = await getUser(id);
  if (!user) return null;
  
  // We'll handle the specific data updates in workspace.ts using direct supabase calls
  // as updateFn is a callback designed for the old file-based system.
  return user; 
}

