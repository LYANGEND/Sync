const Payment = require('../models/Payment');
const Student = require('../models/Student');

// Get all payments
exports.getAllPayments = async (req, res) => {
  try {
    const { student, status, term, academicYear } = req.query;
    let query = {};
    
    if (student) query.student = student;
    if (status) query.status = status;
    if (term) query.term = term;
    if (academicYear) query.academicYear = academicYear;
    
    const payments = await Payment.find(query)
      .populate('student', 'firstName lastName studentId classLevel grade')
      .sort({ paymentDate: -1 });
    
    res.json(payments);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get single payment
exports.getPayment = async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id)
      .populate('student', 'firstName lastName studentId classLevel grade parentName parentPhone');
    
    if (!payment) {
      return res.status(404).json({ message: 'Payment not found' });
    }
    res.json(payment);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Create payment
exports.createPayment = async (req, res) => {
  try {
    const payment = new Payment(req.body);
    const newPayment = await payment.save();
    
    const populatedPayment = await Payment.findById(newPayment._id)
      .populate('student', 'firstName lastName studentId');
    
    res.status(201).json(populatedPayment);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Update payment
exports.updatePayment = async (req, res) => {
  try {
    const payment = await Payment.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).populate('student', 'firstName lastName studentId');
    
    if (!payment) {
      return res.status(404).json({ message: 'Payment not found' });
    }
    res.json(payment);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Delete payment
exports.deletePayment = async (req, res) => {
  try {
    const payment = await Payment.findByIdAndDelete(req.params.id);
    if (!payment) {
      return res.status(404).json({ message: 'Payment not found' });
    }
    res.json({ message: 'Payment deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get students owing money
exports.getStudentsOwing = async (req, res) => {
  try {
    const { term, academicYear } = req.query;
    let query = { status: { $in: ['Pending', 'Partial'] } };
    
    if (term) query.term = term;
    if (academicYear) query.academicYear = academicYear;
    
    const owingPayments = await Payment.find(query)
      .populate('student', 'firstName lastName studentId classLevel grade parentName parentPhone')
      .sort({ balanceOwed: -1 });
    
    // Group by student
    const studentOwings = {};
    owingPayments.forEach(payment => {
      const studentId = payment.student._id.toString();
      if (!studentOwings[studentId]) {
        studentOwings[studentId] = {
          student: payment.student,
          totalOwed: 0,
          payments: []
        };
      }
      studentOwings[studentId].totalOwed += payment.balanceOwed;
      studentOwings[studentId].payments.push({
        _id: payment._id,
        amount: payment.amount,
        paidAmount: payment.paidAmount,
        balanceOwed: payment.balanceOwed,
        paymentType: payment.paymentType,
        term: payment.term,
        status: payment.status
      });
    });
    
    const result = Object.values(studentOwings).sort((a, b) => b.totalOwed - a.totalOwed);
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get payment statistics
exports.getPaymentStats = async (req, res) => {
  try {
    const { term, academicYear } = req.query;
    let query = {};
    
    if (term) query.term = term;
    if (academicYear) query.academicYear = academicYear;
    
    const payments = await Payment.find(query);
    
    const stats = {
      totalExpected: payments.reduce((sum, p) => sum + p.amount, 0),
      totalPaid: payments.reduce((sum, p) => sum + p.paidAmount, 0),
      totalOwed: payments.reduce((sum, p) => sum + p.balanceOwed, 0),
      paidCount: payments.filter(p => p.status === 'Paid').length,
      partialCount: payments.filter(p => p.status === 'Partial').length,
      pendingCount: payments.filter(p => p.status === 'Pending').length
    };
    
    res.json(stats);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
