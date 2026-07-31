-- =============================================================================
-- Backfill `submissions.images` / `submissions.attachments` (jsonb) for PDF
-- SQL cannot invent pixels — you must point to URLs the PDF fetcher can read:
--   • Public HTTPS URLs, or
--   • Supabase Storage signed URLs (recommended for private buckets), or
--   • Data URLs (very large; not ideal in SQL)
--
-- Prerequisites: columns exist — run docs/fix-submissions-images-attachments-for-pdf.sql
-- =============================================================================

-- 1) Inspect current rows (set UUIDs)
/*
SELECT id, student_id, subject_id, exp_id,
       jsonb_array_length(COALESCE(images, '[]'::jsonb)) AS n_img,
       jsonb_array_length(COALESCE(attachments, '[]'::jsonb)) AS n_att,
       left(images::text, 200) AS images_preview
FROM public.submissions
WHERE student_id = 'YOUR-STUDENT-UUID'
  AND subject_id = 'YOUR-SUBJECT-UUID'
ORDER BY updated_at DESC;
*/

-- 2) Attach ONE public image URL to a specific submission (replace IDs + URL)
/*
UPDATE public.submissions
SET
  images = jsonb_build_array('https://example.com/path/output.png'),
  attachments = COALESCE(attachments, '[]'::jsonb),
  updated_at = now()
WHERE id = 'YOUR-SUBMISSION-UUID';
*/

-- 3) Copy attachments → images when images is empty but attachments has URLs
/*
UPDATE public.submissions
SET
  images = attachments,
  updated_at = now()
WHERE jsonb_array_length(COALESCE(images, '[]'::jsonb)) = 0
  AND jsonb_array_length(COALESCE(attachments, '[]'::jsonb)) > 0;
*/

-- 4) If legacy column held a single URL (text) — promote to jsonb array (adjust column name if yours differs)
/*
UPDATE public.submissions
SET
  images = jsonb_build_array(trim(legacy_output_url::text)),
  updated_at = now()
WHERE legacy_output_url IS NOT NULL
  AND legacy_output_url::text <> ''
  AND jsonb_array_length(COALESCE(images, '[]'::jsonb)) = 0;
*/

-- 5) Storage: generate signed URLs in app (recommended) or use a public bucket policy.
--    See docs/fix-submissions-images-attachments-for-pdf.sql section 4.
