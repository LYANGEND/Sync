const mongoose = require('mongoose');

const classSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
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
  section: {
    type: String,
    trim: true
  },
  teacher: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Teacher'
  },
  academicYear: {
    type: String,
    required: true
  },
  capacity: {
    type: Number,
    default: 40
  },
  room: {
    type: String,
    trim: true
  },
  schedule: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

classSchema.index({ classLevel: 1, grade: 1 });
classSchema.index({ teacher: 1 });

module.exports = mongoose.model('Class', classSchema);
