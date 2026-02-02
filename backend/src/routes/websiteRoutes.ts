import { Router } from 'express';
import { submitContactForm, getPublicPricing } from '../controllers/websiteController';

const router = Router();

// Public route for pricing plans (no auth required)
router.get('/pricing', getPublicPricing);

// Public route for contact form submission
router.post('/contact', submitContactForm);

export default router;
