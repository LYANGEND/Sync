# Online Classes & Video School Implementation

## Overview

Complete implementation of live virtual classrooms and video-on-demand learning platform integrated with the Sync school management system.

## Features

### 1. Live Virtual Classrooms
- Real-time video conferencing
- Screen sharing for presentations
- Interactive whiteboard
- Chat and Q&A
- Raise hand feature
- Automatic attendance tracking
- Session recording

### 2. Video Library
- Upload and manage recorded lessons
- Video player with progress tracking
- Playback speed control
- Closed captions/subtitles
- Download for offline viewing
- Video search and filtering

### 3. Scheduled Classes
- Calendar view of upcoming classes
- Email/SMS reminders
- Join links sent automatically
- Recurring class support
- Class materials attachment

---

## Technology Stack

### Option A: Agora.io (Recommended for Africa)
**Pros:**
- Excellent performance in Africa
- $0.99/1000 minutes
- Easy integration
- Built-in recording
- Low latency

**Cons:**
- Paid service
- Requires API key

### Option B: Daily.co
**Pros:**
- $0.002/participant/minute
- Very easy to integrate
- Great developer experience
- Built-in UI components

**Cons:**
- Slightly higher latency in Africa

### Option C: Jitsi Meet (Self-hosted)
**Pros:**
- Free and open source
- Full control
- No per-minute costs

**Cons:**
- Requires server infrastructure
- More complex setup
- Need to manage TURN servers

**Recommendation**: Start with **Agora.io** for reliability, switch to self-hosted Jitsi if costs become prohibitive.

---

## Database Schema

```prisma
// Add to backend/prisma/schema.prisma

enum ClassSessionStatus {
  SCHEDULED
  LIVE
  ENDED
  CANCELLED
}

enum ClassSessionType {
  LIVE_CLASS
  RECORDED_LESSON
  HYBRID
}

model ClassSession {
  id          String   @id @default(uuid())
  title       String
  description String?  @db.Text
  
  classId     String
  class       Class    @relation(fields: [classId], references: [id])
  subjectId   String
  subject     Subject  @relation(fields: [subjectId], references: [id])
  teacherId   String
  teacher     User     @relation("TeacherSessions", fields: [teacherId], references: [id])
  termId      String
  term        AcademicTerm @relation(fields: [termId], references: [id])
  
  type        ClassSessionType
  status      ClassSessionStatus @default(SCHEDULED)
  
  scheduledStart DateTime
  scheduledEnd   DateTime
  actualStart    DateTime?
  actualEnd      DateTime?
  
  // Live class details
  meetingId      String?  @unique
  meetingUrl     String?
  meetingPassword String?
  
  // Recording details
  recordingUrl   String?
  recordingDuration Int?  // seconds
  
  // Materials
  materials      ClassMaterial[]
  participants   ClassParticipant[]
  
  // Settings
  allowRecording Boolean @default(true)
  autoRecord     Boolean @default(true)
  maxParticipants Int?
  
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  @@map("class_sessions")
}

model ClassParticipant {
  id          String   @id @default(uuid())
  sessionId   String
  session     ClassSession @relation(fields: [sessionId], references: [id])
  
  userId      String
  user        User     @relation(fields: [userId], references: [id])
  
  role        String   // "teacher", "student", "observer"
  
  joinedAt    DateTime?
  leftAt      DateTime?
  duration    Int?     // seconds
  
  // Engagement metrics
  cameraOn    Boolean  @default(false)
  micOn       Boolean  @default(false)
  chatMessages Int     @default(0)
  
  createdAt   DateTime @default(now())
  
  @@unique([sessionId, userId])
  @@map("class_participants")
}

model ClassMaterial {
  id          String   @id @default(uuid())
  sessionId   String
  session     ClassSession @relation(fields: [sessionId], references: [id])
  
  title       String
  description String?
  fileUrl     String
  fileType    String   // "pdf", "pptx", "docx", "video", "link"
  fileSize    Int?     // bytes
  
  uploadedBy  String
  uploader    User     @relation(fields: [uploadedBy], references: [id])
  
  createdAt   DateTime @default(now())
  
  @@map("class_materials")
}

model VideoLesson {
  id          String   @id @default(uuid())
  title       String
  description String?  @db.Text
  
  topicId     String?
  topic       Topic?   @relation(fields: [topicId], references: [id])
  subjectId   String
  subject     Subject  @relation(fields: [subjectId], references: [id])
  gradeLevel  Int
  
  // Video details
  videoUrl    String
  thumbnailUrl String?
  duration    Int      // seconds
  fileSize    Int?     // bytes
  
  // Metadata
  transcript  String?  @db.Text
  tags        String[]
  
  uploadedBy  String
  teacher     User     @relation(fields: [uploadedBy], references: [id])
  
  // Analytics
  viewCount   Int      @default(0)
  
  progress    VideoProgress[]
  
  isPublished Boolean  @default(false)
  publishedAt DateTime?
  
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  @@map("video_lessons")
}

model VideoProgress {
  id          String   @id @default(uuid())
  videoId     String
  video       VideoLesson @relation(fields: [videoId], references: [id])
  studentId   String
  student     Student  @relation(fields: [studentId], references: [id])
  
  watchedSeconds Int   @default(0)
  completed   Boolean  @default(false)
  lastPosition Int     @default(0)  // Resume position
  
  lastWatched DateTime @updatedAt
  createdAt   DateTime @default(now())
  
  @@unique([videoId, studentId])
  @@map("video_progress")
}

// Update existing models
model User {
  // ... existing fields
  teacherSessions ClassSession[] @relation("TeacherSessions")
  classParticipants ClassParticipant[]
  uploadedMaterials ClassMaterial[]
  uploadedVideos VideoLesson[]
}

model Class {
  // ... existing fields
  sessions ClassSession[]
}

model Subject {
  // ... existing fields
  sessions ClassSession[]
  videoLessons VideoLesson[]
}

model AcademicTerm {
  // ... existing fields
  sessions ClassSession[]
}

model Topic {
  // ... existing fields
  videoLessons VideoLesson[]
}

model Student {
  // ... existing fields
  videoProgress VideoProgress[]
}
```

---

## Implementation Steps

### Phase 1: Database & Backend Setup
### Phase 2: Live Classes with Agora.io
### Phase 3: Video Library
### Phase 4: Frontend UI
### Phase 5: Mobile Optimization

Let's start with Phase 1...
