import type { RequestHandler } from 'express';
import { z } from 'zod';
export const paginationSchema = z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20) });
export const validatePagination: RequestHandler = (req, _res, next) => { const parsed = paginationSchema.safeParse(req.query); if (!parsed.success) { next(parsed.error); return; } resAssign(req, parsed.data); next(); };
function resAssign(req: Express.Request, page: {page:number;pageSize:number}) { Object.assign(req, { pagination: page }); }
declare global { namespace Express { interface Request { pagination?: { page: number; pageSize: number } } } }
