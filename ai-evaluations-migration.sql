-- AI Assisted Evaluation schema support.
-- Run this once on your Supabase/Postgres project.

create table if not exists public.ai_evaluations (
  id bigserial primary key,
  submission_id bigint,
  submission_uuid uuid,
  ai_score numeric(5,2),
  predicted_score numeric(5,2),
  confidence numeric(5,2),
  status text,
  breakdown jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.ai_evaluations
  add column if not exists submission_id bigint;
alter table public.ai_evaluations
  add column if not exists submission_uuid uuid;
alter table public.ai_evaluations
  add column if not exists ai_score numeric(5,2);
alter table public.ai_evaluations
  add column if not exists predicted_score numeric(5,2);
alter table public.ai_evaluations
  add column if not exists confidence numeric(5,2);
alter table public.ai_evaluations
  add column if not exists status text;
alter table public.ai_evaluations
  add column if not exists breakdown jsonb;
alter table public.ai_evaluations
  add column if not exists created_at timestamptz default now();
alter table public.ai_evaluations
  add column if not exists updated_at timestamptz default now();

create unique index if not exists ai_evaluations_submission_id_unique
  on public.ai_evaluations (submission_id)
  where submission_id is not null;

create unique index if not exists ai_evaluations_submission_uuid_unique
  on public.ai_evaluations (submission_uuid)
  where submission_uuid is not null;

