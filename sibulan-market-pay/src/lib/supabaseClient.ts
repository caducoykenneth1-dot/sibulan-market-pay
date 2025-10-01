import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL ?? "").trim();
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? "").trim();

const hasSupabaseConfiguration = supabaseUrl.length > 0 && supabaseAnonKey.length > 0;

let supabaseClient: SupabaseClient | null = null;

if (hasSupabaseConfiguration) {
  supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
} else {
  console.warn(
    "Supabase environment variables are missing. The app will operate in local-only mode until they are configured."
  );
}

export const supabase = supabaseClient;
export const isSupabaseConfigured = hasSupabaseConfiguration;
