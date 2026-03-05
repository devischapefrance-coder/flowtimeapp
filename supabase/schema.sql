-- ===========================================
-- FlowTime — Schéma complet de la base de données
-- ===========================================
-- À exécuter dans Supabase SQL Editor :
-- 1. Allez sur https://supabase.com → votre projet
-- 2. Menu gauche → SQL Editor
-- 3. Collez ce fichier en entier et cliquez "Run"
-- ===========================================

-- Table des profils utilisateurs (liée à auth.users)
CREATE TABLE profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  email TEXT NOT NULL,
  first_name TEXT NOT NULL DEFAULT '',
  last_name TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  address TEXT DEFAULT '',
  emoji TEXT DEFAULT '👤',
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  family_id UUID DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Membres de la famille
CREATE TABLE members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  family_id UUID NOT NULL,
  name TEXT NOT NULL,
  role TEXT DEFAULT 'enfant',
  emoji TEXT DEFAULT '👦',
  color TEXT DEFAULT '#3DD6C8',
  birth_date DATE,
  phone TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  schedules JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Contacts de confiance
CREATE TABLE contacts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  family_id UUID NOT NULL,
  name TEXT NOT NULL,
  phone TEXT DEFAULT '',
  relation TEXT DEFAULT '',
  emoji TEXT DEFAULT '👤',
  visible_to TEXT[] DEFAULT NULL,
  assigned_to TEXT[] DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Adresses importantes
CREATE TABLE addresses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  family_id UUID NOT NULL,
  name TEXT NOT NULL,
  emoji TEXT DEFAULT '📍',
  address TEXT DEFAULT '',
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  members JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Événements du planning
CREATE TABLE events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  family_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  time TEXT NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  member_id UUID REFERENCES members(id) ON DELETE SET NULL,
  recurring JSONB DEFAULT NULL,
  category TEXT DEFAULT 'general',
  shared BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sessions bien-être
CREATE TABLE wellbeing_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE,
  activity TEXT NOT NULL,
  minutes INTEGER NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Localisation des appareils familiaux (temps réel)
CREATE TABLE device_locations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  family_id UUID NOT NULL,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE,
  device_name TEXT NOT NULL DEFAULT 'Mon appareil',
  emoji TEXT DEFAULT '📱',
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  accuracy DOUBLE PRECISION,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Notes partagées
CREATE TABLE notes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  family_id UUID NOT NULL,
  title TEXT NOT NULL,
  content TEXT DEFAULT '',
  category TEXT NOT NULL DEFAULT 'info',
  author_name TEXT DEFAULT '',
  pinned BOOLEAN DEFAULT FALSE,
  checklist JSONB DEFAULT '[]',
  attachments JSONB DEFAULT '[]',
  visible_to JSONB DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Commentaires sur les notes
CREATE TABLE note_comments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  note_id UUID REFERENCES notes(id) ON DELETE CASCADE,
  family_id UUID NOT NULL,
  author_name TEXT DEFAULT '',
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Anniversaires
CREATE TABLE birthdays (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  family_id UUID NOT NULL,
  name TEXT NOT NULL,
  date DATE NOT NULL,
  emoji TEXT DEFAULT '🎂',
  member_id UUID REFERENCES members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Repas (meal planning)
CREATE TABLE meals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  family_id UUID NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  meal_type TEXT NOT NULL DEFAULT 'dejeuner',
  name TEXT NOT NULL,
  emoji TEXT DEFAULT '🍽️',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Liste de courses
CREATE TABLE shopping_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  family_id UUID NOT NULL,
  text TEXT NOT NULL,
  checked BOOLEAN DEFAULT false,
  category TEXT DEFAULT 'general',
  added_by TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Dépenses partagées
CREATE TABLE expenses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  family_id UUID NOT NULL,
  title TEXT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  paid_by UUID REFERENCES auth.users ON DELETE SET NULL,
  category TEXT DEFAULT 'general',
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tâches ménagères
CREATE TABLE chores (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  family_id UUID NOT NULL,
  title TEXT NOT NULL,
  assigned_to UUID REFERENCES members(id) ON DELETE SET NULL,
  done BOOLEAN DEFAULT false,
  due_date DATE,
  recurring JSONB DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Messages du chat famille
CREATE TABLE family_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  family_id UUID NOT NULL,
  sender_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_name TEXT NOT NULL DEFAULT '',
  sender_emoji TEXT NOT NULL DEFAULT '👤',
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Abonnements push notifications
CREATE TABLE push_subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  keys JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================
-- Row Level Security (RLS)
-- ===========================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE wellbeing_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE note_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE birthdays ENABLE ROW LEVEL SECURITY;
ALTER TABLE meals ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopping_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE chores ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE family_messages ENABLE ROW LEVEL SECURITY;

-- Profiles : lecture/modif de son propre profil uniquement
CREATE POLICY "Own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Insert profile" ON profiles FOR INSERT WITH CHECK (id = auth.uid());

-- Membres : accès par famille
CREATE POLICY "Family members" ON members FOR ALL USING (
  family_id IN (SELECT family_id FROM profiles WHERE id = auth.uid())
);

-- Contacts : accès par famille
CREATE POLICY "Family contacts" ON contacts FOR ALL USING (
  family_id IN (SELECT family_id FROM profiles WHERE id = auth.uid())
);

-- Adresses : accès par famille
CREATE POLICY "Family addresses" ON addresses FOR ALL USING (
  family_id IN (SELECT family_id FROM profiles WHERE id = auth.uid())
);

-- Événements : accès par famille
CREATE POLICY "Family events" ON events FOR ALL USING (
  family_id IN (SELECT family_id FROM profiles WHERE id = auth.uid())
);

-- Bien-être : accès à ses propres sessions uniquement
CREATE POLICY "Own wellbeing" ON wellbeing_sessions FOR ALL USING (
  user_id = auth.uid()
);

-- Localisations : accès par famille
CREATE POLICY "Family device locations" ON device_locations FOR ALL USING (
  family_id IN (SELECT family_id FROM profiles WHERE id = auth.uid())
);

-- Notes : accès par famille
CREATE POLICY "Family notes" ON notes FOR ALL USING (
  family_id IN (SELECT family_id FROM profiles WHERE id = auth.uid())
);

-- Commentaires de notes : accès par famille
CREATE POLICY "Family note comments" ON note_comments FOR ALL USING (
  family_id IN (SELECT family_id FROM profiles WHERE id = auth.uid())
);

-- Anniversaires : accès par famille
CREATE POLICY "Family birthdays" ON birthdays FOR ALL USING (
  family_id IN (SELECT family_id FROM profiles WHERE id = auth.uid())
);

-- Repas : accès par famille
CREATE POLICY "Family meals" ON meals FOR ALL USING (
  family_id IN (SELECT family_id FROM profiles WHERE id = auth.uid())
);

-- Liste de courses : accès par famille
CREATE POLICY "Family shopping" ON shopping_items FOR ALL USING (
  family_id IN (SELECT family_id FROM profiles WHERE id = auth.uid())
);

-- Dépenses : accès par famille
CREATE POLICY "Family expenses" ON expenses FOR ALL USING (
  family_id IN (SELECT family_id FROM profiles WHERE id = auth.uid())
);

-- Tâches : accès par famille
CREATE POLICY "Family chores" ON chores FOR ALL USING (
  family_id IN (SELECT family_id FROM profiles WHERE id = auth.uid())
);

-- Push subscriptions : accès à ses propres abonnements uniquement
CREATE POLICY "Own push subscriptions" ON push_subscriptions FOR ALL USING (
  user_id = auth.uid()
);

-- Messages chat famille : accès par famille
CREATE POLICY "Family messages" ON family_messages FOR ALL USING (
  family_id IN (SELECT family_id FROM profiles WHERE id = auth.uid())
);
