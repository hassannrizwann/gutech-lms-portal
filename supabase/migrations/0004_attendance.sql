create table if not exists public.attendance_records (
  course_id uuid not null references public.courses(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  attendance_date date not null,
  status text not null check (status in ('present','absent','late','excused')),
  marked_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (course_id, student_id, attendance_date)
);

alter table public.attendance_records enable row level security;
create policy "course members can read attendance" on public.attendance_records
  for select to authenticated using (public.can_access_course(course_id));
create policy "course staff manages attendance" on public.attendance_records
  for all to authenticated
  using (public.current_role()='admin' or public.teaches(course_id))
  with check ((public.current_role()='admin' or public.teaches(course_id)) and marked_by=auth.uid());

create index if not exists attendance_course_date_idx
  on public.attendance_records(course_id, attendance_date);
create index if not exists attendance_student_date_idx
  on public.attendance_records(student_id, attendance_date desc);
create trigger attendance_records_touch before update on public.attendance_records
  for each row execute function public.touch_updated_at();
