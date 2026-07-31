create extension if not exists pgcrypto;

create table if not exists public.manuals (
  id uuid primary key default gen_random_uuid(),
  title text,
  file_url text,
  uploaded_at timestamptz default now()
);

alter table public.manuals
  add column if not exists title text,
  add column if not exists file_url text,
  add column if not exists uploaded_at timestamptz default now();

create table if not exists public.manual_experiments (
  id uuid primary key default gen_random_uuid(),
  manual_id uuid references public.manuals(id) on delete cascade,
  experiment_title text,
  content text,
  content_type text,
  image_url text
);

alter table public.manual_experiments
  add column if not exists manual_id uuid,
  add column if not exists experiment_title text,
  add column if not exists content text,
  add column if not exists content_type text,
  add column if not exists image_url text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'manual_experiments_manual_id_fkey'
  ) then
    alter table public.manual_experiments
      add constraint manual_experiments_manual_id_fkey
      foreign key (manual_id) references public.manuals(id) on delete cascade;
  end if;
end $$;

create table if not exists public.manual_submissions (
  id uuid primary key default gen_random_uuid(),
  experiment_id uuid references public.manual_experiments(id) on delete cascade,
  student_name text,
  student_content text,
  output_image_url text,
  marks integer,
  submitted_at timestamptz default now()
);

alter table public.manual_submissions
  add column if not exists experiment_id uuid,
  add column if not exists student_name text,
  add column if not exists student_content text,
  add column if not exists output_image_url text,
  add column if not exists marks integer,
  add column if not exists submitted_at timestamptz default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'manual_submissions_experiment_id_fkey'
  ) then
    alter table public.manual_submissions
      add constraint manual_submissions_experiment_id_fkey
      foreign key (experiment_id) references public.manual_experiments(id) on delete cascade;
  end if;
end $$;
