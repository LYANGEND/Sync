const Class = require('../models/Class');
const Student = require('../models/Student');

// Get all classes
exports.getAllClasses = async (req, res) => {
  try {
    const { classLevel, grade, academicYear } = req.query;
    let query = {};
    
    if (classLevel) query.classLevel = classLevel;
    if (grade) query.grade = grade;
    if (academicYear) query.academicYear = academicYear;
    
    const classes = await Class.find(query)
      .populate('teacher', 'firstName lastName email')
      .sort({ classLevel: 1, grade: 1 });
    
    res.json(classes);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get single class
exports.getClass = async (req, res) => {
  try {
    const classData = await Class.findById(req.params.id)
      .populate('teacher', 'firstName lastName email phone');
    
    if (!classData) {
      return res.status(404).json({ message: 'Class not found' });
    }
    res.json(classData);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Create class
exports.createClass = async (req, res) => {
  try {
    const classData = new Class(req.body);
    const newClass = await classData.save();
    
    const populatedClass = await Class.findById(newClass._id)
      .populate('teacher', 'firstName lastName email');
    
    res.status(201).json(populatedClass);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Update class
exports.updateClass = async (req, res) => {
  try {
    const classData = await Class.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).populate('teacher', 'firstName lastName email');
    
    if (!classData) {
      return res.status(404).json({ message: 'Class not found' });
    }
    res.json(classData);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Delete class
exports.deleteClass = async (req, res) => {
  try {
    const classData = await Class.findByIdAndDelete(req.params.id);
    if (!classData) {
      return res.status(404).json({ message: 'Class not found' });
    }
    res.json({ message: 'Class deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get students in a class
exports.getClassStudents = async (req, res) => {
  try {
    const classData = await Class.findById(req.params.id);
    if (!classData) {
      return res.status(404).json({ message: 'Class not found' });
    }
    
    const students = await Student.find({
      classLevel: classData.classLevel,
      grade: classData.grade,
      isActive: true
    }).sort({ lastName: 1, firstName: 1 });
    
    res.json(students);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
