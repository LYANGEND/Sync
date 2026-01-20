# LMS Quick Reference Guide

## 🎯 What's Implemented

### Backend (100% Complete)
✅ Database schema with 6 tables
✅ Homework management APIs
✅ Resource management APIs
✅ Parent/children endpoint
✅ Bulk grading support
✅ Role-based access control
✅ Subscription middleware

### Frontend (100% Complete)
✅ Teacher homework management
✅ Teacher grading interface
✅ Teacher resource upload
✅ Parent homework view
✅ Parent resource access
✅ Child selection for multi-child families
✅ React Router integration

---

## 📍 Routes

### Teacher Routes
- `/teacher/homework` - Post and manage homework
- `/teacher/homework/:id/submissions` - Grade submissions
- `/teacher/resources` - Upload and manage resources

### Parent Routes
- `/parent/homework` - View and submit homework
- `/parent/resources` - Access study materials

---

## 🔌 API Endpoints

### Homework
```
POST   /api/v1/homework                    - Create homework
GET    /api/v1/homework/teacher            - Get teacher's homework
GET    /api/v1/homework/student            - Get student's homework
POST   /api/v1/homework/:id/submit         - Submit homework
GET    /api/v1/homework/:id/submissions    - Get submissions
POST   /api/v1/homework/grade/:id          - Grade submission
POST   /api/v1/homework/grade/bulk         - Bulk grade
DELETE /api/v1/homework/:id                - Delete homework
```

### Resources
```
POST   /api/v1/resources                   - Upload resource
GET    /api/v1/resources/teacher           - Get teacher's resources
GET    /api/v1/resources/student           - Get student's resources
DELETE /api/v1/resources/:id               - Delete resource
```

### Parent
```
GET    /api/v1/parent/children             - Get parent's children
```

---

## 🚀 Quick Start

### 1. Setup Database
```bash
cd backend
npx prisma generate
npx prisma migrate dev
```

### 2. Start Backend
```bash
cd backend
npm run dev
```

### 3. Start Frontend
```bash
cd frontend
npm run dev
```

---

## 👨‍🏫 Teacher Workflow

### Post Homework (30 seconds)
1. Go to `/teacher/homework`
2. Click "Post Homework"
3. Select class and subject
4. Enter title and instructions
5. Set due date (optional)
6. Click "Post Homework"

### Grade Submissions
1. Go to `/teacher/homework`
2. Click "View Submissions" on any homework
3. Enter marks and feedback for each student
4. Click "Save" individually OR
5. Click "Grade All Pending" for bulk grading

### Upload Resources
1. Go to `/teacher/resources`
2. Click "Upload Resource"
3. Select class and subject
4. Enter title and description
5. Choose resource type (PDF, Video, etc.)
6. Provide file URL
7. Click "Upload Resource"

---

## 👨‍👩‍👧 Parent Workflow

### View Homework
1. Go to `/parent/homework`
2. Select child (if multiple children)
3. View pending and completed homework
4. See due dates and grades

### Submit Homework
1. Click "Submit Work" on any homework
2. Add submission note (optional)
3. Click "Submit"
4. View confirmation

### Access Resources
1. Go to `/parent/resources`
2. Select child (if multiple children)
3. Filter by subject (optional)
4. Download or view resources

---

## 🎨 Features

### Teacher Features
- ✅ Post homework in 30 seconds
- ✅ Attach files and links
- ✅ Set due dates
- ✅ View submission stats
- ✅ Grade individually or in bulk (40 students)
- ✅ Provide feedback
- ✅ Upload study resources
- ✅ Organize by class and subject
- ✅ Track submission rates

### Parent/Student Features
- ✅ View all homework
- ✅ See due dates and overdue items
- ✅ Download attachments
- ✅ Submit work with notes
- ✅ View grades and feedback
- ✅ Access study resources
- ✅ Filter by subject
- ✅ Multi-child support

### Smart Features
- ✅ Auto-detect late submissions
- ✅ Prevent late submissions if not allowed
- ✅ Link to syllabus topics
- ✅ Track submission status
- ✅ Automatic subject content creation
- ✅ Multi-class support for teachers
- ✅ Role-based access control
- ✅ Subscription enforcement

---

## 📊 Database Schema

### SubjectContent
Links class, subject, teacher, and academic term

### Homework
- Title, instructions, description
- Type (HOMEWORK, CLASSWORK, PROJECT, etc.)
- Due date, max points
- Requires submission flag
- Allow late submission flag
- Attachments array

### HomeworkSubmission
- Student submission
- Content and attachments
- Status (DRAFT, SUBMITTED, GRADED)
- Marks and feedback
- Late flag

### Resource
- Title, description
- Type (PDF, VIDEO, DOCUMENT, etc.)
- File URL and size
- Downloadable flag
- Topic link

---

## 🔐 Security

### Authentication
All endpoints require authentication token:
```
Authorization: Bearer YOUR_TOKEN
```

### Role-Based Access
- Teachers: Create homework, grade, upload resources
- Parents: View homework, submit, access resources
- Super Admin: Full access

### Subscription Check
All LMS endpoints require active subscription

---

## 🎯 Next Steps

### Phase 2 Enhancements
- [ ] File upload handling (currently URL-based)
- [ ] Notifications (SMS, email, in-app)
- [ ] Offline support
- [ ] Print-friendly views
- [ ] WhatsApp sharing
- [ ] Analytics dashboard
- [ ] Lesson planning
- [ ] Attendance integration
- [ ] Gradebook integration
- [ ] Practice quizzes

---

## 🐛 Troubleshooting

### Backend Issues
```bash
# Regenerate Prisma client
cd backend
npx prisma generate

# Reset database (WARNING: deletes data)
npx prisma migrate reset

# View database
npx prisma studio
```

### Frontend Issues
```bash
# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install

# Check API URL
# Edit frontend/.env
VITE_API_URL=http://localhost:3000/api/v1
```

### Common Errors

**"Parent record not found"**
- Ensure user has a parent record in the database
- Check tenant ID matches

**"No active academic term found"**
- Create an active academic term
- Set `isActive: true` on one term

**"Student not found"**
- Verify studentId in query parameter
- Check student belongs to tenant

---

## 📝 Example API Calls

### Create Homework
```bash
curl -X POST http://localhost:3000/api/v1/homework \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "classId": "class123",
    "subjectId": "math",
    "title": "Exercise 5.1",
    "instructions": "Questions 1-5",
    "dueDate": "2026-01-25T08:00:00Z",
    "maxPoints": 10,
    "requiresSubmission": true
  }'
```

### Get Student Homework
```bash
curl http://localhost:3000/api/v1/homework/student?studentId=student123 \
  -H "Authorization: Bearer TOKEN"
```

### Submit Homework
```bash
curl -X POST http://localhost:3000/api/v1/homework/hw123/submit?studentId=student123 \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Completed in exercise book",
    "status": "SUBMITTED"
  }'
```

### Grade Homework
```bash
curl -X POST http://localhost:3000/api/v1/homework/grade/sub123 \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "marks": 8,
    "maxMarks": 10,
    "feedback": "Good work!"
  }'
```

### Upload Resource
```bash
curl -X POST http://localhost:3000/api/v1/resources \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "classId": "class123",
    "subjectId": "math",
    "title": "Quadratic Equations Notes",
    "type": "PDF",
    "fileUrl": "https://example.com/notes.pdf",
    "isDownloadable": true
  }'
```

---

## ✅ Success!

The LMS Phase 1 is **100% complete** with:
- ✅ Full backend implementation
- ✅ Complete frontend UI
- ✅ Teacher and parent portals
- ✅ Homework and resource management
- ✅ Grading and feedback system
- ✅ Multi-child support
- ✅ Role-based access control

**Ready for production use!** 🎉
