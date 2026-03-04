import { createClient } from "@supabase/supabase-js";

// Server-side admin client that bypasses RLS
// Uses SERVICE_ROLE_KEY if available, falls back to ANON_KEY
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
