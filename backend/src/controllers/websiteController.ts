import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Handle contact form submission from public website
 */
export const submitContactForm = async (req: Request, res: Response) => {
    try {
        const { name, email, school, message } = req.body;

        if (!name || !email || !message) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Save to database
        const submission = await prisma.contactSubmission.create({
            data: {
                name,
                email,
                schoolName: school,
                message,
                isRead: false
            }
        });

        // Potentially create a Lead in CRM if configured to do so automatically
        // For now, just save the submission

        res.status(201).json({ 
            success: true, 
            message: 'Thank you for contacting us. We will be in touch shortly.',
            id: submission.id 
        });

    } catch (error) {
        console.error('Error submitting contact form:', error);
        res.status(500).json({ error: 'Failed to submit contact form' });
    }
};
