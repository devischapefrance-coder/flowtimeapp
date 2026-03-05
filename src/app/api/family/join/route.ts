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

  // 1. Find the target family — fetch all profiles and filter in JS (UUID can't use ilike)
  const { data: allProfiles, error: fetchError } = await adminClient
    .from("profiles")
    .select("id, family_id, first_name, last_name, emoji, phone")
    .neq("id", user.id);

  if (fetchError || !allProfiles) {
    return Response.json({ error: `Erreur: ${fetchError?.message}` }, { status: 500 });
  }

  const match = allProfiles.find((p) =>
    p.family_id.toLowerCase().startsWith(search)
  );

  if (!match) {
    return Response.json({ error: "Code famille introuvable. Vérifie le code et réessaie." }, { status: 404 });
  }

  const targetFamilyId = match.family_id;

  // 2. Get the joining user's profile info
  const { data: joinerProfile } = await adminClient
    .from("profiles")
    .select("first_name, last_name, emoji, phone")
    .eq("id", user.id)
    .single();

  // 3. Update the user's family_id to join the family
  const { error: updateError } = await adminClient
    .from("profiles")
    .update({ family_id: targetFamilyId })
    .eq("id", user.id);

  if (updateError) {
    return Response.json({ error: "Erreur lors de la mise à jour." }, { status: 500 });
  }

  // 4. Auto-create a member entry for this person in the family
  if (joinerProfile) {
    // Check if a member with this name already exists to avoid duplicates
    const { data: existingMembers } = await adminClient
      .from("members")
      .select("id")
      .eq("family_id", targetFamilyId)
      .ilike("name", joinerProfile.first_name);

    if (!existingMembers || existingMembers.length === 0) {
      // Try with phone first, fallback without if column doesn't exist
      const memberData: Record<string, unknown> = {
        family_id: targetFamilyId,
        name: joinerProfile.first_name,
        emoji: joinerProfile.emoji || "👤",
        role: "parent",
        user_id: user.id,
      };

      const { error: insertErr } = await adminClient.from("members").insert({ ...memberData, phone: joinerProfile.phone || null });

      if (insertErr) {
        // Retry without phone in case column doesn't exist yet
        await adminClient.from("members").insert(memberData);
      }
    }
  }

  return Response.json({ success: true, family_id: targetFamilyId });
}
