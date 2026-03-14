-- Migration : restructuration de la table chores
-- Passe du modèle todo (title/assigned_to/done) au modèle rotation
-- (name/emoji/frequency/assigned_members/current_index/last_rotated)

-- Ajout des nouvelles colonnes
ALTER TABLE chores ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE chores ADD COLUMN IF NOT EXISTS emoji TEXT DEFAULT '🧹';
ALTER TABLE chores ADD COLUMN IF NOT EXISTS frequency TEXT DEFAULT 'weekly' CHECK (frequency IN ('daily', 'weekly'));
ALTER TABLE chores ADD COLUMN IF NOT EXISTS assigned_members TEXT[] DEFAULT '{}';
ALTER TABLE chores ADD COLUMN IF NOT EXISTS current_index INTEGER DEFAULT 0;
ALTER TABLE chores ADD COLUMN IF NOT EXISTS last_rotated TIMESTAMPTZ DEFAULT NULL;

-- Migrer les données existantes : title → name (seulement si title existe encore)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chores' AND column_name = 'title') THEN
    UPDATE chores SET name = title WHERE name IS NULL AND title IS NOT NULL;
  END IF;
END $$;

-- Rendre name NOT NULL (avec fallback pour les lignes sans title)
UPDATE chores SET name = 'Tâche' WHERE name IS NULL;
ALTER TABLE chores ALTER COLUMN name SET NOT NULL;

-- Migrer assigned_to → assigned_members (seulement si assigned_to existe encore)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chores' AND column_name = 'assigned_to') THEN
    UPDATE chores SET assigned_members = ARRAY[assigned_to::TEXT]
    WHERE assigned_to IS NOT NULL AND (assigned_members IS NULL OR assigned_members = '{}');
  END IF;
END $$;

-- Migrer done → last_rotated (seulement si done existe encore)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chores' AND column_name = 'done') THEN
    UPDATE chores SET last_rotated = created_at WHERE done = true AND last_rotated IS NULL;
  END IF;
END $$;
