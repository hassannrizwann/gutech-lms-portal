import { createClient } from '@supabase/supabase-js';
import { supabase, adminSupabase } from '../config/supabase.js';
import { getProfile } from '../repositories/profile.repository.js';
import { HttpError } from '../utils/errors.js';
import { env } from '../config/env.js';

export async function login(email:string,password:string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session || !data.user) throw new HttpError(401,'INVALID_CREDENTIALS','Invalid email or password.');
  const profile = await getProfile(data.user.id, data.session.access_token);
  return { accessToken:data.session.access_token, refreshToken:data.session.refresh_token, profile };
}
export async function refresh(refreshToken:string) {
  const {data,error}=await supabase.auth.refreshSession({refresh_token:refreshToken});
  if(error||!data.session||!data.user) throw new HttpError(401,'SESSION_EXPIRED','Please sign in again.');
  const profile=await getProfile(data.user.id,data.session.access_token);
  return {accessToken:data.session.access_token,refreshToken:data.session.refresh_token,profile};
}
export async function forgotPassword(email:string) {
  // The response is intentionally identical for known and unknown accounts.
  await supabase.auth.resetPasswordForEmail(email,{redirectTo:env.PASSWORD_RESET_REDIRECT}).catch(()=>undefined);
}
export async function resetPassword(accessToken:string,newPassword:string) {
  const { data, error }=await supabase.auth.getUser(accessToken); if(error||!data.user) throw new HttpError(401,'INVALID_RESET','This password reset link has expired.');
  const {error:changeError}=await adminSupabase.auth.admin.updateUserById(data.user.id,{password:newPassword}); if(changeError) throw new HttpError(422,'PASSWORD_UPDATE_FAILED','The password could not be updated.');
  await adminSupabase.auth.admin.signOut(accessToken,'global').catch(()=>undefined);
}
export async function changePassword(accessToken:string,currentPassword:string,newPassword:string) {
  const {data:{user},error}=await supabase.auth.getUser(accessToken); if(error||!user?.email) throw new HttpError(401,'UNAUTHORIZED','Please sign in again.');
  const verifier=createClient(env.SUPABASE_URL,env.SUPABASE_ANON_KEY,{auth:{autoRefreshToken:false,persistSession:false}});
  const {error:verifyError}=await verifier.auth.signInWithPassword({email:user.email,password:currentPassword}); if(verifyError) throw new HttpError(422,'INVALID_CURRENT_PASSWORD','Your current password is incorrect.');
  const {error:updateError}=await adminSupabase.auth.admin.updateUserById(user.id,{password:newPassword}); if(updateError) throw new HttpError(422,'PASSWORD_UPDATE_FAILED','The password could not be updated.');
  const {error:profileError}=await adminSupabase.from('profiles').update({must_change_password:false}).eq('id',user.id); if(profileError) throw new HttpError(422,'PROFILE_UPDATE_FAILED','The password changed but the profile could not be updated.');
  await adminSupabase.auth.admin.signOut(accessToken,'global').catch(()=>undefined);
}
export async function adminCreateUser(input:{email:string;fullName:string;role:'teacher'|'student';rollNo?:string}) {
  const tempPassword = `N${crypto.randomUUID()}a9`;
  const {data,error}=await adminSupabase.auth.admin.createUser({email:input.email,password:tempPassword,email_confirm:true,user_metadata:{full_name:input.fullName}});
  if(error||!data.user) throw new HttpError(409,'USER_CREATE_FAILED','The user could not be created. Check for a duplicate email.');
  const {error:profileError}=await adminSupabase.from('profiles').insert({id:data.user.id,email:input.email,full_name:input.fullName,role:input.role,roll_no:input.rollNo??null,must_change_password:false});
  if(profileError) { await adminSupabase.auth.admin.deleteUser(data.user.id); throw new HttpError(409,'PROFILE_CREATE_FAILED','The user profile could not be created.'); }
  await adminSupabase.auth.resetPasswordForEmail(input.email,{redirectTo:env.PASSWORD_RESET_REDIRECT});
  return {id:data.user.id,email:input.email,fullName:input.fullName,role:input.role};
}
