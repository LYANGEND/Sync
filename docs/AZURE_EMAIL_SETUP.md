# Azure Email Configuration Guide

## Overview

The platform now supports Azure Communication Services for high-volume, reliable email delivery. This is recommended for sending more than 100 emails per day.

## Features

✅ **Dashboard Configuration** - Configure Azure email directly from Platform Admin settings
✅ **Automatic Fallback** - Falls back to SMTP if Azure fails
✅ **Two Connection Methods** - Connection String or Endpoint + Access Key
✅ **High Deliverability** - Enterprise-grade email service
✅ **No Code Changes** - All configuration through UI

---

## Setup Instructions

### Step 1: Database Migration

Run the Prisma migration to add Azure email fields:

```bash
cd backend
npx prisma migrate dev --name add_azure_email_settings
```

Or apply manually:
```bash
npx prisma db push
```

### Step 2: Install Azure SDK (Optional)

The Azure SDK is optional. The system will work with SMTP if Azure SDK is not installed.

```bash
cd backend
npm install @azure/communication-email
```

### Step 3: Create Azure Communication Services Resource

1. **Go to Azure Portal:**
   - Visit [https://portal.azure.com](https://portal.azure.com)
   - Sign in with your Microsoft account

2. **Create Communication Services:**
   - Click "Create a resource"
   - Search for "Communication Services"
   - Click "Create"
   - Fill in:
     - **Subscription:** Your Azure subscription
     - **Resource Group:** Create new or use existing
     - **Resource Name:** e.g., "sync-school-email"
     - **Region:** Choose closest to your users
   - Click "Review + Create"

3. **Configure Email Domain:**
   - Go to your Communication Services resource
   - Click "Email" → "Domains"
   - Add your domain (e.g., yourdomain.com)
   - Verify domain ownership (add DNS records)
   - Wait for verification (can take up to 24 hours)

4. **Get Connection String:**
   - Go to "Keys" section
   - Copy the "Primary connection string"
   - It looks like: `endpoint=https://...;accesskey=...`

### Step 4: Configure in Platform Admin Dashboard

1. **Login to Platform Admin:**
   - Go to your platform admin URL
   - Login with superadmin credentials

2. **Navigate to Settings:**
   - Click "Settings" tab
   - Scroll to "Azure Email Service Configuration"

3. **Enable Azure Email:**
   - Check "Enable Azure Communication Services"

4. **Choose Connection Method:**

   **Option A: Connection String (Recommended)**
   - Select "Connection String"
   - Paste your connection string
   - Enter your verified email address (e.g., DoNotReply@yourdomain.com)

   **Option B: Endpoint + Access Key**
   - Select "Endpoint + Access Key"
   - Enter endpoint: `https://your-resource.communication.azure.com`
   - Enter access key from Azure portal
   - Enter your verified email address

5. **Save Settings:**
   - Click "Save Azure Settings"
   - System will now use Azure for email delivery

---

## Testing

### Test Email Sending

1. **Send Bulk Email:**
   - Go to Tenants tab
   - Click "Bulk Email"
   - Select a test school
   - Send test email

2. **Check Logs:**
   - Backend logs will show: `📧 Attempting to send via Azure Communication Services...`
   - If successful: `✅ Azure email sent successfully`
   - If failed: `⚠️ Azure email failed, falling back to SMTP...`

### Verify in Azure Portal

1. Go to your Communication Services resource
2. Click "Monitoring" → "Metrics"
3. View email delivery statistics

---

## Configuration Options

### Connection String Method

**Pros:**
- Simpler setup (one field)
- Includes both endpoint and key
- Recommended by Microsoft

**Cons:**
- Longer string to manage

**Format:**
```
endpoint=https://your-resource.communication.azure.com;accesskey=your-access-key
```

### Endpoint + Access Key Method

**Pros:**
- Separate credentials
- Easier to rotate keys

**Cons:**
- Two fields to manage

**Format:**
```
Endpoint: https://your-resource.communication.azure.com
Access Key: your-access-key-here
```

---

## Email Flow

```
┌─────────────────┐
│  Send Email     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Azure Enabled?  │
└────────┬────────┘
         │
    ┌────┴────┐
    │   YES   │   NO
    ▼         ▼
┌─────────┐ ┌──────┐
│  Azure  │ │ SMTP │
└────┬────┘ └──────┘
     │
  Success?
     │
  ┌──┴──┐
  │ NO  │ YES
  ▼     ▼
┌──────┐ ✅
│ SMTP │
└──────┘
```

---

## Pricing

### Azure Communication Services Email

**Free Tier:**
- 100 emails/month free

**Paid Tier:**
- $0.00025 per email (after free tier)
- ~$0.25 per 1,000 emails
- ~$25 per 100,000 emails

**Comparison:**
- SendGrid: $19.95/month for 50,000 emails
- Mailgun: $35/month for 50,000 emails
- Azure: ~$12.50 for 50,000 emails

### When to Use Azure

✅ **Use Azure if:**
- Sending >100 emails/day
- Need high deliverability
- Want enterprise support
- Already using Azure services

❌ **Use SMTP if:**
- Sending <100 emails/day
- Have existing SMTP provider
- Want simpler setup
- Budget constraints

---

## Troubleshooting

### Error: "Azure email failed"

**Check:**
1. Connection string is correct
2. Domain is verified in Azure
3. From address matches verified domain
4. Azure SDK is installed (`npm install @azure/communication-email`)

**Solution:**
- Verify connection string in Azure Portal
- Check domain verification status
- Ensure from address uses verified domain

### Error: "Azure SDK not installed"

**Solution:**
```bash
cd backend
npm install @azure/communication-email
```

### Emails Not Sending

**Check:**
1. Azure email is enabled in settings
2. Connection string is saved (not showing ********)
3. From address is configured
4. Backend logs for errors

**Solution:**
- Re-save settings in dashboard
- Check backend logs: `npm run dev`
- Verify Azure resource is active

### Domain Verification Pending

**Check:**
- DNS records are added correctly
- Wait up to 24 hours for verification
- Check Azure portal for verification status

**Solution:**
- Add required DNS records to your domain
- Wait for propagation
- System will use SMTP until verified

---

## Security Best Practices

### Connection String Security

✅ **Do:**
- Store in database (encrypted at rest)
- Use environment variables as backup
- Rotate keys regularly
- Use separate keys for dev/prod

❌ **Don't:**
- Commit to version control
- Share in plain text
- Use same key across environments
- Log connection strings

### Access Control

- Only PLATFORM_SUPERADMIN can configure
- Settings are masked in UI (********)
- API responses mask sensitive data
- Audit logs track changes

---

## Monitoring

### Check Email Status

**In Azure Portal:**
1. Go to Communication Services resource
2. Click "Monitoring" → "Metrics"
3. View:
   - Emails sent
   - Delivery rate
   - Bounce rate
   - Failed deliveries

**In Platform Admin:**
- Check backend logs for delivery status
- Monitor email queue status
- Review failed email logs

### Set Up Alerts

**In Azure:**
1. Go to "Alerts" → "Create alert rule"
2. Set conditions:
   - Failed email deliveries > threshold
   - Bounce rate > threshold
3. Configure action groups (email notifications)

---

## Migration from SMTP

### Gradual Migration

1. **Enable Azure** (keeps SMTP as fallback)
2. **Test with small batch** (10-20 emails)
3. **Monitor for 24 hours**
4. **Increase volume gradually**
5. **Full migration** after successful testing

### Rollback Plan

If issues occur:
1. Disable Azure in settings
2. System automatically uses SMTP
3. No downtime or email loss
4. Fix Azure configuration
5. Re-enable when ready

---

## FAQ

**Q: Do I need to change any code?**
A: No, all configuration is through the dashboard.

**Q: What happens if Azure fails?**
A: System automatically falls back to SMTP.

**Q: Can I use both Azure and SMTP?**
A: Yes, Azure is primary, SMTP is fallback.

**Q: How do I know which service sent an email?**
A: Check backend logs for delivery method.

**Q: Is Azure required?**
A: No, SMTP works fine for low volume (<100/day).

**Q: Can I test before going live?**
A: Yes, use "Send Test Email" button (coming soon).

**Q: What about email templates?**
A: Templates work with both Azure and SMTP.

**Q: How do I rotate keys?**
A: Generate new key in Azure, update in dashboard.

---

## Support

### Azure Support
- [Azure Communication Services Docs](https://learn.microsoft.com/en-us/azure/communication-services/)
- [Email Service Quickstart](https://learn.microsoft.com/en-us/azure/communication-services/quickstarts/email/send-email)
- [Azure Support Portal](https://portal.azure.com/#blade/Microsoft_Azure_Support/HelpAndSupportBlade)

### Platform Support
- Check `docs/OPS_ADMIN_FEATURES.md` for general features
- Review backend logs for errors
- Contact platform administrator

---

## Summary

✅ **Configured:** Azure email in dashboard
✅ **Tested:** Send test emails
✅ **Monitored:** Check Azure metrics
✅ **Secured:** Connection strings protected
✅ **Fallback:** SMTP as backup

**You're all set!** The platform will now use Azure for reliable, high-volume email delivery with automatic SMTP fallback.
