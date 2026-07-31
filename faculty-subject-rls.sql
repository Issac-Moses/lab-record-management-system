-- Faculty/Department subject visibility guards
-- Run this in Supabase SQL editor.

begin;

create or replace function public.normalize_department_key(value text)
returns text
language sql
immutable
as $$
  select regexp_replace(
           regexp_replace(
             regexp_replace(lower(trim(coalesce(value, ''))), '&', 'and', 'g'),
             '[^a-z0-9]+',
             ' ',
             'g'
           ),
           '\s+',
           ' ',
           'g'
         );
$$;

alter table public.subjects enable row level security;
alter table public.faculty_subjects enable row level security;

drop policy if exists subjects_select_admin on public.subjects;
create policy subjects_select_admin
on public.subjects
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  )
);

drop policy if exists subjects_select_faculty_assigned on public.subjects;
create policy subjects_select_faculty_assigned
on public.subjects
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    join public.faculty_subjects fs on fs.faculty_id = p.id
    where p.id = auth.uid()
      and p.role = 'faculty'
      and fs.subject_id = subjects.id
  )
);

drop policy if exists subjects_select_student_scope on public.subjects;
create policy subjects_select_student_scope
on public.subjects
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'student'
      and public.normalize_department_key(p.department) = public.normalize_department_key(subjects.department)
      and (
        coalesce(trim(p.year::text), '') = ''
        or coalesce(trim(subjects.year::text), '') = ''
        or trim(p.year::text) = trim(subjects.year::text)
      )
      and (
        coalesce(trim(p.semester::text), '') = ''
        or coalesce(trim(subjects.semester::text), '') = ''
        or trim(p.semester::text) = trim(subjects.semester::text)
      )
  )
);

drop policy if exists faculty_subjects_select_admin on public.faculty_subjects;
create policy faculty_subjects_select_admin
on public.faculty_subjects
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  )
);

drop policy if exists faculty_subjects_select_faculty_self on public.faculty_subjects;
create policy faculty_subjects_select_faculty_self
on public.faculty_subjects
for select
to authenticated
using (
  faculty_id = auth.uid()
);

commit;

