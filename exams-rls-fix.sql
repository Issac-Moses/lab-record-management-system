-- Exams RLS policy fix
-- Run in Supabase SQL Editor (once).

alter table public.exams enable row level security;

-- Faculty: create only own exams
drop policy if exists "faculty_can_insert_own_exams" on public.exams;
create policy "faculty_can_insert_own_exams"
on public.exams
for insert
to authenticated
with check (faculty_id = auth.uid());

-- Faculty: view only own exams
drop policy if exists "faculty_can_select_own_exams" on public.exams;
create policy "faculty_can_select_own_exams"
on public.exams
for select
to authenticated
using (faculty_id = auth.uid());

-- Faculty: update only own exams
drop policy if exists "faculty_can_update_own_exams" on public.exams;
create policy "faculty_can_update_own_exams"
on public.exams
for update
to authenticated
using (faculty_id = auth.uid())
with check (faculty_id = auth.uid());

-- Faculty: delete only own exams
drop policy if exists "faculty_can_delete_own_exams" on public.exams;
create policy "faculty_can_delete_own_exams"
on public.exams
for delete
to authenticated
using (faculty_id = auth.uid());

-- Admin: read all exams (requires profiles.role = 'admin')
drop policy if exists "admin_can_select_all_exams" on public.exams;
create policy "admin_can_select_all_exams"
on public.exams
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and lower(coalesce(p.role, '')) = 'admin'
  )
);

-- Students / Authenticated: read exams to join exam session
drop policy if exists "students_can_select_exams" on public.exams;
create policy "students_can_select_exams"
on public.exams
for select
to authenticated
using (true);


