import express from 'express';
import type { RequestHandler } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { pinoHttp } from 'pino-http';
import { env } from './config/env.js';
import routes from './routes/index.js';
import lmsRoutes from './routes/lms.routes.js';
import { errorHandler, notFound } from './utils/errors.js';

const createHelmetMiddleware = helmet as unknown as () => RequestHandler;

export const app=express();
app.disable('x-powered-by');
app.use(createHelmetMiddleware());
app.use(cors({origin:env.CLIENT_ORIGIN,credentials:true,methods:['GET','POST','PATCH','DELETE','OPTIONS'],allowedHeaders:['Content-Type','Authorization']}));
app.use(express.json({limit:'1mb'}));
app.use(cookieParser());
app.use(pinoHttp({redact:['req.headers.authorization','req.headers.cookie','req.body.password','req.body.currentPassword','req.body.newPassword']}));
app.get('/health',(_req,res)=>res.json({data:{status:'ok'}}));
app.use('/api',lmsRoutes);
app.use('/api',routes);
app.use(notFound);
app.use(errorHandler);
