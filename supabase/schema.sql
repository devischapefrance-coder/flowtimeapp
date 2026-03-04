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
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
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
ALTER TABLE birthdays ENABLE ROW LEVEL SECURITY;
ALTER TABLE meals ENABLE ROW LEVEL SECURITY;

-- Profiles : lecture/modif de son propre profil uniquement
CREATE POLICY "Own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Insert profile" ON profiles FOR INSERT WITH CHECK (true);

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

-- Anniversaires : accès par famille
CREATE POLICY "Family birthdays" ON birthdays FOR ALL USING (
  family_id IN (SELECT family_id FROM profiles WHERE id = auth.uid())
);

-- Repas : accès par famille
CREATE POLICY "Family meals" ON meals FOR ALL USING (
  family_id IN (SELECT family_id FROM profiles WHERE id = auth.uid())
);
