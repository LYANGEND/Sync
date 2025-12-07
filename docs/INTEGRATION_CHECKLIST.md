# Voice AI Tutor - Integration Checklist

Use this checklist to integrate the Voice AI Tutor into your existing Sync platform.

## ☑️ Pre-requisites

- [ ] OpenAI account created
- [ ] API key obtained (starts with `sk-`)
- [ ] Backend running (Node.js + Express)
- [ ] Frontend running (React + Vite)
- [ ] PostgreSQL database accessible
- [ ] Prisma configured

## ☑️ Backend Integration

### 1. Install Dependencies
```bash
cd backend
npm install openai multer @types/multer
```
- [ ] Dependencies installed successfully

### 2. Update Prisma Schema
Add to `backend/prisma/schema.prisma`:

```prisma
model VoiceSession {
  id          String   @id @default(uuid())
  studentId   String
  student     Student  @relation(fields: [studentId], references: [id])
  topicId     String?
  topic       Topic?   @relation(fields: [topicId], references: [id])
  subjectId   String?
  subject     Subject? @relation(fields: [subjectId], references: [id])
  startedAt   DateTime @default(now())
  endedAt     DateTime?
  duration    Int?
  messages    VoiceMessage[]
  @@map("voice_sessions")
}

model VoiceMessage {
  id              String   @id @default(uuid())
  sessionId       String
  session         VoiceSession @relation(fields: [sessionId], references: [id])
  role            String
  audioUrl        String?
  transcription   String   @db.Text
  response        String?  @db.Text
  responseAudioUrl String?
  language        String   @default("en")
  duration        Int?
  createdAt       DateTime @default(now())
  @@map("voice_messages")
}

model TutorContext {
  id          String   @id @default(uuid())
  studentId   String   @unique
  student     Student  @relation(fields: [studentId], references: [id])
  currentTopic String?
  recentTopics String[]
  learningStyle String?
  preferredLanguage String @default("en")
  weakAreas   Json?
  strengths   Json?
  updatedAt   DateTime @updatedAt
  @@map("tutor_context")
}

model AIContent {
  id          String   @id @default(uuid())
  topicId     String?
  topic       Topic?   @relation(fields: [topicId], references: [id])
  contentType String
  prompt      String   @db.Text
  generatedContent String @db.Text
  gradeLevel  Int
  subjectId   String
  subject     Subject  @relation(fields: [subjectId], references: [id])
  createdAt   DateTime @default(now())
  @@map("ai_content")
}
```

Update existing models:
```prisma
model Student {
  // ... existing fields
  voiceSessions VoiceSession[]
  tutorContext  TutorContext?
}

model Topic {
  // ... existing fields
  voiceSessions VoiceSession[]
  aiContent     AIContent[]
}

model Subject {
  // ... existing fields
  voiceSessions VoiceSession[]
  aiContent     AIContent[]
}
```

- [ ] Schema updated

### 3. Run Migration
```bash
npx prisma migrate dev --name add_voice_tutor
npx prisma generate
```
- [ ] Migration successful
- [ ] Prisma client regenerated

### 4. Create Upload Directories
```bash
mkdir -p uploads/audio/temp
mkdir -p uploads/audio
chmod 755 uploads/audio
chmod 755 uploads/audio/temp
```
- [ ] Directories created

### 5. Add Environment Variable
Add to `backend/.env`:
```env
OPENAI_API_KEY=sk-your-actual-key-here
```
- [ ] API key added
- [ ] Key tested (make a test API call)

### 6. Copy Controller File
Copy `backend/src/controllers/voiceTutorController.ts` to your project
- [ ] File copied
- [ ] No import errors

### 7. Copy Routes File
Copy `backend/src/routes/voiceTutorRoutes.ts` to your project
- [ ] File copied
- [ ] No import errors

### 8. Register Routes
Edit `backend/src/app.ts`:

```typescript
import voiceTutorRoutes from './routes/voiceTutorRoutes';

// After other routes
app.use('/api/v1/voice-tutor', voiceTutorRoutes);
```
- [ ] Routes registered
- [ ] Server restarts without errors

### 9. Test Backend
```bash
# Test session start
curl -X POST http://localhost:5000/api/v1/voice-tutor/sessions/start \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"language": "en"}'
```
- [ ] Endpoint responds
- [ ] Session created in database

## ☑️ Frontend Integration

### 1. Copy Component Files
Copy these files to your frontend:
- `frontend/src/pages/student/VoiceTutor.tsx`
- `frontend/src/components/VoiceTutorButton.tsx`

- [ ] Files copied
- [ ] No import errors

### 2. Add Routes
Edit `frontend/src/App.tsx`:

```typescript
import VoiceTutor from './pages/student/VoiceTutor';

// In your routes
<Route path="/student/voice-tutor" element={<VoiceTutor />} />
```
- [ ] Route added
- [ ] Page accessible

### 3. Add Access Button
Add to student dashboard or topic pages:

```typescript
import VoiceTutorButton from '../components/VoiceTutorButton';

// In your component
<VoiceTutorButton 
  variant="floating" 
  topicId={currentTopic?.id}
  subjectId={currentSubject?.id}
/>
```
- [ ] Button added
- [ ] Button visible
- [ ] Button clickable

### 4. Update API Configuration
Ensure `frontend/src/utils/api.ts` includes the base URL:

```typescript
const api = axios.create({
  baseURL: 'http://localhost:5000/api/v1',
  // ... other config
});
```
- [ ] API configured
- [ ] Requests working

## ☑️ Testing

### 1. Microphone Access
- [ ] Browser requests microphone permission
- [ ] Permission granted
- [ ] Recording indicator shows

### 2. Voice Recording
- [ ] Click microphone button
- [ ] Speak a test question
- [ ] Recording stops when button released
- [ ] Processing indicator shows

### 3. Transcription
- [ ] Spoken words appear as text
- [ ] Transcription is accurate
- [ ] No errors in console

### 4. AI Response
- [ ] AI generates response
- [ ] Response is relevant
- [ ] Response appears in chat

### 5. Audio Playback
- [ ] Audio file generated
- [ ] Audio plays automatically (if enabled)
- [ ] Audio is clear and understandable
- [ ] Can replay audio

### 6. Lesson Explanation
- [ ] "Explain Lesson" button works
- [ ] Full lesson explanation generated
- [ ] Audio narration plays
- [ ] Content is educational

### 7. Session History
- [ ] Sessions saved to database
- [ ] Can view past sessions
- [ ] Messages preserved

## ☑️ Production Readiness

### 1. Security
- [ ] HTTPS enabled (required for microphone)
- [ ] API key not exposed in frontend
- [ ] Rate limiting configured
- [ ] Authentication required for all endpoints

### 2. Performance
- [ ] Audio files compressed
- [ ] Responses cached where possible
- [ ] Database queries optimized
- [ ] CDN configured for audio files

### 3. Monitoring
- [ ] Error logging configured
- [ ] Usage metrics tracked
- [ ] Cost monitoring set up
- [ ] Alerts configured

### 4. User Experience
- [ ] Loading states clear
- [ ] Error messages helpful
- [ ] Mobile responsive
- [ ] Offline handling graceful

### 5. Documentation
- [ ] User guide created
- [ ] Teacher training materials ready
- [ ] Support process defined
- [ ] FAQ documented

## ☑️ Deployment

### 1. Environment Variables
Production `.env`:
```env
OPENAI_API_KEY=sk-prod-key
NODE_ENV=production
DATABASE_URL=postgresql://...
```
- [ ] All variables set
- [ ] Keys secured

### 2. File Storage
- [ ] S3 bucket created (or alternative)
- [ ] Upload configured to use S3
- [ ] Audio URLs point to CDN

### 3. Database
- [ ] Production migration run
- [ ] Indexes created
- [ ] Backup configured

### 4. Server
- [ ] Backend deployed
- [ ] Frontend deployed
- [ ] HTTPS configured
- [ ] Domain configured

### 5. Testing in Production
- [ ] Can access voice tutor page
- [ ] Microphone works
- [ ] Recording works
- [ ] AI responds
- [ ] Audio plays

## ☑️ Launch

### 1. Pilot Program
- [ ] Select 10-20 students
- [ ] Provide training
- [ ] Monitor usage
- [ ] Gather feedback

### 2. Iteration
- [ ] Review feedback
- [ ] Fix issues
- [ ] Improve prompts
- [ ] Optimize costs

### 3. Scale
- [ ] Roll out to more students
- [ ] Monitor costs
- [ ] Track metrics
- [ ] Celebrate success! 🎉

## ☑️ Ongoing Maintenance

### Weekly
- [ ] Check error logs
- [ ] Review usage metrics
- [ ] Monitor costs
- [ ] Respond to feedback

### Monthly
- [ ] Analyze session data
- [ ] Update AI prompts
- [ ] Review student satisfaction
- [ ] Optimize performance

### Quarterly
- [ ] Add new features
- [ ] Update documentation
- [ ] Train teachers
- [ ] Assess ROI

---

## 🎯 Success Criteria

Your integration is successful when:
- ✅ Students can have voice conversations with AI
- ✅ Responses are helpful and educational
- ✅ System is stable and performant
- ✅ Costs are within budget
- ✅ Students and teachers are satisfied

## 📞 Support

If you encounter issues:
1. Check the logs (backend console)
2. Review documentation
3. Test API endpoints directly
4. Check OpenAI dashboard for errors
5. Open GitHub issue if needed

---

**Good luck with your launch!** 🚀
