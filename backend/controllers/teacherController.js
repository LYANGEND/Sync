const Teacher = require('../models/Teacher');

// Get all teachers
exports.getAllTeachers = async (req, res) => {
  try {
    const { search } = req.query;
    let query = { isActive: true };
    
    if (search) {
      query.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { teacherId: { $regex: search, $options: 'i' } }
      ];
    }
    
    const teachers = await Teacher.find(query).sort({ lastName: 1, firstName: 1 });
    res.json(teachers);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get single teacher
exports.getTeacher = async (req, res) => {
  try {
    const teacher = await Teacher.findById(req.params.id);
    if (!teacher) {
      return res.status(404).json({ message: 'Teacher not found' });
    }
    res.json(teacher);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Create teacher
exports.createTeacher = async (req, res) => {
  try {
    const teacher = new Teacher(req.body);
    const newTeacher = await teacher.save();
    res.status(201).json(newTeacher);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Update teacher
exports.updateTeacher = async (req, res) => {
  try {
    const teacher = await Teacher.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!teacher) {
      return res.status(404).json({ message: 'Teacher not found' });
    }
    res.json(teacher);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Delete teacher (soft delete)
exports.deleteTeacher = async (req, res) => {
  try {
    const teacher = await Teacher.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );
    if (!teacher) {
      return res.status(404).json({ message: 'Teacher not found' });
    }
    res.json({ message: 'Teacher deactivated successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
