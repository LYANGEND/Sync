# Setup Instructions - Voice AI Tutor & Online Classes

## ✅ What's Been Done

1. ✅ Installed `openai` package (includes Azure OpenAI support)
2. ✅ Added all necessary Prisma models to schema
3. ✅ Generated Prisma client
4. ✅ Created all controller files
5. ✅ Created all route files
6. ✅ Created frontend components
7. ✅ Created comprehensive documentation

## 🔧 What You Need to Do

### Step 1: Restart TypeScript Server (IMPORTANT!)

The TypeScript errors you're seeing are because VS Code hasn't picked up the regenerated Prisma client.

**Fix**: Restart TypeScript Server
- Press `Ctrl+Shift+P`
- Type "TypeScript: Restart TS Server"
- Press Enter

Or just restart VS Code.

### Step 2: Start Your Database

```bash
# Start PostgreSQL (via Docker Compose)
docker compose up -d postgres

# Or if using docker-compose
docker-compose up -d postgres
```

### Step 3: Run Database Migration

```bash
cd backend
npx prisma migrate dev --name add_voice_tutor_and_online_classes
```

This will create all the new tables:
- `voice_sessions`
- `voice_messages`
- `tutor_context`
- `ai_content`
- `class_sessions`
- `class_participants`
- `class_materials`
- `video_lessons`
- `video_progress`

### Step 4: Configure Environment Variables

Add to `backend/.env`:

```env
# Azure OpenAI (for Voice AI Tutor)
AZURE_OPENAI_API_KEY=your-azure-key
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com/
AZURE_OPENAI_DEPLOYMENT_NAME=gpt-4o
AZURE_OPENAI_WHISPER_DEPLOYMENT=whisper
AZURE_OPENAI_TTS_DEPLOYMENT=tts
AZURE_OPENAI_API_VERSION=2024-08-01-preview

# Agora.io (for Live Classes) - OPTION A
AGORA_APP_ID=your-agora-app-id
AGORA_APP_CERTIFICATE=your-agora-certificate

# OR Azure Communication Services - OPTION B
AZURE_COMMUNICATION_CONNECTION_STRING=your-connection-string
```

### Step 5: Register Routes

Edit `backend/src/app.ts` and add:

```typescript
import voiceTutorRoutes from './routes/voiceTutorRoutes';
import liveClassRoutes from './routes/liveClassRoutes';
import videoLessonRoutes from './routes/videoLessonRoutes';

// Add these lines after other routes
app.use('/api/v1/voice-tutor', voiceTutorRoutes);
app.use('/api/v1/live-classes', liveClassRoutes);
app.use('/api/v1/video-lessons', videoLessonRoutes);
```

### Step 6: Add Frontend Routes

Edit `frontend/src/App.tsx` and add:

```typescript
import VoiceTutor from './pages/student/VoiceTutor';
import LiveClassroom from './pages/student/LiveClassroom';

// Add these routes
<Route path="/student/voice-tutor" element={<VoiceTutor />} />
<Route path="/student/live-class/:sessionId" element={<LiveClassroom />} />
```

### Step 7: Test

```bash
# Start backend
cd backend
npm run dev

# Start frontend (in another terminal)
cd frontend
npm run dev
```

Navigate to:
- Voice Tutor: `http://localhost:3000/student/voice-tutor`
- Live Class: `http://localhost:3000/student/live-class/{session-id}`

---

## 📚 Documentation

### Quick Starts
- **Azure OpenAI**: `AZURE_SETUP_QUICKSTART.md` (20 min)
- **Voice Tutor**: `docs/VOICE_TUTOR_QUICK_START.md` (15 min)
- **Online Classes**: `docs/ONLINE_CLASSES_QUICK_START.md` (30 min)

### Detailed Guides
- **Azure OpenAI Setup**: `docs/AZURE_OPENAI_SETUP.md`
- **Voice Tutor Implementation**: `docs/VOICE_AI_TUTOR_IMPLEMENTATION.md`
- **Online Classes Implementation**: `docs/ONLINE_CLASSES_IMPLEMENTATION.md`
- **Azure Communication Services**: `docs/AZURE_COMMUNICATION_SERVICES_SETUP.md`

### Decision Guides
- **Virtual Classroom Comparison**: `docs/VIRTUAL_CLASSROOM_COMPARISON.md`
- **Complete Platform Summary**: `COMPLETE_PLATFORM_SUMMARY.md`

---

## 🐛 Troubleshooting

### TypeScript Errors Still Showing?

1. Restart TypeScript Server (Ctrl+Shift+P → "TypeScript: Restart TS Server")
2. Restart VS Code
3. Delete `node_modules` and reinstall: `npm install`
4. Regenerate Prisma client: `npx prisma generate`

### Database Connection Error?

```bash
# Check if PostgreSQL is running
docker ps

# Start it if not running
docker compose up -d postgres

# Check connection
psql "host=localhost port=5432 dbname=sync_db user=sync_user password=sync_password"
```

### Migration Fails?

```bash
# Reset database (WARNING: Deletes all data!)
npx prisma migrate reset

# Or create migration without applying
npx prisma migrate dev --create-only
```

---

## 💰 Cost Summary

### For 500 Students

| Service | Monthly Cost |
|---------|-------------|
| Azure OpenAI (Voice Tutor) | $450 |
| Agora.io (Live Classes) | $237 |
| Video Storage | $9 |
| Database | $20 |
| Hosting | $50 |
| **Total** | **$766** |

**Revenue**: K50,000/month ($3,000) at K100/student
**Profit**: $2,234/month (74% margin)

---

## 🎯 Next Steps

1. ✅ Fix TypeScript errors (restart TS server)
2. ✅ Run database migration
3. ✅ Configure environment variables
4. ✅ Register routes
5. ✅ Test voice tutor
6. ✅ Test live classes
7. 📊 Launch pilot program
8. 📈 Scale to all students

---

## 📞 Need Help?

- Check documentation in `docs/` folder
- Review error logs in backend console
- Check Azure Portal for service health
- Verify all environment variables are set

**Your platform is ready to transform education!** 🚀🎓
