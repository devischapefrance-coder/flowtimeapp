export const EVENT_CATEGORIES = [
  { value: "general", label: "General", color: "#9CA3AF", emoji: "📋" },
  { value: "sport", label: "Sport", color: "#3B82F6", emoji: "⚽" },
  { value: "ecole", label: "Ecole", color: "#22C55E", emoji: "🏫" },
  { value: "medical", label: "Medical", color: "#EF4444", emoji: "🏥" },
  { value: "loisir", label: "Loisir", color: "#A855F7", emoji: "🎭" },
  { value: "travail", label: "Travail", color: "#F97316", emoji: "💼" },
  { value: "famille", label: "Famille", color: "#EC4899", emoji: "👨‍👩‍👧‍👦" },
] as const;

export const CATEGORY_COLORS: Record<string, string> = Object.fromEntries(
  EVENT_CATEGORIES.map((c) => [c.value, c.color])
);

export function getCategoryColor(category?: string): string {
  return CATEGORY_COLORS[category || "general"] || CATEGORY_COLORS.general;
}

// Auto-detect category from event title keywords
export function detectCategory(title: string): string {
  const t = title.toLowerCase();
  const sportKeywords = ["foot", "basket", "tennis", "rugby", "judo", "karate", "gym", "gymnastique", "natation", "piscine", "danse", "escalade", "equitation", "athletisme", "sport", "match", "entrainement", "velo", "scooter"];
  const ecoleKeywords = ["ecole", "école", "cours", "devoirs", "aide aux devoirs", "garderie", "creche", "crèche"];
  const medicalKeywords = ["medecin", "médecin", "dentiste", "ophtalmo", "kine", "kiné", "orthophoniste", "vaccin", "rdv medical", "hopital", "hôpital", "pharmacie"];
  const loisirKeywords = ["cinema", "cinéma", "theatre", "théâtre", "musee", "musée", "parc", "promenade", "sortie", "jeu", "musique", "piano", "guitare", "lecture", "coiffeur", "shopping"];
  const travailKeywords = ["travail", "teletravail", "télétravail", "reunion", "réunion", "bureau", "meeting", "conference", "conférence"];
  const familleKeywords = ["anniversaire", "fete", "fête", "repas", "famille", "babysitting", "nounou", "grands-parents"];

  if (sportKeywords.some((k) => t.includes(k))) return "sport";
  if (ecoleKeywords.some((k) => t.includes(k))) return "ecole";
  if (medicalKeywords.some((k) => t.includes(k))) return "medical";
  if (loisirKeywords.some((k) => t.includes(k))) return "loisir";
  if (travailKeywords.some((k) => t.includes(k))) return "travail";
  if (familleKeywords.some((k) => t.includes(k))) return "famille";
  return "general";
}
