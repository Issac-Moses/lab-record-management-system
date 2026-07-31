-- AI-level lightweight exam protection schema extension
-- Run in Supabase SQL editor.

-- exam_submissions: device and ip tracking
alter table public.exam_submissions
add column if not exists device_id text;

alter table public.exam_submissions
add column if not exists ip_address text;

create unique index if not exists unique_exam_device
on public.exam_submissions (exam_id, register_no, device_id);

-- Activity audit table
create table if not exists public.exam_activity_logs (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid,
  register_no text,
  event text,
  created_at timestamptz default now()
);

create index if not exists idx_exam_activity_logs_exam_time
on public.exam_activity_logs (exam_id, created_at desc);

create index if not exists idx_exam_activity_logs_register
on public.exam_activity_logs (register_no);

-- RLS: allow students (authenticated) to INSERT tab-switch audit rows, and staff to read them.
-- If inserts from the exam UI fail silently, run this block in the Supabase SQL editor.
alter table public.exam_activity_logs enable row level security;

drop policy if exists "exam_activity_logs_insert_authenticated" on public.exam_activity_logs;
create policy "exam_activity_logs_insert_authenticated"
on public.exam_activity_logs
for insert
to authenticated
with check (true);

drop policy if exists "exam_activity_logs_select_authenticated" on public.exam_activity_logs;
create policy "exam_activity_logs_select_authenticated"
on public.exam_activity_logs
for select
to authenticated
using (true);

-- Supabase Realtime: enable replication for this table if you use postgres_changes subscriptions:
-- alter publication supabase_realtime add table public.exam_activity_logs;
