-- Individual and Overall Global XP quests assigned to students (faculty/admin).
-- Run in Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS public.student_gamification_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  assigned_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  subject_id uuid REFERENCES public.subjects(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  xp_reward integer NOT NULL DEFAULT 50,
  is_global boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc', now()),
  completed_at timestamp with time zone,
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT student_gamification_tasks_status_check CHECK (status IN ('pending', 'completed', 'cancelled')),
  CONSTRAINT student_gamification_tasks_xp_check CHECK (xp_reward >= 1 AND xp_reward <= 500)
);

-- Make student_id nullable for global overall quests (applicable to all students)
ALTER TABLE public.student_gamification_tasks ALTER COLUMN student_id DROP NOT NULL;
ALTER TABLE public.student_gamification_tasks ADD COLUMN IF NOT EXISTS is_global boolean NOT NULL DEFAULT false;

-- Per-student completion tracking for global overall quests
CREATE TABLE IF NOT EXISTS public.student_quest_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.student_gamification_tasks(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  completed_at timestamp with time zone NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE (task_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_student_gamification_tasks_student_status
  ON public.student_gamification_tasks(student_id, status);

CREATE INDEX IF NOT EXISTS idx_student_gamification_tasks_assigner
  ON public.student_gamification_tasks(assigned_by, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_student_quest_completions_student
  ON public.student_quest_completions(student_id);

COMMENT ON TABLE public.student_gamification_tasks IS 'Quest-style tasks; individual or global overall quests applicable to all students.';
COMMENT ON TABLE public.student_quest_completions IS 'Tracks student completion records for overall global quests.';

-- Migration / update to support performing & submitted status
ALTER TABLE public.student_gamification_tasks DROP CONSTRAINT IF EXISTS student_gamification_tasks_status_check;
ALTER TABLE public.student_gamification_tasks ADD CONSTRAINT student_gamification_tasks_status_check CHECK (status IN ('pending', 'performing', 'submitted', 'completed', 'cancelled'));

ALTER TABLE public.student_quest_completions ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'completed';
ALTER TABLE public.student_quest_completions DROP CONSTRAINT IF EXISTS student_quest_completions_status_check;
ALTER TABLE public.student_quest_completions ADD CONSTRAINT student_quest_completions_status_check CHECK (status IN ('performing', 'submitted', 'completed'));

ALTER TABLE public.student_gamification_tasks ADD COLUMN IF NOT EXISTS submission_notes text;
ALTER TABLE public.student_quest_completions ADD COLUMN IF NOT EXISTS submission_notes text;



