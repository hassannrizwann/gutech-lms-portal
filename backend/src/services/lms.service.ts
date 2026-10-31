import { randomBytes } from 'node:crypto';
import { adminSupabase } from '../config/supabase.js';
import { HttpError } from '../utils/errors.js';
import type { UserRole } from '../types/user.js';

export type Actor = { id: string; role: UserRole };
const fail = (error: { message: string } | null) => { if (error) throw new HttpError(422, 'DATABASE_ERROR', error.message); };
const tempPassword = () => `N${randomBytes(12).toString('base64url')}7a`;
async function courseRole(actor: Actor, courseId: string, allowed: 'member' | 'staff' = 'member') {
  const { data: course } = await adminSupabase.from('courses').select('id,is_archived').eq('id', courseId).maybeSingle();
  if (!course || course.is_archived) throw new HttpError(404, 'NOT_FOUND', 'Course not found.');
  if (actor.role === 'admin') return;
  const table = actor.role === 'teacher' ? 'course_teachers' : 'enrollments';
  const column = actor.role === 'teacher' ? 'teacher_id' : 'student_id';
  const { data } = await adminSupabase.from(table).select('course_id').eq('course_id', courseId).eq(column, actor.id).maybeSingle();
  if (!data || (allowed === 'staff' && actor.role !== 'teacher')) throw new HttpError(403, 'FORBIDDEN', 'You do not have access to this course.');
}
async function assignmentCourse(id: string) {
  const { data, error } = await adminSupabase.from('assignments').select('id,course_id,title,max_marks,due_at,allow_late').eq('id', id).maybeSingle();
  fail(error); if (!data) throw new HttpError(404, 'NOT_FOUND', 'Assignment not found.'); return data;
}
async function quizCourse(id: string) {
  const { data, error } = await adminSupabase.from('quizzes').select('*').eq('id', id).maybeSingle();
  fail(error); if (!data) throw new HttpError(404, 'NOT_FOUND', 'Quiz not found.'); return data;
}
async function audit(actor: Actor, action: string, entity: string, entityId?: string) {
  await adminSupabase.from('audit_log').insert({ actor_id: actor.id, action, entity, entity_id: entityId ?? null });
}
export async function listUsers(search: string, role: string, page: number, pageSize: number) {
  let q = adminSupabase.from('profiles').select('id,full_name,email,role,roll_no,is_active,must_change_password,created_at', { count: 'exact' }).order('full_name').range((page - 1) * pageSize, page * pageSize - 1);
  if (search) q = q.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);
  if (role) q = q.eq('role', role);
  const { data, error, count } = await q; fail(error); return { data: data ?? [], total: count ?? 0 };
}
export async function createUser(actor: Actor, input: { email: string; fullName: string; role: 'teacher' | 'student'; rollNo?: string }) {
  const password = tempPassword();
  const { data, error } = await adminSupabase.auth.admin.createUser({ email: input.email, password, email_confirm: true, user_metadata: { full_name: input.fullName } });
  if (error || !data.user) throw new HttpError(409, 'USER_CREATE_FAILED', 'Could not create the account. Check whether this email is already in use.');
  const { error: profileError } = await adminSupabase.from('profiles').insert({ id: data.user.id, email: input.email, full_name: input.fullName, role: input.role, roll_no: input.rollNo ?? null, must_change_password: false, is_active: true });
  if (profileError) { await adminSupabase.auth.admin.deleteUser(data.user.id); throw new HttpError(409, 'PROFILE_CREATE_FAILED', 'The account profile could not be created.'); }
  await audit(actor, 'create', 'profile', data.user.id);
  return { id: data.user.id, email: input.email, fullName: input.fullName, role: input.role, temporaryPassword: password };
}
export async function updateUser(actor: Actor, id: string, patch: { fullName?: string; role?: UserRole; isActive?: boolean; rollNo?: string | null }) {
  const values: Record<string, unknown> = {};
  if (patch.fullName !== undefined) values.full_name = patch.fullName;
  if (patch.role !== undefined) values.role = patch.role;
  if (patch.isActive !== undefined) values.is_active = patch.isActive;
  if (patch.rollNo !== undefined) values.roll_no = patch.rollNo;
  const { data, error } = await adminSupabase.from('profiles').update(values).eq('id', id).select('id,full_name,email,role,roll_no,is_active,must_change_password').maybeSingle();
  fail(error); if (!data) throw new HttpError(404, 'NOT_FOUND', 'User not found.');
  await audit(actor, 'update', 'profile', id); return data;
}
export async function resetUserPassword(actor: Actor, id: string) {
  const password = tempPassword(); const { data, error } = await adminSupabase.auth.admin.updateUserById(id, { password });
  if (error || !data.user) throw new HttpError(404, 'NOT_FOUND', 'User not found.');
  await adminSupabase.from('profiles').update({ must_change_password: false }).eq('id', id);
  await audit(actor, 'reset_password', 'profile', id); return { email: data.user.email, temporaryPassword: password };
}
export async function listCourses(actor: Actor, page: number, pageSize: number, includeArchived = false) {
  let q = adminSupabase.from('courses').select('id,code,title,description,is_archived', { count: 'exact' }).order('title').range((page - 1) * pageSize, page * pageSize - 1);
  if (!includeArchived) q = q.eq('is_archived', false);
  if (actor.role === 'teacher') q = q.in('id', (await adminSupabase.from('course_teachers').select('course_id').eq('teacher_id', actor.id)).data?.map(x => x.course_id) ?? []);
  if (actor.role === 'student') q = q.in('id', (await adminSupabase.from('enrollments').select('course_id').eq('student_id', actor.id)).data?.map(x => x.course_id) ?? []);
  const { data, error, count } = await q; fail(error); return { data: data ?? [], total: count ?? 0 };
}
async function courseEnrollmentCount(courseId: string) {
  const { count, error } = await adminSupabase.from('enrollments').select('student_id', { count: 'exact', head: true }).eq('course_id', courseId);
  fail(error); return count ?? 0;
}
export async function dashboardSummary(actor: Actor) {
  const result = await listCourses(actor, 1, 100, actor.role === 'admin');
  const courses = result.data.filter((course: any) => !course.is_archived);
  const counts = await Promise.all(courses.map(async (course: any) => [course.id, await courseEnrollmentCount(course.id)] as const));
  const courseStudentCounts = Object.fromEntries(counts);
  let activeTeachers = 0;
  if (actor.role === 'admin') {
    const { count, error } = await adminSupabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'teacher').eq('is_active', true);
    fail(error); activeTeachers = count ?? 0;
  }
  const courseIds = courses.map((course: any) => course.id);
  const enrolledIds = new Set<string>();
  if (courseIds.length) {
    for (let start = 0; ; start += 1000) {
      const { data, error } = await adminSupabase.from('enrollments').select('student_id').in('course_id', courseIds).range(start, start + 999);
      fail(error);
      for (const row of data ?? []) enrolledIds.add(row.student_id);
      if ((data ?? []).length < 1000) break;
    }
  }
  let enrolledStudents = 0;
  const ids = [...enrolledIds];
  if (ids.length) {
    const { count, error } = await adminSupabase.from('profiles').select('id', { count: 'exact', head: true }).in('id', ids).eq('role', 'student').eq('is_active', true);
    fail(error); enrolledStudents = count ?? 0;
  }
  return { activeTeachers, enrolledStudents, activeCourses: courses.length, courseStudentCounts };
}
export async function courseAttendance(actor: Actor, courseId: string, date: string) {
  await courseRole(actor, courseId, 'staff');
  const { data: enrollments, error: enrollmentError } = await adminSupabase.from('enrollments').select('student_id,student:profiles!enrollments_student_id_fkey(id,full_name,email,roll_no,is_active)').eq('course_id', courseId).order('student_id');
  fail(enrollmentError);
  const { data: records, error } = await adminSupabase.from('attendance_records').select('student_id,status,marked_by,updated_at').eq('course_id', courseId).eq('attendance_date', date);
  fail(error);
  const byStudent = new Map((records ?? []).map(record => [record.student_id, record]));
  return (enrollments ?? []).map((row: any) => {
    const student = Array.isArray(row.student) ? row.student[0] : row.student;
    return { studentId: row.student_id, fullName: student?.full_name ?? 'Unknown student', email: student?.email ?? '', rollNo: student?.roll_no ?? null, isActive: student?.is_active ?? false, status: byStudent.get(row.student_id)?.status ?? 'unmarked' };
  }).filter((row: any) => row.isActive);
}
export async function saveCourseAttendance(actor: Actor, courseId: string, date: string, entries: { studentId: string; status: 'unmarked'|'present'|'absent'|'late'|'excused' }[]) {
  await courseRole(actor, courseId, 'staff');
  const ids = [...new Set(entries.map(entry => entry.studentId))];
  if (ids.length !== entries.length) throw new HttpError(422, 'DUPLICATE_STUDENT', 'Each student can appear only once on the attendance sheet.');
  const { data: enrolled, error } = ids.length ? await adminSupabase.from('enrollments').select('student_id').eq('course_id', courseId).in('student_id', ids) : { data: [], error: null };
  fail(error);
  if ((enrolled ?? []).length !== ids.length) throw new HttpError(422, 'NOT_ENROLLED', 'Attendance can only be marked for students enrolled in this course.');
  const toSave = entries.filter(entry => entry.status !== 'unmarked');
  const toClear = entries.filter(entry => entry.status === 'unmarked').map(entry => entry.studentId);
  if (toClear.length) {
    const { error: clearError } = await adminSupabase.from('attendance_records').delete().eq('course_id', courseId).eq('attendance_date', date).in('student_id', toClear);
    fail(clearError);
  }
  if (toSave.length) {
    const { error: saveError } = await adminSupabase.from('attendance_records').upsert(toSave.map(entry => ({ course_id: courseId, student_id: entry.studentId, attendance_date: date, status: entry.status, marked_by: actor.id })), { onConflict: 'course_id,student_id,attendance_date' });
    fail(saveError);
  }
  if (entries.length) {
    await audit(actor, 'mark_attendance', 'attendance', courseId);
  }
  return courseAttendance(actor, courseId, date);
}
export async function createCourse(actor: Actor, input: { code: string; title: string; description?: string }) {
  const { data, error } = await adminSupabase.from('courses').insert({ code: input.code, title: input.title, description: input.description ?? null }).select().single(); fail(error); await audit(actor, 'create', 'course', data.id); return data;
}
export async function updateCourse(actor: Actor, id: string, patch: { code?: string; title?: string; description?: string; isArchived?: boolean }) {
  const { code, title, description, isArchived } = patch; const { data, error } = await adminSupabase.from('courses').update({ ...(code === undefined ? {} : { code }), ...(title === undefined ? {} : { title }), ...(description === undefined ? {} : { description }), ...(isArchived === undefined ? {} : { is_archived: isArchived }) }).eq('id', id).select().maybeSingle(); fail(error); if (!data) throw new HttpError(404, 'NOT_FOUND', 'Course not found.'); await audit(actor, 'update', 'course', id); return data;
}
export async function assignTeachers(actor: Actor, courseId: string, teacherIds: string[]) {
  const ids=[...new Set(teacherIds)];if(ids.length){const {data,error}=await adminSupabase.from('profiles').select('id').in('id',ids).eq('role','teacher').eq('is_active',true);fail(error);if((data??[]).length!==ids.length)throw new HttpError(422,'INVALID_TEACHERS','Select active teacher accounts only.');}
  const { error } = await adminSupabase.from('course_teachers').delete().eq('course_id', courseId); fail(error);
  if (ids.length) { const { error: insertError } = await adminSupabase.from('course_teachers').upsert(ids.map(teacher_id => ({ course_id: courseId, teacher_id })), { onConflict: 'course_id,teacher_id' }); fail(insertError); }
  await audit(actor, 'assign_teachers', 'course', courseId); return { assigned: ids.length };
}
export async function enrollStudents(actor: Actor, courseId: string, studentIds: string[]) {
  const ids = [...new Set(studentIds)]; if (ids.length) {
    const { data: users, error: userError } = await adminSupabase.from('profiles').select('id').in('id', ids).eq('role', 'student').eq('is_active', true); fail(userError);
    if ((users ?? []).length !== ids.length) throw new HttpError(422, 'INVALID_STUDENTS', 'Select active student accounts only.');
    const { error } = await adminSupabase.from('enrollments').upsert(ids.map(student_id => ({ course_id: courseId, student_id })), { onConflict: 'course_id,student_id', ignoreDuplicates: true }); fail(error);
  }
  await audit(actor, 'enroll_students', 'course', courseId); return { enrolled: ids.length };
}
export async function unenrollStudent(actor: Actor, courseId: string, studentId: string) { const { error } = await adminSupabase.from('enrollments').delete().eq('course_id', courseId).eq('student_id', studentId); fail(error); await audit(actor, 'unenroll_student', 'course', courseId); return { ok: true }; }
export async function courseRoster(courseId: string) {
  const { data, error } = await adminSupabase.from('enrollments').select('student:profiles!enrollments_student_id_fkey(id,full_name,email,roll_no)').eq('course_id', courseId).order('enrolled_at'); fail(error); return data ?? [];
}
export async function courseTeachers(courseId: string) { const { data, error } = await adminSupabase.from('course_teachers').select('teacher:profiles!course_teachers_teacher_id_fkey(id,full_name,email)').eq('course_id', courseId); fail(error); return data ?? []; }
export async function createAssignment(actor: Actor, courseId: string, input: { title: string; instructions: string; maxMarks: number; dueAt: string; allowLate: boolean; attachmentPath?:string }) {
  await courseRole(actor, courseId, 'staff'); const { data, error } = await adminSupabase.from('assignments').insert({ course_id: courseId, created_by: actor.id, title: input.title, instructions: input.instructions, max_marks: input.maxMarks, due_at: input.dueAt, allow_late: input.allowLate, attachment_path:input.attachmentPath??null }).select().single(); fail(error); await audit(actor, 'create', 'assignment', data.id); return data;
}
export async function listAssignments(actor: Actor, courseId: string, page: number, pageSize: number) {
  await courseRole(actor, courseId); const { data, error, count } = await adminSupabase.from('assignments').select('id,course_id,title,instructions,max_marks,due_at,allow_late,attachment_path,created_at', { count: 'exact' }).eq('course_id', courseId).order('due_at').range((page - 1) * pageSize, page * pageSize - 1); fail(error);
  if (actor.role !== 'student') return { data: data ?? [], total: count ?? 0 };
  const rows = data ?? []; const { data: subs } = rows.length ? await adminSupabase.from('submissions').select('assignment_id,id,submitted_at,is_late,marks_obtained,feedback,graded_at').eq('student_id', actor.id).in('assignment_id', rows.map(x => x.id)) : { data: [] };
  return { data: rows.map(row => ({ ...row, submission: (subs ?? []).find(s => s.assignment_id === row.id) ?? null })), total: count ?? 0 };
}
export async function submitAssignment(actor: Actor, assignmentId: string, input: { textAnswer?: string; filePath?: string }) {
  const assignment = await assignmentCourse(assignmentId); await courseRole(actor, assignment.course_id);
  if (actor.role !== 'student') throw new HttpError(403, 'FORBIDDEN', 'Only students can submit work.');
  const late = Date.now() > new Date(assignment.due_at).getTime(); if (late && !assignment.allow_late) throw new HttpError(409, 'LATE_SUBMISSION', 'The deadline has passed.');
  const { data: old } = await adminSupabase.from('submissions').select('id,marks_obtained').eq('assignment_id', assignmentId).eq('student_id', actor.id).maybeSingle();
  const { data, error } = await adminSupabase.from('submissions').upsert({ assignment_id: assignmentId, student_id: actor.id, text_answer: input.textAnswer ?? null, file_path: input.filePath ?? null, submitted_at: new Date().toISOString(), is_late: late, marks_obtained: null, feedback: null, graded_by: null, graded_at: null }, { onConflict: 'assignment_id,student_id' }).select().single(); fail(error); return data;
}
export async function assignmentSubmissions(actor: Actor, assignmentId: string, page: number, pageSize: number) {
  const a = await assignmentCourse(assignmentId); await courseRole(actor, a.course_id, 'staff');
  const { data, error, count } = await adminSupabase.from('submissions').select('*,student:profiles!submissions_student_id_fkey(id,full_name,email,roll_no)', { count: 'exact' }).eq('assignment_id', assignmentId).order('submitted_at').range((page - 1) * pageSize, page * pageSize - 1); fail(error); return { data: data ?? [], total: count ?? 0 };
}
export async function gradeSubmission(actor: Actor, submissionId: string, input: { marks: number; feedback?: string }) {
  const { data: s, error } = await adminSupabase.from('submissions').select('id,assignment_id,assignment:assignments(course_id,max_marks)').eq('id', submissionId).maybeSingle(); fail(error); if (!s) throw new HttpError(404, 'NOT_FOUND', 'Submission not found.');
  const a = Array.isArray(s.assignment) ? s.assignment[0] : s.assignment; const courseId = a?.course_id; if (!courseId) throw new HttpError(404, 'NOT_FOUND', 'Assignment not found.'); await courseRole(actor, courseId, 'staff');
  if (input.marks < 0 || input.marks > Number(a.max_marks)) throw new HttpError(422, 'INVALID_MARKS', 'Marks must be between 0 and the assignment maximum.');
  const { data, error: updateError } = await adminSupabase.from('submissions').update({ marks_obtained: input.marks, feedback: input.feedback ?? null, graded_by: actor.id, graded_at: new Date().toISOString() }).eq('id', submissionId).select().single(); fail(updateError); await audit(actor, 'grade', 'submission', submissionId); return data;
}
export async function createQuiz(actor: Actor, courseId: string, input: { title: string; description?: string; timeLimitMinutes: number; opensAt: string; closesAt: string; isPublished: boolean; questions: { type: 'mcq_single'|'mcq_multi'|'true_false'; prompt: string; options: {id:string;text:string}[]; correctOptionIds: string[]; marks: number }[] }) {
  await courseRole(actor, courseId, 'staff'); const { data: q, error } = await adminSupabase.from('quizzes').insert({ course_id: courseId, created_by: actor.id, title: input.title, description: input.description ?? null, time_limit_minutes: input.timeLimitMinutes, opens_at: input.opensAt, closes_at: input.closesAt, is_published: input.isPublished }).select().single(); fail(error);
  for (const [position, item] of input.questions.entries()) { const { data: question, error: qe } = await adminSupabase.from('quiz_questions').insert({ quiz_id: q.id, position, type: item.type, prompt: item.prompt, options: item.options, marks: item.marks }).select().single(); if (qe) { await adminSupabase.from('quizzes').delete().eq('id', q.id); fail(qe); } const { error: ae } = await adminSupabase.from('quiz_answers').insert({ question_id: question.id, correct_option_ids: item.correctOptionIds }); if (ae) { await adminSupabase.from('quizzes').delete().eq('id', q.id); fail(ae); } }
  await audit(actor, 'create', 'quiz', q.id); return q;
}
export async function listQuizzes(actor: Actor, courseId: string, page: number, pageSize: number) {
  await courseRole(actor, courseId); const { data, error, count } = await adminSupabase.from('quizzes').select('id,course_id,title,description,time_limit_minutes,opens_at,closes_at,is_published,created_at', { count: 'exact' }).eq('course_id', courseId).order('created_at', { ascending: false }).range((page - 1) * pageSize, page * pageSize - 1); fail(error);
  const rows = data ?? []; if (actor.role !== 'student') return { data: rows, total: count ?? 0 };
  const { data: attempts } = rows.length ? await adminSupabase.from('quiz_attempts').select('quiz_id,submitted_at,score').eq('student_id', actor.id).in('quiz_id', rows.map(x => x.id)) : { data: [] };
  return { data: rows.filter(x => x.is_published).map(x => ({ ...x, attempt: (attempts ?? []).find(a => a.quiz_id === x.id) ?? null })), total: count ?? 0 };
}
export async function updateQuiz(actor: Actor, id: string, patch: { isPublished?: boolean; title?: string; description?: string }) {
  const q = await quizCourse(id); await courseRole(actor, q.course_id, 'staff');
  const { count, error: ce } = await adminSupabase.from('quiz_attempts').select('id', { count: 'exact', head: true }).eq('quiz_id', id); fail(ce); if ((count ?? 0) > 0 && patch.title !== undefined) throw new HttpError(409, 'QUIZ_HAS_ATTEMPTS', 'This quiz cannot be edited after students have attempted it.');
  const { data, error } = await adminSupabase.from('quizzes').update({ ...(patch.isPublished === undefined ? {} : { is_published: patch.isPublished }), ...(patch.title === undefined ? {} : { title: patch.title }), ...(patch.description === undefined ? {} : { description: patch.description }) }).eq('id', id).select().single(); fail(error); return data;
}
export async function startQuiz(actor: Actor, id: string) {
  const q = await quizCourse(id); await courseRole(actor, q.course_id); if (actor.role !== 'student') throw new HttpError(403, 'FORBIDDEN', 'Only students can attempt quizzes.');
  const now = Date.now(); if (!q.is_published || now < new Date(q.opens_at).getTime() || now > new Date(q.closes_at).getTime()) throw new HttpError(409, 'QUIZ_CLOSED', 'This quiz is not open for attempts.');
  const { data: inserted, error } = await adminSupabase.from('quiz_attempts').insert({ quiz_id: id, student_id: actor.id, answers: {} }).select('id,started_at').single(); if (error?.code === '23505') throw new HttpError(409, 'ATTEMPT_EXISTS', 'You have already attempted this quiz.'); fail(error); if (!inserted) throw new HttpError(500, 'ATTEMPT_FAILED', 'Could not start the quiz.');
  const { data: questions, error: qe } = await adminSupabase.from('quiz_questions').select('id,position,type,prompt,options,marks').eq('quiz_id', id).order('position'); fail(qe); const startedAt=new Date(inserted.started_at).getTime();const endsAt=Math.min(startedAt+q.time_limit_minutes*60000,new Date(q.closes_at).getTime()); return { quizId:id,attemptId: inserted.id, startedAt: inserted.started_at, endsAt:new Date(endsAt).toISOString(),expiresAt: new Date(endsAt + 10000).toISOString(), questions: questions ?? [] };
}
export async function submitQuiz(actor: Actor, id: string, input: { attemptId: string; answers: Record<string, string[]> }) {
  const q = await quizCourse(id); await courseRole(actor, q.course_id); if (actor.role !== 'student') throw new HttpError(403, 'FORBIDDEN', 'Only students can submit quiz attempts.');
  const { data: attempt, error } = await adminSupabase.from('quiz_attempts').select('*').eq('id', input.attemptId).eq('quiz_id', id).eq('student_id', actor.id).maybeSingle(); fail(error); if (!attempt) throw new HttpError(404, 'NOT_FOUND', 'Attempt not found.'); if (attempt.submitted_at) throw new HttpError(409, 'ATTEMPT_SUBMITTED', 'This attempt has already been submitted.');
  const endsAt=Math.min(new Date(attempt.started_at).getTime()+q.time_limit_minutes*60000,new Date(q.closes_at).getTime());if (Date.now() > endsAt + 10000) throw new HttpError(409, 'ATTEMPT_EXPIRED', 'The time limit has expired.');
  const { data: questions, error: qe } = await adminSupabase.from('quiz_questions').select('id,marks').eq('quiz_id', id); fail(qe); let score = 0;
  for (const item of questions ?? []) { const { data: answer } = await adminSupabase.from('quiz_answers').select('correct_option_ids').eq('question_id', item.id).maybeSingle(); const chosen = [...new Set(input.answers[item.id] ?? [])].sort(); const correct = [...(answer?.correct_option_ids ?? [])].sort(); if (chosen.length === correct.length && chosen.every((x, i) => x === correct[i])) score += Number(item.marks); }
  const { data, error: ue } = await adminSupabase.from('quiz_attempts').update({ answers: input.answers, score, submitted_at: new Date().toISOString() }).eq('id', attempt.id).is('submitted_at', null).select('id,score,submitted_at').single(); fail(ue); return data;
}
export async function quizResults(actor: Actor, id: string, page: number, pageSize: number) { const q = await quizCourse(id); await courseRole(actor, q.course_id, 'staff'); const { data, error, count } = await adminSupabase.from('quiz_attempts').select('id,student_id,started_at,submitted_at,score,student:profiles!quiz_attempts_student_id_fkey(full_name,email,roll_no)', { count: 'exact' }).eq('quiz_id', id).order('submitted_at', { ascending: false }).range((page-1)*pageSize,page*pageSize-1); fail(error); return { data: data ?? [], total: count ?? 0 }; }
export async function listAnnouncements(actor: Actor, page: number, pageSize: number) {
  let q = adminSupabase.from('announcements').select('id,course_id,title,body,is_pinned,created_at,author_id', { count: 'exact' }).order('is_pinned', { ascending: false }).order('created_at', { ascending: false });
  if (actor.role === 'student') { const { data } = await adminSupabase.from('enrollments').select('course_id').eq('student_id', actor.id); q = q.or(`course_id.is.null,course_id.in.(${(data ?? []).map(x => x.course_id).join(',') || '00000000-0000-0000-0000-000000000000'})`); }
  if (actor.role === 'teacher') { const { data } = await adminSupabase.from('course_teachers').select('course_id').eq('teacher_id', actor.id); q = q.or(`course_id.is.null,course_id.in.(${(data ?? []).map(x => x.course_id).join(',') || '00000000-0000-0000-0000-000000000000'})`); }
  const { data, error, count } = await q.range((page-1)*pageSize,page*pageSize-1); fail(error); return { data: data ?? [], total: count ?? 0 };
}
export async function createAnnouncement(actor: Actor, input: { courseId?: string | null; title: string; body: string; isPinned: boolean }) { if (input.courseId) await courseRole(actor, input.courseId, 'staff'); else if (actor.role !== 'admin') throw new HttpError(403, 'FORBIDDEN', 'Only admins can post a global announcement.'); const { data, error } = await adminSupabase.from('announcements').insert({ course_id: input.courseId ?? null, author_id: actor.id, title: input.title, body: input.body, is_pinned: input.isPinned }).select().single(); fail(error); await audit(actor, 'create', 'announcement', data.id); return data; }
export async function markAnnouncementsRead(actor: Actor, ids: string[]) { if (!ids.length) return { ok: true }; const { error } = await adminSupabase.from('announcement_reads').upsert(ids.map(announcement_id => ({ user_id: actor.id, announcement_id })), { onConflict: 'user_id,announcement_id' }); fail(error); return { ok: true }; }
async function marksFor(courseIds:string[], studentIds:string[]) {
  if(!courseIds.length||!studentIds.length)return [];
  const [{data:assignments,error:ae},{data:quizzes,error:qe},{data:subs,error:se},{data:attempts,error:te}]=await Promise.all([
    adminSupabase.from('assignments').select('id,course_id,title,max_marks,due_at').in('course_id',courseIds),
    adminSupabase.from('quizzes').select('id,course_id,title,is_published').in('course_id',courseIds).eq('is_published',true),
    adminSupabase.from('submissions').select('id,assignment_id,student_id,marks_obtained,graded_at').in('student_id',studentIds),
    adminSupabase.from('quiz_attempts').select('id,quiz_id,student_id,score,submitted_at').in('student_id',studentIds)
  ]);fail(ae);fail(qe);fail(se);fail(te);
  const quizIds=(quizzes??[]).map(q=>q.id);const {data:questionMarks,error:questionError}=quizIds.length?await adminSupabase.from('quiz_questions').select('quiz_id,marks').in('quiz_id',quizIds):{data:[],error:null};fail(questionError);
  const quizzesWithMax=(quizzes??[]).map(q=>({...q,max_marks:(questionMarks??[]).filter(x=>x.quiz_id===q.id).reduce((sum,x)=>sum+Number(x.marks),0)}));
  const rows:any[]=[];
  for(const studentId of studentIds) for(const courseId of courseIds){
    for(const a of (assignments??[]).filter(x=>x.course_id===courseId)){const sub=(subs??[]).find(x=>x.student_id===studentId&&x.assignment_id===a.id);rows.push({student_id:studentId,course_id:courseId,kind:'assignment',item_id:a.id,title:a.title,obtained:sub?.marks_obtained??null,max:a.max_marks,graded_at:sub?.graded_at??null});}
    for(const q of quizzesWithMax.filter(x=>x.course_id===courseId)){const attempt=(attempts??[]).find(x=>x.student_id===studentId&&x.quiz_id===q.id);rows.push({student_id:studentId,course_id:courseId,kind:'quiz',item_id:q.id,title:q.title,obtained:attempt?.submitted_at?attempt.score:null,max:q.max_marks,graded_at:attempt?.submitted_at??null});}
  }
  return rows;
}
export async function marks(actor: Actor, courseId?: string) {
  let courseIds:string[]=[];let studentIds:string[]=[];
  if(actor.role==='student'){const {data,error}=await adminSupabase.from('enrollments').select('course_id').eq('student_id',actor.id);fail(error);courseIds=(data??[]).map(x=>x.course_id);studentIds=[actor.id];if(courseId&&!courseIds.includes(courseId))throw new HttpError(403,'FORBIDDEN','You are not enrolled in this course.');}
  else if(courseId){await courseRole(actor,courseId,'staff');courseIds=[courseId];const {data,error}=await adminSupabase.from('enrollments').select('student_id').eq('course_id',courseId);fail(error);studentIds=(data??[]).map(x=>x.student_id);}
  else if(actor.role==='admin'){const {data,error}=await adminSupabase.from('courses').select('id').eq('is_archived',false);fail(error);courseIds=(data??[]).map(x=>x.id);const {data:en,error:e}=await adminSupabase.from('enrollments').select('student_id');fail(e);studentIds=[...new Set((en??[]).map(x=>x.student_id))];}
  else {const {data,error}=await adminSupabase.from('course_teachers').select('course_id').eq('teacher_id',actor.id);fail(error);courseIds=(data??[]).map(x=>x.course_id);const {data:en,error:e}=await adminSupabase.from('enrollments').select('student_id').in('course_id',courseIds);fail(e);studentIds=[...new Set((en??[]).map(x=>x.student_id))];}
  return marksFor(courseIds,studentIds);
}
export async function gradebook(actor: Actor, courseId: string, page: number, pageSize: number) { await courseRole(actor, courseId, 'staff'); const { data: enrollments, error: ee, count } = await adminSupabase.from('enrollments').select('student_id,student:profiles!enrollments_student_id_fkey(id,full_name,email,roll_no)', { count: 'exact' }).eq('course_id', courseId).order('student_id').range((page-1)*pageSize,page*pageSize-1); fail(ee); const ids = (enrollments ?? []).map(x => x.student_id); const data=await marksFor([courseId],ids); return { students: enrollments ?? [], marks: data, total: count ?? 0 }; }
export async function chatMessages(actor: Actor, courseId: string, before: string | undefined, limit: number) { await courseRole(actor, courseId); let q = adminSupabase.from('chat_messages').select('id,course_id,sender_id,body,created_at,deleted_at,sender:profiles!chat_messages_sender_id_fkey(full_name,role)').eq('course_id', courseId).order('created_at', { ascending: false }).limit(limit); if (before) q = q.lt('created_at', before); const { data, error } = await q; fail(error); return (data ?? []).reverse(); }
export async function sendMessage(actor: Actor, courseId: string, body: string) { await courseRole(actor, courseId); const { data, error } = await adminSupabase.from('chat_messages').insert({ course_id: courseId, sender_id: actor.id, body }).select('id,course_id,sender_id,body,created_at,deleted_at').single(); fail(error); return data; }
export async function deleteMessage(actor: Actor, id: string) { const { data: m, error } = await adminSupabase.from('chat_messages').select('id,sender_id,course_id,created_at').eq('id', id).maybeSingle(); fail(error); if (!m) throw new HttpError(404, 'NOT_FOUND', 'Message not found.'); await courseRole(actor, m.course_id); if (actor.id !== m.sender_id && actor.role === 'student') throw new HttpError(403, 'FORBIDDEN', 'You cannot delete this message.'); if (actor.id === m.sender_id && Date.now() - new Date(m.created_at).getTime() > 5*60*1000) throw new HttpError(403, 'FORBIDDEN', 'Messages can only be deleted for five minutes.'); const { error: e } = await adminSupabase.from('chat_messages').update({ deleted_at: new Date().toISOString() }).eq('id', id); fail(e); await audit(actor,'delete','chat_message',id); return { ok: true }; }
export async function createComplaint(actor: Actor, input: { courseId?: string | null; category: string; subject: string; description: string;attachmentPath?:string }) { if (actor.role === 'admin') throw new HttpError(403, 'FORBIDDEN', 'Admins cannot file complaints.'); if (input.courseId) await courseRole(actor,input.courseId); const { data,error } = await adminSupabase.from('complaints').insert({ raised_by:actor.id,course_id:input.courseId??null,category:input.category,subject:input.subject,description:input.description,attachment_path:input.attachmentPath??null }).select().single(); fail(error); return data; }
export async function myComplaints(actor: Actor, page: number, pageSize: number) { const {data,error,count}=await adminSupabase.from('complaints').select('*',{count:'exact'}).eq('raised_by',actor.id).order('created_at',{ascending:false}).range((page-1)*pageSize,page*pageSize-1);fail(error);return {data:data??[],total:count??0}; }
export async function adminComplaints(status: string, category: string, page: number, pageSize: number) { let q=adminSupabase.from('complaints').select('*,user:profiles!complaints_raised_by_fkey(full_name,email,role)',{count:'exact'}).order('created_at',{ascending:false});if(status)q=q.eq('status',status);if(category)q=q.eq('category',category);const {data,error,count}=await q.range((page-1)*pageSize,page*pageSize-1);fail(error);return {data:data??[],total:count??0}; }
export async function updateComplaint(actor: Actor, id: string, input: { status: string; adminResponse?: string }) { if (['resolved','rejected'].includes(input.status) && !input.adminResponse?.trim()) throw new HttpError(422,'RESPONSE_REQUIRED','A response is required to resolve or reject a complaint.'); const {data,error}=await adminSupabase.from('complaints').update({status:input.status,admin_response:input.adminResponse??null,resolved_by:actor.id}).eq('id',id).select().maybeSingle();fail(error);if(!data)throw new HttpError(404,'NOT_FOUND','Complaint not found.');await audit(actor,'update','complaint',id);return data; }

const safeName = (name: string) => name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120) || 'upload';
export async function listResources(actor: Actor, courseId: string, page: number, pageSize: number, search: string) {
  await courseRole(actor, courseId); let q = adminSupabase.from('resources').select('id,course_id,title,description,file_name,mime_type,size_bytes,created_at', { count: 'exact' }).eq('course_id', courseId).order('created_at', { ascending: false }).range((page-1)*pageSize,page*pageSize-1); if (search) q=q.ilike('title', `%${search}%`); const {data,error,count}=await q;fail(error);return {data:data??[],total:count??0};
}
export async function uploadResource(actor: Actor, courseId: string, fileName: string, mimeType: string, bytes: Buffer, title: string, description?: string) {
  await courseRole(actor, courseId, 'staff'); const path=`${courseId}/${crypto.randomUUID()}-${safeName(fileName)}`;
  const {error:uploadError}=await adminSupabase.storage.from('resources').upload(path,bytes,{contentType:mimeType,upsert:false});fail(uploadError);
  const {data,error}=await adminSupabase.from('resources').insert({course_id:courseId,uploaded_by:actor.id,title,description:description??null,file_path:path,file_name:fileName,mime_type:mimeType,size_bytes:bytes.length}).select().single();
  if(error){await adminSupabase.storage.from('resources').remove([path]);fail(error);} return data;
}
export async function resourceDownload(actor: Actor, id: string) { const {data,error}=await adminSupabase.from('resources').select('id,course_id,file_path').eq('id',id).maybeSingle();fail(error);if(!data)throw new HttpError(404,'NOT_FOUND','Resource not found.');await courseRole(actor,data.course_id);const {data:signed,error:e}=await adminSupabase.storage.from('resources').createSignedUrl(data.file_path,60);fail(e);if(!signed)throw new HttpError(500,'DOWNLOAD_FAILED','Could not prepare the download.');return {url:signed.signedUrl,expiresIn:60}; }
export async function deleteResource(actor: Actor, id: string) { const {data,error}=await adminSupabase.from('resources').select('id,course_id,file_path,uploaded_by').eq('id',id).maybeSingle();fail(error);if(!data)throw new HttpError(404,'NOT_FOUND','Resource not found.');await courseRole(actor,data.course_id,'staff');if(actor.role!=='admin'&&data.uploaded_by!==actor.id)throw new HttpError(403,'FORBIDDEN','Only the uploader or an admin can remove this resource.');const {error:e}=await adminSupabase.storage.from('resources').remove([data.file_path]);fail(e);const {error:de}=await adminSupabase.from('resources').delete().eq('id',id);fail(de);await audit(actor,'delete','resource',id);return {ok:true}; }
export async function uploadSubmissionFile(actor: Actor, assignmentId: string, fileName: string, mimeType: string, bytes: Buffer) { const a=await assignmentCourse(assignmentId);await courseRole(actor,a.course_id);if(actor.role!=='student')throw new HttpError(403,'FORBIDDEN','Only students can submit files.');const path=`${actor.id}/${crypto.randomUUID()}-${safeName(fileName)}`;const {error}=await adminSupabase.storage.from('submissions').upload(path,bytes,{contentType:mimeType,upsert:false});fail(error);return {filePath:path}; }
export async function submissionDownload(actor: Actor, id: string) { const {data,error}=await adminSupabase.from('submissions').select('id,student_id,file_path,assignment:assignments(course_id)').eq('id',id).maybeSingle();fail(error);if(!data?.file_path)throw new HttpError(404,'NOT_FOUND','Submission file not found.');const a=Array.isArray(data.assignment)?data.assignment[0]:data.assignment;if(!a)throw new HttpError(404,'NOT_FOUND','Assignment not found.');await courseRole(actor,a.course_id);if(actor.role==='student'&&data.student_id!==actor.id)throw new HttpError(404,'NOT_FOUND','Submission not found.');const {data:signed,error:e}=await adminSupabase.storage.from('submissions').createSignedUrl(data.file_path,60);fail(e);if(!signed)throw new HttpError(500,'DOWNLOAD_FAILED','Could not prepare the download.');return {url:signed.signedUrl,expiresIn:60}; }
export async function uploadComplaintFile(actor: Actor, fileName: string, mimeType: string, bytes: Buffer) { const path=`${actor.id}/${crypto.randomUUID()}-${safeName(fileName)}`;const {error}=await adminSupabase.storage.from('complaint-attachments').upload(path,bytes,{contentType:mimeType,upsert:false});fail(error);return {filePath:path}; }
export async function uploadAssignmentAttachment(actor:Actor,courseId:string,fileName:string,mimeType:string,bytes:Buffer){await courseRole(actor,courseId,'staff');const path=`${courseId}/${crypto.randomUUID()}-${safeName(fileName)}`;const {error}=await adminSupabase.storage.from('resources').upload(path,bytes,{contentType:mimeType,upsert:false});fail(error);return {filePath:path};}
export async function assignmentAttachment(actor:Actor,id:string){const a=await assignmentCourse(id);await courseRole(actor,a.course_id);const {data,error}=await adminSupabase.from('assignments').select('attachment_path').eq('id',id).single();fail(error);if(!data?.attachment_path)throw new HttpError(404,'NOT_FOUND','Assignment attachment not found.');const {data:signed,error:e}=await adminSupabase.storage.from('resources').createSignedUrl(data.attachment_path,60);fail(e);if(!signed)throw new HttpError(500,'DOWNLOAD_FAILED','Could not prepare the download.');return {url:signed.signedUrl,expiresIn:60};}
export async function complaintDownload(actor: Actor, id: string) { const {data,error}=await adminSupabase.from('complaints').select('id,raised_by,attachment_path').eq('id',id).maybeSingle();fail(error);if(!data?.attachment_path||(actor.role!=='admin'&&data.raised_by!==actor.id))throw new HttpError(404,'NOT_FOUND','Complaint attachment not found.');const {data:signed,error:e}=await adminSupabase.storage.from('complaint-attachments').createSignedUrl(data.attachment_path,60);fail(e);if(!signed)throw new HttpError(500,'DOWNLOAD_FAILED','Could not prepare the download.');return {url:signed.signedUrl,expiresIn:60}; }
export async function updateAssignment(actor:Actor,id:string,patch:{title?:string;instructions?:string;maxMarks?:number;dueAt?:string;allowLate?:boolean}){const a=await assignmentCourse(id);await courseRole(actor,a.course_id,'staff');const {data,error}=await adminSupabase.from('assignments').update({...(patch.title===undefined?{}:{title:patch.title}),...(patch.instructions===undefined?{}:{instructions:patch.instructions}),...(patch.maxMarks===undefined?{}:{max_marks:patch.maxMarks}),...(patch.dueAt===undefined?{}:{due_at:patch.dueAt}),...(patch.allowLate===undefined?{}:{allow_late:patch.allowLate})}).eq('id',id).select().single();fail(error);await audit(actor,'update','assignment',id);return data;}
export async function deleteAssignment(actor:Actor,id:string){const a=await assignmentCourse(id);await courseRole(actor,a.course_id,'staff');const {data,error}=await adminSupabase.from('submissions').select('file_path').eq('assignment_id',id);fail(error);const paths=(data??[]).flatMap(x=>x.file_path?[x.file_path]:[]);if(paths.length){const {error:storageError}=await adminSupabase.storage.from('submissions').remove(paths);fail(storageError);}const {error:removeError}=await adminSupabase.from('assignments').delete().eq('id',id);fail(removeError);await audit(actor,'delete','assignment',id);return {ok:true};}
export async function updateAnnouncement(actor:Actor,id:string,patch:{title?:string;body?:string;isPinned?:boolean}){const {data:row,error}=await adminSupabase.from('announcements').select('id,author_id,course_id').eq('id',id).maybeSingle();fail(error);if(!row)throw new HttpError(404,'NOT_FOUND','Announcement not found.');if(actor.role!=='admin'){if(actor.id!==row.author_id||!row.course_id)throw new HttpError(403,'FORBIDDEN','You cannot edit this announcement.');await courseRole(actor,row.course_id,'staff');}const {data,error:e}=await adminSupabase.from('announcements').update({...(patch.title===undefined?{}:{title:patch.title}),...(patch.body===undefined?{}:{body:patch.body}),...(patch.isPinned===undefined?{}:{is_pinned:patch.isPinned})}).eq('id',id).select().single();fail(e);await audit(actor,'update','announcement',id);return data;}
export async function deleteAnnouncement(actor:Actor,id:string){const {data,error}=await adminSupabase.from('announcements').select('id,author_id,course_id').eq('id',id).maybeSingle();fail(error);if(!data)throw new HttpError(404,'NOT_FOUND','Announcement not found.');if(actor.role!=='admin'){if(actor.id!==data.author_id||!data.course_id)throw new HttpError(403,'FORBIDDEN','You cannot delete this announcement.');await courseRole(actor,data.course_id,'staff');}const {error:e}=await adminSupabase.from('announcements').delete().eq('id',id);fail(e);await audit(actor,'delete','announcement',id);return {ok:true};}
