# Voice-Interactive AI Tutor Implementation Guide

## Overview

This guide provides a complete implementation of a voice-interactive AI tutor that can:
- Listen to student questions via voice
- Explain lessons conversationally
- Respond with natural speech
- Maintain context across conversations
- Support multiple languages (English + Zambian languages)

---

## Architecture

```
Student speaks → Speech-to-Text → AI Processing → Text-to-Speech → Student hears
                      ↓                ↓                ↓
                  Transcription    Context-aware    Natural voice
                                   Response         Output
```

---

## Technology Stack

### Speech-to-Text Options
1. **OpenAI Whisper API** (Recommended)
   - Cost: $0.006/minute
   - Supports 50+ languages
   - High accuracy
   
2. **Google Cloud Speech-to-Text**
   - Cost: $0.006/15 seconds
   - Good for real-time streaming
   
3. **Web Speech API** (Browser-based)
   - Free
   - Limited browser support
   - Requires internet

### AI Processing
- **OpenAI GPT-4o** (Recommended for voice)
  - Native audio understanding
  - Context-aware responses
  - Cost: $5/1M input tokens, $15/1M output tokens


### Text-to-Speech Options
1. **OpenAI TTS** (Recommended)
   - Cost: $15/1M characters
   - Natural voices (6 options)
   - Low latency
   
2. **Google Cloud TTS**
   - Cost: $4/1M characters
   - WaveNet voices
   - Multiple accents
   
3. **ElevenLabs** (Premium)
   - Cost: $0.30/1K characters
   - Most natural voices
   - Voice cloning available

---

## Database Schema

```typescript
// Add to backend/prisma/schema.prisma

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
  duration    Int?     // seconds
  
  messages    VoiceMessage[]
  
  @@map("voice_sessions")
}

model VoiceMessage {
  id              String   @id @default(uuid())
  sessionId       String
  session         VoiceSession @relation(fields: [sessionId], references: [id])
  
  role            String   // "student" or "tutor"
  audioUrl        String?  // S3 URL for student's audio
  transcription   String   @db.Text
  response        String?  @db.Text
  responseAudioUrl String? // S3 URL for tutor's audio
  
  language        String   @default("en")
  duration        Int?     // milliseconds
  
  createdAt       DateTime @default(now())
  
  @@map("voice_messages")
}

model TutorContext {
  id          String   @id @default(uuid())
  studentId   String   @unique
  student     Student  @relation(fields: [studentId], references: [id])
  
  currentTopic String?
  recentTopics String[] // Array of topic IDs
  learningStyle String? // "visual", "auditory", "kinesthetic"
  preferredLanguage String @default("en")
  
  weakAreas   Json?    // { "mathematics": ["fractions", "algebra"] }
  strengths   Json?
  
  updatedAt   DateTime @updatedAt
  
  @@map("tutor_context")
}
```

---

## Backend Implementation



### Controller: `backend/src/controllers/voiceTutorController.ts`

Key features implemented:
- **startVoiceSession**: Initialize tutoring session with welcome message
- **processVoiceMessage**: Handle voice input → transcription → AI response → TTS
- **explainLesson**: Generate comprehensive lesson explanation with voice
- **Context Management**: Track student's learning history and preferences

---

## Frontend Implementation

### Component: `frontend/src/pages/student/VoiceTutor.tsx`

Features:
- **Voice Recording**: Browser-based audio capture
- **Real-time Transcription**: Display what student said
- **Audio Playback**: Play tutor responses
- **Auto-play Mode**: Automatically play responses
- **Language Selection**: Support multiple languages
- **Lesson Explanation**: Request full lesson walkthrough

---

## Setup Instructions

### 1. Install Dependencies

```bash
# Backend
cd backend
npm install openai multer @types/multer

# Frontend (already has required packages)
```

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

Update existing models to add relations:

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

### 3. Run Migrations

```bash
cd backend
npx prisma migrate dev --name add_voice_tutor
npx prisma generate
```

### 4. Configure Environment Variables

Add to `backend/.env`:

```env
OPENAI_API_KEY=sk-your-api-key-here
```

### 5. Register Routes

Update `backend/src/app.ts`:

```typescript
import voiceTutorRoutes from './routes/voiceTutorRoutes';

// ... existing code

app.use('/api/v1/voice-tutor', voiceTutorRoutes);
```

### 6. Create Upload Directories

```bash
mkdir -p backend/uploads/audio/temp
mkdir -p backend/uploads/audio
```

### 7. Add Route to Frontend

Update `frontend/src/App.tsx`:

```typescript
import VoiceTutor from './pages/student/VoiceTutor';

// In your routes:
<Route path="/student/voice-tutor" element={<VoiceTutor />} />
<Route path="/student/voice-tutor/:topicId" element={<VoiceTutor />} />
```

---

## Usage Examples

### 1. Start Voice Tutoring Session

```typescript
// Student clicks "Voice Tutor" button
POST /api/v1/voice-tutor/sessions/start
Body: {
  "topicId": "uuid-of-topic",
  "language": "en"
}

Response: {
  "sessionId": "session-uuid",
  "welcomeMessage": "Hello John! I'm here to help...",
  "welcomeAudioUrl": "/uploads/audio/welcome-123.mp3"
}
```

### 2. Send Voice Message

```typescript
// Student records audio and sends
POST /api/v1/voice-tutor/sessions/message
FormData: {
  audio: <audio-file>,
  sessionId: "session-uuid",
  language: "en"
}

Response: {
  "messageId": "msg-uuid",
  "transcription": "Can you explain photosynthesis?",
  "response": "Great question! Photosynthesis is how plants make food...",
  "audioUrl": "/uploads/audio/response-456.mp3"
}
```

### 3. Request Lesson Explanation

```typescript
POST /api/v1/voice-tutor/explain-lesson
Body: {
  "topicId": "uuid-of-topic",
  "language": "en"
}

Response: {
  "explanation": "Let me explain photosynthesis step by step...",
  "audioUrl": "/uploads/audio/lesson-789.mp3",
  "topic": {
    "id": "topic-uuid",
    "title": "Photosynthesis"
  }
}
```

---

## Advanced Features

### 1. Conversation Context

The AI tutor maintains context across messages:

```typescript
// Previous messages are included in AI prompt
const conversationHistory = session.messages.map(msg => [
  { role: 'user', content: msg.transcription },
  { role: 'assistant', content: msg.response }
]).flat();
```

### 2. Personalized Teaching

The system adapts to each student:

```typescript
// System prompt includes:
- Student's grade level
- Current topic
- Known weak areas
- Learning style preference
- Recent topics studied
```

### 3. Socratic Method

The AI asks guiding questions instead of giving direct answers:

```
Student: "What is 5 + 3?"
Tutor: "Good question! Let's think about it together. 
       If you have 5 mangoes and your friend gives you 3 more, 
       how many do you have in total?"
```

### 4. Local Context

Uses Zambian examples:

```
Explaining fractions:
"If you buy a loaf of bread for K15 and share it equally 
with 2 friends, each person gets 1/3 of the bread, 
which costs K5."
```

---

## Mobile Optimization

### Progressive Web App Features

```javascript
// frontend/src/sw.js (Service Worker)

// Cache audio responses for offline playback
self.addEventListener('fetch', (event) => {
  if (event.request.url.includes('/uploads/audio/')) {
    event.respondWith(
      caches.match(event.request).then((response) => {
        return response || fetch(event.request).then((fetchResponse) => {
          return caches.open('audio-cache').then((cache) => {
            cache.put(event.request, fetchResponse.clone());
            return fetchResponse;
          });
        });
      })
    );
  }
});
```

### Low-Bandwidth Mode

```typescript
// Compress audio before sending
const compressAudio = async (audioBlob: Blob): Promise<Blob> => {
  // Use lower bitrate for mobile networks
  const audioContext = new AudioContext();
  const arrayBuffer = await audioBlob.arrayBuffer();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
  
  // Encode at lower quality (32kbps)
  // Implementation depends on codec
  
  return compressedBlob;
};
```

---

## Cost Optimization

### 1. Use Cheaper Models for Simple Queries

```typescript
// For simple questions, use gpt-4o-mini
const model = isComplexQuery(message) ? 'gpt-4o' : 'gpt-4o-mini';
```

### 2. Cache Common Responses

```typescript
// Cache frequently asked questions
const cachedResponse = await redis.get(`faq:${questionHash}`);
if (cachedResponse) {
  return cachedResponse;
}
```

### 3. Batch TTS Requests

```typescript
// Generate audio for multiple responses at once
const audioPromises = responses.map(text => textToSpeech(text));
const audioUrls = await Promise.all(audioPromises);
```

### 4. Use Streaming for Long Responses

```typescript
// Stream AI response instead of waiting for full completion
const stream = await openai.chat.completions.create({
  model: 'gpt-4o',
  messages: [...],
  stream: true,
});

for await (const chunk of stream) {
  // Send chunks to frontend as they arrive
  res.write(chunk.choices[0]?.delta?.content || '');
}
```

---

## Testing

### 1. Test Voice Recording

```typescript
// Test microphone access
navigator.mediaDevices.getUserMedia({ audio: true })
  .then(stream => console.log('Microphone OK'))
  .catch(err => console.error('Microphone error:', err));
```

### 2. Test API Endpoints

```bash
# Test transcription
curl -X POST http://localhost:5000/api/v1/voice-tutor/sessions/start \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"language": "en"}'

# Test with audio file
curl -X POST http://localhost:5000/api/v1/voice-tutor/sessions/message \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "audio=@test-audio.webm" \
  -F "sessionId=session-uuid" \
  -F "language=en"
```

### 3. Test AI Responses

```typescript
// Unit test for AI prompt generation
describe('Voice Tutor', () => {
  it('should generate appropriate system prompt', () => {
    const prompt = buildSystemPrompt(mockSession, mockContext, 'en');
    expect(prompt).toContain('Grade 8');
    expect(prompt).toContain('Socratic method');
  });
});
```

---

## Troubleshooting

### Issue: Microphone not working

**Solution**: Check browser permissions and HTTPS requirement

```typescript
// Check if HTTPS or localhost
if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
  alert('Voice features require HTTPS');
}
```

### Issue: Audio playback fails

**Solution**: Handle autoplay restrictions

```typescript
// Request user interaction first
const playWithFallback = async (url: string) => {
  try {
    await audio.play();
  } catch (err) {
    // Show play button if autoplay blocked
    setShowPlayButton(true);
  }
};
```

### Issue: High API costs

**Solution**: Implement rate limiting

```typescript
// Limit requests per student
const rateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 requests per minute
  message: 'Too many requests, please slow down',
});

router.use('/voice-tutor', rateLimiter);
```

---

## Future Enhancements

1. **Emotion Detection**: Analyze student's tone to detect frustration
2. **Multi-turn Conversations**: Remember context across sessions
3. **Voice Cloning**: Create custom tutor voices
4. **Real-time Translation**: Instant translation between languages
5. **Pronunciation Feedback**: Help students improve speaking
6. **Group Study Sessions**: Multiple students with one AI tutor
7. **Parent Monitoring**: Parents can review tutoring sessions
8. **Gamification**: Earn points for asking good questions

---

## Security Considerations

1. **Audio Storage**: Encrypt audio files at rest
2. **PII Protection**: Don't include personal info in AI prompts
3. **Rate Limiting**: Prevent abuse of API
4. **Content Filtering**: Block inappropriate questions
5. **Session Timeout**: Auto-end inactive sessions

---

## Success Metrics

Track these KPIs:

```typescript
// Analytics to implement
interface VoiceTutorMetrics {
  totalSessions: number;
  avgSessionDuration: number;
  questionsPerSession: number;
  studentSatisfaction: number; // 1-5 rating
  topicsExplained: string[];
  mostAskedQuestions: string[];
  responseAccuracy: number; // % of helpful responses
}
```

---

## Conclusion

This voice-interactive AI tutor provides:
- ✅ Natural conversation with students
- ✅ Voice input and output
- ✅ Context-aware responses
- ✅ Lesson explanations
- ✅ Personalized teaching
- ✅ Multi-language support
- ✅ Mobile-optimized

**Estimated Cost**: $0.50-1.00 per student per month
**Implementation Time**: 2-3 days
**Impact**: 24/7 personalized tutoring for all students

Start with a pilot program in 1-2 classes, gather feedback, then scale!
