require('dotenv').config();
const mongoose = require('mongoose');
const Student = require('./models/Student');
const Teacher = require('./models/Teacher');
const Class = require('./models/Class');
const Payment = require('./models/Payment');
const Attendance = require('./models/Attendance');

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/sync-school-management');
    console.log('MongoDB Connected');
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
};

const seedData = async () => {
  try {
    // Clear existing data
    await Student.deleteMany({});
    await Teacher.deleteMany({});
    await Class.deleteMany({});
    await Payment.deleteMany({});
    await Attendance.deleteMany({});
    
    console.log('Cleared existing data');

    // Create Teachers
    const teachers = await Teacher.insertMany([
      {
        firstName: 'Grace',
        lastName: 'Mwansa',
        teacherId: 'T001',
        email: 'grace.mwansa@sync.zm',
        phone: '+260971234567',
        subject: 'Mathematics',
        qualification: 'B.Ed Mathematics'
      },
      {
        firstName: 'Joseph',
        lastName: 'Banda',
        teacherId: 'T002',
        email: 'joseph.banda@sync.zm',
        phone: '+260972345678',
        subject: 'English',
        qualification: 'B.Ed English Literature'
      },
      {
        firstName: 'Mary',
        lastName: 'Phiri',
        teacherId: 'T003',
        email: 'mary.phiri@sync.zm',
        phone: '+260973456789',
        subject: 'Science',
        qualification: 'B.Sc Biology'
      }
    ]);

    console.log('Created teachers');

    // Create Classes
    const classes = await Class.insertMany([
      {
        name: 'Baby Class A',
        classLevel: 'Baby',
        grade: 'Grade 1',
        teacher: teachers[0]._id,
        academicYear: '2025',
        capacity: 30,
        room: 'Room 101'
      },
      {
        name: 'Primary 5A',
        classLevel: 'Primary',
        grade: 'Grade 5',
        teacher: teachers[1]._id,
        academicYear: '2025',
        capacity: 40,
        room: 'Room 201'
      },
      {
        name: 'Secondary 9B',
        classLevel: 'Secondary',
        grade: 'Grade 9',
        teacher: teachers[2]._id,
        academicYear: '2025',
        capacity: 35,
        room: 'Room 301'
      }
    ]);

    console.log('Created classes');

    // Create Students
    const students = await Student.insertMany([
      {
        firstName: 'Chanda',
        lastName: 'Mulenga',
        studentId: 'STU001',
        classLevel: 'Baby',
        grade: 'Grade 1',
        dateOfBirth: new Date('2018-03-15'),
        gender: 'Female',
        parentName: 'James Mulenga',
        parentPhone: '+260977111222',
        parentEmail: 'james.mulenga@email.com',
        address: 'Plot 123, Lusaka'
      },
      {
        firstName: 'Bwalya',
        lastName: 'Chanda',
        studentId: 'STU002',
        classLevel: 'Primary',
        grade: 'Grade 5',
        dateOfBirth: new Date('2014-07-20'),
        gender: 'Male',
        parentName: 'Patricia Chanda',
        parentPhone: '+260977222333',
        parentEmail: 'patricia.chanda@email.com',
        address: 'House 45, Ndola'
      },
      {
        firstName: 'Thandiwe',
        lastName: 'Kasonde',
        studentId: 'STU003',
        classLevel: 'Secondary',
        grade: 'Grade 9',
        dateOfBirth: new Date('2010-11-10'),
        gender: 'Female',
        parentName: 'David Kasonde',
        parentPhone: '+260977333444',
        parentEmail: 'david.kasonde@email.com',
        address: 'Flat 12B, Kitwe'
      },
      {
        firstName: 'Mwamba',
        lastName: 'Sakala',
        studentId: 'STU004',
        classLevel: 'Primary',
        grade: 'Grade 5',
        dateOfBirth: new Date('2014-05-18'),
        gender: 'Male',
        parentName: 'Grace Sakala',
        parentPhone: '+260977444555',
        address: 'Plot 88, Kabwe'
      },
      {
        firstName: 'Natasha',
        lastName: 'Zulu',
        studentId: 'STU005',
        classLevel: 'Baby',
        grade: 'Grade 1',
        dateOfBirth: new Date('2018-09-22'),
        gender: 'Female',
        parentName: 'Michael Zulu',
        parentPhone: '+260977555666',
        address: 'House 67, Lusaka'
      }
    ]);

    console.log('Created students');

    // Create Payments
    const payments = await Payment.insertMany([
      {
        student: students[0]._id,
        amount: 1500,
        paymentType: 'Tuition Fee',
        paymentMethod: 'Mobile Money',
        term: 'Term 1',
        academicYear: '2025',
        paidAmount: 1500,
        receiptNumber: 'REC001'
      },
      {
        student: students[1]._id,
        amount: 2000,
        paymentType: 'Tuition Fee',
        paymentMethod: 'Cash',
        term: 'Term 1',
        academicYear: '2025',
        paidAmount: 1000,
        receiptNumber: 'REC002'
      },
      {
        student: students[2]._id,
        amount: 2500,
        paymentType: 'Tuition Fee',
        paymentMethod: 'Bank Transfer',
        term: 'Term 1',
        academicYear: '2025',
        paidAmount: 0
      },
      {
        student: students[3]._id,
        amount: 2000,
        paymentType: 'Tuition Fee',
        paymentMethod: 'Mobile Money',
        term: 'Term 1',
        academicYear: '2025',
        paidAmount: 500
      },
      {
        student: students[4]._id,
        amount: 1500,
        paymentType: 'Tuition Fee',
        paymentMethod: 'Cash',
        term: 'Term 1',
        academicYear: '2025',
        paidAmount: 1500,
        receiptNumber: 'REC003'
      }
    ]);

    console.log('Created payments');

    // Create Attendance records for today
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    await Attendance.insertMany([
      {
        student: students[0]._id,
        date: today,
        status: 'Present',
        class: classes[0]._id,
        markedBy: teachers[0]._id
      },
      {
        student: students[1]._id,
        date: today,
        status: 'Present',
        class: classes[1]._id,
        markedBy: teachers[1]._id
      },
      {
        student: students[2]._id,
        date: today,
        status: 'Absent',
        class: classes[2]._id,
        markedBy: teachers[2]._id
      },
      {
        student: students[3]._id,
        date: today,
        status: 'Late',
        class: classes[1]._id,
        markedBy: teachers[1]._id
      },
      {
        student: students[4]._id,
        date: today,
        status: 'Present',
        class: classes[0]._id,
        markedBy: teachers[0]._id
      }
    ]);

    console.log('Created attendance records');
    console.log('Seed data created successfully!');
    
    process.exit(0);
  } catch (error) {
    console.error('Error seeding data:', error);
    process.exit(1);
  }
};

connectDB().then(() => seedData());
