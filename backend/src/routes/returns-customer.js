import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../middleware/require-auth.js';
import { customerReturns,requestReturn } from '../services/return-cod.js';
const router=Router();router.use(requireAuth,requireRole('CUSTOMER'));
router.get('/',async(req,res,next)=>{try{res.json({success:true,items:await customerReturns(req.authUser.id)});}catch(e){next(e)}});
router.post('/',async(req,res,next)=>{try{const b=z.object({shopOrderId:z.string().uuid(),reason:z.string().trim().min(5).max(500)}).strict().parse(req.body);res.status(201).json({success:true,data:await requestReturn(req.authUser.id,b.shopOrderId,b.reason)});}catch(e){next(e)}});
export default router;
