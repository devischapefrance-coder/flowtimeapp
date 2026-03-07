export interface TutorialSection {
  id: string;
  label: string;
  emoji: string;
}

export interface TutorialStep {
  id: string;
  section: string;
  page: string;
  targetAttr: string | null;
  title: string;
  description: string;
  position: "top" | "bottom" | "center";
}

export const TUTORIAL_SECTIONS: TutorialSection[] = [
  { id: "accueil", label: "Accueil", emoji: "\u{1F3E0}" },
  { id: "famille", label: "Famille", emoji: "\u{1F468}\u200D\u{1F469}\u200D\u{1F467}\u200D\u{1F466}" },
  { id: "vie", label: "Vie", emoji: "\u{1F4CC}" },
  { id: "reglages", label: "Réglages", emoji: "\u2699\uFE0F" },
];

export const TUTORIAL_STEPS: TutorialStep[] = [
  // Accueil (4 steps)
  {
    id: "day-carousel",
    section: "accueil",
    page: "/home",
    targetAttr: "day-carousel",
    title: "Navigue dans tes jours",
    description: "Glisse le carrousel pour voir tes événements jour par jour. Chaque jour affiche ton planning complet.",
    position: "bottom",
  },
  {
    id: "add-event-btn",
    section: "accueil",
    page: "/home",
    targetAttr: "add-event-btn",
    title: "Crée un événement",
    description: "Ce bouton + te permet d'ajouter un événement en quelques secondes. Tu peux aussi demander à Flow de le faire pour toi.",
    position: "bottom",
  },
  {
    id: "flow-chat-widget",
    section: "accueil",
    page: "/home",
    targetAttr: "flow-chat-widget",
    title: "Ton assistant Flow",
    description: "Ton copilote IA. Dis-lui « Ajoute un cours de danse mardi à 17h » et c'est fait. Il gère ton planning à ta place.",
    position: "top",
  },
  {
    id: "weather-widget",
    section: "accueil",
    page: "/home",
    targetAttr: "weather-widget",
    title: "Météo en direct",
    description: "La météo du jour et les prévisions, toujours à portée de main. Appuie dessus pour voir les détails.",
    position: "bottom",
  },
  // Famille (3 steps)
  {
    id: "famille-membres",
    section: "famille",
    page: "/famille",
    targetAttr: "famille-membres",
    title: "Les membres de ta famille",
    description: "Tous les membres de ta famille sont ici. Appuie sur l'un d'eux pour voir son profil, modifier son rôle ou le lier à un compte.",
    position: "bottom",
  },
  {
    id: "famille-map",
    section: "famille",
    page: "/famille",
    targetAttr: "famille-map",
    title: "Carte interactive",
    description: "Visualise tes adresses et tes proches sur la carte. Appuie pour l'ouvrir en plein écran avec recherche et itinéraire.",
    position: "top",
  },
  {
    id: "location-toggle",
    section: "famille",
    page: "/famille",
    targetAttr: "location-toggle",
    title: "Partage ta position",
    description: "Active ce bouton pour que ta famille puisse te localiser en temps réel sur la carte.",
    position: "top",
  },
  // Vie (2 steps)
  {
    id: "vie-tabs",
    section: "vie",
    page: "/vie",
    targetAttr: "vie-tabs",
    title: "Ta vie organisée",
    description: "Notes, courses, tâches, routines et documents — tout est organisé par onglets. Appuie sur un onglet pour changer de catégorie.",
    position: "bottom",
  },
  {
    id: "vie-add-item",
    section: "vie",
    page: "/vie",
    targetAttr: "vie-add-item",
    title: "Ajoute un élément",
    description: "Ce bouton te permet de créer une note, un article de course ou une tâche selon l'onglet actif.",
    position: "bottom",
  },
  // Réglages (2 steps)
  {
    id: "family-code",
    section: "reglages",
    page: "/reglages",
    targetAttr: "family-code",
    title: "Invite ta famille",
    description: "Partage ce code à tes proches. Ils pourront rejoindre ta famille en le saisissant à l'inscription.",
    position: "top",
  },
  {
    id: "done",
    section: "reglages",
    page: "/reglages",
    targetAttr: null,
    title: "Tu es prêt !",
    description: "Tu connais FlowTime ! Explore librement et laisse Flow t'aider au quotidien.",
    position: "center",
  },
];

export function getSectionSteps(sectionId: string) {
  return TUTORIAL_STEPS.filter((s) => s.section === sectionId);
}

export function getFirstStepIndex(sectionId: string) {
  return TUTORIAL_STEPS.findIndex((s) => s.section === sectionId);
}

export function getSectionForStep(stepIndex: number) {
  const step = TUTORIAL_STEPS[stepIndex];
  return step ? TUTORIAL_SECTIONS.find((s) => s.id === step.section) : null;
}
