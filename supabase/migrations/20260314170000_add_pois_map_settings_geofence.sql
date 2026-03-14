-- =============================================
-- Migration : POI, réglages carte, alertes géofence
-- =============================================

-- 1. Points d'intérêt sauvegardés par la famille
CREATE TABLE IF NOT EXISTS pois (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  family_id UUID NOT NULL,
  name TEXT NOT NULL,
  emoji TEXT DEFAULT '📍',
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  address TEXT DEFAULT '',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pois_family ON pois (family_id);
ALTER TABLE pois ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Family pois" ON pois FOR ALL USING (
  family_id IN (SELECT family_id FROM profiles WHERE id = auth.uid())
);

-- 2. Réglages carte sur profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS safe_radius INTEGER DEFAULT 500,
  ADD COLUMN IF NOT EXISTS show_safe_zone BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS gps_precision TEXT DEFAULT 'high';

-- 3. Alertes géofence (détection entrée/sortie de zone par membre)
CREATE TABLE IF NOT EXISTS geofence_alerts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  family_id UUID NOT NULL,
  member_id UUID REFERENCES members(id) ON DELETE CASCADE,
  poi_id UUID REFERENCES pois(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL DEFAULT 'both' CHECK (alert_type IN ('enter', 'exit', 'both')),
  radius INTEGER DEFAULT 500,
  enabled BOOLEAN DEFAULT true,
  last_state TEXT DEFAULT NULL CHECK (last_state IS NULL OR last_state IN ('inside', 'outside')),
  last_triggered_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_geofence_family ON geofence_alerts (family_id);
ALTER TABLE geofence_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Family geofence alerts" ON geofence_alerts FOR ALL USING (
  family_id IN (SELECT family_id FROM profiles WHERE id = auth.uid())
);
