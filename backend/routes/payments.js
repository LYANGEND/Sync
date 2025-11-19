const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');

router.get('/', paymentController.getAllPayments);
router.get('/owing', paymentController.getStudentsOwing);
router.get('/stats', paymentController.getPaymentStats);
router.get('/:id', paymentController.getPayment);
router.post('/', paymentController.createPayment);
router.put('/:id', paymentController.updatePayment);
router.delete('/:id', paymentController.deletePayment);

module.exports = router;
