import { createClient } from "@supabase/supabase-js";
import { getAuthUser } from "@/lib/server-auth";

// Rate limiting par utilisateur pour la jointure famille
const joinAttempts = new Map<string, { count: number; resetAt: number }>();
const MAX_JOIN_ATTEMPTS = 5; // 5 tentatives par minute

function isJoinRateLimited(userId: string): boolean {
  const now = Date.now();
  const entry = joinAttempts.get(userId);
  if (!entry || entry.resetAt < now) {
    joinAttempts.set(userId, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  entry.count++;
  // Nettoyage paresseux (max 1000 entrées)
  if (joinAttempts.size > 1000) {
    for (const [key, val] of joinAttempts) {
      if (val.resetAt < now) joinAttempts.delete(key);
    }
  }
  return entry.count > MAX_JOIN_ATTEMPTS;
}

export async function POST(req: Request) {
  const user = await getAuthUser(req);
  if (!user) {
    return Response.json({ error: "Non autorisé" }, { status: 401 });
  }

  // Rate limiting par utilisateur
  if (isJoinRateLimited(user.id)) {
    return Response.json({ error: "Trop de tentatives. Réessaie dans une minute." }, { status: 429 });
  }

  const { code } = await req.json();
  if (!code || typeof code !== "string" || code.trim().length !== 8) {
    return Response.json({ error: "Le code famille doit faire exactement 8 caractères" }, { status: 400 });
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return Response.json({ error: "Configuration serveur manquante (SERVICE_ROLE_KEY)" }, { status: 500 });
  }

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const search = code.trim().toLowerCase();

  // Délai constant pour éviter le timing attack
  await new Promise((r) => setTimeout(r, 200 + Math.random() * 300));

  // 1. Find the target family — match exact sur les 8 premiers caractères du family_id
  const { data: allProfiles, error: fetchError } = await adminClient
    .from("profiles")
    .select("id, family_id, first_name, last_name, emoji, phone")
    .neq("id", user.id);

  if (fetchError || !allProfiles) {
    return Response.json({ error: `Erreur: ${fetchError?.message}` }, { status: 500 });
  }

  const match = allProfiles.find((p) =>
    p.family_id.toLowerCase().substring(0, 8) === search
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
    // Check if this user already has a member entry in this family (by user_id)
    const { data: existingByUserId } = await adminClient
      .from("members")
      .select("id")
      .eq("family_id", targetFamilyId)
      .eq("user_id", user.id);

    if (existingByUserId && existingByUserId.length > 0) {
      // User already has a member entry — skip
    } else {
      // Check if a member with matching name exists without a linked account
      const { data: matchByName } = await adminClient
        .from("members")
        .select("id")
        .eq("family_id", targetFamilyId)
        .ilike("name", joinerProfile.first_name)
        .is("user_id", null);

      if (matchByName && matchByName.length > 0) {
        // Link the existing unlinked member to this user
        await adminClient
          .from("members")
          .update({
            user_id: user.id,
            emoji: joinerProfile.emoji || undefined,
            phone: joinerProfile.phone || undefined,
          })
          .eq("id", matchByName[0].id);
      } else {
        // Create a new member entry
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
  }

  return Response.json({ success: true, family_id: targetFamilyId });
}
