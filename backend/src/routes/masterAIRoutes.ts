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
} from '../controllers/masterAIController';
import { authenticateToken, authorizeRole } from '../middleware/authMiddleware';

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

// All master AI routes require authentication + SUPER_ADMIN role
router.use(authenticateToken);
router.use(authorizeRole(['SUPER_ADMIN']));

// Audio Features
router.post('/transcribe', upload.single('audio'), transcribeAudio);
router.post('/speech', generateSpeech);

// Voice conversation (two-phase streaming execute)
router.post('/voice-execute-v2', voiceExecuteV2);

// Conversations (ChatGPT-style)
router.post('/conversations', createConversation);
router.get('/conversations', getConversations);
router.get('/conversations/:id', getConversation);
router.patch('/conversations/:id', updateConversation);
router.delete('/conversations/:id', deleteConversation);

// Execute a natural language command (within a conversation)
router.post('/execute', executeCommand);

export default router;
