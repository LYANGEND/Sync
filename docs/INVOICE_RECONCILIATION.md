# Invoice Management & Revenue Reconciliation

## Overview
Complete invoice generation and revenue reconciliation system for tracking subscription payments and financial reporting.

## Features Implemented

### 1. Invoice Management
- **Automatic Invoice Generation**: Generate invoices for subscription payments
- **Bulk Invoice Generation**: Create invoices for all completed payments without invoices
- **PDF Export**: Download professional PDF invoices
- **Payment Reminders**: Send email reminders for unpaid invoices
- **Invoice Tracking**: Track invoice status (Draft, Sent, Paid, Overdue, Cancelled)
- **Invoice Details**: View complete invoice breakdown with line items

### 2. Revenue Reconciliation
- **Dashboard Overview**: Real-time financial metrics
  - Total Invoiced
  - Total Paid
  - Outstanding Balance
  - Overdue Invoices Count
- **Overdue Invoice Tracking**: Monitor and manage overdue payments
- **Missing Payment Alerts**: Identify discrepancies between expected and actual payments
- **Reconciliation Reports**: Run period-based reconciliation analysis
- **Financial Export**: Export detailed financial reports to CSV
- **Reconciliation History**: Track all past reconciliation runs

## Database Schema

### Invoice Model
```prisma
model Invoice {
  id                    String           @id @default(uuid())
  tenantId              String
  invoiceNumber         String           @unique
  invoiceType           InvoiceType
  status                InvoiceStatus    @default(DRAFT)
  subtotal              Decimal          @db.Decimal(10, 2)
  taxAmount             Decimal          @db.Decimal(10, 2)
  discountAmount        Decimal          @db.Decimal(10, 2)
  totalAmount           Decimal          @db.Decimal(10, 2)
  paidAmount            Decimal          @db.Decimal(10, 2)
  balanceAmount         Decimal          @db.Decimal(10, 2)
  currency              String           @default("ZMW")
  issueDate             DateTime         @default(now())
  dueDate               DateTime
  paidDate              DateTime?
  remindersSent         Int              @default(0)
  lastReminderAt        DateTime?
  subscriptionPaymentId String?          @unique
  createdAt             DateTime         @default(now())
  updatedAt             DateTime         @updatedAt
  
  tenant                Tenant           @relation(fields: [tenantId], references: [id])
  subscriptionPayment   SubscriptionPayment? @relation(fields: [subscriptionPaymentId], references: [id])
  items                 InvoiceItem[]
  payments              InvoicePayment[]
}
```

### PaymentReconciliation Model
```prisma
model PaymentReconciliation {
  id                   String    @id @default(uuid())
  periodStart          DateTime
  periodEnd            DateTime
  tenantId             String?
  totalInvoiced        Decimal   @db.Decimal(12, 2)
  totalPaid            Decimal   @db.Decimal(12, 2)
  totalOutstanding     Decimal   @db.Decimal(12, 2)
  totalOverdue         Decimal   @db.Decimal(12, 2)
  invoiceCount         Int
  paidInvoiceCount     Int
  overdueInvoiceCount  Int
  discrepancyAmount    Decimal   @default(0) @db.Decimal(12, 2)
  status               String    @default("PENDING")
  performedBy          String?
  completedAt          DateTime?
  createdAt            DateTime  @default(now())
  
  tenant               Tenant?   @relation(fields: [tenantId], references: [id])
}
```

## API Endpoints

### Invoice Management
- `GET /api/platform/finance/invoices` - Get all invoices with filters
- `POST /api/platform/finance/invoices/generate` - Generate invoice for subscription payment
- `GET /api/platform/finance/invoices/:invoiceId/pdf` - Download invoice PDF
- `POST /api/platform/finance/invoices/:invoiceId/reminder` - Send payment reminder
- `POST /api/platform/finance/invoices/bulk-generate` - Bulk generate invoices

### Revenue Reconciliation
- `GET /api/platform/finance/reconciliation/dashboard` - Get reconciliation dashboard
- `POST /api/platform/finance/reconciliation/run` - Run reconciliation for a period
- `GET /api/platform/finance/reconciliation/history` - Get reconciliation history
- `GET /api/platform/finance/reconciliation/export` - Export financial report (CSV)

## Frontend Components

### InvoiceManagement Component
Location: `frontend/src/components/InvoiceManagement.tsx`

Features:
- Invoice list with search and filters
- Status badges (Paid, Sent, Overdue, Cancelled)
- View invoice details modal
- Download PDF functionality
- Send reminder functionality
- Bulk generate invoices button

### RevenueReconciliation Component
Location: `frontend/src/components/RevenueReconciliation.tsx`

Features:
- Financial summary cards
- Date range filtering
- Overdue invoices table
- Missing payment alerts
- Run reconciliation modal
- Export financial report
- Reconciliation history

## Usage

### Accessing the Features
1. Login to Platform Admin portal
2. Navigate to **Finance** group in sidebar
3. Choose between:
   - **Invoice Management**: Generate and track invoices
   - **Revenue Reconciliation**: Analyze financial data

### Generating Invoices
1. Go to Invoice Management
2. Click "Bulk Generate" to create invoices for all completed payments
3. Or generate individual invoices from payment records

### Running Reconciliation
1. Go to Revenue Reconciliation
2. Select date range
3. Click "Run Reconciliation"
4. View results in dashboard and history

### Exporting Reports
1. Set desired date range
2. Click "Export Report"
3. CSV file will download with all invoice details

## Invoice PDF Format
Generated PDFs include:
- Company header
- Invoice number and dates
- Bill to information
- Itemized line items
- Subtotal, tax, discount breakdown
- Total, paid, and balance amounts
- Professional formatting

## Email Notifications
Payment reminders include:
- Invoice details
- Amount due
- Due date
- Payment instructions
- Tracks reminder count and last sent date

## Best Practices
1. **Regular Reconciliation**: Run monthly reconciliation reports
2. **Monitor Overdue**: Check overdue invoices weekly
3. **Bulk Generation**: Generate invoices at end of billing cycle
4. **Export Reports**: Keep monthly CSV exports for accounting
5. **Send Reminders**: Send reminders 7 days before and after due date

## Future Enhancements
- Automated reminder scheduling
- Payment gateway integration for invoice payments
- Multi-currency support
- Tax calculation rules
- Discount management
- Credit notes and refunds
- Recurring invoice templates
- Email template customization
