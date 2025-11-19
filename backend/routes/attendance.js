const express = require('express');
const router = express.Router();
const attendanceController = require('../controllers/attendanceController');

router.get('/', attendanceController.getAllAttendance);
router.get('/stats', attendanceController.getAttendanceStats);
router.get('/:id', attendanceController.getAttendance);
router.post('/', attendanceController.markAttendance);
router.post('/bulk', attendanceController.bulkMarkAttendance);
router.delete('/:id', attendanceController.deleteAttendance);

module.exports = router;
