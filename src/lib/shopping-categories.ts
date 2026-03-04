const CATEGORY_KEYWORDS: Record<string, string[]> = {
  "fruits-legumes": [
    "pomme", "banane", "orange", "citron", "fraise", "tomate", "carotte",
    "salade", "courgette", "oignon", "ail", "pomme de terre", "patate",
    "poireau", "chou", "brocoli", "avocat", "mangue", "raisin", "poire",
    "peche", "abricot", "melon", "pasteque", "concombre", "aubergine",
    "poivron", "champignon", "haricot", "petits pois", "epinard", "persil",
    "basilic", "menthe", "coriandre", "ananas", "kiwi", "cerise", "framboise",
  ],
  "viande-poisson": [
    "poulet", "boeuf", "porc", "veau", "agneau", "steak", "escalope",
    "saucisse", "jambon", "bacon", "lardons", "saumon", "thon", "crevette",
    "cabillaud", "sardine", "merlu", "truite", "dinde", "canard", "filet",
  ],
  "produits-laitiers": [
    "lait", "beurre", "fromage", "yaourt", "yogourt", "creme", "gruyere",
    "emmental", "camembert", "mozzarella", "parmesan", "chevre", "comté",
    "mascarpone", "ricotta", "creme fraiche",
  ],
  "boulangerie": [
    "pain", "baguette", "croissant", "brioche", "pain de mie", "farine",
    "levure", "gateau", "tarte", "biscuit", "cookie", "madeleine",
  ],
  "epicerie": [
    "pates", "riz", "huile", "vinaigre", "sel", "poivre", "sucre",
    "miel", "confiture", "cereales", "muesli", "conserve", "sauce",
    "ketchup", "moutarde", "mayo", "mayonnaise", "olive", "epice",
    "cafe", "the", "chocolat", "cacao", "nutella", "biscotte",
  ],
  "boissons": [
    "eau", "jus", "soda", "coca", "biere", "vin", "limonade", "sirop",
    "lait d'amande", "lait de coco", "smoothie", "compote",
  ],
  "hygiene": [
    "savon", "shampoing", "shampooing", "gel douche", "dentifrice",
    "brosse a dent", "deodorant", "coton", "mouchoir", "papier toilette",
    "pq", "serviette", "rasoir", "creme solaire", "lessive",
  ],
  "surgeles": [
    "glace", "surgele", "pizza surgelee", "frites", "legumes surgeles",
    "poisson pane", "cordon bleu",
  ],
  "bebe": [
    "couche", "lingette", "biberon", "petit pot", "lait bebe",
    "compote bebe",
  ],
};

export const SHOPPING_CATEGORIES = [
  { value: "fruits-legumes", label: "Fruits & Legumes", emoji: "🥦" },
  { value: "viande-poisson", label: "Viande & Poisson", emoji: "🥩" },
  { value: "produits-laitiers", label: "Produits laitiers", emoji: "🧀" },
  { value: "boulangerie", label: "Boulangerie", emoji: "🥖" },
  { value: "epicerie", label: "Epicerie", emoji: "🥫" },
  { value: "boissons", label: "Boissons", emoji: "🥤" },
  { value: "hygiene", label: "Hygiene", emoji: "🧴" },
  { value: "surgeles", label: "Surgeles", emoji: "🧊" },
  { value: "bebe", label: "Bebe", emoji: "👶" },
  { value: "autre", label: "Autre", emoji: "📦" },
];

export function detectShoppingCategory(text: string): string {
  const lower = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const kw of keywords) {
      const normalizedKw = kw.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      if (lower.includes(normalizedKw)) return category;
    }
  }
  return "autre";
}
