const Attendance = require('../models/Attendance');
const Student = require('../models/Student');

// Get all attendance records
exports.getAllAttendance = async (req, res) => {
  try {
    const { student, date, startDate, endDate, classId } = req.query;
    let query = {};
    
    if (student) query.student = student;
    if (classId) query.class = classId;
    
    if (date) {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);
      query.date = { $gte: startOfDay, $lte: endOfDay };
    } else if (startDate && endDate) {
      query.date = { $gte: new Date(startDate), $lte: new Date(endDate) };
    }
    
    const attendance = await Attendance.find(query)
      .populate('student', 'firstName lastName studentId classLevel grade')
      .populate('class', 'name grade')
      .populate('markedBy', 'firstName lastName')
      .sort({ date: -1 });
    
    res.json(attendance);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get single attendance record
exports.getAttendance = async (req, res) => {
  try {
    const attendance = await Attendance.findById(req.params.id)
      .populate('student', 'firstName lastName studentId classLevel grade')
      .populate('class', 'name grade')
      .populate('markedBy', 'firstName lastName');
    
    if (!attendance) {
      return res.status(404).json({ message: 'Attendance record not found' });
    }
    res.json(attendance);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Mark attendance (create/update)
exports.markAttendance = async (req, res) => {
  try {
    const { student, date, status, class: classId, notes, markedBy } = req.body;
    
    // Check if attendance already exists for this student and date
    const attendanceDate = new Date(date);
    attendanceDate.setHours(0, 0, 0, 0);
    const endOfDay = new Date(attendanceDate);
    endOfDay.setHours(23, 59, 59, 999);
    
    let attendance = await Attendance.findOne({
      student,
      date: { $gte: attendanceDate, $lte: endOfDay }
    });
    
    if (attendance) {
      // Update existing attendance
      attendance.status = status;
      if (classId) attendance.class = classId;
      if (notes) attendance.notes = notes;
      if (markedBy) attendance.markedBy = markedBy;
      await attendance.save();
    } else {
      // Create new attendance
      attendance = new Attendance({
        student,
        date: attendanceDate,
        status,
        class: classId,
        notes,
        markedBy
      });
      await attendance.save();
    }
    
    const populatedAttendance = await Attendance.findById(attendance._id)
      .populate('student', 'firstName lastName studentId')
      .populate('class', 'name grade');
    
    res.status(201).json(populatedAttendance);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Bulk mark attendance (for marking entire class)
exports.bulkMarkAttendance = async (req, res) => {
  try {
    const { attendanceRecords } = req.body; // Array of { student, status, date, class, markedBy }
    
    const results = [];
    for (const record of attendanceRecords) {
      const attendanceDate = new Date(record.date);
      attendanceDate.setHours(0, 0, 0, 0);
      const endOfDay = new Date(attendanceDate);
      endOfDay.setHours(23, 59, 59, 999);
      
      let attendance = await Attendance.findOne({
        student: record.student,
        date: { $gte: attendanceDate, $lte: endOfDay }
      });
      
      if (attendance) {
        attendance.status = record.status;
        if (record.class) attendance.class = record.class;
        if (record.markedBy) attendance.markedBy = record.markedBy;
        await attendance.save();
      } else {
        attendance = new Attendance({
          student: record.student,
          date: attendanceDate,
          status: record.status,
          class: record.class,
          markedBy: record.markedBy
        });
        await attendance.save();
      }
      
      results.push(attendance);
    }
    
    res.status(201).json(results);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Get attendance statistics
exports.getAttendanceStats = async (req, res) => {
  try {
    const { startDate, endDate, classId } = req.query;
    let query = {};
    
    if (startDate && endDate) {
      query.date = { $gte: new Date(startDate), $lte: new Date(endDate) };
    }
    if (classId) query.class = classId;
    
    const attendance = await Attendance.find(query);
    
    const stats = {
      total: attendance.length,
      present: attendance.filter(a => a.status === 'Present').length,
      absent: attendance.filter(a => a.status === 'Absent').length,
      late: attendance.filter(a => a.status === 'Late').length,
      excused: attendance.filter(a => a.status === 'Excused').length
    };
    
    stats.attendanceRate = stats.total > 0 
      ? ((stats.present + stats.late) / stats.total * 100).toFixed(2) 
      : 0;
    
    res.json(stats);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Delete attendance record
exports.deleteAttendance = async (req, res) => {
  try {
    const attendance = await Attendance.findByIdAndDelete(req.params.id);
    if (!attendance) {
      return res.status(404).json({ message: 'Attendance record not found' });
    }
    res.json({ message: 'Attendance record deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
