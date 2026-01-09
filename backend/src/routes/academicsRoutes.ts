import { Router } from 'express';
import {
    assignSubjectTeacher,
    getClassSubjectTeachers,
    getTeacherSubjectAssignments
} from '../controllers/academicsController';
import { authenticateToken, authorizeRole } from '../middleware/authMiddleware';

const router = Router();

router.use(authenticateToken);

// Assign a teacher to a subject in a class
router.post('/assign', authorizeRole(['SUPER_ADMIN', 'ADMIN']), assignSubjectTeacher);

// Get assignments for a specific class
router.get('/class/:classId', authorizeRole(['SUPER_ADMIN', 'ADMIN', 'TEACHER', 'BURSAR']), getClassSubjectTeachers);

// Get assignments for a specific teacher
router.get('/teacher/:teacherId', authorizeRole(['SUPER_ADMIN', 'ADMIN', 'TEACHER']), getTeacherSubjectAssignments);

export default router;
