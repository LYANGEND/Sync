import { Router } from 'express';
import multer from 'multer';
import {
  exportSchoolData,
  getDataManagementSummary,
  importSchoolData,
  previewSchoolDataImport,
} from '../controllers/dataManagementController';
import { authenticateToken, authorizeRole } from '../middleware/authMiddleware';
import { MAX_ARCHIVE_UPLOAD_BYTES } from '../services/schoolDataArchiveService';

const router = Router();
const archiveUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: 1,
    fileSize: MAX_ARCHIVE_UPLOAD_BYTES,
  },
});

router.use(authenticateToken, authorizeRole(['SUPER_ADMIN']));

router.get('/summary', getDataManagementSummary);
router.get('/export', exportSchoolData);
router.post('/import/preview', archiveUpload.single('archive'), previewSchoolDataImport);
router.post('/import', archiveUpload.single('archive'), importSchoolData);

export default router;
