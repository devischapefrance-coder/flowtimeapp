import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Server-side admin client that bypasses RLS (lazy init to avoid build crash)
let _client: SupabaseClient | null = null;

export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    if (!_client) {
      _client = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );
    }
    return (_client as unknown as Record<string | symbol, unknown>)[prop];
  },
});
