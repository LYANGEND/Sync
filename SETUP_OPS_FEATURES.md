# 🚀 Quick Setup Guide - Ops Admin Advanced Features

## ✅ What's Been Implemented

All 5 advanced features are now ready to use:

1. ✅ **Email Service Integration** (Azure Communication Services + SMTP)
2. ✅ **PDF Invoice Generation** (Professional invoices for payments)
3. ✅ **Scheduled Reports** (Weekly/Monthly automated reports)
4. ✅ **Email Templates** (Beautiful branded templates)
5. ✅ **Analytics Charts** (Revenue trend visualization)

---

## 📦 Installation

### Option 1: Automatic (Recommended)

**Windows:**
```cmd
cd scripts
install-ops-features.bat
```

**Linux/Mac:**
```bash
cd scripts
chmod +x install-ops-features.sh
./install-ops-features.sh
```

### Option 2: Manual

```bash
# Backend packages
cd backend
npm install @azure/communication-email pdfkit @types/pdfkit node-cron @types/node-cron

# Frontend packages (optional)
cd ../frontend
npm install chart.js react-chartjs-2
```

---

## ⚙️ Configuration

### 1. Environment Variables

Add to `backend/.env`:

```env
# Azure Email Service (Optional - for high-volume sending)
AZURE_COMMUNICATION_CONNECTION_STRING=endpoint=https://...;accesskey=...
AZURE_COMMUNICATION_FROM_ADDRESS=DoNotReply@yourdomain.com

# Frontend URL (for email links)
FRONTEND_URL=http://localhost:5173

# Email Queue Settings (Optional)
EMAIL_QUEUE_DELAY_MS=1500
EMAIL_MAX_RETRIES=3
```

### 2. Initialize Scheduled Reports

Edit `backend/src/server.ts`:

```typescript
import { initializeScheduledReports } from './services/scheduledReportsService';

// After app.listen()
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    
    // Initialize scheduled reports
    initializeScheduledReports();
    
    console.log('✅ Scheduled reports initialized');
});
```

---

## 🧪 Testing

### 1. Test Bulk Email

1. Start the backend: `cd backend && npm run dev`
2. Start the frontend: `cd frontend && npm run dev`
3. Login to Platform Admin
4. Go to **Tenants** tab
5. Click **"Bulk Email"** button
6. Select target schools and send

**Expected Result:** Emails queued and sent to selected schools

### 2. Test Invoice Generation

1. Go to **Payments** tab
2. Click on any **COMPLETED** payment
3. Click **"Download Invoice PDF"** button

**Expected Result:** Professional PDF invoice downloads

### 3. Test Scheduled Reports

**Manual trigger:**
```bash
cd backend
npx ts-node -e "require('./src/services/scheduledReportsService').sendWeeklyReport()"
```

**Expected Result:** Report email sent to all platform admins

### 4. Test Analytics Charts

1. Go to **Dashboard** tab
2. Scroll to **"Revenue Trend"** section

**Expected Result:** Animated bar chart showing 12-month revenue

---

## 🎯 Features Overview

### 1. Email Service Integration

**What it does:**
- Sends emails using Azure Communication Services or SMTP
- Automatic fallback to SMTP if Azure fails
- Email queue prevents rate limiting
- Retry logic for failed emails

**How to use:**
- Bulk emails: Platform Admin → Tenants → Bulk Email
- Automatic emails: Payment receipts, welcome emails, etc.

**Azure Setup (Optional):**
1. Create Azure Communication Services resource
2. Get connection string
3. Add to `.env` file
4. System automatically uses Azure

### 2. PDF Invoice Generation

**What it does:**
- Generates professional PDF invoices
- Includes school branding
- Itemized breakdown
- Payment status

**How to use:**
- View payment details
- Click "Download Invoice PDF"
- PDF downloads automatically

**Programmatic:**
```typescript
import { generateSubscriptionInvoice } from './services/invoiceService';
const pdf = await generateSubscriptionInvoice(paymentId);
```

### 3. Scheduled Reports

**What it does:**
- Weekly reports every Monday at 9 AM
- Monthly reports on 1st of month at 9 AM
- Sent to all platform admins
- Includes key metrics and charts

**Customize schedule:**
Edit `scheduledReportsService.ts`:
```typescript
// Daily at 8 AM
cron.schedule('0 8 * * *', sendWeeklyReport);

// Every Friday at 5 PM
cron.schedule('0 17 * * 5', sendWeeklyReport);
```

### 4. Email Templates

**Available templates:**
- Announcements
- Payment Receipts
- Welcome Emails
- Fee Reminders
- Password Reset
- Generic Notifications

**Features:**
- School logo and branding
- Responsive design
- Professional layout
- Customizable content

**Usage:**
```typescript
import { paymentReceiptTemplate } from './services/emailTemplateService';

const html = await paymentReceiptTemplate({
    tenantId: 'school-id',
    recipientName: 'Parent Name',
    studentName: 'Student Name',
    amount: 5000,
    // ... more options
});
```

### 5. Analytics Charts

**What it shows:**
- 12-month revenue trend
- Growth indicators
- Summary statistics
- Color-coded metrics

**Location:** Platform Admin → Dashboard

**Metrics:**
- This Month Revenue (with growth %)
- Average per School
- Payment Success Rate
- School Fees Volume
- Revenue Trend Chart

---

## 📊 Dashboard Enhancements

### New Metrics Cards

1. **This Month Revenue**
   - Current month revenue
   - Growth % vs last month
   - Green/red indicator

2. **Average per School**
   - Revenue per tenant
   - Helps identify pricing effectiveness

3. **Payment Success Rate**
   - Last 30 days
   - Identifies payment issues

4. **School Fees Volume**
   - Total gateway transactions
   - Mobile Money + Bank Deposits

### Revenue Trend Chart

- Visual bar chart
- 12-month history
- Animated bars
- Total and average summary

---

## 🔧 Troubleshooting

### Emails Not Sending

**Check:**
1. SMTP settings configured in tenant
2. Azure credentials (if using Azure)
3. Email queue status
4. Server logs

**Solution:**
```bash
# Check email queue status
# In your API or logs
```

### PDF Generation Fails

**Error:** "PDFKit not installed"

**Solution:**
```bash
cd backend
npm install pdfkit @types/pdfkit
```

### Scheduled Reports Not Running

**Check:**
1. node-cron installed
2. `initializeScheduledReports()` called in server.ts
3. Server timezone

**Solution:**
```bash
cd backend
npm install node-cron @types/node-cron
```

### Charts Not Displaying

**Check:**
1. Revenue data exists
2. Browser console for errors
3. API returning data

**Solution:**
- Ensure payments exist in database
- Check network tab for API errors

---

## 📚 Documentation

- **Full Guide:** `docs/OPS_ADMIN_FEATURES.md`
- **Service Files:** `backend/src/services/`
- **API Routes:** `backend/src/routes/platformAdminRoutes.ts`

---

## 🎉 You're All Set!

All features are now ready to use. Here's what you can do:

1. ✅ Send bulk emails to schools
2. ✅ Generate PDF invoices
3. ✅ Receive automated reports
4. ✅ Use beautiful email templates
5. ✅ View revenue analytics

**Next Steps:**
1. Configure Azure (optional)
2. Test each feature
3. Customize email templates
4. Adjust report schedules
5. Monitor email queue

---

## 💡 Pro Tips

- **Azure vs SMTP:** Use Azure for high-volume (>100 emails/day)
- **Email Queue:** Prevents Gmail rate limiting
- **Scheduled Reports:** Run during off-peak hours
- **Invoice Storage:** Consider saving PDFs to cloud storage
- **Email Templates:** Keep updated with school branding

---

## 🆘 Need Help?

1. Check `docs/OPS_ADMIN_FEATURES.md` for detailed docs
2. Review service files for implementation details
3. Check server logs for errors
4. Test with small batches first

---

**Happy Managing! 🚀**
