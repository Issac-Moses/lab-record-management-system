-- Run in Supabase SQL Editor to verify marks & attachments for PDF generation.
-- Uncomment and set UUIDs for one student + subject:

/*
SELECT
  id,
  student_id,
  subject_id,
  exp_id,
  status,
  marks,
  faculty_marks,
  final_marks,
  ai_marks,
  pg_typeof(images) AS images_pg_type,
  pg_typeof(attachments) AS attachments_pg_type,
  images,
  attachments,
  updated_at
FROM submissions
WHERE student_id = 'YOUR-STUDENT-UUID'
  AND subject_id = 'YOUR-SUBJECT-UUID'
ORDER BY updated_at DESC
LIMIT 50;
*/

-- Quick sanity: any submission with non-null marks (adjust table/column names if yours differ)
SELECT COUNT(*) AS rows_with_marks
FROM submissions
WHERE COALESCE(marks, faculty_marks, final_marks) IS NOT NULL;

-- If marks exist in DB but the app shows 0: check RLS policies on `submissions` for SELECT (student role).

-- Images: `images` / `attachments` should be jsonb[] or text[] of URLs or base64 strings.
-- Private Storage URLs need the browser session; the app sends Authorization: Bearer when fetching for PDF.
