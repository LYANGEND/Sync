import { Response } from 'express';
import { PaymentSettlementError } from '../services/paymentSettlementService';

export const sendPaymentSettlementError = (
  res: Response,
  error: PaymentSettlementError,
) => res.status(error.status).json({
  error: error.message,
  code: error.code,
});
