import type { RequestHandler } from 'express';
import { supabase, adminSupabase } from '../config/supabase.js';
import { HttpError } from '../utils/errors.js';
import type { UserRole } from '../types/user.js';

export const requireAuth: RequestHandler = async (req, _res, next) => {
  const token = req.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) { next(new HttpError(401, 'UNAUTHORIZED', 'Please sign in to continue.')); return; }
  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) throw new HttpError(401, 'UNAUTHORIZED', 'Your session has expired. Please sign in again.');
    const { data: profile, error: profileError } = await adminSupabase.from('profiles').select('id,role,is_active').eq('id', user.id).maybeSingle();
    if (profileError || !profile || !profile.is_active) throw new HttpError(401, 'UNAUTHORIZED', 'This account is not active.');
    req.user = { id: profile.id, role: profile.role as UserRole, accessToken: token }; next();
  } catch (error) { next(error instanceof HttpError ? error : new HttpError(401, 'UNAUTHORIZED', 'Please sign in again.')); }
};
export function requireRole(...roles: UserRole[]): RequestHandler { return (req, _res, next) => req.user && roles.includes(req.user.role) ? next() : next(new HttpError(403, 'FORBIDDEN', 'You do not have permission to do that.')); }
