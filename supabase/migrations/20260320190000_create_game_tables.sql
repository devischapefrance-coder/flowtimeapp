-- Table des scores de jeux
create table if not exists public.game_scores (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  family_id uuid not null,
  game text not null check (game in ('snake', 'tetris', 'flappy')),
  score integer not null default 0,
  level integer,
  lines integer,
  duration_seconds integer,
  played_at timestamptz default now()
);

create index idx_game_scores_family_game on public.game_scores(family_id, game, score desc);
create index idx_game_scores_user on public.game_scores(user_id, game);

alter table public.game_scores enable row level security;

create policy "select_family_scores" on public.game_scores
  for select using (
    family_id in (select family_id from profiles where id = auth.uid())
  );

create policy "insert_own_score" on public.game_scores
  for insert with check (
    auth.uid() = user_id and
    family_id in (select family_id from profiles where id = auth.uid())
  );

-- Table sessions multijoueur Tetris
create table if not exists public.game_sessions (
  id uuid default gen_random_uuid() primary key,
  family_id uuid not null,
  game text not null default 'tetris',
  host_id uuid references auth.users(id) not null,
  guest_id uuid references auth.users(id),
  status text default 'waiting' check (status in ('waiting', 'playing', 'finished')),
  host_score integer default 0,
  guest_score integer default 0,
  host_alive boolean default true,
  guest_alive boolean default true,
  winner_id uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.game_sessions enable row level security;

create policy "select_family_sessions" on public.game_sessions
  for select using (
    family_id in (select family_id from profiles where id = auth.uid())
  );

create policy "insert_own_session" on public.game_sessions
  for insert with check (auth.uid() = host_id);

create policy "update_participant_session" on public.game_sessions
  for update using (host_id = auth.uid() or guest_id = auth.uid());

-- Activer realtime pour les sessions multi
alter publication supabase_realtime add table public.game_sessions;
