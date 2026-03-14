-- Create family_messages table for synchronized family chat
CREATE TABLE IF NOT EXISTS family_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  family_id UUID NOT NULL,
  sender_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_name TEXT NOT NULL DEFAULT '',
  sender_emoji TEXT NOT NULL DEFAULT '👤',
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE family_messages ENABLE ROW LEVEL SECURITY;

-- Policy: family members can read/write their family's messages
CREATE POLICY "Family messages" ON family_messages FOR ALL USING (
  family_id IN (SELECT family_id FROM profiles WHERE id = auth.uid())
);

-- Enable realtime for this table
ALTER PUBLICATION supabase_realtime ADD TABLE family_messages;

-- Index for fast family queries
CREATE INDEX idx_family_messages_family_id ON family_messages (family_id, created_at);
