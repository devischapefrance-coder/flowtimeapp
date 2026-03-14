# CLAUDE.md — FlowTime

> Source de verite pour Claude Code. Derniere mise a jour : 14 mars 2026

---

## Dernieres modifications (Mars 2026)

- **Separation perso/famille** : champ `scope` sur `events`, filtrage strict par vue, badge perso/famille
- **Flow IA redefinie** : nouveau prompt systeme, contexte dynamique (membres, events, taches, meteo, heure, mode vocal), actions Supabase (events, taches, notes, repas, theme), reponse vocale TTS
- **Flo Dev** : assistant developpeur separe (`/api/flo`), genere des prompts Claude Code, separation stricte "go" (code) / "deploy" (git push)
- **Theme Stone & Amber** : nouveau theme selectionnable dans Reglages > Apparence, variables CSS classe `.stone-amber`, mode sombre et clair
- **Widget Flow IA** : redesign — orbe animee, icones SVG meteo, variables CSS pures, pas de couleurs hardcodees
- **Fix carousel** : synchronisation scroll/date, refresh dots apres mutations

### Dette technique identifiee (audit 14/03/2026)

- `schema.sql` desynchronise : 6 colonnes manquantes (`avatar_url`, `theme`, `theme_mode`, `reminder_minutes`, `speed`, `heading`)
- Interface `Chore` dans types.ts ne correspond pas a la table `chores` en base
- `ShoppingItem.name` devrait etre `text` (nom colonne en base)
- `Expense.description` devrait etre `title` (nom colonne en base)
- 60+ couleurs hardcodees au lieu de `var(--...)`

---

## Contexte

**FlowTime** est une app web de coordination familiale — agenda partage, taches, bien-etre, carte, assistant IA, messagerie.

- **Dev** : solo-entrepreneur
- **Stack** : Next.js 16.1.6 (App Router), React 19.2.3, TypeScript strict, Tailwind CSS 4
- **Backend** : Supabase (Auth, PostgreSQL, RLS, Storage, Realtime)
- **IA** : Claude API (Anthropic) via proxy server-side
- **Paiement** : Stripe (3 tiers : Free / Plus / Pro)
- **Deploiement** : Vercel
- **Repo** : github.com/devischapefrance-coder/flowtimeapp

---

## Stack technique

| Couche | Choix |
|--------|-------|
| Framework | Next.js 16.1.6 App Router |
| React | 19.2.3 |
| Langage | TypeScript strict |
| Styling | Tailwind CSS 4 (`@tailwindcss/postcss`) — pas de tailwind.config |
| Backend / Auth / DB | Supabase (Auth, PostgreSQL, RLS, Realtime, Storage) |
| Carte | Leaflet 1.9 + react-leaflet 5 (CartoDB Dark, OSM, Esri Satellite) |
| Paiement | Stripe (checkout, portal, webhooks) |
| Push | Web Push API (web-push) |
| Drag & drop | @dnd-kit |
| QR Code | qrcode.react |
| Fonts | Nunito (body) + Fraunces (titres) via next/font/google |
| Deploiement | Vercel (cron jobs inclus) |

---

## Design System — Dark Glassmorphism Purple

### Variables CSS (globals.css)

```css
:root {
  --bg: #0F1117;
  --surface: rgba(255, 255, 255, 0.04);
  --surface2: rgba(255, 255, 255, 0.07);
  --surface-solid: #1A1C25;
  --nav-bg: rgba(15, 17, 23, 0.85);
  --accent: #7C6BF0;           /* Purple — couleur principale */
  --accent-soft: rgba(124, 107, 240, 0.12);
  --accent-glow: rgba(124, 107, 240, 0.2);
  --text: #ECEEF4;
  --dim: rgba(236, 238, 244, 0.5);
  --faint: rgba(236, 238, 244, 0.2);
  --glass: rgba(255, 255, 255, 0.03);
  --glass-border: rgba(255, 255, 255, 0.06);
  --radius: 16px;
  --radius-sm: 12px;
  --teal: #5ED4C8;
  --warm: #F5C563;
  --red: #F06B7E;
  --green: #5EC89E;
  --lavender: #B39DDB;
  --blue: #6BA3F0;
}
```

### Regles de style

- **Glassmorphism** : `.glass` (backdrop-filter blur 16px, surfaces transparentes)
- **Gradient overlay** : `.gradient-bg` (radial gradient subtil)
- **Cards** : `.card` (glass + hover elevation)
- **Boutons** : `.btn-primary` (gradient accent), `.btn-secondary` (glass), `.btn-danger` (rouge)
- **Arrondis** : `--radius: 16px` par defaut, `--radius-sm: 12px`
- **Max-width** : 430px (mobile-first)
- **Min-height** : 100dvh
- **Animations** : transitions subtiles, pas de bounce excessif
- **Regle** : toujours utiliser `var(--...)` — jamais de couleurs hardcodees

### Themes

22 palettes couleur (p1-p20 + stone-amber dark + stone-amber light) + mode light default. Changement via classe CSS sur `<html>`.
- Free : 1 theme
- Plus : 10 themes
- Pro : 20 themes

---

## Structure du projet

```
src/
├── app/
│   ├── layout.tsx              # Root (fonts, metadata, theme script)
│   ├── globals.css             # Tout le design system (22 palettes)
│   ├── sw-register.tsx         # Enregistrement service worker
│   ├── page.tsx                # Splash (non authentifie)
│   ├── login/page.tsx          # Connexion email/Google
│   ├── signup/page.tsx         # Inscription
│   ├── join/page.tsx           # Rejoindre une famille
│   ├── reset-password/         # Reset mot de passe
│   ├── demo/page.tsx           # Demo auto-login
│   ├── (app)/
│   │   ├── layout.tsx          # Auth guard, ProfileContext, Navbar, FamilyChat
│   │   ├── home/page.tsx       # Dashboard, timeline, agenda, Flow IA chat, meteo
│   │   ├── famille/page.tsx    # Membres, contacts, adresses
│   │   ├── flowmap/page.tsx     # Carte, localisation, itineraires
│   │   ├── vie/page.tsx        # Notes, courses, routines, taches
│   │   ├── reglages/page.tsx   # Profil, securite, themes, abonnement
│   │   ├── abonnement/page.tsx # Plans et tarifs Stripe
│   │   ├── onboarding/page.tsx # Premier lancement
│   │   └── flo/page.tsx        # Interface Flo Dev (is_dev only)
│   └── api/
│       ├── flow/route.ts           # Proxy Claude API (Flow IA)
│       ├── flow/proactive/route.ts # Suggestions proactives
│       ├── flo/route.ts            # Proxy Claude API (Flo Dev)
│       ├── account/delete/route.ts # Suppression compte
│       ├── family/join/route.ts    # Rejoindre famille
│       ├── cron/morning/route.ts   # Briefing matinal
│       ├── cron/reminders/route.ts # Rappels
│       ├── push/subscribe/route.ts # Abonnement push
│       ├── push/send/route.ts      # Envoi notification
│       ├── stripe/checkout/route.ts
│       ├── stripe/portal/route.ts
│       └── stripe/webhook/route.ts
├── components/                 # 22 composants
│   ├── FlowChat.tsx            # Assistant IA calendrier (Flow IA)
│   ├── flo/FloChat.tsx         # Assistant developpeur (Flo Dev)
│   ├── MapFull.tsx             # Carte plein ecran
│   ├── MapView.tsx             # Mini carte
│   ├── Timeline.tsx            # Timeline evenements (drag-and-drop)
│   ├── DayAgenda.tsx           # Vue grille journee
│   ├── TutorialOverlay.tsx     # Tutoriel interactif
│   ├── SearchOverlay.tsx       # Recherche globale
│   ├── FamilyChat.tsx          # Messagerie famille temps reel
│   ├── Navbar.tsx              # Navigation bottom (5 tabs)
│   ├── Modal.tsx               # Modal generique
│   ├── AvatarUpload.tsx        # Upload photo profil (crop/zoom)
│   ├── AddressPickerMap.tsx    # Selection adresse sur carte
│   ├── NotificationManager.tsx # Notifications
│   ├── QuickVoice.tsx          # Saisie vocale flottante
│   ├── PhotoAlbum.tsx          # Album photos
│   ├── UpgradeNudge.tsx        # Upsell abonnement
│   ├── Toast.tsx               # Contexte toast
│   ├── Logo.tsx                # Logo SVG
│   ├── EmptyState.tsx          # Etat vide reutilisable
│   └── charts/                 # BarChart, DonutChart
├── lib/
│   ├── supabase.ts             # Client lazy via Proxy
│   ├── supabase-admin.ts       # Client admin (service role)
│   ├── server-auth.ts          # Auth serveur
│   ├── types.ts                # Tous les types TypeScript
│   ├── subscription.ts         # Plans, limites, prix Stripe
│   ├── push.ts / push-utils.ts # Push notifications
│   ├── realtime.ts             # Supabase Realtime hooks
│   ├── reminders.ts            # Programmation rappels
│   ├── routing.ts              # Calcul itineraires OSRM
│   ├── storage.ts              # Avatar storage Supabase
│   ├── stripe.ts               # Client Stripe
│   ├── weather.ts              # Meteo (open-meteo)
│   ├── pdf-export.ts           # Export PDF
│   ├── ical.ts                 # Export iCalendar
│   ├── offline.ts              # Cache hors-ligne
│   ├── categories.ts           # Categories evenements
│   ├── shopping-categories.ts  # Categories courses
│   ├── tutorial-data.ts        # Donnees tutoriel
│   ├── audio.ts                # Utilitaires audio
│   ├── usePullToRefresh.tsx    # Hook pull-to-refresh
│   ├── hooks/useFloChat.ts     # Hook chat Flo Dev
│   ├── hooks/useTheme.ts       # Hook gestion theme
│   └── i18n/                   # Localisation (fr, en)
├── middleware.ts                # Auth + rate limiting
└── types/
    └── speech.d.ts             # Types Web Speech API
```

---

## Base de donnees — 17 tables Supabase

| Table | Description |
|-------|-------------|
| profiles | Profils utilisateurs (extends auth.users), abonnement Stripe, theme, is_dev |
| members | Membres de la famille |
| contacts | Contacts de confiance |
| addresses | Lieux importants (avec lat/lng) |
| events | Evenements calendrier (avec scope perso/famille) |
| wellbeing_sessions | Sessions bien-etre |
| device_locations | GPS temps reel |
| notes | Notes partagees |
| note_comments | Commentaires sur notes |
| birthdays | Anniversaires |
| meals | Planning repas |
| shopping_items | Liste de courses |
| expenses | Depenses partagees |
| chores | Taches menageres |
| family_messages | Messagerie famille |
| flo_messages | Messages Flo Dev (persistance) |
| push_subscriptions | Endpoints push |

### Conventions SQL

- Tables en **snake_case** pluriel
- `id uuid DEFAULT gen_random_uuid() PRIMARY KEY`
- `created_at timestamptz DEFAULT now()`
- RLS active sur toutes les tables, acces filtre par `family_id`
- Schema complet : `supabase/schema.sql`

---

## Deux assistants IA — separation stricte

### Flow IA (assistant familial)
- Route : `POST /api/flow` (non-streaming, JSON)
- Composant : `FlowChat.tsx`
- Modele : claude-sonnet-4
- Personnalite : chaleureux, direct, parle en francais, tutoie
- Contexte injecte : membres, events, taches, meteo, heure, mode vocal
- Actions : add_event, delete_event, edit_event, add_recurring, add_task, complete_task, add_meal, create_note, change_theme
- Suggestions proactives : `POST /api/flow/proactive` (Plus/Pro)
- Widget : orbe animee sur l'accueil avec message proactif + meteo

### Flo Dev (assistant developpeur)
- Route : `POST /api/flo` (streaming SSE)
- Composant : `flo/FloChat.tsx`
- Hook : `hooks/useFloChat.ts`
- Acces : `profiles.is_dev = true` uniquement
- Workflow : reformulation → "go" → prompt Claude Code → "deploy" → commit/push
- Ne jamais melanger Flow IA et Flo Dev dans le code

---

## Abonnement Stripe (3 tiers)

| | Free | Plus | Pro |
|---|---|---|---|
| Membres | 4 | Illimite | Illimite |
| Messages Flow | 3/jour | Illimite | Illimite |
| Routines | 1 | 5 | Illimite |
| Themes | 1 | 10 | 20 |
| Suggestions proactives | Non | Oui | Oui |
| Carte famille | Non | Oui | Oui |
| Documents | Oui | Oui | Oui |
| Export | Oui | Oui | Oui |
| Partage externe | Oui | Non | Oui |
| Digest hebdo | Non | Non | Oui |

---

## Conventions de code

### TypeScript
- `strict: true` — pas de `any`
- Types centralises dans `src/lib/types.ts`
- Path alias : `@/*` → `./src/*`

### Nommage
- Composants : PascalCase (`FlowChat.tsx`)
- Hooks : camelCase + use (`usePullToRefresh`)
- Fonctions utilitaires : camelCase (`formatDate`)
- Types/Interfaces : PascalCase (`FamilyEvent`)
- Variables, props : camelCase (`isLoading`)

### Langue
- **UI** : francais (labels, boutons, messages, placeholders)
- **Code** : anglais (variables, fonctions, types, fichiers)
- **Commentaires** : francais
- **Commits** : francais

### Couleurs
- **Toujours** utiliser `var(--accent)`, `var(--text)`, etc.
- **Jamais** de hex hardcode (`#7C6BF0`) ni de `rgba(124,107,240,...)` en inline
- Les animations et gradients doivent aussi utiliser des variables CSS

---

## Decisions techniques cles

- Supabase client lazy via Proxy (evite crash build Vercel)
- Leaflet en dynamic import (ssr: false)
- Carte : tiles gratuits (CartoDB Dark, OSM, Esri Satellite)
- Geocoding : Nominatim (1 req/sec, France)
- Routing : OSRM (gratuit, sans API key)
- Meteo : Open-Meteo (gratuit)
- ANTHROPIC_API_KEY server-only (pas de NEXT_PUBLIC_)
- Code famille = 8 premiers chars de family_id UUID
- Max-width 430px, mobile-first
- Scrollbar custom, overscroll contained
- Service worker pour push + offline
- CSP stricte (Stripe, maps, APIs autorisees)

---

## Variables d'environnement

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Claude API
ANTHROPIC_API_KEY=

# Push notifications
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=

# Stripe
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_PLUS_MONTHLY=
STRIPE_PRICE_PLUS_ANNUAL=
STRIPE_PRICE_PRO_MONTHLY=
STRIPE_PRICE_PRO_ANNUAL=

# App
NEXT_PUBLIC_SITE_URL=
CRON_SECRET=
```

---

## Carte (FlowMap) — tout gratuit, sans API key

- Tiles : CartoDB Dark, OpenStreetMap, Esri Satellite
- Routing : OSRM (voiture/marche/velo)
- Geocoding : Nominatim
- POI : Overpass API
- GPS : geolocation API + partage temps reel via Supabase Realtime
- Switcher de style de carte dans MapFull

---

*Ce fichier reflete l'etat reel du projet. Le mettre a jour si l'architecture evolue.*
