import { Router } from 'express';
import { submitContactForm } from '../controllers/websiteController';

const router = Router();

// Public route for contact form submission
router.post('/contact', submitContactForm);

export default router;
