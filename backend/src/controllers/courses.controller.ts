import type { RequestHandler } from 'express';
import { listCourses } from '../repositories/profile.repository.js';
export const list:RequestHandler=async(req,res,next)=>{try{const page=req.pagination?.page??1,pageSize=req.pagination?.pageSize??20;const result=await listCourses(req.user!.accessToken,page,pageSize);res.json({data:result.data,meta:{page,pageSize,total:result.total}});}catch(e){next(e);}};
