import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Get public pricing plans for the website
 * No authentication required
 */
export const getPublicPricing = async (req: Request, res: Response) => {
    try {
        const plans = await prisma.subscriptionPlan.findMany({
            where: { isActive: true },
            orderBy: { sortOrder: 'asc' },
            select: {
                id: true,
                name: true,
                tier: true,
                description: true,
                monthlyPriceZMW: true,
                yearlyPriceZMW: true,
                monthlyPriceUSD: true,
                yearlyPriceUSD: true,
                includedStudents: true,
                maxStudents: true,
                maxTeachers: true,
                maxUsers: true,
                features: true,
                isPopular: true,
            } as any,
        });

        // Format for website consumption
        const formattedPlans = plans.map((plan: any) => ({
            id: plan.id,
            name: plan.name,
            tier: plan.tier,
            description: plan.description,
            price: {
                monthly: {
                    zmw: Number(plan.monthlyPriceZMW),
                    usd: Number(plan.monthlyPriceUSD),
                },
                yearly: {
                    zmw: Number(plan.yearlyPriceZMW),
                    usd: Number(plan.yearlyPriceUSD),
                },
            },
            limits: {
                students: plan.maxStudents === 0 ? 'Unlimited' : plan.maxStudents,
                includedStudents: plan.includedStudents,
                teachers: plan.maxTeachers,
                users: plan.maxUsers,
            },
            features: plan.features || [],
            isPopular: plan.isPopular,
        }));

        res.json({ 
            success: true,
            plans: formattedPlans,
            currency: {
                primary: 'ZMW',
                secondary: 'USD'
            }
        });

    } catch (error) {
        console.error('Error fetching pricing:', error);
        res.status(500).json({ error: 'Failed to fetch pricing' });
    }
};

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
