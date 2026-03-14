-- Migration : suppression de la colonne shared sur events
-- Le champ shared est devenu redondant avec scope (perso/famille)
-- Toutes les références TypeScript ont été migrées vers scope

ALTER TABLE events DROP COLUMN IF EXISTS shared;
