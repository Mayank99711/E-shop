import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/require-auth.js';
import { requireEmployeePermission } from '../middleware/require-employee-permission.js';
import { associateReturns,associateReturnAction } from '../services/return-cod.js';
const router=Router();router.use(requireAuth);
router.get('/',requireEmployeePermission('delivery.view'),async(req,res,next)=>{try{res.json({success:true,items:await associateReturns(req.authUser)});}catch(e){next(e)}});
router.patch('/:id/action',requireEmployeePermission('delivery.manage'),async(req,res,next)=>{try{const id=z.string().uuid().parse(req.params.id);const b=z.object({action:z.enum(['collect','handover','failed']),reason:z.string().trim().max(250).optional()}).strict().parse(req.body);res.json({success:true,data:await associateReturnAction(req.authUser,id,b.action,b.reason)});}catch(e){next(e)}});
export default router;
