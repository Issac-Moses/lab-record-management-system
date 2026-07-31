-- Optional Supabase RLS for gamification tables (run after gamification-schema.sql).
-- Lets the browser (anon/authenticated key) read achievements and a user's own badges.
-- XP updates still go through your Node API with the service role (bypasses RLS).

-- Achievements catalog: readable by any signed-in user
ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "achievements_select_authenticated" ON public.achievements;
CREATE POLICY "achievements_select_authenticated"
  ON public.achievements FOR SELECT
  TO authenticated
  USING (true);

-- User badges: each user sees only their rows
ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_achievements_select_own" ON public.user_achievements;
CREATE POLICY "user_achievements_select_own"
  ON public.user_achievements FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Note: Inserts into user_achievements are performed by the backend (service role).
-- If you need client-side inserts, add a secure policy or use an Edge Function.
