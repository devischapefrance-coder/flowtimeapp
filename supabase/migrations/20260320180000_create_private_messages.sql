-- Table pour les messages prives entre membres
create table if not exists public.private_messages (
  id uuid default gen_random_uuid() primary key,
  sender_id uuid not null references auth.users(id) on delete cascade,
  receiver_id uuid not null references auth.users(id) on delete cascade,
  message text not null,
  created_at timestamptz default now()
);

-- Index pour les requetes de conversation
create index idx_private_messages_sender on public.private_messages(sender_id, created_at);
create index idx_private_messages_receiver on public.private_messages(receiver_id, created_at);
create index idx_private_messages_conversation on public.private_messages(sender_id, receiver_id, created_at);

-- RLS : chaque utilisateur ne voit que ses propres conversations
alter table public.private_messages enable row level security;

create policy "Users can read their own messages"
  on public.private_messages for select
  using (auth.uid() = sender_id or auth.uid() = receiver_id);

create policy "Users can send messages"
  on public.private_messages for insert
  with check (auth.uid() = sender_id);

create policy "Users can delete their own sent messages"
  on public.private_messages for delete
  using (auth.uid() = sender_id);

-- Activer realtime
alter publication supabase_realtime add table public.private_messages;
