"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import Logo from "@/components/Logo";

const DEMO_EMAIL = "demo@flowtime.app";
const DEMO_PASSWORD = "FlowDemo2024!";

export default function DemoPage() {
  const router = useRouter();
  const [status, setStatus] = useState("Connexion au compte demo...");
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    startDemo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startDemo() {
    try {
      // 1. Try sign in
      setStatus("Connexion au compte demo...");
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: DEMO_EMAIL,
        password: DEMO_PASSWORD,
      });

      if (signInError) {
        // 2. Account doesn't exist → sign up
        setStatus("Creation du compte demo...");
        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email: DEMO_EMAIL,
          password: DEMO_PASSWORD,
        });
        if (signUpError) throw signUpError;

        // Insert profile
        if (signUpData.user) {
          await supabase.from("profiles").insert({
            id: signUpData.user.id,
            email: DEMO_EMAIL,
            first_name: "Thomas",
            last_name: "Dupont",
            emoji: "👨",
          });
        }
      }

      // 3. Get profile to retrieve family_id
      setStatus("Chargement des donnees...");
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Auth failed");

      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (!profile) throw new Error("No profile");

      const familyId = profile.family_id;

      // 4. Check if already seeded
      const { data: existingMembers } = await supabase
        .from("members")
        .select("id")
        .eq("family_id", familyId)
        .limit(1);

      if (!existingMembers || existingMembers.length === 0) {
        setStatus("Preparation de la famille demo...");
        await seedDemoData(familyId);
      }

      // 5. Skip onboarding for demo
      localStorage.setItem("flowtime_onboarded", "true");

      setStatus("C'est parti !");
      router.push("/home");
    } catch (err) {
      console.error("Demo error:", err);
      setStatus("Erreur lors du chargement. Retour...");
      setTimeout(() => router.push("/"), 2000);
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-dvh px-6 gradient-bg gap-6">
      <div className="animate-pulse">
        <Logo size={60} />
      </div>
      <div className="flex flex-col items-center gap-3">
        <div
          className="w-6 h-6 border-2 rounded-full animate-spin"
          style={{
            borderColor: "var(--glass-border)",
            borderTopColor: "var(--accent)",
          }}
        />
        <p className="text-[14px]" style={{ color: "var(--dim)" }}>
          {status}
        </p>
      </div>
    </div>
  );
}

// ─── Seed all demo data ───────────────────────────────────

async function seedDemoData(familyId: string) {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");

  // Helper: get next occurrence of a weekday (0=Sun, 1=Mon, ...)
  function nextWeekday(day: number): string {
    const d = new Date(today);
    const diff = (day - d.getDay() + 7) % 7;
    d.setDate(d.getDate() + (diff === 0 ? 0 : diff));
    return d.toISOString().split("T")[0];
  }

  // ── Members ──
  const { data: members } = await supabase
    .from("members")
    .insert([
      { family_id: familyId, name: "Thomas", role: "parent", emoji: "👨", color: "#7C6BF0" },
      { family_id: familyId, name: "Sophie", role: "parent", emoji: "👩", color: "#F06B9B" },
      { family_id: familyId, name: "Emma", role: "enfant", emoji: "👧", color: "#6BF0C8", birth_date: `${yyyy - 10}-03-03` },
      { family_id: familyId, name: "Lucas", role: "enfant", emoji: "👦", color: "#F0C86B", birth_date: `${yyyy - 7}-12-18` },
    ])
    .select("id, name");

  const memberMap: Record<string, string> = {};
  if (members) {
    for (const m of members) {
      memberMap[m.name] = m.id;
    }
  }

  // ── Events (current week) ──
  const monday = nextWeekday(1);
  const tuesday = nextWeekday(2);
  const wednesday = nextWeekday(3);
  const thursday = nextWeekday(4);
  const friday = nextWeekday(5);
  const saturday = nextWeekday(6);

  await supabase.from("events").insert([
    {
      family_id: familyId,
      title: "Ecole",
      time: "08:30",
      date: monday,
      category: "education",
      scope: "famille",
      recurring: { days: [1, 2, 3, 4, 5], time_start: "08:30", time_end: "16:30" },
    },
    {
      family_id: familyId,
      title: "Foot Lucas",
      time: "14:00",
      date: wednesday,
      category: "sport",
      member_id: memberMap["Lucas"] || null,
    },
    {
      family_id: familyId,
      title: "Danse Emma",
      time: "17:00",
      date: tuesday,
      category: "sport",
      member_id: memberMap["Emma"] || null,
    },
    {
      family_id: familyId,
      title: "Dentiste Sophie",
      time: "10:00",
      date: thursday,
      category: "sante",
      member_id: memberMap["Sophie"] || null,
    },
    {
      family_id: familyId,
      title: "Reunion travail",
      time: "09:00",
      date: friday,
      category: "travail",
      member_id: memberMap["Thomas"] || null,
    },
    {
      family_id: familyId,
      title: "Cinema en famille",
      time: "15:00",
      date: saturday,
      category: "loisirs",
      scope: "famille",
    },
  ]);

  // ── Notes ──
  await supabase.from("notes").insert([
    {
      family_id: familyId,
      title: "Liste vaccins enfants",
      content: "Emma: rappel ROR en juin\nLucas: vaccin grippe a planifier",
      category: "important",
      author_name: "Sophie",
      pinned: true,
    },
    {
      family_id: familyId,
      title: "Code portail ecole: 4872",
      content: "Code d'acces au portail de l'ecole primaire Jules Ferry.\nA ne pas partager.",
      category: "info",
      author_name: "Thomas",
    },
    {
      family_id: familyId,
      title: "Rappel: renouveler assurance",
      content: "L'assurance habitation expire fin du mois. Contacter MAIF.",
      category: "rappel",
      author_name: "Thomas",
    },
  ]);

  // ── Shopping ──
  const shoppingItems = [
    { name: "Lait", category: "frais" },
    { name: "Pain", category: "boulangerie" },
    { name: "Tomates", category: "fruits-legumes" },
    { name: "Poulet", category: "viande" },
    { name: "Pates", category: "epicerie" },
    { name: "Yaourts", category: "frais" },
    { name: "Savon", category: "hygiene" },
  ];
  await supabase.from("shopping_items").insert(
    shoppingItems.map((item) => ({
      family_id: familyId,
      text: item.name,
      category: item.category,
      added_by: "Sophie",
    }))
  );

  // ── Birthdays ──
  await supabase.from("birthdays").insert([
    { family_id: familyId, name: "Thomas", date: `${yyyy}-06-15`, emoji: "🎂", member_id: memberMap["Thomas"] || null },
    { family_id: familyId, name: "Sophie", date: `${yyyy}-09-22`, emoji: "🎂", member_id: memberMap["Sophie"] || null },
    { family_id: familyId, name: "Emma", date: `${yyyy}-03-03`, emoji: "🎂", member_id: memberMap["Emma"] || null },
    { family_id: familyId, name: "Lucas", date: `${yyyy}-12-18`, emoji: "🎂", member_id: memberMap["Lucas"] || null },
  ]);

  // ── Expenses (current month) ──
  await supabase.from("expenses").insert([
    { family_id: familyId, amount: 87.5, title: "Courses Carrefour", category: "courses", date: `${yyyy}-${mm}-02` },
    { family_id: familyId, amount: 65, title: "Essence", category: "transport", date: `${yyyy}-${mm}-05` },
    { family_id: familyId, amount: 32, title: "Cinema", category: "loisirs", date: `${yyyy}-${mm}-08` },
    { family_id: familyId, amount: 28, title: "Pediatre Lucas", category: "sante", date: `${yyyy}-${mm}-10` },
  ]);
}
