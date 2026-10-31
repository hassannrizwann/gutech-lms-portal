import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';

export class HttpError extends Error { constructor(public status: number, public code: string, message: string) { super(message); } }
export const notFound: RequestHandler = (_req,res) => { res.status(404).json({ error: { code: 'NOT_FOUND', message: 'The requested resource was not found.' } }); };
export const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
  if (error instanceof ZodError) { res.status(422).json({ error: { code: 'VALIDATION_ERROR', message: 'Please check the submitted information.', details: error.issues.map(i => ({ path: i.path, message: i.message })) } }); return; }
  if (error instanceof HttpError) { res.status(error.status).json({ error: { code: error.code, message: error.message } }); return; }
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' } });
};
