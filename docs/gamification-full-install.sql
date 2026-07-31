-- =============================================================================
-- Lab Record System — FULL gamification install (Supabase / PostgreSQL)
-- Safe to run multiple times (idempotent where possible).
--
-- Run in: Supabase Dashboard → SQL → New query → Paste → Run
--
-- Includes:
--   • XP columns on public.profiles (and public.users if present)
--   • achievements, user_achievements, leaderboard_cache
--   • Achievement catalog seed (labs, streaks, quests)
--   • student_gamification_tasks (faculty/admin → student quests)
--   • Optional RLS for client reads (achievements + user_achievements)
--
-- After this: restart your Node API. Frontend uses profiles.xp_* and the
-- gamification API (service role) for writes.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) XP columns on profiles / users
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
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

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
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

-- -----------------------------------------------------------------------------
-- 2) Core gamification tables
-- -----------------------------------------------------------------------------
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

-- Required for ON CONFLICT (name) below
CREATE UNIQUE INDEX IF NOT EXISTS achievements_name_key ON public.achievements (name);

-- -----------------------------------------------------------------------------
-- 3) Achievement catalog (labs, streaks, leaderboard, quests)
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- 4) Student quests (assigned tasks)
-- subject_id: optional link — FK added only if public.subjects exists (see §5)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.student_gamification_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  assigned_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  subject_id uuid,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  xp_reward integer NOT NULL DEFAULT 50,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc', now()),
  completed_at timestamp with time zone,
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT student_gamification_tasks_status_check CHECK (status IN ('pending', 'completed', 'cancelled')),
  CONSTRAINT student_gamification_tasks_xp_check CHECK (xp_reward >= 1 AND xp_reward <= 500)
);

CREATE INDEX IF NOT EXISTS idx_student_gamification_tasks_student_status
  ON public.student_gamification_tasks(student_id, status);

CREATE INDEX IF NOT EXISTS idx_student_gamification_tasks_assigner
  ON public.student_gamification_tasks(assigned_by, created_at DESC);

COMMENT ON TABLE public.student_gamification_tasks IS
  'Quest-style tasks; completing pending rows awards XP via Node API (profiles.xp_points).';

-- -----------------------------------------------------------------------------
-- 5) Optional FK: subject_id → public.subjects (only if table exists)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'subjects'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'student_gamification_tasks_subject_id_fkey'
    ) THEN
      ALTER TABLE public.student_gamification_tasks
        ADD CONSTRAINT student_gamification_tasks_subject_id_fkey
        FOREIGN KEY (subject_id) REFERENCES public.subjects(id) ON DELETE SET NULL;
    END IF;
  END IF;
END
$$;

-- -----------------------------------------------------------------------------
-- 6) Optional RLS — lets authenticated clients read achievements + own badges
--    (XP writes still use service role in Node; safe to skip if you prefer deny-all)
-- -----------------------------------------------------------------------------
ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "achievements_select_authenticated" ON public.achievements;
CREATE POLICY "achievements_select_authenticated"
  ON public.achievements FOR SELECT
  TO authenticated
  USING (true);

ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_achievements_select_own" ON public.user_achievements;
CREATE POLICY "user_achievements_select_own"
  ON public.user_achievements FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Inserts into user_achievements are done by the backend (service role).

-- =============================================================================
-- Done. Verify:
--   SELECT COUNT(*) FROM public.achievements;   -- expect 10
--   SELECT column_name FROM information_schema.columns
--     WHERE table_schema = 'public' AND table_name = 'profiles'
--     AND column_name IN ('xp_points','level','current_streak','labs_completed');
-- =============================================================================
