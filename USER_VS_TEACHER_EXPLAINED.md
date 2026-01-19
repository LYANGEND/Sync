# Users vs Teachers - Complete Explanation

## Overview
In the Sync School Management System, **Teachers are a type of User**, not a separate entity. This is a role-based system where all staff members are stored in the `User` table with different roles.

---

## The User Model

### Database Structure
```prisma
model User {
  id            String   @id @default(uuid())
  tenantId      String   // Which school they belong to
  email         String   
  passwordHash  String
  fullName      String
  role          Role     // ← THIS DETERMINES IF THEY'RE A TEACHER
  isActive      Boolean  @default(true)
  // ... other fields
}
```

### Available Roles
```prisma
enum Role {
  SUPER_ADMIN   // School administrator (full access)
  BURSAR        // Financial officer (payments, fees)
  TEACHER       // Teaching staff (classes, assessments, attendance)
  SECRETARY     // Administrative staff (students, records)
  PARENT        // Parent/guardian (view only)
  STUDENT       // Student account (limited access)
}
```

---

## Key Concept: Teachers ARE Users

### What is a "User"?
- **User** = Any person with a login account in the system
- This includes: Admins, Bursars, Teachers, Secretaries, Parents, and Students
- All stored in the same `users` table
- Differentiated by their `role` field

### What is a "Teacher"?
- **Teacher** = A User with `role = 'TEACHER'`
- They have specific permissions for teaching-related tasks
- They can manage classes, record attendance, create assessments, etc.
- They are counted separately for subscription limits

---

## Why This Matters for Subscription Limits

### Two Different Counts

#### 1. Total Users (maxUsers)
**Counts ALL users in the system:**
```typescript
const userCount = await prisma.user.count({ 
  where: { tenantId } 
});
```

This includes:
- ✅ Super Admins
- ✅ Bursars
- ✅ Teachers
- ✅ Secretaries
- ✅ Parents
- ✅ Students

**Example**: If a school has:
- 1 Super Admin
- 1 Bursar
- 5 Teachers
- 2 Secretaries
- 50 Parents
- 200 Students

**Total Users = 259**

#### 2. Total Teachers (maxTeachers)
**Counts ONLY users with role='TEACHER':**
```typescript
const teacherCount = await prisma.user.count({ 
  where: { tenantId, role: 'TEACHER' } 
});
```

This includes:
- ✅ Teachers only

**Example**: From the same school above:
**Total Teachers = 5**

---

## Subscription Plan Limits

### How Limits Work

Each subscription plan has TWO separate limits:

```typescript
model SubscriptionPlan {
  maxUsers         Int  // Total login accounts (all roles)
  maxTeachers      Int  // Teaching staff only
  // ...
}
```

### Example Plan Limits

#### FREE Tier
- **maxUsers**: 10 (total accounts)
- **maxTeachers**: 5 (teaching staff)

This means:
- You can have up to 10 total login accounts
- Of those 10, maximum 5 can be teachers
- Remaining 5 could be: admins, bursars, secretaries, parents, students

#### STARTER Tier
- **maxUsers**: 30 (total accounts)
- **maxTeachers**: 20 (teaching staff)

#### PROFESSIONAL Tier
- **maxUsers**: 75 (total accounts)
- **maxTeachers**: 50 (teaching staff)

#### ENTERPRISE Tier
- **maxUsers**: 0 (unlimited)
- **maxTeachers**: 0 (unlimited)

---

## Why Have Both Limits?

### Business Logic

1. **Teachers are the most valuable users**
   - They actively use the system daily
   - They create content (assessments, lesson plans)
   - They generate the most data
   - Schools need more teachers than admins

2. **Different pricing tiers target different school sizes**
   - Small schools: Few teachers, few total users
   - Large schools: Many teachers, many total users

3. **Prevents abuse**
   - Without teacher limit, a school could buy STARTER plan and add 100 teachers
   - With teacher limit, they must upgrade to accommodate more teaching staff

---

## How Limits Are Enforced

### When Creating a User

```typescript
// Check total user limit
const userCheck = await checkResourceLimit(tenantId, 'users', 1);
if (!userCheck.allowed) {
  return res.status(403).json({
    error: 'limit_exceeded',
    message: 'You have reached your user limit (30/30)'
  });
}

// If creating a teacher, also check teacher limit
if (role === 'TEACHER') {
  const teacherCheck = await checkResourceLimit(tenantId, 'teachers', 1);
  if (!teacherCheck.allowed) {
    return res.status(403).json({
      error: 'limit_exceeded',
      message: 'You have reached your teacher limit (20/20)'
    });
  }
}
```

### Middleware Protection

```typescript
// From subscriptionMiddleware.ts
export const requireUserLimit = requireResourceLimit('users');
export const requireTeacherLimit = requireResourceLimit('teachers');

// Applied in routes
router.post('/', 
  requireActiveSubscription,
  requireUserLimit,  // Check total user limit
  tenantHandler(createUser)
);
```

---

## Counting Logic

### How Teachers Are Counted

```typescript
// From subscriptionService.ts
export async function syncResourceCounts(tenantId: string) {
  const [studentCount, teacherCount, userCount] = await Promise.all([
    prisma.student.count({ 
      where: { tenantId, status: 'ACTIVE' } 
    }),
    prisma.user.count({ 
      where: { tenantId, role: 'TEACHER' }  // ← Only TEACHER role
    }),
    prisma.user.count({ 
      where: { tenantId }  // ← All roles
    }),
  ]);

  await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      currentStudentCount: studentCount,
      currentTeacherCount: teacherCount,  // Stored separately
      currentUserCount: userCount,        // Stored separately
    },
  });
}
```

### Tenant Model Tracks Both

```prisma
model Tenant {
  // Limits (from subscription plan)
  maxUsers         Int  @default(10)
  maxTeachers      Int  @default(5)
  
  // Current usage
  currentUserCount    Int @default(0)  // All users
  currentTeacherCount Int @default(0)  // Teachers only
}
```

---

## Real-World Examples

### Example 1: Small School (FREE Plan)
**Limits**: 10 users, 5 teachers

**Current Users**:
- 1 Super Admin (Principal)
- 1 Bursar
- 3 Teachers
- 1 Secretary
- **Total: 6 users, 3 teachers** ✅ Within limits

**Can they add**:
- Another teacher? ✅ Yes (3/5 teachers, 6/10 users)
- Another admin? ✅ Yes (3/5 teachers, 6/10 users)
- 3 more teachers? ❌ No (would be 6/5 teachers - exceeds teacher limit)
- 5 more secretaries? ❌ No (would be 11/10 users - exceeds user limit)

### Example 2: Medium School (STARTER Plan)
**Limits**: 30 users, 20 teachers

**Current Users**:
- 2 Super Admins
- 1 Bursar
- 15 Teachers
- 2 Secretaries
- 5 Parents (with login access)
- **Total: 25 users, 15 teachers** ✅ Within limits

**Can they add**:
- 5 more teachers? ✅ Yes (would be 20/20 teachers, 30/30 users)
- 6 more teachers? ❌ No (would be 21/20 teachers - exceeds teacher limit)
- 10 more parents? ❌ No (would be 35/30 users - exceeds user limit)

### Example 3: Large School (PROFESSIONAL Plan)
**Limits**: 75 users, 50 teachers

**Current Users**:
- 3 Super Admins
- 2 Bursars
- 40 Teachers
- 5 Secretaries
- 20 Parents
- **Total: 70 users, 40 teachers** ✅ Within limits

**Can they add**:
- 10 more teachers? ❌ No (would be 80/75 users - exceeds user limit, even though 50/50 teachers is ok)
- 5 more teachers? ✅ Yes (would be 75/75 users, 45/50 teachers)

---

## Teacher-Specific Features

### What Teachers Can Do

Teachers have access to specific features based on their role:

```typescript
// From various route files
authorizeRole(['TEACHER', 'SUPER_ADMIN'])
```

**Teaching Features**:
- ✅ View and manage their assigned classes
- ✅ Record attendance for their classes
- ✅ Create and grade assessments
- ✅ Create lesson plans
- ✅ Track syllabus progress
- ✅ Generate report cards
- ✅ View student records in their classes
- ✅ Create timetable periods
- ✅ Send announcements

**Restricted Features**:
- ❌ Cannot manage school settings
- ❌ Cannot manage subscription/billing
- ❌ Cannot create/delete other users
- ❌ Cannot access financial reports (unless also BURSAR)
- ❌ Cannot suspend students (admin only)

### Teacher Dashboard

Teachers see a customized dashboard:

```typescript
// From dashboardController.ts
if (userRole === 'TEACHER') {
  // Show only their classes
  const myClasses = await prisma.class.findMany({
    where: { teacherId: userId, tenantId }
  });
  
  // Show their students only
  const myStudents = await prisma.student.findMany({
    where: { 
      classId: { in: myClasses.map(c => c.id) }
    }
  });
  
  return res.json({
    role: 'TEACHER',
    stats: {
      totalStudents: myStudents.length,
      totalClasses: myClasses.length,
      // ... teacher-specific stats
    }
  });
}
```

---

## Common Scenarios

### Scenario 1: Creating a Teacher Account

```typescript
// POST /api/users
{
  "email": "john.doe@school.com",
  "fullName": "John Doe",
  "role": "TEACHER",  // ← This makes them a teacher
  "password": "secure123"
}
```

**System checks**:
1. ✅ Is subscription active?
2. ✅ Is currentUserCount < maxUsers?
3. ✅ Is currentTeacherCount < maxTeachers?
4. ✅ Create user with role='TEACHER'
5. ✅ Increment currentUserCount
6. ✅ Increment currentTeacherCount

### Scenario 2: Changing a User to Teacher

```typescript
// PUT /api/users/:id
{
  "role": "TEACHER"  // Changing from SECRETARY to TEACHER
}
```

**System checks**:
1. ✅ Is currentTeacherCount < maxTeachers?
2. ✅ Update user role to 'TEACHER'
3. ✅ Increment currentTeacherCount
4. ✅ currentUserCount stays the same (already counted)

### Scenario 3: Deleting a Teacher

```typescript
// DELETE /api/users/:id (teacher account)
```

**System updates**:
1. ✅ Delete user record
2. ✅ Decrement currentUserCount
3. ✅ Decrement currentTeacherCount

---

## Summary

### Key Points

1. **Teachers are Users with role='TEACHER'**
   - Not a separate table
   - Same authentication system
   - Different permissions

2. **Two separate limits exist**
   - `maxUsers` - Total accounts (all roles)
   - `maxTeachers` - Teaching staff only
   - Both are enforced independently

3. **Teachers count towards both limits**
   - Adding a teacher increases both counters
   - Removing a teacher decreases both counters
   - Changing role to/from teacher adjusts teacher counter

4. **Business logic**
   - Teachers are premium users (more valuable)
   - Separate limit prevents plan abuse
   - Encourages upgrades for growing schools

5. **Tracking is automatic**
   - Counters updated on create/update/delete
   - Middleware enforces limits
   - Sync function available for corrections

---

## Visual Representation

```
┌─────────────────────────────────────────────────────────┐
│                    USERS TABLE                          │
│                                                         │
│  ┌──────────────────────────────────────────────────┐  │
│  │ id: 1, role: SUPER_ADMIN, name: "Principal"     │  │
│  └──────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────┐  │
│  │ id: 2, role: BURSAR, name: "Finance Officer"    │  │
│  └──────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────┐  │
│  │ id: 3, role: TEACHER, name: "John Doe"      ◄───┼──┐
│  └──────────────────────────────────────────────────┘  │ │
│  ┌──────────────────────────────────────────────────┐  │ │
│  │ id: 4, role: TEACHER, name: "Jane Smith"    ◄───┼──┤
│  └──────────────────────────────────────────────────┘  │ │
│  ┌──────────────────────────────────────────────────┐  │ │
│  │ id: 5, role: TEACHER, name: "Bob Wilson"    ◄───┼──┤
│  └──────────────────────────────────────────────────┘  │ │
│  ┌──────────────────────────────────────────────────┐  │ │
│  │ id: 6, role: SECRETARY, name: "Admin Staff"     │  │ │
│  └──────────────────────────────────────────────────┘  │ │
│                                                         │ │
│  Total Users: 6                                         │ │
│  Total Teachers: 3  ◄───────────────────────────────────┘
└─────────────────────────────────────────────────────────┘

Subscription Limits:
├─ maxUsers: 10 (6/10 used) ✅
└─ maxTeachers: 5 (3/5 used) ✅
```

---

## Conclusion

**Teachers are not a separate entity** - they are Users with a specific role. The system tracks them separately for subscription limit purposes because they are the most active and valuable users in a school management system. This dual-tracking approach allows for flexible pricing tiers that scale with school size while preventing plan abuse.
