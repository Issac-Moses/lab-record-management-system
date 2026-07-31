-- =============================================================================
-- Fix submissions so PDF / unifiedStudentData can load output images & attachments
-- Run in Supabase SQL Editor (review policies — adjust if you already have these).
-- =============================================================================

-- 1) Columns: store arrays as JSONB (app sends arrays of data URLs or URL strings)
--    If your table already has these with another type, inspect first:
--    SELECT column_name, data_type FROM information_schema.columns
--    WHERE table_schema = 'public' AND table_name = 'submissions';

ALTER TABLE public.submissions
  ADD COLUMN IF NOT EXISTS images jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.submissions
  ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb;

-- If columns existed as TEXT / TEXT[] and inserts failed silently, normalize once:
-- (Uncomment only after checking a sample row; backup first.)
/*
UPDATE public.submissions
SET
  images = CASE
    WHEN images IS NULL THEN '[]'::jsonb
    WHEN jsonb_typeof(images::jsonb) IS NOT NULL THEN images::jsonb
    ELSE to_jsonb(ARRAY[images::text])
  END
WHERE false; -- set WHERE after verifying types
*/

-- 2) Helpful index for student + subject lookups (PDF merge uses this)
CREATE INDEX IF NOT EXISTS submissions_student_subject_updated_idx
  ON public.submissions (student_id, subject_id, updated_at DESC);

-- 3) RLS: students must be allowed to SELECT their own rows (includes images/attachments)
--    Replace policy name if it clashes with your project.

ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "submissions_select_own_student" ON public.submissions;

CREATE POLICY "submissions_select_own_student"
  ON public.submissions
  FOR SELECT
  TO authenticated
  USING (student_id = auth.uid());

-- If students also INSERT/UPDATE their submissions (StudentExperiment upsert), ensure policies exist.
-- Example (adjust to match your app):

DROP POLICY IF EXISTS "submissions_insert_own_student" ON public.submissions;

CREATE POLICY "submissions_insert_own_student"
  ON public.submissions
  FOR INSERT
  TO authenticated
  WITH CHECK (student_id = auth.uid());

DROP POLICY IF EXISTS "submissions_update_own_student" ON public.submissions;

CREATE POLICY "submissions_update_own_student"
  ON public.submissions
  FOR UPDATE
  TO authenticated
  USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid());

-- Faculty/admin policies are project-specific — do not drop them. Add separate policies
-- for role = faculty if needed, e.g. USING (true) with a check on faculty_subjects.

-- =============================================================================
-- 4) Supabase Storage (if output images are files in a bucket, not only base64 in DB)
--    PDF fetch() needs either:
--    - public bucket, OR
--    - signed URLs stored in images[], OR
--    - RLS on storage.objects allowing the student to read objects they uploaded
--
-- Example: public read on a dedicated bucket (replace bucket name):

-- INSERT INTO storage.buckets (id, name, public)
-- VALUES ('lab-outputs', 'lab-outputs', true)
-- ON CONFLICT (id) DO UPDATE SET public = true;

-- Or create a policy on storage.objects (Supabase docs) for authenticated read
-- on paths prefixed with auth.uid().

-- =============================================================================
-- 5) Verify one student row after saving from the app

/*
SELECT id, student_id, subject_id, exp_id,
       jsonb_array_length(images) AS image_count,
       jsonb_array_length(attachments) AS attachment_count,
       left(images::text, 120) AS images_preview
FROM public.submissions
WHERE student_id = auth.uid()
ORDER BY updated_at DESC
LIMIT 5;
*/
