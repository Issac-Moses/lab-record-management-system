-- Student notifications / announcements schema (idempotent).
-- Run this in Supabase SQL editor.

create extension if not exists pgcrypto;

create table if not exists public.student_notifications (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid references auth.users(id) on delete set null,
  sender_role text not null default 'admin',
  target_role text not null default 'student',
  title text not null,
  message text not null,
  target_department text,
  created_at timestamptz not null default now()
);

alter table public.student_notifications
  add column if not exists sender_id uuid,
  add column if not exists sender_role text not null default 'admin',
  add column if not exists target_role text not null default 'student',
  add column if not exists title text not null default '',
  add column if not exists message text not null default '',
  add column if not exists target_department text,
  add column if not exists created_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'student_notifications_sender_role_check'
  ) then
    alter table public.student_notifications
      add constraint student_notifications_sender_role_check
      check (sender_role in ('admin', 'faculty', 'system'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'student_notifications_target_role_check'
  ) then
    alter table public.student_notifications
      add constraint student_notifications_target_role_check
      check (target_role in ('student', 'faculty'));
  end if;
end $$;

create index if not exists idx_student_notifications_created_at
  on public.student_notifications (created_at desc);

create index if not exists idx_student_notifications_target_department
  on public.student_notifications (target_department);

create index if not exists idx_student_notifications_target_role
  on public.student_notifications (target_role);

alter table public.student_notifications enable row level security;

-- Students can read notifications.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'student_notifications'
      and policyname = 'student_notifications_select_authenticated'
  ) then
    create policy student_notifications_select_authenticated
      on public.student_notifications
      for select
      to authenticated
      using (true);
  end if;
end $$;

-- Admin/faculty can insert.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'student_notifications'
      and policyname = 'student_notifications_insert_staff'
  ) then
    create policy student_notifications_insert_staff
      on public.student_notifications
      for insert
      to authenticated
      with check (
        exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.role in ('admin', 'faculty')
        )
      );
  end if;
end $$;

-- Sender or admin can update/delete own notice (optional moderation support).
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'student_notifications'
      and policyname = 'student_notifications_modify_sender_or_admin'
  ) then
    create policy student_notifications_modify_sender_or_admin
      on public.student_notifications
      for all
      to authenticated
      using (
        sender_id = auth.uid()
        or exists (
          select 1 from public.profiles p
          where p.id = auth.uid() and p.role = 'admin'
        )
      )
      with check (
        sender_id = auth.uid()
        or exists (
          select 1 from public.profiles p
          where p.id = auth.uid() and p.role = 'admin'
        )
      );
  end if;
end $$;

-- Enable Realtime (optional, run in Supabase SQL editor if not already done)
-- alter publication supabase_realtime add table public.student_notifications;

