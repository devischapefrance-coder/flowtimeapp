-- Migration : ajout du mode développeur Flo
-- 1. Ajout du champ is_dev sur la table profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_dev BOOLEAN DEFAULT false;

-- 2. Table des messages Flo (persistance mode normal uniquement)
CREATE TABLE IF NOT EXISTS flo_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS sur flo_messages
ALTER TABLE flo_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Own flo messages" ON flo_messages FOR ALL USING (
  user_id = auth.uid()
);

-- Index pour récupérer les messages récents rapidement
CREATE INDEX IF NOT EXISTS flo_messages_user_created ON flo_messages (user_id, created_at DESC);
