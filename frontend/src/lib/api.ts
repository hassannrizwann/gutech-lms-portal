const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api';
export type UserRole = 'admin' | 'teacher' | 'student';
export interface Profile { id: string; fullName: string; email: string; role: UserRole; rollNo?: string | null; mustChangePassword?: boolean }
export interface ApiError { error: { code: string; message: string; details?: unknown } }
export interface ApiResponse<T> { data: T; meta?: { page: number; pageSize: number; total: number } }

let accessToken: string | null = null;
export const session = {
  get token() { return accessToken; },
  set token(value: string | null) { accessToken = value; },
  clear() { accessToken = null; }
};

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  if (session.token) headers.set('Authorization', `Bearer ${session.token}`);
  const response = await fetch(`${API_URL}${path}`, { ...init, headers, credentials: 'include' });
  const body = await response.json().catch(() => null) as ApiResponse<T> | ApiError | null;
  if (!response.ok) throw new Error(body && 'error' in body ? body.error.message : 'Something went wrong. Please try again.');
  return body && 'data' in body ? body.data : body as T;
}

export async function uploadFile<T = { filePath: string }>(path: string, file: File, query: Record<string, string> = {}): Promise<T> {
  const params = new URLSearchParams({ ...query, fileName: file.name });
  const headers = new Headers({ 'Content-Type': 'application/octet-stream' });
  if (session.token) headers.set('Authorization', `Bearer ${session.token}`);
  const response = await fetch(`${API_URL}${path}?${params}`, { method: 'POST', headers, body: file, credentials: 'include' });
  const body = await response.json().catch(() => null) as ApiResponse<T> | ApiError | null;
  if (!response.ok) throw new Error(body && 'error' in body ? body.error.message : 'The file could not be uploaded.');
  return body && 'data' in body ? body.data : body as T;
}

export async function downloadFile(path: string, filename: string): Promise<void> {
  const headers = new Headers();
  if (session.token) headers.set('Authorization', `Bearer ${session.token}`);
  const response = await fetch(`${API_URL}${path}`, { headers, credentials: 'include' });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as ApiError | null;
    throw new Error(body?.error?.message ?? 'The download could not be prepared.');
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click();
  URL.revokeObjectURL(url);
}
