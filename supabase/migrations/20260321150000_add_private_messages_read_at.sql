-- Ajouter read_at pour tracker les messages lus
ALTER TABLE public.private_messages
  ADD COLUMN IF NOT EXISTS read_at timestamptz DEFAULT NULL;

-- Index pour requêter les messages non lus efficacement
CREATE INDEX IF NOT EXISTS idx_private_messages_unread
  ON public.private_messages(receiver_id, read_at)
  WHERE read_at IS NULL;

-- Policy : le destinataire peut marquer ses messages comme lus
CREATE POLICY "Receiver can mark as read"
  ON public.private_messages FOR UPDATE
  USING (auth.uid() = receiver_id)
  WITH CHECK (auth.uid() = receiver_id);
