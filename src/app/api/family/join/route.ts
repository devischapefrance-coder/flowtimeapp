import { createClient } from "@supabase/supabase-js";
import { getAuthUser } from "@/lib/server-auth";

export async function POST(req: Request) {
  const user = await getAuthUser(req);
  if (!user) {
    return Response.json({ error: "Non autorisé" }, { status: 401 });
  }

  const { code } = await req.json();
  if (!code || typeof code !== "string" || code.trim().length < 4) {
    return Response.json({ error: "Code invalide" }, { status: 400 });
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return Response.json({ error: "Configuration serveur manquante (SERVICE_ROLE_KEY)" }, { status: 500 });
  }

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const search = code.trim().toLowerCase();

  // Use raw SQL via rpc — family_id is UUID, need cast to text for ILIKE
  const { data: matches, error: searchError } = await adminClient
    .rpc("find_family_by_code", { code_prefix: search, exclude_user: user.id });

  if (searchError) {
    // Fallback: if RPC doesn't exist yet, try direct query with text cast
    const { data: fallback, error: fallbackError } = await adminClient
      .from("profiles")
      .select("family_id")
      .neq("id", user.id);

    if (fallbackError || !fallback) {
      return Response.json({ error: `Erreur: ${searchError.message}` }, { status: 500 });
    }

    // Filter in JS as fallback
    const match = fallback.find((p) =>
      p.family_id.toLowerCase().startsWith(search)
    );

    if (!match) {
      return Response.json({ error: "Code famille introuvable. Vérifie le code et réessaie." }, { status: 404 });
    }

    const { error: updateError } = await adminClient
      .from("profiles")
      .update({ family_id: match.family_id })
      .eq("id", user.id);

    if (updateError) {
      return Response.json({ error: "Erreur lors de la mise à jour." }, { status: 500 });
    }

    return Response.json({ success: true, family_id: match.family_id });
  }

  if (!matches || matches.length === 0) {
    return Response.json({ error: "Code famille introuvable. Vérifie le code et réessaie." }, { status: 404 });
  }

  const targetFamilyId = matches[0].family_id;

  const { error: updateError } = await adminClient
    .from("profiles")
    .update({ family_id: targetFamilyId })
    .eq("id", user.id);

  if (updateError) {
    return Response.json({ error: "Erreur lors de la mise à jour." }, { status: 500 });
  }

  return Response.json({ success: true, family_id: targetFamilyId });
}
