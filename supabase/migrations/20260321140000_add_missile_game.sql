-- Ajouter 'missile' à la contrainte CHECK sur game_scores
ALTER TABLE public.game_scores DROP CONSTRAINT IF EXISTS game_scores_game_check;
ALTER TABLE public.game_scores ADD CONSTRAINT game_scores_game_check CHECK (game IN ('snake', 'tetris', 'flappy', 'breakout', 'missile'));
