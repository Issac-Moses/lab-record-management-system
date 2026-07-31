-- Additive soft-delete support for profiles.
-- Run this once in Supabase SQL editor.

alter table if exists public.profiles
  add column if not exists is_deleted boolean not null default false;

alter table if exists public.profiles
  add column if not exists deleted_at timestamptz;

alter table if exists public.profiles
  add column if not exists deleted_by uuid references auth.users(id);

alter table if exists public.profiles
  add column if not exists account_status text not null default 'active';

create index if not exists idx_profiles_role_is_deleted
  on public.profiles (role, is_deleted);

create index if not exists idx_profiles_account_status
  on public.profiles (account_status);
