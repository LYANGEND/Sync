const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema({
  firstName: {
    type: String,
    required: true,
    trim: true
  },
  lastName: {
    type: String,
    required: true,
    trim: true
  },
  studentId: {
    type: String,
    required: true,
    unique: true
  },
  classLevel: {
    type: String,
    enum: ['Baby', 'Primary', 'Secondary'],
    required: true
  },
  grade: {
    type: String,
    required: true
  },
  dateOfBirth: {
    type: Date,
    required: true
  },
  gender: {
    type: String,
    enum: ['Male', 'Female'],
    required: true
  },
  parentName: {
    type: String,
    required: true,
    trim: true
  },
  parentPhone: {
    type: String,
    required: true
  },
  parentEmail: {
    type: String,
    trim: true
  },
  address: {
    type: String,
    trim: true
  },
  enrollmentDate: {
    type: Date,
    default: Date.now
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Index for faster queries
studentSchema.index({ classLevel: 1, grade: 1 });
studentSchema.index({ studentId: 1 });

module.exports = mongoose.model('Student', studentSchema);
