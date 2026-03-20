-- Déduplique d'abord (garder la ligne la plus récente par user_id)
DELETE FROM device_locations a
USING device_locations b
WHERE a.user_id = b.user_id
  AND a.updated_at < b.updated_at;

-- Contrainte UNIQUE pour permettre upsert sur user_id
CREATE UNIQUE INDEX IF NOT EXISTS idx_device_locations_user_unique
  ON device_locations (user_id);
