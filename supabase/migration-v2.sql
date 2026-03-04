-- Migration V2: expenses, chores, family_photos + event reminder_minutes

ALTER TABLE events ADD COLUMN IF NOT EXISTS reminder_minutes INTEGER DEFAULT NULL;

CREATE TABLE IF NOT EXISTS expenses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  family_id UUID NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  description TEXT NOT NULL,
  category TEXT DEFAULT 'autre',
  member_id UUID REFERENCES members(id) ON DELETE SET NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Family expenses" ON expenses FOR ALL USING (
  family_id IN (SELECT family_id FROM profiles WHERE id = auth.uid())
);

CREATE TABLE IF NOT EXISTS chores (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  family_id UUID NOT NULL,
  name TEXT NOT NULL,
  emoji TEXT DEFAULT '🧹',
  frequency TEXT DEFAULT 'weekly',
  assigned_members JSONB DEFAULT '[]',
  current_index INTEGER DEFAULT 0,
  last_rotated DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE chores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Family chores" ON chores FOR ALL USING (
  family_id IN (SELECT family_id FROM profiles WHERE id = auth.uid())
);

CREATE TABLE IF NOT EXISTS family_photos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  family_id UUID NOT NULL,
  url TEXT NOT NULL,
  caption TEXT DEFAULT '',
  uploaded_by TEXT DEFAULT '',
  event_id UUID REFERENCES events(id) ON DELETE SET NULL,
  week_label TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE family_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Family photos" ON family_photos FOR ALL USING (
  family_id IN (SELECT family_id FROM profiles WHERE id = auth.uid())
);
