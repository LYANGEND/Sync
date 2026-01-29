# Payments & Branch Management - Brainstorming Session

## Current State Analysis

### What We Have ✅
- Payments linked to branches via `branchId` field
- Branch-specific payment filtering
- Branch financial summaries
- Multi-branch support for students and staff
- Payment tracking by branch

### What's Missing ❌
- Branch-specific fee structures
- Branch-level payment targets/goals
- Inter-branch payment transfers
- Branch-specific payment methods
- Branch cashier/bursar management
- Branch-level reconciliation
- Branch performance incentives
- Split payments across branches
- Branch-specific discounts/scholarships

---

## Key Challenges & Opportunities

### Challenge 1: Different Fee Structures Per Branch
**Scenario**: North Campus charges K5,000/term while South Campus charges K4,500/term due to different facilities.

**Current Problem**: 
- Fee templates are tenant-wide, not branch-specific
- No way to set different prices for different branches
- Manual adjustments needed for each student

**Proposed Solutions**:

#### Option A: Branch-Specific Fee Templates
```typescript
model FeeTemplate {
  id          String   @id @default(uuid())
  tenantId    String
  tenant      Tenant   @relation(fields: [tenantId], references: [id])
  
  name        String   // "Tuition Fee"
  description String?
  amount      Decimal  @db.Decimal(10, 2)
  frequency   String   // TERM, MONTHLY, ANNUAL
  
  // NEW: Branch Specificity
  branchId    String?  // NULL = applies to all branches
  branch      Branch?  @relation(fields: [branchId], references: [id])
  
  // NEW: Branch Overrides
  branchOverrides BranchFeeOverride[]
  
  @@index([tenantId, branchId])
}

model BranchFeeOverride {
  id            String      @id @default(uuid())
  feeTemplateId String
  feeTemplate   FeeTemplate @relation(fields: [feeTemplateId], references: [id])
  branchId      String
  branch        Branch      @relation(fields: [branchId], references: [id])
  
  overrideAmount Decimal    @db.Decimal(10, 2)
  reason         String?    // "Lower cost of living in this area"
  
  @@unique([feeTemplateId, branchId])
}
```

**Benefits**:
- Flexible pricing per branch
- Easy to manage from admin dashboard
- Automatic application when student enrolls
- Historical tracking of fee changes

---

### Challenge 2: Branch Revenue Targets & Performance

**Scenario**: School wants to set monthly collection targets for each branch and track performance.

**Proposed Solution**:

```typescript
model BranchRevenueTarget {
  id          String   @id @default(uuid())
  tenantId    String
  tenant      Tenant   @relation(fields: [tenantId], references: [id])
  branchId    String
  branch      Branch   @relation(fields: [branchId], references: [id])
  
  // Target Period
  year        Int
  month       Int      // 1-12
  quarter     Int?     // 1-4 (optional)
  
  // Targets
  targetAmount        Decimal @db.Decimal(12, 2)
  targetTransactions  Int?
  targetNewStudents   Int?
  
  // Actual Performance (calculated)
  actualAmount        Decimal @db.Decimal(12, 2) @default(0)
  actualTransactions  Int     @default(0)
  actualNewStudents   Int     @default(0)
  
  // Performance Metrics
  achievementRate     Decimal? @db.Decimal(5, 2) // Percentage
  
  // Incentives
  incentiveAmount     Decimal? @db.Decimal(10, 2)
  incentivePaid       Boolean  @default(false)
  incentivePaidDate   DateTime?
  
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  @@unique([tenantId, branchId, year, month])
  @@index([branchId, year, month])
}
```

**Features**:
- Set monthly/quarterly targets per branch
- Real-time performance tracking
- Automated achievement rate calculation
- Incentive management for branch managers
- Comparative analytics across branches

**Dashboard Views**:
- Branch performance leaderboard
- Target vs. actual charts
- Trend analysis
- Predictive analytics for target achievement

---

### Challenge 3: Branch Cashier/Bursar Management

**Scenario**: Each branch has dedicated cashiers who handle payments. Need to track who collected what.

**Proposed Solution**:

```typescript
model BranchCashier {
  id          String   @id @default(uuid())
  tenantId    String
  tenant      Tenant   @relation(fields: [tenantId], references: [id])
  
  userId      String
  user        User     @relation(fields: [userId], references: [id])
  branchId    String
  branch      Branch   @relation(fields: [branchId], references: [id])
  
  // Cashier Details
  cashierCode String   @unique  // "CSH-001"
  isActive    Boolean  @default(true)
  
  // Limits & Permissions
  dailyLimit  Decimal? @db.Decimal(10, 2)  // Max they can collect per day
  canVoid     Boolean  @default(false)
  canRefund   Boolean  @default(false)
  
  // Float Management
  openingFloat    Decimal? @db.Decimal(10, 2)
  currentFloat    Decimal? @db.Decimal(10, 2)
  
  // Shift Management
  shiftStart      DateTime?
  shiftEnd        DateTime?
  
  // Performance
  totalCollected  Decimal  @db.Decimal(12, 2) @default(0)
  transactionCount Int     @default(0)
  
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  // Relations
  cashierSessions CashierSession[]
  
  @@unique([userId, branchId])
  @@index([branchId, isActive])
}

model CashierSession {
  id          String   @id @default(uuid())
  cashierId   String
  cashier     BranchCashier @relation(fields: [cashierId], references: [id])
  
  // Session Details
  sessionNumber String   @unique  // "SES-20260129-001"
  startTime     DateTime @default(now())
  endTime       DateTime?
  
  // Float
  openingFloat  Decimal  @db.Decimal(10, 2)
  closingFloat  Decimal? @db.Decimal(10, 2)
  
  // Collections
  cashCollected       Decimal @db.Decimal(10, 2) @default(0)
  mobileMoneyCollected Decimal @db.Decimal(10, 2) @default(0)
  bankDepositCollected Decimal @db.Decimal(10, 2) @default(0)
  totalCollected      Decimal @db.Decimal(10, 2) @default(0)
  
  // Reconciliation
  expectedAmount  Decimal? @db.Decimal(10, 2)
  variance        Decimal? @db.Decimal(10, 2)  // Difference
  isReconciled    Boolean  @default(false)
  reconciledAt    DateTime?
  reconciledById  String?
  reconciliationNotes String?
  
  // Payments in this session
  payments        Payment[]
  
  @@index([cashierId, startTime])
}

// Update Payment model to include session
model Payment {
  // ... existing fields ...
  
  cashierSessionId String?
  cashierSession   CashierSession? @relation(fields: [cashierSessionId], references: [id])
}
```

**Features**:
- Cashier shift management
- Opening/closing float tracking
- Session-based reconciliation
- Variance detection and reporting
- Cashier performance metrics
- Audit trail for all transactions

---

### Challenge 4: Inter-Branch Payment Transfers

**Scenario**: Student transfers from Branch A to Branch B mid-term. Need to transfer their payment history and outstanding balance.

**Proposed Solution**:

```typescript
model BranchPaymentTransfer {
  id          String   @id @default(uuid())
  tenantId    String
  tenant      Tenant   @relation(fields: [tenantId], references: [id])
  
  // Transfer Details
  transferNumber String   @unique  // "BPT-20260129-001"
  studentId      String
  student        Student  @relation(fields: [studentId], references: [id])
  
  fromBranchId   String
  fromBranch     Branch   @relation("PaymentTransferFrom", fields: [fromBranchId], references: [id])
  
  toBranchId     String
  toBranch       Branch   @relation("PaymentTransferTo", fields: [toBranchId], references: [id])
  
  // Financial Details
  outstandingBalance  Decimal @db.Decimal(10, 2)
  creditBalance       Decimal @db.Decimal(10, 2) @default(0)  // If overpaid
  
  // Fee Adjustments
  oldFeeStructure     Json    // Snapshot of fees at old branch
  newFeeStructure     Json    // Fees at new branch
  feeAdjustment       Decimal @db.Decimal(10, 2) @default(0)  // Difference
  
  // Proration
  daysAtOldBranch     Int?
  daysAtNewBranch     Int?
  proratedAmount      Decimal? @db.Decimal(10, 2)
  
  // Transfer Status
  status              PaymentTransferStatus @default(PENDING)
  
  // Approvals
  fromBranchApprovedById String?
  fromBranchApprovedAt   DateTime?
  
  toBranchApprovedById   String?
  toBranchApprovedAt     DateTime?
  
  // Execution
  executedById    String?
  executedAt      DateTime?
  
  // Notes
  notes           String?
  
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  
  @@index([studentId])
  @@index([fromBranchId])
  @@index([toBranchId])
}

enum PaymentTransferStatus {
  PENDING
  FROM_BRANCH_APPROVED
  TO_BRANCH_APPROVED
  APPROVED
  EXECUTED
  REJECTED
}
```

**Features**:
- Automatic balance transfer
- Fee proration based on days spent at each branch
- Approval workflow
- Audit trail
- Financial reconciliation

---

### Challenge 5: Branch-Specific Payment Methods

**Scenario**: Some branches have mobile money agents, others only accept cash. Need to configure available payment methods per branch.

**Proposed Solution**:

```typescript
model BranchPaymentMethod {
  id          String   @id @default(uuid())
  branchId    String
  branch      Branch   @relation(fields: [branchId], references: [id])
  
  method      PaymentMethod
  isEnabled   Boolean  @default(true)
  
  // Method-Specific Config
  mobileMoneyOperators String[]  // ["mtn", "airtel"]
  bankAccounts         Json?     // Branch-specific bank details
  
  // Limits
  minAmount   Decimal? @db.Decimal(10, 2)
  maxAmount   Decimal? @db.Decimal(10, 2)
  
  // Fees
  processingFee      Decimal? @db.Decimal(10, 2)
  processingFeeType  String?  // FIXED, PERCENTAGE
  
  // Agent Details (for mobile money)
  agentName   String?
  agentPhone  String?
  agentCode   String?
  
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  @@unique([branchId, method])
}
```

**Features**:
- Configure available payment methods per branch
- Set limits and fees per method per branch
- Agent management for mobile money
- Branch-specific bank account details

---

### Challenge 6: Branch-Level Discounts & Scholarships

**Scenario**: Branch manager wants to offer early payment discounts or scholarships specific to their branch.

**Proposed Solution**:

```typescript
model BranchDiscount {
  id          String   @id @default(uuid())
  tenantId    String
  tenant      Tenant   @relation(fields: [tenantId], references: [id])
  branchId    String
  branch      Branch   @relation(fields: [branchId], references: [id])
  
  // Discount Details
  name        String   // "Early Bird Discount"
  description String?
  code        String?  @unique  // "EARLY2026"
  
  // Discount Type
  discountType    DiscountType
  discountValue   Decimal @db.Decimal(10, 2)
  
  // Applicability
  applicableToFees String[]  // Fee template IDs
  minPaymentAmount Decimal?  @db.Decimal(10, 2)
  
  // Conditions
  requiresFullPayment Boolean @default(false)
  validFrom           DateTime
  validUntil          DateTime
  maxUsageCount       Int?
  currentUsageCount   Int @default(0)
  
  // Approval
  requiresApproval    Boolean @default(false)
  approvedById        String?
  approvedAt          DateTime?
  
  isActive    Boolean  @default(true)
  
  // Applications
  applications BranchDiscountApplication[]
  
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  @@index([branchId, isActive])
  @@index([code])
}

enum DiscountType {
  PERCENTAGE
  FIXED_AMOUNT
  WAIVER  // Full waiver
}

model BranchDiscountApplication {
  id          String   @id @default(uuid())
  discountId  String
  discount    BranchDiscount @relation(fields: [discountId], references: [id])
  
  studentId   String
  student     Student  @relation(fields: [studentId], references: [id])
  
  paymentId   String?
  payment     Payment? @relation(fields: [paymentId], references: [id])
  
  // Discount Applied
  originalAmount  Decimal @db.Decimal(10, 2)
  discountAmount  Decimal @db.Decimal(10, 2)
  finalAmount     Decimal @db.Decimal(10, 2)
  
  appliedAt   DateTime @default(now())
  appliedById String
  appliedBy   User     @relation(fields: [appliedById], references: [id])
  
  @@index([discountId])
  @@index([studentId])
}
```

**Features**:
- Branch-specific discount campaigns
- Early payment incentives
- Sibling discounts
- Bulk payment discounts
- Usage tracking and limits
- Approval workflows

---

### Challenge 7: Branch Payment Analytics & Reporting

**What Branch Managers Need to See**:

#### Daily Dashboard
- Today's collections by method
- Number of transactions
- Average transaction value
- Outstanding collections for the day
- Cashier performance
- Payment method breakdown

#### Weekly/Monthly Reports
- Collection trends
- Target vs. actual
- Student payment status (paid/pending/overdue)
- Class-wise collection rates
- Payment method preferences
- Peak collection times

#### Comparative Analytics
- Branch vs. branch performance
- Historical comparisons
- Seasonal trends
- Forecasting

**Proposed Views**:

```typescript
// API Endpoints
GET /api/branches/:id/payments/dashboard
GET /api/branches/:id/payments/daily-summary
GET /api/branches/:id/payments/weekly-report
GET /api/branches/:id/payments/monthly-report
GET /api/branches/:id/payments/comparative
GET /api/branches/:id/payments/forecast

// Response Structure
{
  summary: {
    todayCollections: 45000,
    todayTransactions: 23,
    avgTransactionValue: 1956.52,
    targetAchievement: 75.5,
    outstandingToday: 15000
  },
  byMethod: [
    { method: "CASH", amount: 25000, count: 15 },
    { method: "MOBILE_MONEY", amount: 20000, count: 8 }
  ],
  byCashier: [
    { cashierName: "John Doe", amount: 30000, count: 18 },
    { cashierName: "Jane Smith", amount: 15000, count: 5 }
  ],
  hourlyTrend: [...],
  studentStatus: {
    fullyPaid: 120,
    partiallyPaid: 45,
    notPaid: 15
  }
}
```

---

### Challenge 8: Split Payments Across Branches

**Scenario**: Student attends classes at multiple branches (e.g., main campus for academics, sports campus for athletics). Payment needs to be split.

**Proposed Solution**:

```typescript
model SplitPayment {
  id          String   @id @default(uuid())
  tenantId    String
  tenant      Tenant   @relation(fields: [tenantId], references: [id])
  
  // Main Payment
  paymentId   String   @unique
  payment     Payment  @relation(fields: [paymentId], references: [id])
  
  // Split Details
  splits      PaymentSplit[]
  
  // Totals
  totalAmount Decimal  @db.Decimal(10, 2)
  
  createdAt   DateTime @default(now())
}

model PaymentSplit {
  id              String   @id @default(uuid())
  splitPaymentId  String
  splitPayment    SplitPayment @relation(fields: [splitPaymentId], references: [id])
  
  branchId        String
  branch          Branch   @relation(fields: [branchId], references: [id])
  
  // Split Amount
  amount          Decimal  @db.Decimal(10, 2)
  percentage      Decimal  @db.Decimal(5, 2)
  
  // Reason
  reason          String?  // "Tuition", "Sports Fee", "Lab Fee"
  
  @@index([splitPaymentId])
  @@index([branchId])
}
```

**Features**:
- Automatic split based on enrollment
- Manual split configuration
- Percentage or fixed amount splits
- Branch-wise revenue attribution
- Reporting per branch

---

## Implementation Priority

### Phase 1: Foundation (Weeks 1-2)
1. ✅ Branch-specific fee templates
2. ✅ Branch payment method configuration
3. ✅ Basic branch payment analytics

### Phase 2: Operations (Weeks 3-4)
4. ✅ Cashier management system
5. ✅ Cashier sessions and reconciliation
6. ✅ Branch revenue targets

### Phase 3: Advanced (Weeks 5-6)
7. ✅ Inter-branch payment transfers
8. ✅ Branch-specific discounts
9. ✅ Split payments

### Phase 4: Analytics (Weeks 7-8)
10. ✅ Advanced reporting dashboards
11. ✅ Predictive analytics
12. ✅ Performance incentives

---

## UI/UX Mockups Needed

### Branch Manager Dashboard
```
┌─────────────────────────────────────────────────────┐
│ North Campus - Payment Dashboard                    │
├─────────────────────────────────────────────────────┤
│                                                      │
│  Today's Collections          Target Achievement    │
│  K 45,000 (23 txns)          75.5% (K 45k/K 60k)   │
│                                                      │
│  ┌──────────────┐  ┌──────────────┐                │
│  │ Cash         │  │ Mobile Money │                │
│  │ K 25,000     │  │ K 20,000     │                │
│  │ 15 txns      │  │ 8 txns       │                │
│  └──────────────┘  └──────────────┘                │
│                                                      │
│  Active Cashiers (2)                                │
│  ┌────────────────────────────────────────┐        │
│  │ John Doe    | K 30,000 | 18 txns | 🟢 │        │
│  │ Jane Smith  | K 15,000 | 5 txns  | 🟢 │        │
│  └────────────────────────────────────────┘        │
│                                                      │
│  [View Detailed Report] [Reconcile Sessions]       │
└─────────────────────────────────────────────────────┘
```

### Cashier Session Screen
```
┌─────────────────────────────────────────────────────┐
│ Cashier Session - John Doe (CSH-001)               │
├─────────────────────────────────────────────────────┤
│                                                      │
│  Session: SES-20260129-001                          │
│  Started: 08:00 AM                                  │
│  Opening Float: K 5,000                             │
│                                                      │
│  Collections Today:                                 │
│  ├─ Cash: K 25,000 (15 txns)                       │
│  ├─ Mobile Money: K 15,000 (8 txns)                │
│  └─ Total: K 40,000 (23 txns)                      │
│                                                      │
│  Expected Closing: K 45,000                         │
│  Actual Cash: [ _______ ]                           │
│                                                      │
│  [Record Payment] [Close Session] [View History]   │
└─────────────────────────────────────────────────────┘
```

---

## API Endpoints Summary

### Branch Payment Management
```
GET    /api/branches/:id/payments                    # List payments
GET    /api/branches/:id/payments/summary            # Summary stats
GET    /api/branches/:id/payments/dashboard          # Dashboard data
POST   /api/branches/:id/payments                    # Record payment

GET    /api/branches/:id/revenue-targets             # Get targets
POST   /api/branches/:id/revenue-targets             # Set target
PUT    /api/branches/:id/revenue-targets/:targetId   # Update target

GET    /api/branches/:id/cashiers                    # List cashiers
POST   /api/branches/:id/cashiers                    # Add cashier
PUT    /api/branches/:id/cashiers/:cashierId         # Update cashier

GET    /api/branches/:id/cashier-sessions            # List sessions
POST   /api/branches/:id/cashier-sessions            # Start session
PUT    /api/branches/:id/cashier-sessions/:sessionId/close  # Close session
POST   /api/branches/:id/cashier-sessions/:sessionId/reconcile  # Reconcile

GET    /api/branches/:id/fee-templates               # Branch fees
POST   /api/branches/:id/fee-overrides               # Set override

GET    /api/branches/:id/discounts                   # List discounts
POST   /api/branches/:id/discounts                   # Create discount
POST   /api/branches/:id/discounts/:discountId/apply # Apply to student

POST   /api/branch-payment-transfers                 # Initiate transfer
GET    /api/branch-payment-transfers/:id             # Get transfer
PUT    /api/branch-payment-transfers/:id/approve     # Approve transfer
```

---

## Success Metrics

### Operational Efficiency
- Payment recording time: < 2 minutes
- Session reconciliation time: < 10 minutes
- Variance rate: < 1%
- Cashier productivity: > 20 transactions/day

### Financial Performance
- Collection rate: > 85%
- Target achievement: > 80%
- Payment method diversity: 3+ methods
- Discount utilization: 10-15%

### User Satisfaction
- Branch manager satisfaction: > 4.5/5
- Cashier ease of use: > 4.0/5
- Parent payment experience: > 4.5/5
- Reconciliation accuracy: > 99%

---

## Security Considerations

### Access Control
- Branch managers can only see their branch data
- Cashiers can only record payments for their branch
- Super admins can see all branches
- Audit logs for all financial transactions

### Data Protection
- Encrypted payment data
- PCI compliance for card payments
- Secure mobile money integration
- Regular security audits

### Fraud Prevention
- Daily reconciliation requirements
- Variance alerts
- Duplicate payment detection
- Unusual activity monitoring

---

## Next Steps

1. **Stakeholder Review**: Present to school administrators
2. **Prioritize Features**: Determine MVP vs. future phases
3. **Technical Design**: Detailed architecture and database design
4. **Prototype**: Build cashier session management first
5. **Pilot**: Test with 2-3 branches
6. **Iterate**: Refine based on feedback
7. **Scale**: Roll out to all branches

---

**Document Version**: 1.0  
**Date**: January 29, 2026  
**Status**: Brainstorming - Ready for Review
