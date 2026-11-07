import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/require-auth.js';
import { requireEmployeePermission } from '../middleware/require-employee-permission.js';
import { employeeDeliveries, progressDelivery } from '../services/delivery-workflow.js';
const router = Router();
router.use(requireAuth);
router.get('/', requireEmployeePermission('delivery.view'), async (req,res,next) => { try { res.json({ success: true, items: await employeeDeliveries(req.authUser) }); } catch(e) { next(e); } });
router.patch('/:id/action', requireEmployeePermission('delivery.manage'), async (req,res,next) => { try {
  const id = z.string().uuid().parse(req.params.id);
  const body = z.object({ action: z.enum(['pickup','start','delivered','failed']), failureReason: z.string().trim().max(250).optional(), cashConfirmed: z.boolean().optional() }).strict().parse(req.body);
  res.json({ success: true, data: await progressDelivery(req.authUser, id, body.action, body.failureReason, body.cashConfirmed) });
} catch(e) { next(e); } });
export default router;
