import { Router } from 'express';
import multer from 'multer';
import {
  executeCommand,
  createConversation,
  getConversations,
  getConversation,
  updateConversation,
  deleteConversation,
  transcribeAudio,
  generateSpeech,
  voiceExecuteV2,
  confirmAction,
  cancelAction,
} from '../controllers/masterAIController';
import { authenticateToken, authorizeRole } from '../middleware/authMiddleware';
import { aiLimiter } from '../middleware/rateLimiter';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB max
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('audio/')) {
      cb(null, true);
    } else {
      cb(new Error('Only audio files are allowed'));
    }
  },
});

// Admins get every tool; teachers get a scoped subset enforced in masterAIService (TEACHER_TOOLS).
router.use(authenticateToken);
router.use(authorizeRole(['SUPER_ADMIN', 'TEACHER']));

// Audio Features
router.post('/transcribe', aiLimiter, upload.single('audio'), transcribeAudio);
router.post('/speech', aiLimiter, generateSpeech);

// Voice conversation (two-phase streaming execute)
router.post('/voice-execute-v2', aiLimiter, voiceExecuteV2);

// Conversations (ChatGPT-style)
router.post('/conversations', createConversation);
router.get('/conversations', getConversations);
router.get('/conversations/:id', getConversation);
router.patch('/conversations/:id', updateConversation);
router.delete('/conversations/:id', deleteConversation);

// Execute a natural language command (within a conversation)
router.post('/execute', aiLimiter, executeCommand);

// Confirm or cancel a plan held for confirmation (deletes, messages, announcements)
router.post('/confirm', aiLimiter, confirmAction);
router.post('/cancel', cancelAction);

export default router;
