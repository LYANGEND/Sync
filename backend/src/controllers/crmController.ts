import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ==========================================
// LEADS MANAGEMENT
// ==========================================

export const createLead = async (req: Request, res: Response) => {
    try {
        const {
            schoolName,
            contactName,
            contactEmail,
            contactPhone,
            source,
            status,
            assignedToId
        } = req.body;

        const lead = await prisma.lead.create({
            data: {
                schoolName,
                contactName,
                contactEmail,
                contactPhone,
                source,
                status,
                assignedToId,
                country: req.body.country || 'Zambia',
                city: req.body.city,
                notes: req.body.notes
            }
        });

        res.status(201).json(lead);
    } catch (error) {
        console.error('Error creating lead:', error);
        res.status(500).json({ error: 'Failed to create lead' });
    }
};

export const getLeads = async (req: Request, res: Response) => {
    try {
        const { status, assignedToId, search } = req.query;

        const where: any = {};

        if (status) where.status = status;
        if (assignedToId) where.assignedToId = assignedToId;

        if (search) {
            where.OR = [
                { schoolName: { contains: String(search), mode: 'insensitive' } },
                { contactName: { contains: String(search), mode: 'insensitive' } },
                { contactEmail: { contains: String(search), mode: 'insensitive' } }
            ];
        }

        const leads = await prisma.lead.findMany({
            where,
            include: {
                assignedTo: {
                    select: {
                        id: true,
                        fullName: true,
                        email: true
                    }
                },
                _count: {
                    select: {
                        activities: true,
                        tasks: true
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        res.json(leads);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch leads' });
    }
};

export const getLeadDetails = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const lead = await prisma.lead.findUnique({
            where: { id },
            include: {
                activities: {
                    orderBy: { activityDate: 'desc' },
                    include: {
                        performedBy: {
                            select: { fullName: true }
                        }
                    }
                },
                tasks: {
                    orderBy: { dueDate: 'asc' },
                    include: {
                        assignedTo: { select: { fullName: true } }
                    }
                },
                deals: true,
                assignedTo: {
                    select: { fullName: true, email: true }
                }
            }
        });

        if (!lead) {
            return res.status(404).json({ error: 'Lead not found' });
        }

        res.json(lead);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch lead details' });
    }
};

export const updateLead = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const lead = await prisma.lead.update({
            where: { id },
            data: req.body
        });
        res.json(lead);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update lead' });
    }
};

// ==========================================
// DEALS & PIPELINE
// ==========================================

export const createDeal = async (req: Request, res: Response) => {
    try {
        const {
            name,
            value,
            leadId,
            stage,
            proposedTier,
            ownerId
        } = req.body;

        const deal = await prisma.deal.create({
            data: {
                name,
                value,
                leadId,
                stage,
                proposedTier,
                ownerId,
                probability: req.body.probability || 10,
                expectedCloseDate: req.body.expectedCloseDate ? new Date(req.body.expectedCloseDate) : undefined
            }
        });

        res.status(201).json(deal);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create deal' });
    }
};

export const getPipeline = async (req: Request, res: Response) => {
    try {
        // Group deals by stage
        const deals = await prisma.deal.findMany({
            include: {
                lead: {
                    select: {
                        schoolName: true,
                        contactName: true
                    }
                },
                owner: {
                    select: { fullName: true }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        // Calculate pipeline stats
        const stats = {
            totalValue: deals.reduce((sum, deal) => sum + Number(deal.value), 0),
            totalDeals: deals.length,
            byStage: deals.reduce((acc: any, deal) => {
                acc[deal.stage] = (acc[deal.stage] || 0) + 1;
                return acc;
            }, {})
        };

        res.json({ deals, stats });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch pipeline' });
    }
};

export const updateDealStage = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { stage, probability } = req.body;

        const deal = await prisma.deal.update({
            where: { id },
            data: {
                stage,
                probability
            }
        });

        res.json(deal);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update deal stage' });
    }
};

// ==========================================
// ACTIVITIES & TASKS
// ==========================================

export const logActivity = async (req: Request, res: Response) => {
    try {
        const {
            leadId,
            type,
            subject,
            description,
            performedById,
            durationMinutes
        } = req.body;

        // Create activity
        const activity = await prisma.activity.create({
            data: {
                leadId,
                type,
                subject,
                description,
                performedById, // Ensure this comes from auth user in routes
                durationMinutes,
                activityDate: new Date()
            }
        });

        // Update lead's last contacted date
        await prisma.lead.update({
            where: { id: leadId },
            data: { lastContactedAt: new Date() }
        });

        res.status(201).json(activity);
    } catch (error) {
        res.status(500).json({ error: 'Failed to log activity' });
    }
};

export const createTask = async (req: Request, res: Response) => {
    try {
        const {
            title,
            description,
            priority,
            dueDate,
            assignedToId,
            leadId,
            createdById
        } = req.body;

        const task = await prisma.task.create({
            data: {
                title,
                description,
                priority,
                dueDate: new Date(dueDate),
                assignedToId,
                leadId,
                createdById
            }
        });

        res.status(201).json(task);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to create task' });
    }
};

export const getMyTasks = async (req: Request, res: Response) => {
    try {
        const userId = req.query.userId as string; // Will come from auth middleware

        const tasks = await prisma.task.findMany({
            where: {
                assignedToId: userId,
                status: { not: 'COMPLETED' }
            },
            include: {
                lead: {
                    select: { schoolName: true }
                }
            },
            orderBy: { dueDate: 'asc' }
        });

        res.json(tasks);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch tasks' });
    }
};
