-- Migration : ajout du champ scope sur la table events
-- Séparation stricte entre événements personnels et familiaux

-- Ajout du champ scope
ALTER TABLE events
ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'famille'
CHECK (scope IN ('perso', 'famille'));

-- Les events existants sont migrés vers 'famille' (comportement historique)
UPDATE events SET scope = 'famille' WHERE scope IS NULL;

-- Migration shared→scope (idempotent : skip si shared n'existe plus)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'events' AND column_name = 'shared') THEN
    UPDATE events SET scope = 'perso' WHERE shared = false;
  END IF;
END $$;

COMMENT ON COLUMN events.scope IS
'perso = visible uniquement dans Mon Planning du créateur | famille = visible par tous les membres dans la vue Famille';
