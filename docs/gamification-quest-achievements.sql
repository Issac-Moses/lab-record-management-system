-- Quest-based achievements (run after gamification-schema.sql + gamification-tasks-schema.sql).
-- Idempotent via unique name.

INSERT INTO public.achievements (name, description, xp_reward) VALUES
  ('First Quest Complete', 'Finish your first assigned quest from faculty or admin', 40),
  ('Quest Sprint', 'Complete 5 assigned quests', 120),
  ('Quest Legend', 'Complete 10 assigned quests', 250)
ON CONFLICT (name) DO NOTHING;
