import { getAuthUser } from "@/lib/server-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(req: Request) {
  const user = await getAuthUser(req);
  if (!user) {
    return Response.json({ error: "Non autorisé" }, { status: 401 });
  }

  try {
    const userId = user.id;

    // 1. Get profile to know family_id
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("family_id")
      .eq("id", userId)
      .maybeSingle();

    if (profile?.family_id) {
      // 2. Unlink member (set user_id to null so the member entry can be reused)
      await supabaseAdmin
        .from("members")
        .update({ user_id: null })
        .eq("user_id", userId);
    }

    // 3. Delete profile (cascades to wellbeing_sessions, device_locations, etc.)
    await supabaseAdmin.from("profiles").delete().eq("id", userId);

    // 4. Delete auth user (frees the email for re-registration)
    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (authError) {
      console.error("Failed to delete auth user:", authError.message);
      return Response.json({ error: "Erreur lors de la suppression du compte" }, { status: 500 });
    }

    return Response.json({ success: true });
  } catch (err) {
    console.error("Account deletion error:", err);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
