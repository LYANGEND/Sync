# Role-Based Access Control (RBAC) Guide

## Overview
The Sync LMS system uses Role-Based Access Control to ensure users see only the features and content appropriate for their role.

## How It Works

### 1. User Roles
The system supports the following roles:
- `SUPER_ADMIN` - Full system access
- `TEACHER` - Teacher-specific features
- `STUDENT` - Student-specific features
- `PARENT` - Parent-specific features
- `BURSAR` - Finance-specific features
- `SECRETARY` - Administrative features

### 2. Authentication Flow

```
User Login → JWT Token Generated → Token Contains User Role → Frontend Stores User Data → Routes Check Role
```

#### Backend (Authentication)
```typescript
// backend/src/middleware/auth.ts
// Verifies JWT token and attaches user to request
export const authenticate = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  const decoded = jwt.verify(token, JWT_SECRET);
  req.user = await prisma.user.findUnique({ where: { id: decoded.userId } });
  next();
};
```

#### Frontend (Context)
```typescript
// frontend/src/context/AuthContext.tsx
// Stores authenticated user data including role
const AuthContext = createContext({
  user: { id, email, fullName, role, tenantId },
  login, logout, isLoading
});
```

### 3. Route Protection

#### RoleGuard Component
```typescript
// frontend/src/components/layout/RoleGuard.tsx
const RoleGuard = ({ children, allowedRoles }) => {
  const { user } = useAuth();
  
  if (!user || !allowedRoles.includes(user.role)) {
    return <Navigate to={user ? "/" : "/login"} />;
  }
  
  return <>{children}</>;
};
```

#### Usage in Routes
```typescript
// frontend/src/App.tsx
<Route path="/teacher/homework" element={
  <RoleGuard allowedRoles={['TEACHER', 'SUPER_ADMIN']}>
    <TeacherHomework />
  </RoleGuard>
} />
```

### 4. Dashboard Routing

#### Automatic Role-Based Redirect
```typescript
// frontend/src/pages/dashboard/Dashboard.tsx
const Dashboard = () => {
  const { user } = useAuth();
  
  // Parents redirected to children page
  if (user?.role === 'PARENT') {
    return <Navigate to="/my-children" replace />;
  }
  
  // Teachers see teacher dashboard
  if (data?.role === 'TEACHER') {
    return <TeacherDashboardView />;
  }
  
  // Admins/Bursars see admin dashboard
  return <AdminDashboardView />;
};
```

## Teacher Platform Access

### What Teachers See

#### 1. Dashboard (/)
When teachers log in and navigate to `/`, they see:
- Welcome message with their name
- Today's class schedule
- Pending homework to grade
- Attendance status
- Recent assessments
- Quick action buttons

#### 2. Teacher-Specific Routes
Teachers have access to:

| Route | Purpose | Access |
|-------|---------|--------|
| `/teacher/homework` | Create and manage homework | TEACHER, SUPER_ADMIN |
| `/teacher/homework/:id/submissions` | Grade homework submissions | TEACHER, SUPER_ADMIN |
| `/teacher/resources` | Upload and manage resources | TEACHER, SUPER_ADMIN |
| `/teacher/video-lessons` | Manage video lessons | TEACHER, SUPER_ADMIN |
| `/academics` | Academic management | TEACHER, SUPER_ADMIN |
| `/academics/gradebook` | View and manage grades | TEACHER, SUPER_ADMIN |
| `/academics/attendance` | Take attendance | TEACHER, SUPER_ADMIN, SECRETARY |
| `/students` | View student list | TEACHER, SUPER_ADMIN, BURSAR, SECRETARY |
| `/ai-teacher` | AI teaching assistant | ALL ROLES |

#### 3. Sidebar Navigation
Teachers see a customized sidebar with:
- Dashboard
- Students
- Academics (Gradebook, Attendance, Report Cards)
- Teacher section (Homework, Resources, Video Lessons)
- Communication
- AI Teacher
- Profile

### Ensuring Teachers See Teacher Platform

#### Step 1: Verify User Role in Database
```sql
-- Check user role
SELECT id, email, fullName, role FROM "User" WHERE email = 'teacher@school.com';

-- Update user role if needed
UPDATE "User" SET role = 'TEACHER' WHERE email = 'teacher@school.com';
```

#### Step 2: Verify Teacher Record Exists
```sql
-- Check if teacher record exists
SELECT * FROM "Teacher" WHERE "userId" = 'user-id-here';

-- Create teacher record if missing
INSERT INTO "Teacher" ("id", "userId", "tenantId", "fullName", "email", "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'user-id', 'tenant-id', 'Teacher Name', 'teacher@school.com', NOW(), NOW());
```

#### Step 3: Clear Browser Cache
Sometimes old authentication data can cause issues:
1. Open browser DevTools (F12)
2. Go to Application tab
3. Clear Local Storage
4. Clear Session Storage
5. Refresh page and log in again

#### Step 4: Verify JWT Token
```javascript
// In browser console
const token = localStorage.getItem('token');
const payload = JSON.parse(atob(token.split('.')[1]));
console.log('User Role:', payload.role);
```

#### Step 5: Check Backend Response
```javascript
// In browser console or Network tab
fetch('/api/v1/dashboard/stats', {
  headers: {
    'Authorization': `Bearer ${localStorage.getItem('token')}`
  }
})
.then(res => res.json())
.then(data => console.log('Dashboard Data:', data));
```

## Common Issues & Solutions

### Issue 1: Teacher Sees Admin Dashboard
**Cause**: User role is set to SUPER_ADMIN instead of TEACHER
**Solution**: Update user role in database to TEACHER

### Issue 2: Teacher Gets "Unauthorized" Error
**Cause**: Teacher record doesn't exist or is not linked to user
**Solution**: Create teacher record with correct userId

### Issue 3: Teacher Sees Empty Dashboard
**Cause**: Teacher has no assigned classes or subjects
**Solution**: 
1. Assign teacher to classes in Class Management
2. Assign subjects to teacher in Subject Management

### Issue 4: Teacher Can't Access Certain Features
**Cause**: Route protection doesn't include TEACHER role
**Solution**: Update RoleGuard allowedRoles to include 'TEACHER'

### Issue 5: Teacher Redirected to Login
**Cause**: JWT token expired or invalid
**Solution**: Log out and log in again to get fresh token

## Testing Role-Based Access

### Manual Testing Checklist

#### For Teachers:
- [ ] Can log in successfully
- [ ] Redirected to dashboard (not login)
- [ ] Dashboard shows teacher-specific content
- [ ] Can access /teacher/homework
- [ ] Can access /teacher/resources
- [ ] Can access /academics/gradebook
- [ ] Can access /academics/attendance
- [ ] Can view student list
- [ ] Cannot access /finance (should redirect)
- [ ] Cannot access /platform-admin (should redirect)

#### For Students:
- [ ] Can log in successfully
- [ ] See student-specific dashboard
- [ ] Can access /homework
- [ ] Can access /resources
- [ ] Can access /assessments
- [ ] Cannot access /teacher/* routes
- [ ] Cannot access /finance

#### For Parents:
- [ ] Can log in successfully
- [ ] Redirected to /my-children
- [ ] Can view children's information
- [ ] Can access /parent/homework
- [ ] Can access /parent/grades
- [ ] Cannot access /teacher/* routes
- [ ] Cannot access /academics

### Automated Testing

```typescript
// Example test for role-based access
describe('Teacher Access Control', () => {
  it('should allow teachers to access teacher routes', async () => {
    const teacherToken = await loginAsTeacher();
    const response = await fetch('/api/v1/teacher/homework', {
      headers: { 'Authorization': `Bearer ${teacherToken}` }
    });
    expect(response.status).toBe(200);
  });
  
  it('should deny teachers access to finance routes', async () => {
    const teacherToken = await loginAsTeacher();
    const response = await fetch('/api/v1/finance/reports', {
      headers: { 'Authorization': `Bearer ${teacherToken}` }
    });
    expect(response.status).toBe(403);
  });
});
```

## Adding New Role-Protected Routes

### Step 1: Define Route in App.tsx
```typescript
<Route path="/new-teacher-feature" element={
  <RoleGuard allowedRoles={['TEACHER', 'SUPER_ADMIN']}>
    <NewTeacherFeature />
  </RoleGuard>
} />
```

### Step 2: Add Backend Route Protection
```typescript
// backend/src/routes/newFeatureRoutes.ts
router.get('/new-feature', 
  authenticate, 
  requireRole(['TEACHER', 'SUPER_ADMIN']), 
  controller.getNewFeature
);
```

### Step 3: Add to Sidebar (if needed)
```typescript
// frontend/src/components/layout/Sidebar.tsx
{
  icon: NewIcon,
  label: 'New Feature',
  path: '/new-teacher-feature',
  roles: ['TEACHER', 'SUPER_ADMIN']
}
```

## Security Best Practices

### 1. Always Verify on Backend
Frontend route protection is for UX only. Always verify permissions on the backend:
```typescript
// backend/src/middleware/requireRole.ts
export const requireRole = (allowedRoles: string[]) => {
  return (req, res, next) => {
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
};
```

### 2. Use Tenant Isolation
Always filter data by tenantId to prevent cross-tenant access:
```typescript
const students = await prisma.student.findMany({
  where: {
    tenantId: req.user.tenantId, // Always include this
    classId: req.params.classId
  }
});
```

### 3. Validate User Ownership
For teacher-specific data, verify the teacher owns the resource:
```typescript
const homework = await prisma.homework.findFirst({
  where: {
    id: req.params.id,
    tenantId: req.user.tenantId,
    subjectContent: {
      teacher: {
        userId: req.user.id // Verify teacher ownership
      }
    }
  }
});
```

### 4. Log Access Attempts
Track unauthorized access attempts:
```typescript
if (!allowedRoles.includes(req.user.role)) {
  await prisma.auditLog.create({
    data: {
      userId: req.user.id,
      action: 'UNAUTHORIZED_ACCESS_ATTEMPT',
      resource: req.path,
      tenantId: req.user.tenantId
    }
  });
  return res.status(403).json({ error: 'Forbidden' });
}
```

## Troubleshooting Commands

### Check User Role
```bash
# PostgreSQL
psql -d sync_db -c "SELECT id, email, role FROM \"User\" WHERE email = 'teacher@school.com';"
```

### Update User Role
```bash
# PostgreSQL
psql -d sync_db -c "UPDATE \"User\" SET role = 'TEACHER' WHERE email = 'teacher@school.com';"
```

### Verify Teacher Record
```bash
# PostgreSQL
psql -d sync_db -c "SELECT t.*, u.email FROM \"Teacher\" t JOIN \"User\" u ON t.\"userId\" = u.id WHERE u.email = 'teacher@school.com';"
```

### Check JWT Token
```javascript
// Browser console
const token = localStorage.getItem('token');
if (token) {
  const parts = token.split('.');
  const payload = JSON.parse(atob(parts[1]));
  console.log('Token Payload:', payload);
  console.log('Expires:', new Date(payload.exp * 1000));
}
```

## Summary

The Sync LMS system ensures teachers see the teacher platform through:

1. **Role Assignment**: Users are assigned the TEACHER role in the database
2. **Authentication**: JWT tokens contain the user's role
3. **Route Protection**: RoleGuard components check user role before rendering
4. **Dashboard Logic**: Dashboard component shows teacher-specific view for TEACHER role
5. **Backend Verification**: All API endpoints verify user role and permissions

**Key Point**: If a teacher is not seeing the teacher platform, check:
1. User role in database is 'TEACHER'
2. Teacher record exists and is linked to user
3. JWT token is valid and contains correct role
4. Browser cache is cleared
5. Teacher has assigned classes/subjects

For any issues, follow the troubleshooting steps above or check the application logs for error messages.
