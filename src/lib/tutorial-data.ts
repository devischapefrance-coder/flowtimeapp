export type InteractionType = "swipe" | "tap" | "toggle" | null;

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
  interaction: InteractionType;
  hintText: string | null;
  hintIcon: "swipe" | "tap" | "toggle" | null;
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
    description: "Glisse le carrousel pour voir tes événements jour par jour.",
    position: "bottom",
    interaction: "swipe",
    hintText: "Glisse le carrousel",
    hintIcon: "swipe",
  },
  {
    id: "add-event-btn",
    section: "accueil",
    page: "/home",
    targetAttr: "add-event-btn",
    title: "Crée un événement",
    description: "Appuie sur ce bouton pour ajouter un événement en 2 secondes.",
    position: "bottom",
    interaction: "tap",
    hintText: "Appuie sur le bouton +",
    hintIcon: "tap",
  },
  {
    id: "flow-chat-widget",
    section: "accueil",
    page: "/home",
    targetAttr: "flow-chat-widget",
    title: "Ton assistant Flow",
    description: "Ton copilote IA. Dis-lui ce que tu veux et il s'en occupe.",
    position: "top",
    interaction: "tap",
    hintText: "Appuie pour ouvrir Flow",
    hintIcon: "tap",
  },
  {
    id: "weather-widget",
    section: "accueil",
    page: "/home",
    targetAttr: "weather-widget",
    title: "Météo en direct",
    description: "La météo du jour et les prévisions, toujours à portée de main.",
    position: "bottom",
    interaction: null,
    hintText: null,
    hintIcon: null,
  },
  // Famille (3 steps)
  {
    id: "famille-membres",
    section: "famille",
    page: "/famille",
    targetAttr: "famille-membres",
    title: "Les membres de ta famille",
    description: "Retrouve tous les membres, leur rôle et leur position.",
    position: "bottom",
    interaction: "tap",
    hintText: "Appuie sur un membre",
    hintIcon: "tap",
  },
  {
    id: "famille-map",
    section: "famille",
    page: "/famille",
    targetAttr: "famille-map",
    title: "Carte interactive",
    description: "Visualise tes proches et tes adresses sur la carte.",
    position: "top",
    interaction: null,
    hintText: null,
    hintIcon: null,
  },
  {
    id: "location-toggle",
    section: "famille",
    page: "/famille",
    targetAttr: "location-toggle",
    title: "Partage ta position",
    description: "Active le partage pour que ta famille te localise en temps réel.",
    position: "top",
    interaction: "toggle",
    hintText: "Active le toggle",
    hintIcon: "toggle",
  },
  // Vie (2 steps)
  {
    id: "vie-tabs",
    section: "vie",
    page: "/vie",
    targetAttr: "vie-tabs",
    title: "Ta vie organisée",
    description: "Notes, courses, budget, tâches, photos — tout par onglets.",
    position: "bottom",
    interaction: "tap",
    hintText: "Appuie sur un onglet",
    hintIcon: "tap",
  },
  {
    id: "vie-add-item",
    section: "vie",
    page: "/vie",
    targetAttr: "vie-add-item",
    title: "Ajoute un élément",
    description: "Crée une note, une course ou une tâche en un clic.",
    position: "bottom",
    interaction: "tap",
    hintText: "Appuie sur + Ajouter",
    hintIcon: "tap",
  },
  // Réglages (2 steps)
  {
    id: "family-code",
    section: "reglages",
    page: "/reglages",
    targetAttr: "family-code",
    title: "Invite ta famille",
    description: "Partage ce code pour synchroniser toute la famille.",
    position: "top",
    interaction: "tap",
    hintText: "Appuie pour copier",
    hintIcon: "tap",
  },
  {
    id: "done",
    section: "reglages",
    page: "/reglages",
    targetAttr: null,
    title: "Tu es prêt !",
    description: "Tu connais FlowTime ! Explore et laisse Flow t'aider.",
    position: "center",
    interaction: null,
    hintText: null,
    hintIcon: null,
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
