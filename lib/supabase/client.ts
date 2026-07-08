"use client";

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

const configuredSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const configuredSupabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseUrl = configuredSupabaseUrl || "http://127.0.0.1:54321";
const supabaseAnonKey = configuredSupabaseAnonKey || "placeholder-anon-key";

export const isSupabaseConfigured = Boolean(configuredSupabaseUrl && configuredSupabaseAnonKey);

export function createBrowserSupabaseClient() {
  return createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });
}
