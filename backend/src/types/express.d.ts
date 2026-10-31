import type { UserRole } from './user.js';
declare global { namespace Express { interface Request { user?: { id: string; role: UserRole; accessToken: string } } } }
export {};
