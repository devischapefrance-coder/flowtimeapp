# CLAUDE.md — FlowTime (Famly)

> Fichier de configuration pour Claude Code. À placer à la racine du projet.
> Dernière mise à jour : mars 2026

---

## 🧭 Contexte du projet

**FlowTime** (alias potentiel : **Famly**) est une application web de planification et coordination familiale. Elle s'adresse aux couples et familles qui veulent organiser leur quotidien ensemble — agenda partagé, tâches, bien-être, et assistant IA intégré.

- **Développeur** : solo-entrepreneur
- **Stack** : Next.js 14+ (App Router), TypeScript, Tailwind CSS, Supabase
- **Déploiement** : Vercel
- **Mobile** : conversion via Capacitor (en cours)
- **Accès distant** : développement via VS Code Remote SSH + Tailscale

---

## 🛠 Stack technique

| Couche | Choix |
|--------|-------|
| Framework | Next.js 14+ App Router |
| Langage | TypeScript strict |
| Styling | Tailwind CSS (pas de CSS-in-JS) |
| Backend / Auth / DB | Supabase (Auth, PostgreSQL, RLS, Storage) |
| Icons | Lucide React |
| Fonts | Sora (display), JetBrains Mono (code/data) |
| UI libs | shadcn/ui (si nécessaire), composants custom |
| Animations | Tailwind transitions + Framer Motion si nécessaire |
| Mobile | Capacitor (à venir) |
| Déploiement | Vercel |

---

## 🎨 Design System

### Thème : Dark Premium Warm

L'interface adopte un esthétique **dark warm premium** — sobre, chaleureux, moderne. Pas de violet générique, pas de glassmorphism abusif. Chaque écran doit sembler conçu par un designer, pas généré par une IA.

```css
/* Variables CSS globales — globals.css */
:root {
  /* Fond principal */
  --bg-base: #0D0D0F;
  --bg-surface: #141416;
  --bg-card: #1A1A1E;
  --bg-elevated: #222228;

  /* Accents */
  --accent-primary: #E8A87C;     /* Orange warm — couleur principale */
  --accent-secondary: #C97D4E;   /* Orange foncé */
  --accent-glow: rgba(232, 168, 124, 0.15);

  /* Textes */
  --text-primary: #F0EDE8;
  --text-secondary: #9B9690;
  --text-muted: #5C5A56;

  /* Bordures */
  --border-subtle: rgba(255, 255, 255, 0.06);
  --border-default: rgba(255, 255, 255, 0.10);
  --border-accent: rgba(232, 168, 124, 0.3);

  /* États */
  --success: #4CAF82;
  --warning: #E8C47C;
  --error: #E87C7C;
  --info: #7CA8E8;
}
```

### Règles de style

- **Backgrounds** : toujours en couches (`bg-base` → `bg-surface` → `bg-card` → `bg-elevated`)
- **Bordures** : fines, semi-transparentes — jamais de bordures grises pleines
- **Ombres** : warm-tinted, jamais noir pur
- **Arrondis** : `rounded-xl` (12px) par défaut, `rounded-2xl` (16px) pour les cards majeures
- **Espacements** : généreux — padding 24px minimum sur les containers principaux
- **Typographie** : Sora pour les titres/UI, tailles minimum 14px
- **Animations** : subtiles, 150–300ms, `ease-out` — jamais de bounce ou spring excessif
- **États hover** : légère élévation de fond + transition douce
- **Icônes** : Lucide React uniquement, stroke-width 1.5, taille cohérente (16/18/20px)

### Anti-patterns absolus

❌ Pas de violet/purple dans les gradients  
❌ Pas d'Inter ou Roboto  
❌ Pas de glassmorphism avec `backdrop-blur` sur chaque élément  
❌ Pas de bordures `border-gray-700` solides  
❌ Pas d'emojis en guise d'icônes dans l'UI applicative  
❌ Pas de `p-2 text-sm` sans spacing réfléchi  
❌ Pas de layout Bootstrap/Material générique  

---

## 📁 Structure du projet

```
flowtime/
├── app/
│   ├── (auth)/
│   │   ├── login/
│   │   │   └── page.tsx
│   │   └── signup/
│   │       └── page.tsx
│   ├── (app)/
│   │   ├── layout.tsx          # Layout principal avec sidebar/nav
│   │   ├── accueil/
│   │   │   └── page.tsx        # Dashboard / timeline du jour
│   │   ├── agenda/
│   │   │   └── page.tsx        # Calendrier partagé
│   │   ├── famille/
│   │   │   └── page.tsx        # Gestion famille, carte, membres
│   │   ├── taches/
│   │   │   └── page.tsx        # Tâches partagées
│   │   ├── bien-etre/
│   │   │   └── page.tsx        # Suivi humeur/bien-être
│   │   └── flo/
│   │       └── page.tsx        # Assistant IA "Flo"
│   ├── api/
│   │   └── [endpoint]/
│   │       └── route.ts
│   ├── globals.css
│   └── layout.tsx              # Root layout (fonts, providers)
├── components/
│   ├── ui/                     # Composants génériques (Button, Card, Modal...)
│   ├── layout/                 # Sidebar, Header, Nav
│   ├── agenda/                 # Composants spécifiques agenda
│   ├── famille/                # Composants famille
│   ├── taches/                 # Composants tâches
│   ├── bien-etre/              # Composants bien-être
│   └── flo/                    # Composants assistant IA
├── lib/
│   ├── supabase/
│   │   ├── client.ts           # Client Supabase browser
│   │   ├── server.ts           # Client Supabase server
│   │   └── middleware.ts       # Auth middleware
│   ├── hooks/                  # Custom React hooks
│   ├── utils.ts                # Fonctions utilitaires
│   └── constants.ts            # Constantes de l'app
├── types/
│   └── index.ts                # Types TypeScript centralisés
├── public/
├── supabase/
│   └── migrations/             # Migrations SQL
├── CLAUDE.md                   # Ce fichier
├── next.config.ts
├── tailwind.config.ts
└── tsconfig.json
```

---

## 🗄 Base de données Supabase

### Conventions SQL

- Noms de tables en **snake_case** au pluriel (`user_profiles`, `family_events`)
- Toujours inclure `id uuid DEFAULT gen_random_uuid() PRIMARY KEY`
- Toujours inclure `created_at timestamptz DEFAULT now()`
- Toujours inclure `updated_at timestamptz DEFAULT now()` avec trigger
- Toujours activer RLS : `ALTER TABLE xxx ENABLE ROW LEVEL SECURITY;`

### Schéma principal

```sql
-- Profils utilisateurs
CREATE TABLE user_profiles (
  id uuid REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  display_name text NOT NULL,
  avatar_url text,
  family_id uuid REFERENCES families(id),
  role text DEFAULT 'member', -- 'admin' | 'member'
  color text DEFAULT '#E8A87C', -- couleur de l'utilisateur dans l'app
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Familles / groupes
CREATE TABLE families (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Événements agenda partagé
CREATE TABLE family_events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  family_id uuid REFERENCES families(id) ON DELETE CASCADE NOT NULL,
  created_by uuid REFERENCES auth.users(id) NOT NULL,
  title text NOT NULL,
  description text,
  start_at timestamptz NOT NULL,
  end_at timestamptz,
  all_day boolean DEFAULT false,
  color text,
  participants uuid[], -- array d'user ids
  location text,
  recurrence text, -- 'none' | 'daily' | 'weekly' | 'monthly'
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Tâches partagées
CREATE TABLE tasks (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  family_id uuid REFERENCES families(id) ON DELETE CASCADE NOT NULL,
  created_by uuid REFERENCES auth.users(id) NOT NULL,
  assigned_to uuid REFERENCES auth.users(id),
  title text NOT NULL,
  description text,
  status text DEFAULT 'todo', -- 'todo' | 'in_progress' | 'done'
  priority text DEFAULT 'normal', -- 'low' | 'normal' | 'high'
  due_date date,
  category text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Suivi bien-être / humeur
CREATE TABLE wellbeing_entries (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  family_id uuid REFERENCES families(id) ON DELETE CASCADE NOT NULL,
  mood integer NOT NULL CHECK (mood BETWEEN 1 AND 5),
  energy integer CHECK (energy BETWEEN 1 AND 5),
  note text,
  date date DEFAULT CURRENT_DATE,
  created_at timestamptz DEFAULT now()
);

-- Messages IA Flo
CREATE TABLE flo_messages (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  family_id uuid REFERENCES families(id),
  role text NOT NULL, -- 'user' | 'assistant'
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);
```

### Template RLS standard

Pour chaque table, appliquer ce pattern (adapter selon le contexte) :

```sql
-- Activer RLS
ALTER TABLE [table] ENABLE ROW LEVEL SECURITY;

-- Lecture : membres de la même famille
CREATE POLICY "select_family" ON [table]
  FOR SELECT USING (
    family_id IN (
      SELECT family_id FROM user_profiles WHERE id = auth.uid()
    )
  );

-- Insertion : utilisateur authentifié de la famille
CREATE POLICY "insert_family" ON [table]
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL AND
    family_id IN (
      SELECT family_id FROM user_profiles WHERE id = auth.uid()
    )
  );

-- Modification : créateur ou admin famille
CREATE POLICY "update_own" ON [table]
  FOR UPDATE USING (created_by = auth.uid());

-- Suppression : créateur ou admin famille
CREATE POLICY "delete_own" ON [table]
  FOR DELETE USING (created_by = auth.uid());
```

---

## 🧩 Composants UI de base

### Conventions composants

```typescript
// Toujours typer les props explicitement
interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  children: React.ReactNode
  onClick?: () => void
}

// Utiliser cn() de lib/utils pour combiner les classes
import { cn } from '@/lib/utils'

// Exports nommés pour les composants UI
export function Button({ variant = 'primary', size = 'md', loading, children, onClick }: ButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={cn(
        'inline-flex items-center justify-center font-medium transition-all duration-150',
        // variants...
      )}
    >
      {children}
    </button>
  )
}
```

### Composants existants à réutiliser

- `Button` — variants : primary, secondary, ghost, danger
- `Card` — wrapper avec bg-card, border, rounded-2xl
- `Modal` — dialog centré avec backdrop
- `Input` — input stylisé avec label et état d'erreur
- `Avatar` — photo profil avec fallback initiales + couleur user
- `Badge` — pill coloré pour statuts/catégories
- `Spinner` — loader animé

---

## 🔗 Clients Supabase

```typescript
// lib/supabase/client.ts — côté navigateur
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

// lib/supabase/server.ts — côté serveur (Server Components, API routes)
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )
}
```

---

## 📝 Conventions de code

### TypeScript

- `strict: true` dans tsconfig — pas de `any` implicite
- Tous les types centralisés dans `types/index.ts`
- Préférer les interfaces aux types pour les objets
- Toujours typer les retours de fonctions async

### Nommage

| Élément | Convention | Exemple |
|---------|-----------|---------|
| Composants | PascalCase | `EventCard`, `FamilyHeader` |
| Hooks | camelCase + use | `useFamily`, `useCurrentUser` |
| Fonctions utilitaires | camelCase | `formatDate`, `groupByDate` |
| Types/Interfaces | PascalCase | `FamilyEvent`, `UserProfile` |
| Variables, props | camelCase | `isLoading`, `onSubmit` |
| Constantes | SCREAMING_SNAKE | `MAX_FAMILY_MEMBERS` |
| Fichiers composants | kebab-case | `event-card.tsx` |

### Langue

- **Textes UI** : français (labels, boutons, messages d'erreur, placeholders)
- **Code** : anglais (variables, fonctions, types, noms de fichiers)
- **Commentaires** : français
- **Commits** : français

---

## 🤖 Assistant Flo

L'assistant IA intégré s'appelle **Flo**. Il est accessible via la route `/flo` et potentiellement dans une mini-interface sur l'accueil.

- Personnalité : bienveillant, utile, familier mais pas infantilisant
- Contexte injecté : données famille (événements, tâches, bien-être) du jour/semaine
- API : Claude API (`claude-sonnet-4-20250514`)
- Historique : persisté dans `flo_messages` (Supabase)
- Limites : pas de données sensibles hors `family_id` de l'utilisateur

**Prompt système de base pour Flo :**
```
Tu es Flo, l'assistant IA de FlowTime, une app de coordination familiale.
Tu aides [nom_famille] à s'organiser au quotidien.
Tu es bienveillant, direct et utile. Tu parles en français.
Contexte famille du jour : [données_injectées]
```

---

## 📱 Mobile (Capacitor)

Le projet sera converti en app mobile via **Capacitor**. Garder en tête lors du développement :

- Tous les éléments interactifs minimum **44x44px** (touch targets)
- Éviter hover-only interactions (pas d'info uniquement au survol)
- Bottom navigation bar pour mobile (pas de sidebar latérale)
- Éviter les popups/modals qui nécessitent un clavier sur mobile
- Tester mentalement sur viewport 390px (iPhone 15)
- Utiliser `safe-area-inset` pour les notches iOS

---

## ⚙️ Variables d'environnement

```env
# .env.local
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=      # Côté serveur uniquement
ANTHROPIC_API_KEY=              # Pour l'assistant Flo
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## 🚀 Workflow de développement

### Ordre de priorité pour chaque feature

1. **Schema SQL** → migration dans `supabase/migrations/`
2. **Types TypeScript** → `types/index.ts`
3. **Hook de données** → `lib/hooks/use[Feature].ts`
4. **Composants UI** → `components/[feature]/`
5. **Page** → `app/(app)/[feature]/page.tsx`
6. **Tests** → Playwright E2E si critique

### Checklist avant de soumettre une feature

- [ ] RLS activé sur toutes les nouvelles tables
- [ ] Types TypeScript exportés dans `types/index.ts`
- [ ] Composants accessibles (aria-label sur les icônes seules)
- [ ] États de chargement gérés (`loading`, `error`, `empty`)
- [ ] Responsive jusqu'à 390px testé mentalement
- [ ] Pas de `console.log` oublié en production
- [ ] Variables d'environnement dans `.env.example`

---

## 🎯 Fonctionnalités cibles

### MVP (à compléter en priorité)

- [x] Auth (login / signup / logout)
- [x] Profil utilisateur
- [ ] Création / invitation famille
- [ ] Agenda partagé (CRUD événements)
- [ ] Tâches partagées (CRUD + assignation)
- [ ] Suivi bien-être quotidien
- [ ] Assistant Flo (chat basique)

### V2 (après MVP)

- [ ] Notifications push (Capacitor)
- [ ] Carte interactive famille (Leaflet)
- [ ] Récurrence d'événements
- [ ] Flo enrichi (contexte famille complet)
- [ ] Mode hors-ligne (Capacitor + cache)
- [ ] Partage de photos famille

---

## 🔍 Patterns à éviter

```typescript
// ❌ Mauvais — any implicite
const handleData = (data: any) => { ... }

// ✅ Bon — type explicite
const handleData = (data: FamilyEvent) => { ... }

// ❌ Mauvais — fetch direct dans un composant
function EventList() {
  const [events, setEvents] = useState([])
  useEffect(() => {
    fetch('/api/events').then(...)
  }, [])
}

// ✅ Bon — hook dédié
function EventList() {
  const { events, isLoading } = useEvents()
}

// ❌ Mauvais — classes Tailwind en dur dans les variants
className="bg-orange-400 text-white"

// ✅ Bon — variables CSS + cn()
className={cn(
  "transition-colors duration-150",
  variant === 'primary' && "bg-[var(--accent-primary)] text-[var(--bg-base)]"
)}
```

---

*Ce fichier est la source de vérité pour le développement de FlowTime. Le mettre à jour si l'architecture ou les choix techniques évoluent.*
