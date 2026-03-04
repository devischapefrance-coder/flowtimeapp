import { createClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";

export async function getAuthUser(req: Request): Promise<User | null> {
  const authHeader = req.headers.get("authorization");
  const cookieHeader = req.headers.get("cookie");

  // Try to extract token from Authorization header or cookie
  let token: string | null = null;

  if (authHeader?.startsWith("Bearer ")) {
    token = authHeader.slice(7);
  } else if (cookieHeader) {
    // Supabase stores tokens in cookies with the storage key
    const match = cookieHeader.match(/sb-[^=]+-auth-token=([^;]+)/);
    if (match) {
      try {
        const parsed = JSON.parse(decodeURIComponent(match[1]));
        token = parsed.access_token || parsed[0]?.access_token;
      } catch {
        // ignore parse errors
      }
    }
  }

  if (!token) return null;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );

  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;

  return user;
}
