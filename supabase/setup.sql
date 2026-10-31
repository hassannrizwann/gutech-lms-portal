create extension if not exists pgcrypto;
create type public.user_role as enum ('admin','teacher','student');
create type public.question_type as enum ('mcq_single','mcq_multi','true_false');
create type public.complaint_status as enum ('open','in_review','resolved','rejected');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null unique,
  role public.user_role not null,
  roll_no text unique,
  is_active boolean not null default true,
  must_change_password boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.courses (
  id uuid primary key default gen_random_uuid(), code text not null unique, title text not null,
  description text, is_archived boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.course_teachers (
  course_id uuid not null references public.courses(id) on delete cascade,
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(), primary key(course_id,teacher_id)
);
create table public.enrollments (
  course_id uuid not null references public.courses(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  enrolled_at timestamptz not null default now(), primary key(course_id,student_id)
);
create table public.audit_log (
  id bigint generated always as identity primary key, actor_id uuid references public.profiles(id), action text not null,
  entity text not null, entity_id uuid, at timestamptz not null default now()
);

create or replace function public.current_role() returns public.user_role
language sql stable security definer set search_path=public as $$ select role from public.profiles where id=auth.uid() and is_active $$;
create or replace function public.is_enrolled(target_course uuid) returns boolean
language sql stable security definer set search_path=public as $$ select exists(select 1 from public.enrollments where course_id=target_course and student_id=auth.uid()) $$;
create or replace function public.teaches(target_course uuid) returns boolean
language sql stable security definer set search_path=public as $$ select exists(select 1 from public.course_teachers where course_id=target_course and teacher_id=auth.uid()) $$;
create or replace function public.can_access_course(target_course uuid) returns boolean
language sql stable security definer set search_path=public as $$ select public.current_role()='admin' or public.teaches(target_course) or public.is_enrolled(target_course) $$;
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end $$;
create trigger profiles_touch_updated_at before update on public.profiles for each row execute function public.touch_updated_at();
create trigger courses_touch_updated_at before update on public.courses for each row execute function public.touch_updated_at();
create or replace function public.protect_profile_fields() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is not null and public.current_role()<>'admin' and (new.role is distinct from old.role or new.is_active is distinct from old.is_active or new.email is distinct from old.email or new.roll_no is distinct from old.roll_no or new.must_change_password is distinct from old.must_change_password) then
    raise exception 'Protected profile fields cannot be changed by this user' using errcode='42501';
  end if;
  return new;
end $$;
create trigger profiles_protect_fields before update on public.profiles for each row execute function public.protect_profile_fields();

alter table public.profiles enable row level security;
alter table public.courses enable row level security;
alter table public.course_teachers enable row level security;
alter table public.enrollments enable row level security;
alter table public.audit_log enable row level security;
create policy "profile read self or admin" on public.profiles for select to authenticated using(id=auth.uid() or public.current_role()='admin');
create policy "profile update self or admin" on public.profiles for update to authenticated using(id=auth.uid() or public.current_role()='admin') with check(id=auth.uid() or public.current_role()='admin');
create policy "course visible to members" on public.courses for select to authenticated using(public.can_access_course(id));
create policy "admin manages courses" on public.courses for all to authenticated using(public.current_role()='admin') with check(public.current_role()='admin');
create policy "course teacher visibility" on public.course_teachers for select to authenticated using(teacher_id=auth.uid() or public.current_role()='admin' or public.is_enrolled(course_id));
create policy "admin manages course teachers" on public.course_teachers for all to authenticated using(public.current_role()='admin') with check(public.current_role()='admin');
create policy "enrollment self or admin" on public.enrollments for select to authenticated using(student_id=auth.uid() or public.current_role()='admin' or public.teaches(course_id));
create policy "admin manages enrollments" on public.enrollments for all to authenticated using(public.current_role()='admin') with check(public.current_role()='admin');
create policy "admin sees audit log" on public.audit_log for select to authenticated using(public.current_role()='admin');

create index courses_active_title_idx on public.courses(is_archived,title);
create index enrollments_student_idx on public.enrollments(student_id,course_id);
create index course_teachers_teacher_idx on public.course_teachers(teacher_id,course_id);


create table public.resources (
  id uuid primary key default gen_random_uuid(), course_id uuid not null references public.courses(id) on delete cascade,
  uploaded_by uuid not null references public.profiles(id), title text not null, description text,
  file_path text not null, file_name text not null, mime_type text not null, size_bytes bigint not null check(size_bytes between 1 and 26214400),
  created_at timestamptz not null default now()
);
create table public.assignments (
  id uuid primary key default gen_random_uuid(), course_id uuid not null references public.courses(id) on delete cascade,
  created_by uuid not null references public.profiles(id), title text not null, instructions text not null,
  max_marks numeric(6,2) not null check(max_marks>0), due_at timestamptz not null, allow_late boolean not null default false,
  attachment_path text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.submissions (
  id uuid primary key default gen_random_uuid(), assignment_id uuid not null references public.assignments(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade, text_answer text, file_path text,
  submitted_at timestamptz not null default now(), is_late boolean not null default false,
  marks_obtained numeric(6,2), feedback text, graded_by uuid references public.profiles(id), graded_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(assignment_id,student_id),
  check(marks_obtained is null or marks_obtained>=0)
);
create table public.quizzes (
  id uuid primary key default gen_random_uuid(), course_id uuid not null references public.courses(id) on delete cascade,
  created_by uuid not null references public.profiles(id), title text not null, description text,
  time_limit_minutes int not null check(time_limit_minutes>0), opens_at timestamptz not null, closes_at timestamptz not null,
  is_published boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), check(closes_at>opens_at)
);
create table public.quiz_questions (
  id uuid primary key default gen_random_uuid(), quiz_id uuid not null references public.quizzes(id) on delete cascade,
  position int not null, type public.question_type not null, prompt text not null, options jsonb not null,
  marks numeric(5,2) not null default 1 check(marks>0), created_at timestamptz not null default now(), unique(quiz_id,position)
);
create table public.quiz_answers (
  question_id uuid primary key references public.quiz_questions(id) on delete cascade, correct_option_ids text[] not null
);
create table public.quiz_attempts (
  id uuid primary key default gen_random_uuid(), quiz_id uuid not null references public.quizzes(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade, started_at timestamptz not null default now(),
  submitted_at timestamptz, answers jsonb not null default '{}', score numeric(6,2),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(quiz_id,student_id)
);
create table public.announcements (
  id uuid primary key default gen_random_uuid(), course_id uuid references public.courses(id) on delete cascade,
  author_id uuid not null references public.profiles(id), title text not null, body text not null, is_pinned boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.announcement_reads (
  user_id uuid not null references public.profiles(id) on delete cascade, announcement_id uuid not null references public.announcements(id) on delete cascade,
  read_at timestamptz not null default now(), primary key(user_id,announcement_id)
);
create table public.chat_messages (
  id uuid primary key default gen_random_uuid(), course_id uuid not null references public.courses(id) on delete cascade,
  sender_id uuid not null references public.profiles(id), body text not null check(char_length(body) between 1 and 2000),
  created_at timestamptz not null default now(), deleted_at timestamptz
);
create table public.complaints (
  id uuid primary key default gen_random_uuid(), raised_by uuid not null references public.profiles(id),
  course_id uuid references public.courses(id), category text not null check(category in ('academic','technical','facility','conduct','other')),
  subject text not null, description text not null, attachment_path text, status public.complaint_status not null default 'open',
  admin_response text, resolved_by uuid references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check(status not in ('resolved','rejected') or nullif(trim(admin_response),'') is not null)
);

do $$ declare t text; begin
  foreach t in array array['resources','assignments','submissions','quizzes','quiz_questions','quiz_answers','quiz_attempts','announcements','announcement_reads','chat_messages','complaints'] loop
    execute format('alter table public.%I enable row level security',t);
  end loop;
end $$;

create policy "resources visible to course members" on public.resources for select to authenticated using(public.can_access_course(course_id));
create policy "teachers add resources to own courses" on public.resources for insert to authenticated with check(public.current_role() in ('admin','teacher') and (public.current_role()='admin' or public.teaches(course_id)) and uploaded_by=auth.uid());
create policy "teachers manage own course resources" on public.resources for delete to authenticated using(public.current_role()='admin' or (uploaded_by=auth.uid() and public.teaches(course_id)));
create policy "assignments visible to course members" on public.assignments for select to authenticated using(public.can_access_course(course_id));
create policy "teachers create assignments" on public.assignments for insert to authenticated with check((public.current_role()='admin' or public.teaches(course_id)) and created_by=auth.uid());
create policy "teachers update assignments" on public.assignments for update to authenticated using(public.current_role()='admin' or (created_by=auth.uid() and public.teaches(course_id))) with check(public.current_role()='admin' or public.teaches(course_id));
create policy "submission visible to owner or course staff" on public.submissions for select to authenticated using(student_id=auth.uid() or exists(select 1 from public.assignments a where a.id=assignment_id and (public.current_role()='admin' or public.teaches(a.course_id))));
create policy "students submit own work" on public.submissions for insert to authenticated with check(student_id=auth.uid() and public.current_role()='student' and exists(select 1 from public.assignments a where a.id=assignment_id and public.is_enrolled(a.course_id)));
create policy "students update own ungraded work" on public.submissions for update to authenticated using(student_id=auth.uid() and marks_obtained is null) with check(student_id=auth.uid());
create policy "teachers grade course submissions" on public.submissions for update to authenticated using(public.current_role()='admin' or exists(select 1 from public.assignments a where a.id=assignment_id and public.teaches(a.course_id))) with check(public.current_role()='admin' or graded_by=auth.uid());
create policy "quizzes visible to course members" on public.quizzes for select to authenticated using(public.current_role() in ('admin','teacher') and (public.current_role()='admin' or public.teaches(course_id)) or (is_published and public.is_enrolled(course_id)));
create policy "teachers manage quizzes" on public.quizzes for all to authenticated using(public.current_role()='admin' or (created_by=auth.uid() and public.teaches(course_id))) with check(public.current_role()='admin' or (created_by=auth.uid() and public.teaches(course_id)));
create policy "questions visible without answers" on public.quiz_questions for select to authenticated using(exists(select 1 from public.quizzes q where q.id=quiz_id and (public.current_role() in ('admin','teacher') and (public.current_role()='admin' or public.teaches(q.course_id)) or (q.is_published and public.is_enrolled(q.course_id)))));
create policy "teachers manage questions" on public.quiz_questions for all to authenticated using(exists(select 1 from public.quizzes q where q.id=quiz_id and (public.current_role()='admin' or (q.created_by=auth.uid() and public.teaches(q.course_id))))) with check(exists(select 1 from public.quizzes q where q.id=quiz_id and (public.current_role()='admin' or (q.created_by=auth.uid() and public.teaches(q.course_id)))));
create policy "quiz answers staff only" on public.quiz_answers for select to authenticated using(exists(select 1 from public.quiz_questions qq join public.quizzes q on q.id=qq.quiz_id where qq.id=question_id and (public.current_role()='admin' or public.teaches(q.course_id))));
create policy "quiz answers staff manage" on public.quiz_answers for all to authenticated using(exists(select 1 from public.quiz_questions qq join public.quizzes q on q.id=qq.quiz_id where qq.id=question_id and (public.current_role()='admin' or public.teaches(q.course_id)))) with check(exists(select 1 from public.quiz_questions qq join public.quizzes q on q.id=qq.quiz_id where qq.id=question_id and (public.current_role()='admin' or public.teaches(q.course_id))));
create policy "students own quiz attempts" on public.quiz_attempts for select to authenticated using(student_id=auth.uid() or public.current_role()='admin' or exists(select 1 from public.quizzes q where q.id=quiz_id and public.teaches(q.course_id)));
create policy "students create own quiz attempt" on public.quiz_attempts for insert to authenticated with check(student_id=auth.uid() and public.current_role()='student' and exists(select 1 from public.quizzes q where q.id=quiz_id and public.is_enrolled(q.course_id) and q.is_published));
create policy "students submit own attempt" on public.quiz_attempts for update to authenticated using(student_id=auth.uid() and submitted_at is null) with check(student_id=auth.uid());
create policy "announcements visible to audience" on public.announcements for select to authenticated using(course_id is null and public.current_role() in ('admin','teacher','student') or course_id is not null and public.can_access_course(course_id));
create policy "staff create announcements" on public.announcements for insert to authenticated with check(author_id=auth.uid() and (public.current_role()='admin' or (public.current_role()='teacher' and course_id is not null and public.teaches(course_id))));
create policy "authors and admins manage announcements" on public.announcements for update to authenticated using(public.current_role()='admin' or (author_id=auth.uid() and course_id is not null and public.teaches(course_id))) with check(public.current_role()='admin' or (author_id=auth.uid() and course_id is not null and public.teaches(course_id)));
create policy "users manage own announcement reads" on public.announcement_reads for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy "chat course members read" on public.chat_messages for select to authenticated using(public.can_access_course(course_id));
create policy "course members send chat" on public.chat_messages for insert to authenticated with check(sender_id=auth.uid() and public.can_access_course(course_id));
create policy "sender or course staff soft delete chat" on public.chat_messages for update to authenticated using(sender_id=auth.uid() or public.current_role()='admin' or public.teaches(course_id)) with check(deleted_at is not null);
create policy "complainants or admins read complaints" on public.complaints for select to authenticated using(raised_by=auth.uid() or public.current_role()='admin');
create policy "students and teachers file complaints" on public.complaints for insert to authenticated with check(raised_by=auth.uid() and public.current_role() in ('student','teacher'));
create policy "admins resolve complaints" on public.complaints for update to authenticated using(public.current_role()='admin') with check(public.current_role()='admin');

create trigger assignments_touch before update on public.assignments for each row execute function public.touch_updated_at();
create trigger submissions_touch before update on public.submissions for each row execute function public.touch_updated_at();
create trigger quizzes_touch before update on public.quizzes for each row execute function public.touch_updated_at();
create trigger announcements_touch before update on public.announcements for each row execute function public.touch_updated_at();
create trigger complaints_touch before update on public.complaints for each row execute function public.touch_updated_at();
create index resources_course_created_idx on public.resources(course_id,created_at desc);
create index assignments_course_due_idx on public.assignments(course_id,due_at);
create index submissions_assignment_student_idx on public.submissions(assignment_id,student_id);
create index quizzes_course_open_idx on public.quizzes(course_id,opens_at,closes_at);
create index announcements_course_created_idx on public.announcements(course_id,created_at desc);
create index chat_course_created_idx on public.chat_messages(course_id,created_at desc);
create index complaints_status_created_idx on public.complaints(status,created_at desc);

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
('resources','resources',false,26214400,array['application/pdf','text/plain','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation','image/png','image/jpeg']),
('submissions','submissions',false,26214400,array['application/pdf','text/plain','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','image/png','image/jpeg']),
('complaint-attachments','complaint-attachments',false,10485760,array['application/pdf','text/plain','image/png','image/jpeg'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy "course members read resource files" on storage.objects for select to authenticated using(bucket_id='resources' and public.can_access_course((storage.foldername(name))[1]::uuid));
create policy "course teachers upload resource files" on storage.objects for insert to authenticated with check(bucket_id='resources' and (public.current_role()='admin' or public.teaches((storage.foldername(name))[1]::uuid)));
create policy "course teachers delete resource files" on storage.objects for delete to authenticated using(bucket_id='resources' and (public.current_role()='admin' or public.teaches((storage.foldername(name))[1]::uuid)));
create policy "complainants and admins access complaint files" on storage.objects for select to authenticated using(bucket_id='complaint-attachments' and (public.current_role()='admin' or exists(select 1 from public.complaints c where c.attachment_path=name and c.raised_by=auth.uid())));
create policy "users upload own complaint files" on storage.objects for insert to authenticated with check(bucket_id='complaint-attachments' and (storage.foldername(name))[1]=auth.uid()::text);
create policy "submission owner and staff access submission files" on storage.objects for select to authenticated using(bucket_id='submissions' and (public.current_role()='admin' or (storage.foldername(name))[1]=auth.uid()::text or exists(select 1 from public.assignments a where a.id=(storage.foldername(name))[1]::uuid and public.teaches(a.course_id))));
create policy "students upload own submission files" on storage.objects for insert to authenticated with check(bucket_id='submissions' and (storage.foldername(name))[1]=auth.uid()::text);

create table public.attendance_records (
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
create policy "course members can read attendance" on public.attendance_records for select to authenticated using(public.can_access_course(course_id));
create policy "course staff manages attendance" on public.attendance_records for all to authenticated using(public.current_role()='admin' or public.teaches(course_id)) with check((public.current_role()='admin' or public.teaches(course_id)) and marked_by=auth.uid());
create index attendance_course_date_idx on public.attendance_records(course_id,attendance_date);
create index attendance_student_date_idx on public.attendance_records(student_id,attendance_date desc);
create trigger attendance_records_touch before update on public.attendance_records for each row execute function public.touch_updated_at();
