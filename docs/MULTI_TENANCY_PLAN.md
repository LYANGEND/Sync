# Multi-Tenancy Implementation Plan

This document outlines the roadmap for converting the current single-tenant School Management System into a multi-tenant SaaS platform.

## 1. Database Architecture (Shared Database, Discriminator Column)

We will use a single database for all tenants (schools), distinguishing data by a `schoolId` column on every major table.

### Schema Changes
See `docs/MULTI_TENANCY_SCHEMA.prisma` for the full proposed schema.

**Key Changes:**
- **New Model:** `School` (The tenant root).
- **New Field:** `schoolId` added to `User`, `Student`, `Class`, `Subject`, `AcademicTerm`, etc.
- **Unique Constraints:** Updated to be scoped by school (e.g., `email` is unique per school, not globally).

### Migration Strategy (Zero Data Loss)
Since we have existing data, we cannot simply "add a required column".

1.  **Create `School` Table:** Create the table manually or via migration.
2.  **Seed Default School:** Create a "Default School" record (ID: `default-school-id`).
3.  **Add Optional `schoolId`:** Add the column as nullable first.
4.  **Backfill Data:** Run a script to update ALL existing records in `User`, `Student`, etc., setting `schoolId = 'default-school-id'`.
5.  **Make Required:** Alter the column to be `NOT NULL` and add Foreign Key constraints.

## 2. Backend Implementation

### Tenant Resolution Middleware
We need to identify which school is making the request.

**Strategy: Subdomains**
- `school1.app.com` -> School ID: `uuid-1`
- `school2.app.com` -> School ID: `uuid-2`

```typescript
// middleware/tenantMiddleware.ts
export const resolveTenant = async (req, res, next) => {
  const host = req.headers.host; // e.g., school1.app.com
  const subdomain = host.split('.')[0];
  
  const school = await prisma.school.findUnique({ where: { slug: subdomain } });
  if (!school) return res.status(404).json({ message: 'School not found' });
  
  req.school = school; // Attach to request
  next();
};
```

### Prisma Extensions (Row-Level Security)
To avoid manually adding `where: { schoolId: req.school.id }` to every single query, we will use Prisma Client Extensions to automatically filter data.

```typescript
// lib/prisma.ts
const prisma = new PrismaClient().$extends({
  query: {
    $allModels: {
      async findMany({ args, query }) {
        // Auto-inject schoolId
        if (context.schoolId) {
           args.where = { ...args.where, schoolId: context.schoolId };
        }
        return query(args);
      }
    }
  }
});
```

## 3. Frontend Implementation

### Authentication
- **Login Page:** Needs to know which school you are logging into.
  - *Option A:* User visits `school1.app.com/login`. The login API sends the school ID automatically.
  - *Option B:* Global login `app.com/login`. User enters email, system finds which schools they belong to, and asks them to select one.

### Context
- Update `AuthContext` to store `currentSchool` information.
- Display School Name/Logo in the sidebar/header dynamically.

## 4. Onboarding & Super Admin

### Platform Admin Dashboard
A new "Super Admin" area (outside of any specific school) to:
- Create new Schools.
- Manage subscription plans.
- Disable/Suspend schools.

### Registration Flow
1.  User visits `app.com/register`.
2.  Fills form: "School Name", "Subdomain", "Admin Email", "Password".
3.  System creates `School` + `User` (Admin).
4.  Redirects user to `subdomain.app.com/login`.

## 5. Next Steps

1.  **Review Schema:** Check `docs/MULTI_TENANCY_SCHEMA.prisma`.
2.  **Backup Data:** Ensure current database is backed up.
3.  **Execute Migration:** Apply the schema changes (carefully!).
4.  **Update Backend:** Implement the middleware and update controllers.
