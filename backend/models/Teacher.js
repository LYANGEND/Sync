const mongoose = require('mongoose');

const teacherSchema = new mongoose.Schema({
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
  teacherId: {
    type: String,
    required: true,
    unique: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  phone: {
    type: String,
    required: true
  },
  subject: {
    type: String,
    trim: true
  },
  qualification: {
    type: String,
    trim: true
  },
  dateJoined: {
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

teacherSchema.index({ teacherId: 1 });
teacherSchema.index({ email: 1 });

module.exports = mongoose.model('Teacher', teacherSchema);
