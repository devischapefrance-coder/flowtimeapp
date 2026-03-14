-- Migration : ajout des préférences de thème sur profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS theme TEXT DEFAULT 'default',
  ADD COLUMN IF NOT EXISTS theme_mode TEXT DEFAULT 'dark';
