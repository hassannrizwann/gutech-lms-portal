import { supabase } from '../config/supabase.js';
import { HttpError } from '../utils/errors.js';
export async function getProfile(userId: string, token: string) {
  const client = (await import('@supabase/supabase-js')).createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
  const { data, error } = await client.from('profiles').select('id,full_name,email,role,roll_no,must_change_password,is_active').eq('id', userId).single();
  if (error) throw error;
  if (!data.is_active) throw new HttpError(401,'ACCOUNT_INACTIVE','This account is not active.');
  return { id: data.id, fullName: data.full_name, email: data.email, role: data.role, rollNo: data.roll_no, mustChangePassword: data.must_change_password };
}
export async function listCourses(token: string, page: number, pageSize: number) {
  const { data, error, count } = await supabase.auth.getUser(token).then(async ({ data: { user }, error: authError }) => {
    if (authError || !user) throw authError;
    const client = (await import('@supabase/supabase-js')).createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
    return client.from('courses').select('id,code,title,description,is_archived', { count: 'exact' }).eq('is_archived', false).order('title').range((page - 1) * pageSize, page * pageSize - 1);
  }).then(result => ({...result, count:result.count}));
  if (error) throw error;
  return { data: (data ?? []).map(c => ({ id:c.id, code:c.code, title:c.title, description:c.description })), total: count ?? 0 };
}
