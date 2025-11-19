const Student = require('../models/Student');
const Payment = require('../models/Payment');

// Get all students
exports.getAllStudents = async (req, res) => {
  try {
    const { classLevel, grade, search } = req.query;
    let query = { isActive: true };
    
    if (classLevel) query.classLevel = classLevel;
    if (grade) query.grade = grade;
    if (search) {
      query.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { studentId: { $regex: search, $options: 'i' } }
      ];
    }
    
    const students = await Student.find(query).sort({ lastName: 1, firstName: 1 });
    res.json(students);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get single student
exports.getStudent = async (req, res) => {
  try {
    const student = await Student.findById(req.params.id);
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }
    res.json(student);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Create student
exports.createStudent = async (req, res) => {
  try {
    const student = new Student(req.body);
    const newStudent = await student.save();
    res.status(201).json(newStudent);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Update student
exports.updateStudent = async (req, res) => {
  try {
    const student = await Student.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }
    res.json(student);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Delete student (soft delete)
exports.deleteStudent = async (req, res) => {
  try {
    const student = await Student.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }
    res.json({ message: 'Student deactivated successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get students with payment status
exports.getStudentsWithPaymentStatus = async (req, res) => {
  try {
    const { term, academicYear } = req.query;
    
    const students = await Student.find({ isActive: true });
    
    const studentsWithPayments = await Promise.all(
      students.map(async (student) => {
        let paymentQuery = { student: student._id };
        if (term) paymentQuery.term = term;
        if (academicYear) paymentQuery.academicYear = academicYear;
        
        const payments = await Payment.find(paymentQuery);
        const totalOwed = payments.reduce((sum, p) => sum + p.balanceOwed, 0);
        const totalPaid = payments.reduce((sum, p) => sum + p.paidAmount, 0);
        
        return {
          ...student.toObject(),
          totalOwed,
          totalPaid,
          hasOutstanding: totalOwed > 0
        };
      })
    );
    
    res.json(studentsWithPayments);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
