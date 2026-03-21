-- Ajouter 'breakout' à la contrainte CHECK sur game_scores
alter table public.game_scores drop constraint if exists game_scores_game_check;
alter table public.game_scores add constraint game_scores_game_check check (game in ('snake', 'tetris', 'flappy', 'breakout'));

-- Ajouter 'breakout' à la colonne game de game_sessions (default reste 'tetris')
-- Pas de contrainte CHECK existante sur game_sessions.game, mais on s'assure de la compatibilité
