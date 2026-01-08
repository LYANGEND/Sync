import { Router } from 'express';
import { authenticatePlatformUser } from '../middleware/platformMiddleware';
import {
    createLead,
    getLeads,
    getLeadDetails,
    updateLead,
    createDeal,
    getPipeline,
    updateDealStage,
    logActivity,
    createTask,
    getMyTasks
} from '../controllers/crmController';

const router = Router();

// All CRM routes require platform authentication
router.use(authenticatePlatformUser);

// Leads
router.post('/leads', createLead);
router.get('/leads', getLeads);
router.get('/leads/:id', getLeadDetails);
router.put('/leads/:id', updateLead);

// Deals & Pipeline
router.post('/deals', createDeal);
router.get('/pipeline', getPipeline);
router.put('/deals/:id/stage', updateDealStage);

// Activities
router.post('/activities', logActivity);

// Tasks
router.post('/tasks', createTask);
router.get('/tasks/my', getMyTasks);

export default router;
