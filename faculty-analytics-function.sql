-- Faculty analytics dataset (one row per student per subject)
-- Rules implemented:
-- 1) faculty scope from auth.uid()
-- 2) only student profiles included
-- 3) no table modifications
-- 4) progress = submitted / total_experiments * 100
-- 5) submitted status = 'submitted'
-- 6) pending status = NULL or 'draft'

drop function if exists public.get_faculty_student_subject_analytics();
drop function if exists public.get_faculty_student_subject_analytics(uuid);

create or replace function public.get_faculty_student_subject_analytics(
  p_faculty_id uuid default auth.uid()
)
returns table (
  subject text,
  department text,
  year text,
  semester text,
  student_name text,
  register_no text,
  total_experiments integer,
  submitted integer,
  pending integer,
  avg_marks numeric,
  progress_percent numeric
)
language sql
stable
as $$
with faculty_scope as (
  select
    s.id as subject_id,
    s.name as subject,
    s.department,
    s.year,
    s.semester
  from faculty_subjects fs
  join subjects s
    on s.id = fs.subject_id
  where fs.faculty_id = p_faculty_id
),
scoped_students as (
  select
    ss.subject_id,
    p.id as student_id,
    p.name as student_name,
    p.register_no
  from student_subjects ss
  join faculty_scope f
    on f.subject_id = ss.subject_id
  join profiles p
    on p.id = ss.student_id
  where p.role = 'student'
),
scoped_experiments as (
  select
    e.id as exp_id,
    e.subject_id
  from experiments e
  join faculty_scope f
    on f.subject_id = e.subject_id
),
latest_submission_per_experiment as (
  select distinct on (s.student_id, s.exp_id)
    s.student_id,
    s.exp_id,
    lower(s.status) as status,
    s.marks,
    e.subject_id
  from submissions s
  join scoped_experiments e
    on e.exp_id = s.exp_id
  join scoped_students st
    on st.student_id = s.student_id
   and st.subject_id = e.subject_id
  order by s.student_id, s.exp_id, s.updated_at desc nulls last
),
student_experiment_grid as (
  select
    st.subject_id,
    st.student_id,
    st.student_name,
    st.register_no,
    e.exp_id
  from scoped_students st
  left join scoped_experiments e
    on e.subject_id = st.subject_id
)
select
  f.subject::text as subject,
  f.department::text as department,
  f.year::text as year,
  f.semester::text as semester,
  coalesce(g.student_name, 'Unknown Student')::text as student_name,
  coalesce(g.register_no, '-')::text as register_no,
  count(g.exp_id)::int as total_experiments,
  count(*) filter (where l.status = 'submitted' and g.exp_id is not null)::int as submitted,
  count(*) filter (where (l.status is null or l.status = 'draft') and g.exp_id is not null)::int as pending,
  round(avg(l.marks)::numeric, 2) as avg_marks,
  case
    when count(g.exp_id) = 0 then 0::numeric
    else round(
      (count(*) filter (where l.status = 'submitted')::numeric / count(g.exp_id)::numeric) * 100,
      2
    )
  end as progress_percent
from student_experiment_grid g
join faculty_scope f
  on f.subject_id = g.subject_id
left join latest_submission_per_experiment l
  on l.student_id = g.student_id
 and l.exp_id = g.exp_id
 and l.subject_id = g.subject_id
group by
  f.subject,
  f.department,
  f.year,
  f.semester,
  g.student_id,
  g.student_name,
  g.register_no
order by
  f.subject,
  g.student_name;
$$;

-- Usage:
-- select * from public.get_faculty_student_subject_analytics();
-- select * from public.get_faculty_student_subject_analytics('YOUR_FACULTY_UUID');
