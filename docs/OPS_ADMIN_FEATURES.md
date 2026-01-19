# Ops Admin Platform - Advanced Features

This document describes the advanced features implemented for the Ops Admin platform.

## 📧 1. Email Service Integration

### Overview
The platform supports multiple email services for reliable email delivery:
- **Nodemailer (SMTP)** - Default, works with any SMTP provider
- **Azure Communication Services** - Enterprise-grade email service
- **Email Queue System** - Prevents rate limiting and ensures delivery

### Setup

#### Option A: SMTP (Gmail, Outlook, etc.)
Already configured per-tenant in the database. Each school can use their own SMTP settings.

#### Option B: Azure Communication Services

1. **Install Azure SDK:**
```bash
cd backend
npm install @azure/communication-email
```

2. **Get Azure Credentials:**
   - Go to [Azure Portal](https://portal.azure.com)
   - Create a Communication Services resource
   - Get your connection string

3. **Configure Environment Variables:**
```env
# backend/.env
AZURE_COMMUNICATION_CONNECTION_STRING=endpoint=https://...;accesskey=...
AZURE_COMMUNICATION_FROM_ADDRESS=DoNotReply@your-domain.com
```

4. **Usage:**
The system automatically uses Azure if configured, otherwise falls back to SMTP.

### Email Templates
Pre-built beautiful HTML templates for:
- ✅ Announcements
- ✅ Payment Receipts
- ✅ Welcome Emails
- ✅ Fee Reminders
- ✅ Password Reset
- ✅ Generic Notifications

All templates are branded with school logos and colors.

### Email Queue
- Automatically queues emails to prevent rate limiting
- Configurable delay between emails (default: 1.5s)
- Retry logic for failed emails (3 attempts)
- Status monitoring

---

## 📄 2. PDF Invoice Generation

### Overview
Automatically generates professional PDF invoices for subscription payments.

### Setup

1. **Install PDFKit:**
```bash
cd backend
npm install pdfkit @types/pdfkit
```

2. **Generate Invoices:**

**Via API:**
```
GET /api/platform/invoices/:paymentId/pdf
Authorization: Bearer <token>
```

**Via Frontend:**
- Go to Payments tab
- Click on any completed payment
- Click "Download Invoice PDF" button

### Invoice Features
- ✅ Professional layout with branding
- ✅ Itemized breakdown (base plan + overage)
- ✅ Payment status indicator
- ✅ School details
- ✅ Transaction information
- ✅ Automatic receipt numbers

### Programmatic Usage
```typescript
import { generateSubscriptionInvoice } from './services/invoiceService';

const pdfBuffer = await generateSubscriptionInvoice(paymentId);
// Save to file or send via email
```

---

## 📊 3. Scheduled Reports

### Overview
Automatically generates and emails weekly/monthly platform reports to admins.

### Setup

1. **Install node-cron:**
```bash
cd backend
npm install node-cron @types/node-cron
```

2. **Initialize in server.ts:**
```typescript
import { initializeScheduledReports } from './services/scheduledReportsService';

// After server starts
initializeScheduledReports();
```

### Report Schedule
- **Weekly Reports:** Every Monday at 9 AM
- **Monthly Reports:** 1st of each month at 9 AM

### Report Contents
- 📈 New schools signed up
- 💰 Total revenue
- 👥 New students enrolled
- 📊 Active subscriptions
- ⚠️ Expiring subscriptions
- ✅ Payment success rate
- 📉 Daily growth charts

### Manual Trigger
```typescript
import { sendWeeklyReport, sendMonthlyReport } from './services/scheduledReportsService';

// Send reports manually
await sendWeeklyReport();
await sendMonthlyReport();
```

### Customize Schedule
Edit `scheduledReportsService.ts`:
```typescript
// Change to daily at 8 AM
cron.schedule('0 8 * * *', () => {
    sendWeeklyReport();
});
```

---

## 📧 4. Email Templates System

### Overview
Reusable, branded email templates with school-specific customization.

### Available Templates

#### 1. Announcement Template
```typescript
import { announcementTemplate } from './services/emailTemplateService';

const html = await announcementTemplate({
    tenantId: 'school-id',
    recipientName: 'John Doe',
    subject: 'Important Update',
    message: 'We are excited to announce...',
});
```

#### 2. Payment Receipt Template
```typescript
import { paymentReceiptTemplate } from './services/emailTemplateService';

const html = await paymentReceiptTemplate({
    tenantId: 'school-id',
    recipientName: 'Parent Name',
    studentName: 'Student Name',
    amount: 5000,
    currency: 'ZMW',
    paymentDate: new Date(),
    paymentMethod: 'Mobile Money',
    transactionId: 'TXN-12345',
    balance: 0,
});
```

#### 3. Welcome Email Template
```typescript
import { welcomeEmailTemplate } from './services/emailTemplateService';

const html = await welcomeEmailTemplate({
    tenantId: 'school-id',
    recipientName: 'New User',
    email: 'user@example.com',
    temporaryPassword: 'temp123',
    role: 'Parent',
});
```

#### 4. Fee Reminder Template
```typescript
import { feeReminderTemplate } from './services/emailTemplateService';

const html = await feeReminderTemplate({
    tenantId: 'school-id',
    recipientName: 'Parent Name',
    studentName: 'Student Name',
    amount: 3000,
    dueDate: new Date('2024-12-31'),
    feeItems: [
        { name: 'Tuition', amount: 2000 },
        { name: 'Books', amount: 1000 },
    ],
});
```

### Template Customization
Templates automatically use:
- School logo
- School colors (primary, secondary, accent)
- School contact information
- School branding

---

## 📈 5. Analytics Charts

### Overview
Visual revenue trend charts on the dashboard.

### Features
- ✅ 12-month revenue history
- ✅ Animated bar charts
- ✅ Color-coded metrics
- ✅ Growth indicators
- ✅ Summary statistics

### Dashboard Metrics
1. **This Month Revenue** - with growth %
2. **Average per School** - revenue per tenant
3. **Payment Success Rate** - last 30 days
4. **School Fees Volume** - gateway transactions
5. **Revenue Trend Chart** - 12-month visualization

### Future Enhancements
To add Chart.js for advanced charts:

```bash
cd frontend
npm install chart.js react-chartjs-2
```

Then create interactive charts:
```typescript
import { Line, Bar, Pie } from 'react-chartjs-2';

// Line chart for revenue trends
// Bar chart for tier comparison
// Pie chart for status distribution
```

---

## 🚀 Quick Start Guide

### 1. Install All Dependencies

```bash
# Backend
cd backend
npm install @azure/communication-email pdfkit @types/pdfkit node-cron @types/node-cron

# Frontend (optional for advanced charts)
cd frontend
npm install chart.js react-chartjs-2
```

### 2. Configure Environment Variables

```env
# backend/.env

# Azure Email (Optional)
AZURE_COMMUNICATION_CONNECTION_STRING=your-connection-string
AZURE_COMMUNICATION_FROM_ADDRESS=DoNotReply@yourdomain.com

# Frontend URL (for email links)
FRONTEND_URL=http://localhost:5173

# Email Queue Settings (Optional)
EMAIL_QUEUE_DELAY_MS=1500
EMAIL_MAX_RETRIES=3
```

### 3. Initialize Services

In `backend/src/server.ts`:

```typescript
import { initializeScheduledReports } from './services/scheduledReportsService';

// After server starts
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    
    // Initialize scheduled reports
    initializeScheduledReports();
});
```

### 4. Test Features

#### Test Bulk Email:
1. Go to Platform Admin → Tenants
2. Click "Bulk Email"
3. Select target schools
4. Send test email

#### Test Invoice Generation:
1. Go to Platform Admin → Payments
2. Click on any completed payment
3. Click "Download Invoice PDF"

#### Test Scheduled Reports:
```bash
# In backend directory
npx ts-node -e "require('./src/services/scheduledReportsService').sendWeeklyReport()"
```

---

## 📝 API Endpoints

### Email
- `POST /api/platform/bulk/email` - Send bulk email to schools

### Invoices
- `GET /api/platform/invoices/:paymentId/pdf` - Download invoice PDF

### Exports
- `GET /api/platform/export/tenants` - Export schools to CSV
- `GET /api/platform/export/subscription-payments` - Export subscription payments
- `GET /api/platform/export/school-transactions` - Export school transactions

---

## 🔧 Troubleshooting

### Email Not Sending
1. Check SMTP settings in tenant configuration
2. Verify Azure credentials if using Azure
3. Check email queue status
4. Review server logs for errors

### PDF Generation Fails
1. Ensure PDFKit is installed: `npm install pdfkit`
2. Check payment exists in database
3. Verify file permissions for temp directory

### Scheduled Reports Not Running
1. Ensure node-cron is installed: `npm install node-cron`
2. Verify `initializeScheduledReports()` is called
3. Check server timezone settings
4. Review cron schedule syntax

### Charts Not Displaying
1. Verify revenue data exists in database
2. Check browser console for errors
3. Ensure stats API is returning data

---

## 📚 Additional Resources

- [Azure Communication Services Docs](https://learn.microsoft.com/en-us/azure/communication-services/)
- [PDFKit Documentation](https://pdfkit.org/)
- [node-cron Documentation](https://github.com/node-cron/node-cron)
- [Nodemailer Documentation](https://nodemailer.com/)

---

## 🎯 Next Steps

1. **Email Service**: Choose between SMTP or Azure and configure
2. **PDF Generation**: Install PDFKit and test invoice generation
3. **Scheduled Reports**: Install node-cron and initialize
4. **Test Everything**: Send test emails, generate invoices, check reports
5. **Monitor**: Check email queue status and report delivery

---

## 💡 Tips

- Use Azure Communication Services for high-volume email sending
- Schedule reports during off-peak hours
- Monitor email queue to prevent backlog
- Regularly backup invoice PDFs
- Test email templates before bulk sending
- Keep email templates updated with school branding

---

**Need Help?** Check the service files in `backend/src/services/` for detailed implementation and examples.
