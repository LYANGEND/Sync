# Student Onboarding & Transfer Process - Reimagined

## Executive Summary

This document reimagines the student onboarding and transfer process within Sync, creating a seamless, automated, and user-friendly experience for:
- **New student enrollment** (onboarding)
- **Branch-to-branch transfers** (within same school)
- **School-to-school transfers** (within Sync platform)

## Current State Analysis

### Existing Capabilities ✅
- Basic student creation with auto-generated admission numbers
- Parent account auto-creation with email notifications
- Branch assignment during creation
- Manual branch transfers with audit trail
- Bulk transfer operations
- Multi-branch enrollment support

### Current Limitations ❌
- No guided onboarding workflow
- No document upload/verification
- No approval workflows
- No automated fee structure assignment
- No transfer request system
- No inter-school transfer capability
- No onboarding progress tracking
- No welcome kits or orientation scheduling
- Limited parent communication during process

---

## Reimagined Solution

### 1. Student Onboarding Workflow

#### Phase 1: Pre-Registration (Optional)
**Purpose**: Allow parents to express interest before formal admission

**Features**:
- Public registration form on school website
- Capture: student info, parent info, preferred branch, grade level
- Auto-create Lead in CRM system
- Send confirmation email with next steps
- Admin dashboard to review pre-registrations

**Database**:
```typescript
model PreRegistration {
  id              String   @id @default(uuid())
  tenantId        String
  tenant          Tenant   @relation(fields: [tenantId], references: [id])
  
  // Student Info
  studentFirstName  String
  studentLastName   String
  dateOfBirth       DateTime
  gender            Gender
  previousSchool    String?
  gradeLevel        Int
  
  // Parent Info
  parentName        String
  parentEmail       String
  parentPhone       String
  parentAddress     String?
  
  // Preferences
  preferredBranchId String?
  preferredBranch   Branch? @relation(fields: [preferredBranchId], references: [id])
  startDate         DateTime?
  
  // Status
  status            PreRegistrationStatus @default(PENDING)
  reviewedById      String?
  reviewedBy        User?   @relation(fields: [reviewedById], references: [id])
  reviewNotes       String?
  
  // Conversion
  convertedToStudentId String? @unique
  convertedAt          DateTime?
  
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  
  @@index([tenantId, status])
  @@map("pre_registrations")
}

enum PreRegistrationStatus {
  PENDING
  UNDER_REVIEW
  APPROVED
  REJECTED
  CONVERTED
}
```

#### Phase 2: Formal Admission
**Purpose**: Complete official enrollment with all required information

**Workflow Steps**:
1. **Application Submission**
   - Complete student details form
   - Upload required documents (birth certificate, medical records, previous school reports)
   - Select branch and class
   - Emergency contact information
   - Medical information (allergies, conditions)
   - Special needs/accommodations

2. **Document Verification**
   - Admin reviews uploaded documents
   - Mark documents as verified/rejected
   - Request additional documents if needed
   - Automated reminders for missing documents

3. **Interview/Assessment Scheduling** (Optional)
   - Schedule entrance exam or interview
   - Send calendar invites to parents
   - Record assessment results
   - Admission decision based on results

4. **Admission Decision**
   - Approve or reject application
   - Send decision notification
   - If approved, proceed to enrollment

5. **Enrollment Completion**
   - Generate admission number
   - Assign to class and branch
   - Create student account
   - Create/link parent account
   - Assign fee structure
   - Generate welcome packet

**Database Schema**:
```typescript
model StudentApplication {
  id                String   @id @default(uuid())
  tenantId          String
  tenant            Tenant   @relation(fields: [tenantId], references: [id])
  
  // Application Info
  applicationNumber String   @unique
  applicationDate   DateTime @default(now())
  
  // Student Details
  firstName         String
  lastName          String
  middleName        String?
  dateOfBirth       DateTime
  gender            Gender
  nationality       String   @default("Zambian")
  religion          String?
  bloodGroup        String?
  
  // Previous Education
  previousSchool    String?
  previousGrade     String?
  reasonForLeaving  String?
  
  // Parent/Guardian 1
  guardian1Name     String
  guardian1Email    String
  guardian1Phone    String
  guardian1Relation String   // Father, Mother, Guardian
  guardian1Occupation String?
  guardian1Employer String?
  
  // Parent/Guardian 2 (Optional)
  guardian2Name     String?
  guardian2Email    String?
  guardian2Phone    String?
  guardian2Relation String?
  guardian2Occupation String?
  guardian2Employer String?
  
  // Address
  residentialAddress String
  city              String
  province          String?
  postalCode        String?
  
  // Emergency Contact
  emergencyName     String
  emergencyPhone    String
  emergencyRelation String
  
  // Medical Information
  allergies         String?
  medicalConditions String?
  medications       String?
  doctorName        String?
  doctorPhone       String?
  
  // Special Needs
  specialNeeds      String?
  learningSupport   String?
  dietaryRestrictions String?
  
  // Enrollment Details
  requestedBranchId String
  requestedBranch   Branch  @relation(fields: [requestedBranchId], references: [id])
  requestedGrade    Int
  requestedStartDate DateTime
  
  // Application Status
  status            ApplicationStatus @default(SUBMITTED)
  currentStage      ApplicationStage  @default(DOCUMENT_VERIFICATION)
  
  // Review
  reviewedById      String?
  reviewedBy        User?   @relation(fields: [reviewedById], references: [id])
  reviewNotes       String?
  rejectionReason   String?
  
  // Assessment
  assessmentScheduled DateTime?
  assessmentCompleted DateTime?
  assessmentScore     Int?
  assessmentNotes     String?
  
  // Conversion
  convertedToStudentId String? @unique
  convertedAt          DateTime?
  admissionNumber      String?
  
  // Documents
  documents         ApplicationDocument[]
  
  // Timeline
  timeline          ApplicationTimeline[]
  
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  
  @@index([tenantId, status])
  @@index([applicationNumber])
  @@map("student_applications")
}

enum ApplicationStatus {
  DRAFT
  SUBMITTED
  UNDER_REVIEW
  INTERVIEW_SCHEDULED
  APPROVED
  REJECTED
  ENROLLED
}

enum ApplicationStage {
  DOCUMENT_VERIFICATION
  ASSESSMENT_PENDING
  INTERVIEW_PENDING
  FINAL_REVIEW
  DECISION_MADE
  ENROLLMENT_COMPLETE
}

model ApplicationDocument {
  id            String   @id @default(uuid())
  applicationId String
  application   StudentApplication @relation(fields: [applicationId], references: [id], onDelete: Cascade)
  
  documentType  DocumentType
  fileName      String
  fileUrl       String
  fileSize      Int
  mimeType      String
  
  // Verification
  isVerified    Boolean  @default(false)
  verifiedById  String?
  verifiedBy    User?    @relation(fields: [verifiedById], references: [id])
  verifiedAt    DateTime?
  verificationNotes String?
  
  uploadedAt    DateTime @default(now())
  
  @@index([applicationId])
  @@map("application_documents")
}

enum DocumentType {
  BIRTH_CERTIFICATE
  PREVIOUS_REPORT_CARD
  MEDICAL_RECORDS
  IMMUNIZATION_CARD
  PASSPORT_PHOTO
  PROOF_OF_RESIDENCE
  PARENT_ID
  TRANSFER_CERTIFICATE
  OTHER
}

model ApplicationTimeline {
  id            String   @id @default(uuid())
  applicationId String
  application   StudentApplication @relation(fields: [applicationId], references: [id], onDelete: Cascade)
  
  stage         ApplicationStage
  status        String
  notes         String?
  performedById String?
  performedBy   User?    @relation(fields: [performedById], references: [id])
  
  createdAt     DateTime @default(now())
  
  @@index([applicationId])
  @@map("application_timeline")
}
```

#### Phase 3: Onboarding & Orientation
**Purpose**: Welcome student and family, complete setup

**Features**:
- Welcome email with login credentials
- Orientation scheduling
- Uniform measurement and ordering
- Book list and supply requirements
- School tour scheduling
- Meet the teacher session
- Parent handbook distribution
- School policies acknowledgment
- Photo ID card generation
- Bus route assignment (if applicable)
- Cafeteria account setup
- Library card issuance

**Database**:
```typescript
model StudentOnboarding {
  id              String   @id @default(uuid())
  studentId       String   @unique
  student         Student  @relation(fields: [studentId], references: [id], onDelete: Cascade)
  
  // Onboarding Checklist
  welcomeEmailSent      Boolean @default(false)
  welcomeEmailSentAt    DateTime?
  
  orientationScheduled  Boolean @default(false)
  orientationDate       DateTime?
  orientationCompleted  Boolean @default(false)
  
  uniformOrdered        Boolean @default(false)
  uniformOrderDate      DateTime?
  uniformReceived       Boolean @default(false)
  
  booksIssued           Boolean @default(false)
  booksIssuedDate       DateTime?
  
  schoolTourCompleted   Boolean @default(false)
  schoolTourDate        DateTime?
  
  teacherMeetingDone    Boolean @default(false)
  teacherMeetingDate    DateTime?
  
  handbookAcknowledged  Boolean @default(false)
  handbookAckDate       DateTime?
  
  photoIdGenerated      Boolean @default(false)
  photoIdGeneratedAt    DateTime?
  
  busRouteAssigned      Boolean @default(false)
  busRouteId            String?
  
  cafeteriaSetup        Boolean @default(false)
  cafeteriaAccountId    String?
  
  libraryCardIssued     Boolean @default(false)
  libraryCardNumber     String?
  
  // Overall Status
  onboardingComplete    Boolean @default(false)
  completedAt           DateTime?
  
  // Notes
  notes                 String?
  
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt
  
  @@map("student_onboarding")
}
```

---

### 2. Branch Transfer Workflow (Within Same School)

#### Current Process Issues:
- Immediate transfer without approval
- No notification to affected parties
- No class availability check
- No fee adjustment handling

#### Reimagined Process:

**Step 1: Transfer Request Initiation**
- Parent or admin initiates transfer request
- Select target branch
- Provide reason for transfer
- Select preferred start date

**Step 2: Approval Workflow**
- Current branch manager reviews
- Target branch manager reviews
- Check class availability at target branch
- Check capacity constraints
- Approve or reject with reason

**Step 3: Transfer Execution**
- Update student branch assignment
- Transfer class enrollment
- Adjust fee structures if branches have different fees
- Transfer outstanding balances
- Update parent notifications
- Generate transfer certificate

**Step 4: Post-Transfer**
- Welcome email from new branch
- Orientation at new branch
- Update all records (attendance, assessments, etc.)
- Archive transfer documentation

**Database Schema**:
```typescript
model BranchTransferRequest {
  id                String   @id @default(uuid())
  tenantId          String
  tenant            Tenant   @relation(fields: [tenantId], references: [id])
  
  // Transfer Details
  requestNumber     String   @unique
  studentId         String
  student           Student  @relation(fields: [studentId], references: [id])
  
  fromBranchId      String
  fromBranch        Branch   @relation("TransferFromBranch", fields: [fromBranchId], references: [id])
  
  toBranchId        String
  toBranch          Branch   @relation("TransferToBranch", fields: [toBranchId], references: [id])
  
  // Request Info
  requestedById     String
  requestedBy       User     @relation("TransferRequestedBy", fields: [requestedById], references: [id])
  requestReason     String
  requestedStartDate DateTime
  
  // Current Class Info
  currentClassId    String
  currentClass      Class    @relation("TransferFromClass", fields: [currentClassId], references: [id])
  
  // Target Class Info
  targetClassId     String?
  targetClass       Class?   @relation("TransferToClass", fields: [targetClassId], references: [id])
  
  // Approval Workflow
  status            TransferRequestStatus @default(PENDING)
  
  // From Branch Approval
  fromBranchApprovedById String?
  fromBranchApprovedBy   User? @relation("FromBranchApprover", fields: [fromBranchApprovedById], references: [id])
  fromBranchApprovedAt   DateTime?
  fromBranchNotes        String?
  
  // To Branch Approval
  toBranchApprovedById   String?
  toBranchApprovedBy     User? @relation("ToBranchApprover", fields: [toBranchApprovedById], references: [id])
  toBranchApprovedAt     DateTime?
  toBranchNotes          String?
  toBranchCapacityCheck  Boolean @default(false)
  
  // Final Approval (Admin)
  finalApprovedById String?
  finalApprovedBy   User?  @relation("FinalApprover", fields: [finalApprovedById], references: [id])
  finalApprovedAt   DateTime?
  
  // Rejection
  rejectedById      String?
  rejectedBy        User?  @relation("TransferRejectedBy", fields: [rejectedById], references: [id])
  rejectedAt        DateTime?
  rejectionReason   String?
  
  // Execution
  executedById      String?
  executedBy        User?  @relation("TransferExecutedBy", fields: [executedById], references: [id])
  executedAt        DateTime?
  actualTransferDate DateTime?
  
  // Financial Impact
  feeAdjustmentRequired Boolean @default(false)
  feeAdjustmentAmount   Decimal? @db.Decimal(10, 2)
  feeAdjustmentNotes    String?
  
  // Documents
  transferCertificateUrl String?
  
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  
  @@index([tenantId, status])
  @@index([studentId])
  @@index([fromBranchId])
  @@index([toBranchId])
  @@map("branch_transfer_requests")
}

enum TransferRequestStatus {
  PENDING
  FROM_BRANCH_APPROVED
  TO_BRANCH_APPROVED
  APPROVED
  REJECTED
  EXECUTED
  CANCELLED
}
```

---

### 3. School-to-School Transfer (Within Sync Platform)

#### Vision:
Enable seamless student transfers between different schools using Sync, maintaining data continuity and reducing administrative burden.

#### Process Flow:

**Step 1: Transfer Initiation**
- Current school initiates transfer
- Search for destination school within Sync
- Send transfer request with student data
- Include academic records, attendance, fee history

**Step 2: Destination School Review**
- Receive transfer request notification
- Review student information
- Check admission requirements
- Accept or reject transfer

**Step 3: Data Transfer**
- If accepted, securely transfer:
  - Student profile
  - Academic records (assessments, report cards)
  - Attendance history
  - Medical records
  - Parent information
- Anonymize sensitive data as needed
- Comply with data protection regulations

**Step 4: Enrollment at New School**
- Generate new admission number
- Assign to class and branch
- Create new fee structure
- Send welcome communications
- Archive transfer documentation

**Step 5: Original School Cleanup**
- Mark student as TRANSFERRED
- Archive all records
- Close fee accounts
- Send transfer certificate
- Maintain read-only access to historical data

**Database Schema**:
```typescript
model InterSchoolTransfer {
  id                    String   @id @default(uuid())
  
  // Transfer Request ID (unique across platform)
  transferRequestId     String   @unique @default(uuid())
  
  // Source School (Current)
  sourceTenantId        String
  sourceTenant          Tenant   @relation("SourceSchool", fields: [sourceTenantId], references: [id])
  sourceStudentId       String
  sourceAdmissionNumber String
  
  // Destination School
  destinationTenantId   String
  destinationTenant     Tenant   @relation("DestinationSchool", fields: [destinationTenantId], references: [id])
  destinationStudentId  String?  // Created after acceptance
  destinationAdmissionNumber String?
  
  // Student Data Package (JSON)
  studentData           Json     // Encrypted student information
  academicRecords       Json     // Grades, assessments
  attendanceRecords     Json     // Attendance history
  medicalRecords        Json     // Medical information
  parentData            Json     // Parent/guardian information
  
  // Transfer Details
  transferReason        String
  requestedById         String   // User ID from source school
  requestedByName       String
  requestedByEmail      String
  requestDate           DateTime @default(now())
  
  // Status
  status                InterSchoolTransferStatus @default(PENDING)
  
  // Destination School Review
  reviewedById          String?  // User ID from destination school
  reviewedByName        String?
  reviewedAt            DateTime?
  reviewNotes           String?
  
  // Acceptance
  acceptedById          String?
  acceptedByName        String?
  acceptedAt            DateTime?
  
  // Rejection
  rejectedById          String?
  rejectedByName        String?
  rejectedAt            DateTime?
  rejectionReason       String?
  
  // Execution
  dataTransferredAt     DateTime?
  enrollmentCompletedAt DateTime?
  
  // Documents
  transferCertificateUrl String?
  academicTranscriptUrl  String?
  
  // Compliance
  dataConsentGiven      Boolean  @default(false)
  dataConsentDate       DateTime?
  gdprCompliant         Boolean  @default(true)
  
  // Communication
  notifications         InterSchoolTransferNotification[]
  
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt
  
  @@index([sourceTenantId, status])
  @@index([destinationTenantId, status])
  @@index([transferRequestId])
  @@map("inter_school_transfers")
}

enum InterSchoolTransferStatus {
  PENDING
  UNDER_REVIEW
  ACCEPTED
  REJECTED
  DATA_TRANSFER_IN_PROGRESS
  COMPLETED
  CANCELLED
}

model InterSchoolTransferNotification {
  id          String   @id @default(uuid())
  transferId  String
  transfer    InterSchoolTransfer @relation(fields: [transferId], references: [id], onDelete: Cascade)
  
  recipientTenantId String
  recipientEmail    String
  notificationType  String  // REQUEST_SENT, REQUEST_RECEIVED, ACCEPTED, REJECTED, COMPLETED
  sentAt            DateTime @default(now())
  readAt            DateTime?
  
  @@index([transferId])
  @@map("inter_school_transfer_notifications")
}
```

---

## Implementation Phases

### Phase 1: Enhanced Onboarding (Weeks 1-3)
- [ ] Create PreRegistration model and API
- [ ] Build StudentApplication workflow
- [ ] Implement document upload system
- [ ] Create onboarding checklist
- [ ] Build admin review dashboard
- [ ] Automated email notifications

### Phase 2: Branch Transfer Workflow (Weeks 4-5)
- [ ] Create BranchTransferRequest model
- [ ] Build approval workflow
- [ ] Implement capacity checks
- [ ] Fee adjustment logic
- [ ] Transfer execution automation
- [ ] Notification system

### Phase 3: Inter-School Transfer (Weeks 6-8)
- [ ] Create InterSchoolTransfer model
- [ ] Build secure data transfer mechanism
- [ ] Implement school discovery/search
- [ ] Create transfer request portal
- [ ] Data encryption and compliance
- [ ] Testing with pilot schools

### Phase 4: UI/UX Development (Weeks 9-11)
- [ ] Parent-facing application portal
- [ ] Admin review and approval dashboards
- [ ] Transfer request management UI
- [ ] Document upload and verification UI
- [ ] Progress tracking dashboards
- [ ] Mobile-responsive design

### Phase 5: Testing & Launch (Weeks 12-13)
- [ ] End-to-end testing
- [ ] Security audit
- [ ] Performance optimization
- [ ] User training materials
- [ ] Pilot with select schools
- [ ] Full rollout

---

## Key Features Summary

### For Parents
✅ Online application submission
✅ Document upload from mobile/desktop
✅ Real-time application status tracking
✅ Automated notifications at each stage
✅ Digital welcome packet
✅ Self-service transfer requests

### For School Admins
✅ Centralized application management
✅ Document verification workflow
✅ Automated admission number generation
✅ Bulk application processing
✅ Transfer approval workflows
✅ Capacity management
✅ Comprehensive audit trails

### For Platform (Sync)
✅ Inter-school transfer marketplace
✅ Data portability between schools
✅ Compliance with data protection laws
✅ Analytics on transfer patterns
✅ Revenue opportunities (transfer fees)

---

## Technical Considerations

### Security
- End-to-end encryption for sensitive data
- Role-based access control
- Audit logging for all actions
- GDPR/data protection compliance
- Secure document storage (S3/Azure Blob)

### Performance
- Async processing for bulk operations
- Background jobs for notifications
- Caching for frequently accessed data
- Optimistic UI updates

### Scalability
- Queue-based document processing
- CDN for document delivery
- Database indexing strategy
- Horizontal scaling support

### Integration
- Email service (SendGrid/Azure)
- SMS notifications (Twilio/AfricasTalking)
- Document storage (AWS S3/Azure Blob)
- Payment gateway (for application fees)
- Calendar integration (for scheduling)

---

## Success Metrics

### Onboarding
- Time to complete application: < 15 minutes
- Application approval time: < 48 hours
- Parent satisfaction score: > 4.5/5
- Document verification accuracy: > 95%

### Transfers
- Transfer request processing time: < 72 hours
- Transfer success rate: > 90%
- Data accuracy in transfers: 100%
- Parent satisfaction with process: > 4.0/5

### Platform
- Inter-school transfer adoption: 20% of schools in Year 1
- Average transfer completion time: < 7 days
- Data security incidents: 0
- System uptime: > 99.5%

---

## Next Steps

1. **Review & Approval**: Stakeholder review of this design
2. **Prioritization**: Determine which features are MVP vs. future
3. **Resource Allocation**: Assign development team
4. **Timeline Confirmation**: Finalize implementation schedule
5. **Pilot Selection**: Choose schools for pilot program
6. **Begin Development**: Start with Phase 1

---

## Appendix: API Endpoints

### Onboarding APIs
```
POST   /api/pre-registrations                    # Create pre-registration
GET    /api/pre-registrations                    # List pre-registrations
PUT    /api/pre-registrations/:id/review         # Review pre-registration
POST   /api/pre-registrations/:id/convert        # Convert to application

POST   /api/applications                         # Create application
GET    /api/applications                         # List applications
GET    /api/applications/:id                     # Get application details
PUT    /api/applications/:id                     # Update application
POST   /api/applications/:id/documents           # Upload document
PUT    /api/applications/:id/documents/:docId    # Verify document
POST   /api/applications/:id/schedule-assessment # Schedule assessment
PUT    /api/applications/:id/approve             # Approve application
PUT    /api/applications/:id/reject              # Reject application
POST   /api/applications/:id/enroll              # Convert to student

GET    /api/students/:id/onboarding              # Get onboarding status
PUT    /api/students/:id/onboarding              # Update onboarding checklist
```

### Branch Transfer APIs
```
POST   /api/branch-transfers/request             # Create transfer request
GET    /api/branch-transfers                     # List transfer requests
GET    /api/branch-transfers/:id                 # Get transfer details
PUT    /api/branch-transfers/:id/approve         # Approve transfer
PUT    /api/branch-transfers/:id/reject          # Reject transfer
POST   /api/branch-transfers/:id/execute         # Execute transfer
GET    /api/branch-transfers/:id/certificate     # Generate certificate
```

### Inter-School Transfer APIs
```
POST   /api/inter-school-transfers/initiate      # Initiate transfer
GET    /api/inter-school-transfers/incoming      # List incoming requests
GET    /api/inter-school-transfers/outgoing      # List outgoing requests
GET    /api/inter-school-transfers/:id           # Get transfer details
PUT    /api/inter-school-transfers/:id/accept    # Accept transfer
PUT    /api/inter-school-transfers/:id/reject    # Reject transfer
POST   /api/inter-school-transfers/:id/complete  # Complete transfer
GET    /api/schools/search                       # Search schools in Sync
```

---

**Document Version**: 1.0  
**Last Updated**: January 29, 2026  
**Author**: Kiro AI Assistant  
**Status**: Draft for Review
