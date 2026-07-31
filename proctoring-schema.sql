-- AI proctoring schema (idempotent)
-- Run in Supabase SQL editor. Safe for re-runs.

create table if not exists public.exam_sessions (
  id uuid primary key default gen_random_uuid(),
  student_id text,
  exam_id text,
  start_time timestamptz default now(),
  end_time timestamptz,
  status text default 'active',
  suspicion_score integer not null default 0
);

alter table public.exam_sessions
  add column if not exists student_id text,
  add column if not exists exam_id text,
  add column if not exists start_time timestamptz default now(),
  add column if not exists end_time timestamptz,
  add column if not exists status text default 'active',
  add column if not exists suspicion_score integer default 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'exam_sessions_status_check'
  ) then
    alter table public.exam_sessions
      add constraint exam_sessions_status_check
      check (status in ('active', 'terminated', 'completed'));
  end if;
end $$;

create index if not exists idx_exam_sessions_status
  on public.exam_sessions (status);

create table if not exists public.violations (
  id uuid primary key default gen_random_uuid(),
  session_id uuid,
  violation_type text,
  confidence double precision,
  "timestamp" timestamptz default now()
);

alter table public.violations
  add column if not exists session_id uuid,
  add column if not exists violation_type text,
  add column if not exists confidence double precision,
  add column if not exists "timestamp" timestamptz default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'violations_session_id_fkey'
  ) then
    alter table public.violations
      add constraint violations_session_id_fkey
      foreign key (session_id) references public.exam_sessions(id)
      on delete cascade;
  end if;
end $$;

create index if not exists idx_violations_session_time
  on public.violations (session_id, "timestamp" desc);
