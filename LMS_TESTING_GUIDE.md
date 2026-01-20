# LMS Testing Guide

## 🧪 Complete Testing Checklist

This guide will help you test all LMS features end-to-end.

---

## 🚀 Setup Steps

### 1. Backend Setup
```bash
# Navigate to backend
cd backend

# Generate Prisma client
npx prisma generate

# Run migration
npx prisma migrate dev

# Start backend server
npm run dev
```

**Expected Output:**
```
Server running on port 3000
Database connected
```

### 2. Frontend Setup
```bash
# Open new terminal
cd frontend

# Start frontend server
npm run dev
```

**Expected Output:**
```
Local: http://localhost:5173
```

---

## 👥 Test Users Setup

You'll need these users to test:
1. **Super Admin** - Full access
2. **Teacher** - Create homework, grade, upload resources
3. **Parent** - View homework, submit, access resources

### Create Test Users (via Platform Admin or Database)
```sql
-- Teacher user
INSERT INTO users (id, email, password, role, fullName, tenantId)
VALUES ('teacher1', 'teacher@school.com', 'hashed_password', 'TEACHER', 'Mr. Banda', 'tenant1');

-- Parent user
INSERT INTO users (id, email, password, role, fullName, tenantId)
VALUES ('parent1', 'parent@school.com', 'hashed_password', 'PARENT', 'Mrs. Mwale', 'tenant1');

-- Link parent to student
INSERT INTO parents (id, userId, tenantId)
VALUES ('parent1', 'parent1', 'tenant1');

UPDATE students SET parentId = 'parent1' WHERE id = 'student1';
```

---

## 🧪 Test Scenarios

### Test 1: Teacher Posts Homework

**Steps:**
1. Login as Teacher
2. Navigate to `/teacher/homework`
3. Click "Post Homework"
4. Fill in form:
   - Class: Grade 10A
   - Subject: Mathematics
   - Title: Exercise 5.1
   - Instructions: Questions 1-5 from textbook page 45
   - Due Date: Tomorrow at 8 AM
   - Max Points: 10
   - Check "Requires submission"
5. Click "Post Homework"

**Expected Result:**
- ✅ Success message appears
- ✅ Homework appears in list
- ✅ Stats update (Total Homework +1)
- ✅ Due date shows correctly

**API Call:**
```
POST /api/v1/homework
Status: 201 Created
```

---

### Test 2: Parent Views Homework

**Steps:**
1. Login as Parent
2. Navigate to `/parent/homework`
3. If multiple children, select child
4. View homework list

**Expected Result:**
- ✅ Homework from Test 1 appears
- ✅ Shows "Not started" status
- ✅ Due date visible
- ✅ Subject and teacher name shown
- ✅ "Submit Work" button visible

**API Call:**
```
GET /api/v1/homework/student?studentId=student1
Status: 200 OK
```

---

### Test 3: Parent Submits Homework

**Steps:**
1. On homework item, click "Submit Work"
2. Enter note: "I completed this in my exercise book"
3. Click "Submit"

**Expected Result:**
- ✅ Success message appears
- ✅ Homework moves to "Completed" section
- ✅ Status changes to "Submitted"
- ✅ Submission time shown

**API Call:**
```
POST /api/v1/homework/hw123/submit?studentId=student1
Status: 200 OK
```

---

### Test 4: Teacher Views Submissions

**Steps:**
1. Login as Teacher
2. Navigate to `/teacher/homework`
3. Click "View Submissions" on homework
4. View submission list

**Expected Result:**
- ✅ Student submission appears
- ✅ Student name and admission number shown
- ✅ Submission time visible
- ✅ Status shows "Pending"
- ✅ Submission note visible
- ✅ Grading form appears

**API Call:**
```
GET /api/v1/homework/hw123/submissions
Status: 200 OK
```

---

### Test 5: Teacher Grades Submission

**Steps:**
1. On submission, enter:
   - Marks: 8
   - Feedback: "Good work! Check question 3."
2. Click "Save"

**Expected Result:**
- ✅ Success message appears
- ✅ Status changes to "Graded"
- ✅ Green checkmark appears
- ✅ Stats update (Graded +1, Pending -1)

**API Call:**
```
POST /api/v1/homework/grade/sub123
Status: 200 OK
```

---

### Test 6: Parent Views Grade

**Steps:**
1. Login as Parent
2. Navigate to `/parent/homework`
3. View completed homework

**Expected Result:**
- ✅ Grade shown: "8/10 (80%)"
- ✅ Feedback visible in blue box
- ✅ Teacher feedback: "Good work! Check question 3."

---

### Test 7: Teacher Bulk Grades

**Steps:**
1. Create homework with multiple submissions
2. Navigate to grading page
3. Enter marks for all students
4. Click "Grade All Pending"

**Expected Result:**
- ✅ Success message: "Graded X submissions successfully!"
- ✅ All submissions marked as "Graded"
- ✅ Stats update correctly

**API Call:**
```
POST /api/v1/homework/grade/bulk
Status: 200 OK
```

---

### Test 8: Teacher Uploads Resource

**Steps:**
1. Login as Teacher
2. Navigate to `/teacher/resources`
3. Click "Upload Resource"
4. Fill in form:
   - Class: Grade 10A
   - Subject: Mathematics
   - Title: Quadratic Equations Notes
   - Description: Complete notes with examples
   - Type: PDF
   - File URL: https://example.com/notes.pdf
   - Check "Allow students to download"
5. Click "Upload Resource"

**Expected Result:**
- ✅ Success message appears
- ✅ Resource appears in grid
- ✅ Stats update (Total Resources +1, PDFs +1)
- ✅ Download button visible

**API Call:**
```
POST /api/v1/resources
Status: 201 Created
```

---

### Test 9: Parent Accesses Resource

**Steps:**
1. Login as Parent
2. Navigate to `/parent/resources`
3. Select child
4. View resources

**Expected Result:**
- ✅ Resource from Test 8 appears
- ✅ Title and description shown
- ✅ Subject and teacher name visible
- ✅ Download button works
- ✅ Opens in new tab

**API Call:**
```
GET /api/v1/resources/student?studentId=student1
Status: 200 OK
```

---

### Test 10: Multi-Child Support

**Steps:**
1. Create parent with 2+ children
2. Login as Parent
3. Navigate to `/parent/homework`
4. Switch between children

**Expected Result:**
- ✅ Child selection buttons appear
- ✅ Active child highlighted
- ✅ Homework updates when switching
- ✅ Stats update per child

**API Call:**
```
GET /api/v1/parent/children
Status: 200 OK
```

---

### Test 11: Late Submission Detection

**Steps:**
1. Create homework with due date in past
2. Parent submits homework

**Expected Result:**
- ✅ Submission marked as "Late"
- ✅ Red "Late" badge appears
- ✅ `isLate: true` in database

---

### Test 12: Prevent Late Submission

**Steps:**
1. Create homework with:
   - Due date in past
   - `allowLateSubmission: false`
2. Parent tries to submit

**Expected Result:**
- ✅ Error message: "Late submissions not allowed"
- ✅ Submission blocked
- ✅ Status code: 400

---

### Test 13: Delete Homework

**Steps:**
1. Login as Teacher
2. Navigate to `/teacher/homework`
3. Click delete on homework
4. Confirm deletion

**Expected Result:**
- ✅ Confirmation dialog appears
- ✅ Homework removed from list
- ✅ Stats update

**API Call:**
```
DELETE /api/v1/homework/hw123
Status: 200 OK
```

---

### Test 14: Delete Resource

**Steps:**
1. Login as Teacher
2. Navigate to `/teacher/resources`
3. Click trash icon on resource
4. Confirm deletion

**Expected Result:**
- ✅ Confirmation dialog appears
- ✅ Resource removed from grid
- ✅ Stats update

**API Call:**
```
DELETE /api/v1/resources/res123
Status: 200 OK
```

---

### Test 15: Role-Based Access

**Steps:**
1. Login as Parent
2. Try to access `/teacher/homework`

**Expected Result:**
- ✅ Redirected or blocked
- ✅ Error message shown
- ✅ No access to teacher features

---

### Test 16: Subscription Enforcement

**Steps:**
1. Expire tenant subscription
2. Try to access LMS features

**Expected Result:**
- ✅ Blocked with error message
- ✅ Redirect to subscription page
- ✅ Status code: 403

---

## 📊 Performance Tests

### Test 17: Bulk Grading Performance

**Steps:**
1. Create homework
2. Create 40 student submissions
3. Bulk grade all 40

**Expected Result:**
- ✅ Completes in < 5 seconds
- ✅ All 40 graded successfully
- ✅ No errors or timeouts

---

### Test 18: Homework List Performance

**Steps:**
1. Create 100+ homework items
2. Load teacher homework page

**Expected Result:**
- ✅ Loads in < 2 seconds
- ✅ All homework displayed
- ✅ Stats calculated correctly

---

## 🐛 Error Handling Tests

### Test 19: Invalid Student ID

**Steps:**
1. Call API with invalid studentId
```bash
GET /api/v1/homework/student?studentId=invalid
```

**Expected Result:**
- ✅ Status: 404 Not Found
- ✅ Error: "Student not found"

---

### Test 20: Missing Required Fields

**Steps:**
1. Try to create homework without title
```bash
POST /api/v1/homework
{ "classId": "class1", "subjectId": "math" }
```

**Expected Result:**
- ✅ Status: 400 Bad Request
- ✅ Validation error message

---

### Test 21: No Active Academic Term

**Steps:**
1. Deactivate all academic terms
2. Try to create homework

**Expected Result:**
- ✅ Status: 400 Bad Request
- ✅ Error: "No active academic term found"

---

## ✅ Success Criteria

All tests should pass with:
- ✅ No console errors
- ✅ Correct API responses
- ✅ Proper UI updates
- ✅ Data persisted correctly
- ✅ Role-based access enforced
- ✅ Subscription checked
- ✅ Performance within limits

---

## 📝 Test Results Template

```
Test Date: ___________
Tester: ___________

Test 1: Teacher Posts Homework          [ ] Pass [ ] Fail
Test 2: Parent Views Homework           [ ] Pass [ ] Fail
Test 3: Parent Submits Homework         [ ] Pass [ ] Fail
Test 4: Teacher Views Submissions       [ ] Pass [ ] Fail
Test 5: Teacher Grades Submission       [ ] Pass [ ] Fail
Test 6: Parent Views Grade              [ ] Pass [ ] Fail
Test 7: Teacher Bulk Grades             [ ] Pass [ ] Fail
Test 8: Teacher Uploads Resource        [ ] Pass [ ] Fail
Test 9: Parent Accesses Resource        [ ] Pass [ ] Fail
Test 10: Multi-Child Support            [ ] Pass [ ] Fail
Test 11: Late Submission Detection      [ ] Pass [ ] Fail
Test 12: Prevent Late Submission        [ ] Pass [ ] Fail
Test 13: Delete Homework                [ ] Pass [ ] Fail
Test 14: Delete Resource                [ ] Pass [ ] Fail
Test 15: Role-Based Access              [ ] Pass [ ] Fail
Test 16: Subscription Enforcement       [ ] Pass [ ] Fail
Test 17: Bulk Grading Performance       [ ] Pass [ ] Fail
Test 18: Homework List Performance      [ ] Pass [ ] Fail
Test 19: Invalid Student ID             [ ] Pass [ ] Fail
Test 20: Missing Required Fields        [ ] Pass [ ] Fail
Test 21: No Active Academic Term        [ ] Pass [ ] Fail

Overall Result: [ ] All Pass [ ] Some Fail

Notes:
_________________________________
_________________________________
_________________________________
```

---

## 🎉 Ready to Test!

Follow this guide to thoroughly test all LMS features. Report any issues found during testing.

**Good luck! 🚀**
