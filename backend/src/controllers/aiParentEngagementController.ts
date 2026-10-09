/**
 * AI Parent Engagement Controller
 * Handles HTTP requests for AI-powered parent communication
 */

import { Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
import * as aiParentEngagement from '../services/aiParentEngagementService';

/**
 * POST /api/v1/ai-parent-engagement/weekly-update
 * Generate a weekly update for a student
 */
export const generateWeeklyUpdate = async (req: AuthRequest, res: Response) => {
  try {
    const { studentId, academicTermId } = req.body;

    if (!studentId || !academicTermId) {
      return res.status(400).json({ error: 'studentId and academicTermId are required' });
    }

    const update = await aiParentEngagement.generateWeeklyUpdate(studentId, academicTermId);

    res.json(update);
  } catch (error: any) {
    console.error('Weekly update generation error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to generate weekly update' 
    });
  }
};

/**
 * POST /api/v1/ai-parent-engagement/early-warnings
 * Detect early warning signs for a student
 */
export const detectEarlyWarnings = async (req: AuthRequest, res: Response) => {
  try {
    const { studentId, academicTermId } = req.body;

    if (!studentId || !academicTermId) {
      return res.status(400).json({ error: 'studentId and academicTermId are required' });
    }

    const warnings = await aiParentEngagement.detectEarlyWarnings(studentId, academicTermId);

    res.json(warnings);
  } catch (error: any) {
    console.error('Early warning detection error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to detect early warnings' 
    });
  }
};

/**
 * POST /api/v1/ai-parent-engagement/interventions
 * Get intervention recommendations for a student
 */
export const suggestInterventions = async (req: AuthRequest, res: Response) => {
  try {
    const { studentId, academicTermId, issueType } = req.body;

    if (!studentId || !academicTermId) {
      return res.status(400).json({ error: 'studentId and academicTermId are required' });
    }

    const interventions = await aiParentEngagement.suggestInterventions(
      studentId,
      academicTermId,
      issueType
    );

    res.json(interventions);
  } catch (error: any) {
    console.error('Intervention suggestion error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to suggest interventions' 
    });
  }
};
