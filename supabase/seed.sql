-- Local development accounts only. Change every password before using any non-local environment.
insert into auth.users (id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,phone_change)
values
('10000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','admin@demo.invalid',crypt('DemoOnlyAdmin2026',gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}'::jsonb,'{"full_name":"Avery Morgan"}'::jsonb,now(),now(),'','',''),
('10000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','teacher1@demo.invalid',crypt('DemoOnlyTeacher12026',gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}'::jsonb,'{"full_name":"Jordan Ellis"}'::jsonb,now(),now(),'','',''),
('10000000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','teacher2@demo.invalid',crypt('DemoOnlyTeacher22026',gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}'::jsonb,'{"full_name":"Sam Rivera"}'::jsonb,now(),now(),'','',''),
('10000000-0000-4000-8000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','student1@demo.invalid',crypt('DemoOnlyStudent12026',gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}'::jsonb,'{"full_name":"Taylor Reed"}'::jsonb,now(),now(),'','',''),
('10000000-0000-4000-8000-000000000005','00000000-0000-0000-0000-000000000000','authenticated','authenticated','student2@demo.invalid',crypt('DemoOnlyStudent22026',gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}'::jsonb,'{"full_name":"Casey Chen"}'::jsonb,now(),now(),'','',''),
('10000000-0000-4000-8000-000000000006','00000000-0000-0000-0000-000000000000','authenticated','authenticated','student3@demo.invalid',crypt('DemoOnlyStudent32026',gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}'::jsonb,'{"full_name":"Riley Patel"}'::jsonb,now(),now(),'','',''),
('10000000-0000-4000-8000-000000000007','00000000-0000-0000-0000-000000000000','authenticated','authenticated','student4@demo.invalid',crypt('DemoOnlyStudent42026',gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}'::jsonb,'{"full_name":"Morgan Blake"}'::jsonb,now(),now(),'','',''),
('10000000-0000-4000-8000-000000000008','00000000-0000-0000-0000-000000000000','authenticated','authenticated','student5@demo.invalid',crypt('DemoOnlyStudent52026',gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}'::jsonb,'{"full_name":"Jamie Park"}'::jsonb,now(),now(),'','','')
on conflict (id) do nothing;

insert into public.profiles(id,full_name,email,role,roll_no,must_change_password) values
('10000000-0000-4000-8000-000000000001','Avery Morgan','admin@demo.invalid','admin',null,false),
('10000000-0000-4000-8000-000000000002','Jordan Ellis','teacher1@demo.invalid','teacher',null,false),
('10000000-0000-4000-8000-000000000003','Sam Rivera','teacher2@demo.invalid','teacher',null,false),
('10000000-0000-4000-8000-000000000004','Taylor Reed','student1@demo.invalid','student','NS-1001',false),
('10000000-0000-4000-8000-000000000005','Casey Chen','student2@demo.invalid','student','NS-1002',false),
('10000000-0000-4000-8000-000000000006','Riley Patel','student3@demo.invalid','student','NS-1003',false),
('10000000-0000-4000-8000-000000000007','Morgan Blake','student4@demo.invalid','student','NS-1004',false),
('10000000-0000-4000-8000-000000000008','Jamie Park','student5@demo.invalid','student','NS-1005',false)
on conflict (id) do nothing;

insert into public.courses(id,code,title,description) values
('20000000-0000-4000-8000-000000000001','DS 204','Data & Society','How data changes the way we live and work.'),
('20000000-0000-4000-8000-000000000002','UX 110','Design Foundations','Build thoughtful digital experiences.'),
('20000000-0000-4000-8000-000000000003','CS 218','Creative Coding','Turning ideas into interactive things.')
on conflict (id) do nothing;
insert into public.course_teachers(course_id,teacher_id) values
('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002'),
('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002'),
('20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000003') on conflict do nothing;
insert into public.enrollments(course_id,student_id)
select c.id,p.id from public.courses c cross join public.profiles p where p.role='student' on conflict do nothing;

insert into public.announcements(course_id,author_id,title,body,is_pinned) values
(null,'10000000-0000-4000-8000-000000000001','Welcome to GUTECH','Your learning space is ready. Start with your classes and take it one day at a time.',true),
('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','A note on this week’s reading','I’ve added a short guide to help with the essay. Take a look before Thursday’s seminar.',true),
('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','Workshop room update','We’ll meet in Studio 2 this Friday. Everything else stays the same.',false);
