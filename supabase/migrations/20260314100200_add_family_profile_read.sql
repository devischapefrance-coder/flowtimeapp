-- Allow family members to read each other's profiles (for avatars in chat, etc.)
CREATE POLICY "Read family profiles" ON profiles FOR SELECT USING (
  family_id IN (SELECT family_id FROM profiles WHERE id = auth.uid())
);
