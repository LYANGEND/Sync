/**
 * Term Financial Routes
 * 
 * API endpoints for term-based financial operations
 */

import express from 'express';
import termFinancialService from '../services/termFinancialService';
import { authenticateToken as authenticate } from '../middleware/authMiddleware';

const router = express.Router();

/**
 * GET /api/v1/financial/terms
 * Get all term financial summaries
 */
router.get('/terms', authenticate, async (req, res) => {
  try {
    const { branchId } = req.query;
    
    const summaries = await termFinancialService.getAllTermSummaries(
      branchId as string | undefined
    );

    res.json({
      success: true,
      data: summaries
    });
  } catch (error: any) {
    console.error('Error fetching term summaries:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch term summaries',
      error: error.message
    });
  }
});

/**
 * GET /api/v1/financial/terms/:termId/summary
 * Get financial summary for a specific term
 */
router.get('/terms/:termId/summary', authenticate, async (req, res) => {
  try {
    const { termId } = req.params;
    const { branchId } = req.query;

    const summary = await termFinancialService.getTermFinancialSummary(
      termId,
      branchId as string | undefined
    );

    if (!summary) {
      return res.status(404).json({
        success: false,
        message: 'Term not found'
      });
    }

    res.json({
      success: true,
      data: summary
    });
  } catch (error: any) {
    console.error('Error fetching term summary:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch term summary',
      error: error.message
    });
  }
});

/**
 * GET /api/v1/financial/terms/:termId/outstanding
 * Get all students with outstanding balances for a term
 */
router.get('/terms/:termId/outstanding', authenticate, async (req, res) => {
  try {
    const { termId } = req.params;
    const { branchId } = req.query;

    const outstandingBalances = await termFinancialService.getTermOutstandingBalances(
      termId,
      branchId as string | undefined
    );

    res.json({
      success: true,
      data: outstandingBalances,
      count: outstandingBalances.length
    });
  } catch (error: any) {
    console.error('Error fetching outstanding balances:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch outstanding balances',
      error: error.message
    });
  }
});

/**
 * GET /api/v1/financial/terms/compare
 * Compare financial performance across multiple terms
 */
router.get('/terms/compare', authenticate, async (req, res) => {
  try {
    const { termIds, branchId } = req.query;

    if (!termIds) {
      return res.status(400).json({
        success: false,
        message: 'termIds query parameter is required (comma-separated)'
      });
    }

    const termIdArray = (termIds as string).split(',').map(id => id.trim());

    if (termIdArray.length < 2) {
      return res.status(400).json({
        success: false,
        message: 'At least 2 term IDs are required for comparison'
      });
    }

    const comparison = await termFinancialService.compareTerms(
      termIdArray,
      branchId as string | undefined
    );

    res.json({
      success: true,
      data: comparison
    });
  } catch (error: any) {
    console.error('Error comparing terms:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to compare terms',
      error: error.message
    });
  }
});

/**
 * GET /api/v1/financial/students/:studentId/fees-by-term
 * Get student's fee breakdown across all terms
 */
router.get('/students/:studentId/fees-by-term', authenticate, async (req, res) => {
  try {
    const { studentId } = req.params;

    const feesByTerm = await termFinancialService.getStudentFeesByTerm(studentId);

    res.json({
      success: true,
      data: feesByTerm
    });
  } catch (error: any) {
    console.error('Error fetching student fees by term:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch student fees by term',
      error: error.message
    });
  }
});

/**
 * POST /api/v1/financial/terms/:termId/recalculate
 * Recalculate financial summary for a term
 */
router.post('/terms/:termId/recalculate', authenticate, async (req, res) => {
  try {
    const { termId } = req.params;
    const { branchId } = req.body;

    await termFinancialService.recalculateTermSummary(
      termId,
      branchId
    );

    const updatedSummary = await termFinancialService.getTermFinancialSummary(
      termId,
      branchId
    );

    res.json({
      success: true,
      message: 'Term financial summary recalculated successfully',
      data: updatedSummary
    });
  } catch (error: any) {
    console.error('Error recalculating term summary:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to recalculate term summary',
      error: error.message
    });
  }
});

export default router;
