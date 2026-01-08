# Multi-Tenant Architecture Implementation

## Overview

This document describes the multi-tenant architecture implementation for the Sync School Management System.

## What Was Implemented

### 1. Database Schema Updates (`prisma/schema.prisma`)

#### New Models Added:
- **Tenant** - Core multi-tenant model representing each school
- **PlatformUser** - Super admin users who manage all tenants
- **SubscriptionPlan** - Defines available subscription tiers
- **ContactSubmission** - Contact form submissions from website

#### New Enums:
- `SubscriptionTier` - FREE, STARTER, PROFESSIONAL, ENTERPRISE
- `SubscriptionStatus` - TRIAL, ACTIVE, SUSPENDED, CANCELLED, EXPIRED
- `PlatformRole` - PLATFORM_SUPERADMIN, PLATFORM_SUPPORT, PLATFORM_SALES

#### Models Updated with `tenantId`:
| Model | Changes |
|-------|---------|
| User | Added tenantId, changed email uniqueness to per-tenant |
| Student | Added tenantId, changed admissionNumber uniqueness to per-tenant |
| Class | Added tenantId |
| Subject | Added tenantId, changed code uniqueness to per-tenant |
| AcademicTerm | Added tenantId |
| FeeTemplate | Added tenantId |
| Payment | Added tenantId |
| Attendance | Added tenantId, added reason field |
| Assessment | Added tenantId |
| GradingScale | Added tenantId |
| Scholarship | Added tenantId |
| TimetablePeriod | Added tenantId |
| Topic | Added tenantId |
| LessonPlan | Added tenantId |
| Notification | Added tenantId |
| Conversation | Added tenantId |

### 2. Tenant Middleware (`src/middleware/tenantMiddleware.ts`)

Features:
- **resolveTenant** - Resolves tenant from subdomain, header, or JWT
- **requireFeature** - Gates access to features based on subscription
- **checkLimit** - Enforces resource limits (students, teachers, etc.)
- **updateTenantUsage** - Updates usage counts after CRUD operations
- **validateTenantAccess** - Validates cross-tenant access

### 3. Auth Middleware Update (`src/middleware/authMiddleware.ts`)

- Added `tenantId` to AuthRequest interface
- Added `verifyTenantAccess` middleware for additional security

### 4. Migration Script (`prisma/migrate-to-multitenant.ts`)

Converts existing single-tenant data to multi-tenant:
- Creates default tenant from existing SchoolSettings
- Updates all existing records with tenant ID
- Seeds subscription plans
- Creates platform admin user

---

## Tenant Model Fields

```typescript
{
  // Identity
  id: string
  name: string           // "Lusaka Academy"
  slug: string           // "lusaka-academy" (unique, for subdomain)
  domain: string?        // Custom domain support
  
  // Branding
  logoUrl: string?
  primaryColor: string   // Default: "#2563eb"
  secondaryColor: string // Default: "#475569"
  accentColor: string    // Default: "#f59e0b"
  
  // Contact
  email: string
  phone: string?
  address: string?
  city: string?
  country: string        // Default: "ZM"
  website: string?
  
  // Subscription
  tier: SubscriptionTier
  status: SubscriptionStatus
  trialEndsAt: DateTime?
  subscriptionStartedAt: DateTime?
  subscriptionEndsAt: DateTime?
  
  // Limits (can be overridden per-tenant)
  maxStudents: number     // -1 = unlimited
  maxTeachers: number
  maxUsers: number
  maxClasses: number
  maxStorageGB: number
  
  // Feature Flags
  smsEnabled: boolean
  emailEnabled: boolean
  onlineAssessmentsEnabled: boolean
  parentPortalEnabled: boolean
  reportCardsEnabled: boolean
  attendanceEnabled: boolean
  feeManagementEnabled: boolean
  chatEnabled: boolean
  advancedReportsEnabled: boolean
  apiAccessEnabled: boolean
  timetableEnabled: boolean
  syllabusEnabled: boolean
  
  // Per-tenant SMTP/SMS config
  smtpHost, smtpPort, smtpUser, etc.
  smsProvider, smsApiKey, etc.
  
  // Usage Tracking
  currentStudentCount: number
  currentTeacherCount: number
  currentUserCount: number
  currentStorageUsedMB: number
}
```

---

## Subscription Tiers

| Tier | Max Students | Max Teachers | Max Users | Features |
|------|--------------|--------------|-----------|----------|
| FREE | 50 | 5 | 10 | Basic (Email, Attendance, Fees, Reports, Timetable) |
| STARTER | 300 | 30 | 50 | + Parent Portal |
| PROFESSIONAL | 1000 | 100 | 200 | + SMS, Online Assessments, Chat, Advanced Reports |
| ENTERPRISE | Unlimited | Unlimited | Unlimited | + API Access, Custom Integrations |

---

## How to Complete the Migration

### Step 1: Generate Prisma Client
```bash
cd backend
npx prisma generate
```

### Step 2: Create Migration
```bash
npx prisma migrate dev --name add_multitenancy
```

### Step 3: Run Data Migration
```bash
npx ts-node prisma/migrate-to-multitenant.ts
```

### Step 4: Update Auth Controller

Update `authController.ts` to include `tenantId` in JWT:

```typescript
// In login function
const token = jwt.sign(
  { 
    userId: user.id,
    tenantId: user.tenantId,  // ADD THIS
    role: user.role 
  },
  JWT_SECRET,
  { expiresIn: '24h' }
);
```

### Step 5: Update All Controllers

Each controller needs to:
1. Get `tenantId` from `req.user.tenantId`
2. Filter all queries by `tenantId`
3. Include `tenantId` when creating new records

Example:
```typescript
// Before
const students = await prisma.student.findMany();

// After
const students = await prisma.student.findMany({
  where: { tenantId: req.user.tenantId }
});
```

### Step 6: Add Middleware to Routes

```typescript
import { resolveTenant, requireFeature, checkLimit } from './middleware/tenantMiddleware';

// Apply to all routes
app.use('/api/v1', authenticateToken, resolveTenant);

// Feature-specific routes
router.post('/sms', requireFeature('smsEnabled'), sendSmsController);

// Limit-checked routes
router.post('/students', checkLimit('students'), createStudentController);
```

---

## Frontend Changes Needed

1. **Include tenant in API requests**:
   - Add `X-Tenant-ID` header to all API calls
   - Or use subdomain routing (recommended for production)

2. **Show upgrade prompts**:
   - When API returns `FEATURE_NOT_AVAILABLE` or `LIMIT_REACHED`
   - Display modal with upgrade options

3. **Add billing/subscription page**:
   - Show current plan and usage
   - Upgrade/downgrade options
   - Payment integration

4. **Platform admin dashboard**:
   - Manage all tenants
   - View usage analytics
   - Handle support requests

---

## API Response Codes

| Code | Meaning |
|------|---------|
| 403 SUBSCRIPTION_SUSPENDED | Subscription suspended |
| 403 SUBSCRIPTION_CANCELLED | Subscription cancelled |
| 403 SUBSCRIPTION_EXPIRED | Subscription expired |
| 403 TRIAL_EXPIRED | Free trial ended |
| 403 FEATURE_NOT_AVAILABLE | Feature not in plan |
| 403 LIMIT_REACHED | Resource limit exceeded |

---

## Security Considerations

1. **Row-Level Security**: All queries MUST include `tenantId` filter
2. **JWT Validation**: Validate `tenantId` in JWT matches requested tenant
3. **Cross-Tenant Access**: Never allow users to access other tenants' data
4. **Audit Logging**: Log all tenant-specific operations for compliance

---

## Next Steps

1. [ ] Run database migration
2. [ ] Update auth controller with tenantId in JWT
3. [ ] Update all controllers to filter by tenantId
4. [ ] Apply tenant middleware to routes
5. [ ] Create platform admin dashboard
6. [ ] Add billing integration (Stripe/PayStack)
7. [ ] Implement school registration flow
8. [ ] Update frontend for multi-tenancy
