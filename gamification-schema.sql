-- Gamification additive schema extension
-- Safe to run multiple times.
--
-- For a single file that also includes quests + optional RLS, use:
--   docs/gamification-full-install.sql

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'users'
  ) THEN
    ALTER TABLE public.users
      ADD COLUMN IF NOT EXISTS xp_points integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS level integer NOT NULL DEFAULT 1,
      ADD COLUMN IF NOT EXISTS current_streak integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS labs_completed integer NOT NULL DEFAULT 0;
  END IF;
END
$$;

-- Project compatibility: this codebase stores role/user metadata in profiles.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'profiles'
  ) THEN
    ALTER TABLE public.profiles
      ADD COLUMN IF NOT EXISTS xp_points integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS level integer NOT NULL DEFAULT 1,
      ADD COLUMN IF NOT EXISTS current_streak integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS labs_completed integer NOT NULL DEFAULT 0;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  xp_reward integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.user_achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  achievement_id uuid NOT NULL REFERENCES public.achievements(id) ON DELETE CASCADE,
  earned_at timestamp with time zone NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE (user_id, achievement_id)
);

CREATE TABLE IF NOT EXISTS public.leaderboard_cache (
  user_id uuid PRIMARY KEY,
  xp_points integer NOT NULL DEFAULT 0,
  department text,
  rank integer
);

CREATE INDEX IF NOT EXISTS idx_user_achievements_user_id
  ON public.user_achievements(user_id);

CREATE INDEX IF NOT EXISTS idx_leaderboard_cache_department_xp
  ON public.leaderboard_cache(department, xp_points DESC);

-- Idempotent seed: one row per achievement name (students & faculty share profiles.xp_* columns).
CREATE UNIQUE INDEX IF NOT EXISTS achievements_name_key ON public.achievements (name);

INSERT INTO public.achievements (name, description, xp_reward) VALUES
  ('First Lab Submission', 'Submit your very first experiment', 50),
  ('5 Labs Completed', 'Complete 5 experiments', 100),
  ('10 Labs Completed', 'Complete 10 experiments — halfway there!', 200),
  ('3-Day Streak', 'Submit experiments 3 days in a row', 75),
  ('7-Day Streak', 'Maintain a full week submission streak', 150),
  ('Perfect Score', 'Achieve full marks on an experiment', 100),
  ('Top 5 Ranker', 'Reach the top 5 on your department leaderboard', 200),
  ('First Quest Complete', 'Finish your first assigned quest from faculty or admin', 40),
  ('Quest Sprint', 'Complete 5 assigned quests', 120),
  ('Quest Legend', 'Complete 10 assigned quests', 250)
ON CONFLICT (name) DO NOTHING;
