import { Response } from 'express';
import { TermLifecycleError } from '../services/termLifecycleService';

export const sendTermLifecycleError = (
  res: Response,
  error: TermLifecycleError,
) => res.status(error.statusCode).json({
  error: error.message,
  code: error.code,
});
