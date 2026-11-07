import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../middleware/require-auth.js';
import { ownerDeliveryData, assignDelivery } from '../services/delivery-workflow.js';
const router = Router();
router.use(requireAuth, requireRole('SHOP_OWNER'));
router.get('/', async (req,res,next) => { try { res.json({ success: true, data: await ownerDeliveryData(req.authUser.id) }); } catch(e) { next(e); } });
router.post('/assign', async (req,res,next) => { try {
  const body = z.object({ shopOrderId: z.string().uuid(), employeeId: z.string().uuid() }).strict().parse(req.body);
  const data = await assignDelivery(req.authUser.id, req.authUser.id, body.shopOrderId, body.employeeId);
  res.json({ success: true, data });
} catch(e) { next(e); } });
export default router;
