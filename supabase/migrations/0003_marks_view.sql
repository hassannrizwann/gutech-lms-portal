-- One consistent marks source for student views and teacher gradebooks.
create or replace view public.v_student_marks
with (security_invoker = true)
as
  select e.student_id, a.course_id, 'assignment'::text as kind, a.id as item_id,
         a.title, s.marks_obtained as obtained, a.max_marks as max, s.graded_at
  from public.enrollments e
  join public.assignments a on a.course_id = e.course_id
  left join public.submissions s on s.assignment_id = a.id and s.student_id = e.student_id
  union all
  select e.student_id, q.course_id, 'quiz'::text as kind, q.id as item_id,
         q.title, qa.score as obtained,
         coalesce((select sum(qq.marks) from public.quiz_questions qq where qq.quiz_id = q.id), 0) as max,
         qa.submitted_at as graded_at
  from public.enrollments e
  join public.quizzes q on q.course_id = e.course_id and q.is_published
  left join public.quiz_attempts qa on qa.quiz_id = q.id and qa.student_id = e.student_id;

grant select on public.v_student_marks to authenticated;
