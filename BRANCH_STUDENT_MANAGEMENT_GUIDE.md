# Branch Module - Student Management Guide

## Overview
The branch module uses a sophisticated multi-branch enrollment system that allows students to be associated with one or multiple branches, with support for primary/secondary branch assignments and transfer tracking.

---

## Database Architecture

### 1. Student Model
```prisma
model Student {
  // Direct branch assignment (primary branch)
  branchId          String?
  branch            Branch? @relation(fields: [branchId], references: [id])
  
  // Multi-branch enrollments
  branchEnrollments StudentBranch[]
  
  // Other fields...
  classId           String
  class             Class
  tenantId        