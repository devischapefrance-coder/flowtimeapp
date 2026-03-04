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

  // Find any profile whose family_id starts with this code (bypasses RLS)
  const { data: matches, error: searchError } = await adminClient
    .from("profiles")
    .select("family_id")
    .ilike("family_id", `${search}%`)
    .neq("id", user.id)
    .limit(1);

  if (searchError) {
    return Response.json({ error: `Erreur recherche: ${searchError.message}` }, { status: 500 });
  }

  if (!matches || matches.length === 0) {
    return Response.json({ error: `Code famille introuvable pour "${search}". Vérifie le code et réessaie.` }, { status: 404 });
  }

  const targetFamilyId = matches[0].family_id;

  // Update the user's profile to join this family (bypasses RLS)
  const { error: updateError } = await adminClient
    .from("profiles")
    .update({ family_id: targetFamilyId })
    .eq("id", user.id);

  if (updateError) {
    return Response.json({ error: "Erreur lors de la mise à jour. Réessaie." }, { status: 500 });
  }

  return Response.json({ success: true, family_id: targetFamilyId });
}
