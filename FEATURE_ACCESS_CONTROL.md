# Feature Access Control System - Complete Documentation

## Overview
The system ensures tenants only get features included in their subscribed plan through a multi-layered access control mechanism.

## How It Works

### 1. Database Schema (Plan Features)

**SubscriptionPlan Model** stores features as a string array:
```prisma
model SubscriptionPlan {
  id              String   @id @default(uuid())
  name            String   // "Starter", "Professional"
  tier            String   @unique
  
  // Features included (JSON array of feature keys)
  features        String[] // ["attendance", "fee_management", "sms_notifications", "api_access"]
  
  // Limits
  maxStudents      Int
  maxTeachers      Int
  maxUsers         Int
  maxClasses       Int
  
  // ... other fields
}
```

**Tenant Model** stores feature flags (enabled/disabled):
```prisma
model Tenant {
  tier            String   // "FREE", "STARTER", "PROFESSIONAL", "ENTERPRISE"
  status          SubscriptionStatus
  
  // Feature flags (set based on plan)
  smsEnabled                  Boolean @default(false)
  emailEnabled                Boolean @default(true)
  onlineAssessmentsEnabled    Boolean @default(false)
  parentPortalEnabled         Boolean @default(false)
  reportCardsEnabled          Boolean @default(false)
  attendanceEnabled           Boolean @default(true)
  feeManagementEnabled        Boolean @default(true)
  timetableEnabled            Boolean @default(false)
  syllabusEnabled             Boolean @default(false)
  apiAccessEnabled            Boolean @default(false)
  advancedReportsEnabled      Boolean @default(false)
  
  // Resource limits (set based on plan)
  maxStudents      Int
  maxTeachers      Int
  maxUsers         Int
  maxClasses       Int
  
  // Current usage counts
  currentStudentCount  Int @default(0)
  currentTeacherCount  Int @default(0)
  currentUserCount     Int @default(0)
}
```

### 2. Subscription Service (Feature Checking)

**Location**: `backend/src/services/subscriptionService.ts`

#### Feature Keys
```typescript
export const FEATURES = {
    ATTENDANCE: 'attendance',
    FEE_MANAGEMENT: 'fee_management',
    REPORT_CARDS: 'report_cards',
    PARENT_PORTAL: 'parent_portal',
    EMAIL_NOTIFICATIONS: 'email_notifications',
    SMS_NOTIFICATIONS: 'sms_notifications',
    ONLINE_ASSESSMENTS: 'online_assessments',
    TIMETABLE: 'timetable',
    SYLLABUS_TRACKING: 'syllabus_tracking',
    ADVANCED_REPORTS: 'advanced_reports',
    API_ACCESS: 'api_access',
    WHITE_LABEL: 'white_label',
    DATA_EXPORT: 'data_export',
    BASIC_REPORTS: 'basic_reports',
} as const;
```

#### Check Feature Access
```typescript
export async function checkFeatureAccess(
    tenantId: string,
    feature: FeatureKey
): Promise<SubscriptionCheckResult> {
    const tenant = await getTenantSubscription(tenantId);
    
    let isEnabled = false;
    let requiredTier: string = 'STARTER';
    
    switch (feature) {
        case FEATURES.SMS_NOTIFICATIONS:
            isEnabled = tenant.smsEnabled;
            requiredTier = 'PROFESSIONAL';
            break;
        case FEATURES.API_ACCESS:
            isEnabled = tenant.apiAccessEnabled;
            requiredTier = 'ENTERPRISE';
            break;
        // ... other features
    }
    
    if (!isEnabled) {
        return {
            allowed: false,
            reason: `This feature requires the ${requiredTier} plan or higher.`,
            tier: tenant.tier,
            upgradeRequired: true,
        };
    }
    
    return { allowed: true, tier: tenant.tier };
}
```

#### Check Resource Limits
```typescript
export async function checkResourceLimit(
    tenantId: string,
    resourceType: ResourceType,
    increment: number = 1
): Promise<SubscriptionCheckResult> {
    const tenant = await getTenantSubscription(tenantId);
    
    let currentCount: number;
    let maxAllowed: number;
    
    switch (resourceType) {
        case 'students':
            currentCount = tenant.currentStudentCount;
            maxAllowed = tenant.maxStudents;
            break;
        case 'teachers':
            currentCount = tenant.currentTeacherCount;
            maxAllowed = tenant.maxTeachers;
            break;
        // ... other resources
    }
    
    // 0 means unlimited
    if (maxAllowed === 0) {
        return { allowed: true };
    }
    
    if (currentCount + increment > maxAllowed) {
        return {
            allowed: false,
            reason: `You have reached your limit (${currentCount}/${maxAllowed}).`,
            upgradeRequired: true,
        };
    }
    
    return { allowed: true };
}
```

### 3. Middleware (Route Protection)

**Location**: `backend/src/middleware/subscriptionMiddleware.ts`

#### Active Subscription Check
```typescript
export const requireActiveSubscription: RequestHandler = async (req, res, next) => {
    const tenantId = getTenantId(req);
    const result = await checkSubscriptionActive(tenantId);
    
    if (!result.allowed) {
        return res.status(402).json({
            error: 'subscription_required',
            message: result.reason,
            upgradeUrl: '/subscription/upgrade',
        });
    }
    
    next();
};
```

#### Feature Access Middleware
```typescript
export const requireFeature = (feature: FeatureKey): RequestHandler => {
    return async (req, res, next) => {
        const tenantId = getTenantId(req);
        const result = await checkFeatureAccess(tenantId, feature);
        
        if (!result.allowed) {
            return res.status(403).json({
                error: 'feature_not_available',
                message: result.reason,
                feature,
                upgradeUrl: '/subscription/upgrade',
            });
        }
        
        next();
    };
};

// Pre-built middleware
export const requireSmsFeature = requireFeature(FEATURES.SMS_NOTIFICATIONS);
export const requireApiAccess = requireFeature(FEATURES.API_ACCESS);
export const requireAdvancedReports = requireFeature(FEATURES.ADVANCED_REPORTS);
```

#### Resource Limit Middleware
```typescript
export const requireResourceLimit = (resourceType: ResourceType, increment = 1): RequestHandler => {
    return async (req, res, next) => {
        const tenantId = getTenantId(req);
        const result = await checkResourceLimit(tenantId, resourceType, increment);
        
        if (!result.allowed) {
            return res.status(403).json({
                error: 'limit_exceeded',
                message: result.reason,
                resource: resourceType,
                currentCount: result.currentCount,
                maxAllowed: result.maxAllowed,
                upgradeUrl: '/subscription/upgrade',
            });
        }
        
        next();
    };
};

// Pre-built middleware
export const requireStudentLimit = requireResourceLimit('students');
export const requireTeacherLimit = requireResourceLimit('teachers');
```

### 4. Route Protection (Implementation)

**Example**: `backend/src/routes/studentRoutes.ts`

```typescript
import { requireActiveSubscription, requireStudentLimit } from '../middleware/subscriptionMiddleware';

const router = Router();

router.use(authenticateToken);
router.use(requireActiveSubscription); // Check subscription on ALL routes

// Creating a student checks the limit
router.post('/', 
    authorizeRole(['SUPER_ADMIN', 'SECRETARY']), 
    requireStudentLimit,  // ✅ Checks if tenant can add more students
    tenantHandler(createStudent)
);

// Bulk create also checks limit
router.post('/bulk', 
    authorizeRole(['SUPER_ADMIN', 'SECRETARY']), 
    requireStudentLimit,  // ✅ Checks limit before bulk operation
    tenantHandler(bulkCreateStudents)
);
```

**Example**: SMS Routes (if implemented)
```typescript
import { requireSmsFeature } from '../middleware/subscriptionMiddleware';

router.post('/send-sms', 
    requireActiveSubscription,
    requireSmsFeature,  // ✅ Checks if SMS feature is enabled
    tenantHandler(sendSms)
);
```

## Access Control Flow

### When a Tenant Subscribes to a Plan:

1. **Payment Confirmed** → `subscriptionController.ts`
2. **Update Tenant** → Set tier, limits, and feature flags
```typescript
await prisma.tenant.update({
    where: { id: tenantId },
    data: {
        tier: plan.tier,
        status: 'ACTIVE',
        subscriptionEndsAt: expiryDate,
        
        // Set limits from plan
        maxStudents: plan.maxStudents,
        maxTeachers: plan.maxTeachers,
        maxUsers: plan.maxUsers,
        maxClasses: plan.maxClasses,
        
        // Enable features from plan.features array
        smsEnabled: plan.features.includes('sms_notifications'),
        apiAccessEnabled: plan.features.includes('api_access'),
        advancedReportsEnabled: plan.features.includes('advanced_reports'),
        // ... other features
    }
});
```

### When a Tenant Tries to Use a Feature:

1. **Request** → API endpoint (e.g., POST /api/students)
2. **Auth Middleware** → Verify user is authenticated
3. **Subscription Middleware** → `requireActiveSubscription`
   - Check if subscription is active (not expired/suspended)
   - Return 402 if inactive
4. **Feature Middleware** → `requireFeature('sms_notifications')`
   - Check if `tenant.smsEnabled === true`
   - Return 403 if not enabled
5. **Resource Middleware** → `requireStudentLimit`
   - Check if `currentStudentCount < maxStudents`
   - Return 403 if limit exceeded
6. **Controller** → Execute the actual logic

### Response Codes:

- **402 Payment Required** - Subscription expired/inactive
- **403 Forbidden** - Feature not available or limit exceeded
- **200/201 Success** - Access granted

## Frontend Integration

### Checking Feature Access

**In Components**:
```typescript
// Get subscription status
const { data: status } = await api.get('/subscription/status');

// Check if feature is available
if (status.features.sms_notifications) {
    // Show SMS button
} else {
    // Show upgrade prompt
}

// Check resource limits
if (status.usage.students.percentage >= 90) {
    // Show warning: "Approaching student limit"
}
```

### Displaying Available Features

**Subscription Page** (`/subscription`):
- Shows all plans with their features
- Features come from `plan.features` array in database
- Uses `featureLabels` mapping for readable names

**Platform Admin** (`/platform/plans`):
- Shows plan cards with features
- Admins can edit which features are included in each plan

## How to Add a New Feature

### 1. Add Feature Key
```typescript
// backend/src/services/subscriptionService.ts
export const FEATURES = {
    // ... existing features
    NEW_FEATURE: 'new_feature',
};
```

### 2. Add Database Column (if needed)
```prisma
// backend/prisma/schema.prisma
model Tenant {
    // ... existing fields
    newFeatureEnabled Boolean @default(false)
}
```

### 3. Add Feature Check
```typescript
// backend/src/services/subscriptionService.ts
case FEATURES.NEW_FEATURE:
    isEnabled = tenant.newFeatureEnabled;
    requiredTier = 'PROFESSIONAL';
    break;
```

### 4. Create Middleware
```typescript
// backend/src/middleware/subscriptionMiddleware.ts
export const requireNewFeature = requireFeature(FEATURES.NEW_FEATURE);
```

### 5. Protect Routes
```typescript
// backend/src/routes/someRoutes.ts
router.post('/new-feature-endpoint', 
    requireActiveSubscription,
    requireNewFeature,  // ✅ Feature check
    tenantHandler(newFeatureController)
);
```

### 6. Add to Plans
```sql
-- Add feature to plans that should have it
UPDATE subscription_plans 
SET features = array_append(features, 'new_feature')
WHERE tier IN ('PROFESSIONAL', 'ENTERPRISE');
```

### 7. Update Existing Tenants
```sql
-- Enable for tenants on qualifying plans
UPDATE tenants 
SET "newFeatureEnabled" = true
WHERE tier IN ('PROFESSIONAL', 'ENTERPRISE');
```

## Current Protection Status

### ✅ Protected Routes:
- **Student Routes** - All routes check active subscription, create/bulk check limits
- **Teacher Routes** - Should have similar protection (verify implementation)
- **User Routes** - Should check user limits (verify implementation)
- **Class Routes** - Should check class limits (verify implementation)

### ⚠️ Routes That Need Protection:
Check these routes and add appropriate middleware:
- SMS sending routes → Add `requireSmsFeature`
- API access routes → Add `requireApiAccess`
- Advanced reports → Add `requireAdvancedReports`
- Online assessments → Add `requireFeature(FEATURES.ONLINE_ASSESSMENTS)`
- Parent portal → Add `requireFeature(FEATURES.PARENT_PORTAL)`

## Testing Feature Access

### Test Scenarios:

1. **Free Tier Tenant** tries to send SMS
   - Expected: 403 Forbidden
   - Message: "This feature requires the PROFESSIONAL plan or higher"

2. **Starter Tier Tenant** tries to add 51st student (limit: 50)
   - Expected: 403 Forbidden
   - Message: "You have reached your students limit (50/50)"

3. **Professional Tier Tenant** tries to access API
   - Expected: 403 Forbidden (if API is ENTERPRISE only)
   - Message: "This feature requires the ENTERPRISE plan or higher"

4. **Expired Subscription** tries to access any route
   - Expected: 402 Payment Required
   - Message: "Your subscription has expired. Please renew to continue."

## Summary

✅ **Feature access is controlled through:**
1. Database schema (plan features array + tenant feature flags)
2. Subscription service (feature checking logic)
3. Middleware (route protection)
4. Route implementation (applying middleware)

✅ **Tenants only get features in their plan because:**
1. Feature flags are set when they subscribe
2. Every protected route checks these flags
3. Unauthorized access returns 403 Forbidden
4. Frontend hides unavailable features

✅ **Resource limits are enforced through:**
1. Plan limits stored in database
2. Current usage tracked in tenant table
3. Middleware checks before allowing operations
4. Automatic count updates on create/delete

⚠️ **Action Required:**
- Audit all routes to ensure proper middleware is applied
- Add feature checks to SMS, API, and other premium features
- Test access control with different subscription tiers
