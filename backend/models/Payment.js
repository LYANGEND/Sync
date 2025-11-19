const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  currency: {
    type: String,
    default: 'ZMW'
  },
  paymentType: {
    type: String,
    enum: ['Tuition Fee', 'Examination Fee', 'Activity Fee', 'Other'],
    required: true
  },
  paymentMethod: {
    type: String,
    enum: ['Cash', 'Mobile Money', 'Bank Transfer', 'Cheque'],
    required: true
  },
  term: {
    type: String,
    enum: ['Term 1', 'Term 2', 'Term 3'],
    required: true
  },
  academicYear: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['Paid', 'Partial', 'Pending'],
    default: 'Pending'
  },
  paidAmount: {
    type: Number,
    default: 0
  },
  balanceOwed: {
    type: Number,
    default: 0
  },
  paymentDate: {
    type: Date,
    default: Date.now
  },
  notes: {
    type: String,
    trim: true
  },
  receiptNumber: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

// Calculate balance before saving
paymentSchema.pre('save', function(next) {
  this.balanceOwed = this.amount - this.paidAmount;
  
  if (this.paidAmount === 0) {
    this.status = 'Pending';
  } else if (this.paidAmount < this.amount) {
    this.status = 'Partial';
  } else {
    this.status = 'Paid';
  }
  
  next();
});

// Index for queries
paymentSchema.index({ student: 1, term: 1, academicYear: 1 });
paymentSchema.index({ status: 1 });

module.exports = mongoose.model('Payment', paymentSchema);
