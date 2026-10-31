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
