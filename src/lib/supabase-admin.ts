import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Server-side admin client that bypasses RLS (lazy init to avoid build crash)
let _client: SupabaseClient | null = null;

export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    if (!_client) {
      if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
        throw new Error("SUPABASE_SERVICE_ROLE_KEY manquante — le client admin ne peut pas fonctionner avec la clé anon");
      }
      _client = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );
    }
    return (_client as unknown as Record<string | symbol, unknown>)[prop];
  },
});
