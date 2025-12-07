# Online Classes & Video School - Quick Start

## What's Included

✅ **Live Virtual Classrooms** - Real-time video conferencing with Agora.io
✅ **Video Library** - Upload and manage recorded lessons
✅ **Progress Tracking** - Track student video watch progress
✅ **Session Management** - Schedule and manage live classes
✅ **Attendance Tracking** - Automatic attendance from live sessions
✅ **Analytics** - View engagement metrics and completion rates

---

## Quick Setup (30 minutes)

### Step 1: Get Agora.io Account (10 minutes)

1. Go to [agora.io](https://www.agora.io)
2. Sign up for free account
3. Create a new project
4. Get credentials:
   - **App ID** (public)
   - **App Certificate** (secret)

**Free Tier**: 10,000 minutes/month

---

### Step 2: Install Dependencies (5 minutes)

```bash
# Backend
cd backend
npm install agora-access-token

# Frontend
cd frontend
npm install agora-rtc-sdk-ng
```

---

### Step 3: Configure Environment (2 minutes)

Add to `backend/.env`:

```env
# Agora.io Configuration
AGORA_APP_ID=your-app-id-here
AGORA_APP_CERTIFICATE=your-app-certificate-here
```

---

### Step 4: Database Migration (3 minutes)

```bash
cd backend

# Add schema to prisma/schema.prisma (see docs/ONLINE_CLASSES_IMPLEMENTATION.md)

# Run migration
npx prisma migrate dev --name add_online_classes
npx prisma generate
```

---

### Step 5: Register Routes (2 minutes)

Edit `backend/src/app.ts`:

```typescript
import liveClassRoutes from './routes/liveClassRoutes';
import videoLessonRoutes from './routes/videoLessonRoutes';

// Add routes
app.use('/api/v1/live-classes', liveClassRoutes);
app.use('/api/v1/video-lessons', videoLessonRoutes);
```

---

### Step 6: Add Frontend Routes (2 minutes)

Edit `frontend/src/App.tsx`:

```typescript
import LiveClassroom from './pages/student/LiveClassroom';
import VideoLibrary from './pages/student/VideoLibrary';

// Add routes
<Route path="/student/live-class/:sessionId" element={<LiveClassroom />} />
<Route path="/student/video-library" element={<VideoLibrary />} />
```

---

### Step 7: Test (5 minutes)

```bash
# Start backend
cd backend
npm run dev

# Start frontend
cd frontend
npm run dev

# Create a test session via API or admin panel
# Join the session from student account
```

---

## Usage Examples

### Teacher: Schedule a Live Class

```typescript
POST /api/v1/live-classes/sessions
{
  "title": "Mathematics - Algebra Basics",
  "description": "Introduction to algebraic expressions",
  "classId": "class-uuid",
  "subjectId": "subject-uuid",
  "termId": "term-uuid",
  "scheduledStart": "2024-12-10T10:00:00Z",
  "scheduledEnd": "2024-12-10T11:00:00Z",
  "type": "LIVE_CLASS",
  "allowRecording": true,
  "autoRecord": true
}
```

### Student: Join Live Class

1. Navigate to `/student/live-class/{sessionId}`
2. Preview camera
3. Click "Join Class"
4. Interact with video, audio, chat

### Teacher: Upload Video Lesson

```typescript
POST /api/v1/video-lessons/videos
{
  "title": "Photosynthesis Explained",
  "description": "Complete guide to photosynthesis process",
  "subjectId": "biology-uuid",
  "gradeLevel": 10,
  "videoUrl": "https://cdn.example.com/video.mp4",
  "thumbnailUrl": "https://cdn.example.com/thumb.jpg",
  "duration": 1200,
  "tags": ["biology", "plants", "science"]
}
```

### Student: Watch Video

1. Navigate to `/student/video-library`
2. Browse or search videos
3. Click video to watch
4. Progress automatically tracked

---

## Cost Estimates

### Agora.io Pricing

**Free Tier**: 10,000 minutes/month

**Paid Tier**:
- Video: $0.99/1000 minutes
- Recording: $1.49/1000 minutes

### Example: 500 Students

Assuming 2 hours of live classes per week:

```
Students: 500
Hours per week: 2
Weeks per month: 4
Total minutes: 500 × 2 × 60 × 4 = 240,000 minutes

Cost: 240,000 / 1000 × $0.99 = $237.60/month
```

### Video Storage (Azure Blob)

```
Average video: 500MB
Videos per month: 20
Storage: 10GB = $0.20/month
Bandwidth: 100GB = $8.70/month

Total: ~$9/month
```

**Total Monthly Cost**: ~$250 for 500 students

---

## Features Overview

### Live Classroom Features

- ✅ HD video (up to 1080p)
- ✅ Screen sharing
- ✅ Audio controls (mute/unmute)
- ✅ Video controls (camera on/off)
- ✅ Raise hand
- ✅ Chat messaging
- ✅ Participant list
- ✅ Automatic recording
- ✅ Attendance tracking

### Video Library Features

- ✅ Upload videos
- ✅ Video player with controls
- ✅ Playback speed (0.5x - 2x)
- ✅ Progress tracking
- ✅ Resume where left off
- ✅ Search and filter
- ✅ Tags and categories
- ✅ View analytics

### Teacher Dashboard

- ✅ Schedule classes
- ✅ View attendance
- ✅ Upload materials
- ✅ Manage recordings
- ✅ View engagement metrics
- ✅ Upload video lessons
- ✅ Track video views

---

## Mobile Support

The live classroom works on mobile browsers:

**Supported**:
- Chrome (Android)
- Safari (iOS 12.2+)

**Limitations**:
- iOS Safari requires user interaction before camera/mic access
- Some older devices may have performance issues

---

## Troubleshooting

### Camera/Microphone Not Working

**Fix**: Check browser permissions

```javascript
// Test permissions
navigator.mediaDevices.getUserMedia({ video: true, audio: true })
  .then(stream => console.log('Permissions OK'))
  .catch(err => console.error('Permission denied:', err));
```

### High Latency

**Fix**: Use Agora's SD-RTN (Software Defined Real-time Network)
- Automatically routes through nearest edge server
- Typical latency: 200-400ms globally

### Video Not Loading

**Fix**: Check video URL is accessible
- Use CDN for video hosting
- Enable CORS headers
- Test URL in browser

---

## Next Steps

1. ✅ Set up Agora.io account
2. ✅ Configure environment
3. ✅ Run migrations
4. ✅ Test live classroom
5. 📊 Add analytics dashboard
6. 📱 Optimize for mobile
7. 🎥 Set up video CDN
8. 📧 Add email notifications

---

## Full Documentation

- **Implementation Guide**: `docs/ONLINE_CLASSES_IMPLEMENTATION.md`
- **API Reference**: Check controller files
- **Agora Docs**: https://docs.agora.io

---

**Ready to launch online classes!** 🎓📹
