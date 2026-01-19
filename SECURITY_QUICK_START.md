# 🚀 Security & Compliance - Quick Start Guide

## ⚡ Get Started in 5 Minutes

### Step 1: Verify Database Migration ✅
The migration has already been applied! Verify with:
```bash
cd backend
npx prisma migrate status
```

You should see: `Database schema is up to date!`

### Step 2: Start the Backend
```bash
cd backend
npm run dev
```

Backend will start on `http://localhost:3000`

### Step 3: Start the Frontend
```bash
cd frontend
npm run dev
```

Frontend will start on `http://localhost:5173`

### Step 4: Login to Platform Admin
1. Navigate to Platform Admin login page
2. Login with your platform admin credentials
3. **Security logging is now active!** Every login attempt is tracked

### Step 5: Test Security Features

#### Test Account Locking:
1. Try logging in with wrong password 5 times
2. Account will be locked automatically
3. Check email for lock notification
4. Go to Security tab → see locked account
5. Click "Unlock" to unlock manually

#### View Security Dashboard:
1. Click "Security" tab in sidebar
2. See real-time statistics:
   - Failed logins
   - Successful logins
   - Locked accounts
   - Suspicious activities
   - 2FA adoption rate
3. View recent security events
4. Filter by event type or search

#### Manage Data (GDPR):
1. Click "Data Management" tab
2. View data export requests
3. View deletion requests
4. Configure retention policies
5. Monitor backups

---

## 🎯 Key Features Available Now

### 1. Automatic Account Locking
- **Trigger**: 5 failed login attempts in 15 minutes
- **Duration**: 30 minutes (auto-unlock)
- **Notification**: Email sent to user
- **Manual Unlock**: Available in Security tab

### 2. Security Event Logging
Every action is logged:
- ✅ Failed logins
- ✅ Successful logins
- ✅ Account locks/unlocks
- ✅ Password changes
- ✅ Data exports
- ✅ Data deletions

### 3. Risk Scoring
- **Low (0-39)**: Normal activity
- **Medium (40-69)**: Suspicious
- **High (70-100)**: Critical threat

### 4. Email Notifications
Automatic emails for:
- Account locked
- Suspicious activity
- Multiple failed logins
- Data export ready
- Data deletion request

### 5. GDPR Compliance
- Data export requests
- Data deletion requests
- Retention policies
- Audit trails

---

## 📊 Dashboard Overview

### Security Tab
```
┌─────────────────────────────────────────┐
│  Failed Logins    Successful    Locked  │
│       45             1,250         3    │
│                                         │
│  Suspicious       2FA Adoption          │
│       8              35.5%              │
└─────────────────────────────────────────┘

Recent Failed Login Attempts
┌──────────────────────────────────────────┐
│ Time    Email         IP        Risk     │
│ 2:30pm  user@ex.com  192.168   High(85) │
│ 2:25pm  admin@ex.com 10.0.0.1  Med(45)  │
└──────────────────────────────────────────┘

Locked Accounts
┌──────────────────────────────────────────┐
│ Email         Reason      Actions        │
│ user@ex.com   5 failures  [Unlock]       │
└──────────────────────────────────────────┘
```

### Data Management Tab
```
┌─────────────────────────────────────────┐
│ [Data Exports] [Deletions] [Retention]  │
│                [Backups]                 │
└─────────────────────────────────────────┘

Data Export Requests
┌──────────────────────────────────────────┐
│ School      Type    Status    Actions    │
│ School A    FULL    PENDING   [Process]  │
│ School B    FULL    COMPLETED [Download] │
└──────────────────────────────────────────┘
```

---

## 🔧 Configuration

### Email Notifications
Emails are sent automatically using:
1. **Azure Communication Services** (if configured)
2. **SMTP** (fallback)

Configure in: Settings → Azure Email Configuration

### Retention Policies
Default policies:
- Audit logs: 90 days
- Security events: 180 days
- Backups: 30 days

Create custom policies in: Data Management → Retention Policies

### Account Lock Settings
Current settings (in code):
- **Threshold**: 5 failed attempts
- **Time Window**: 15 minutes
- **Lock Duration**: 30 minutes

To change, edit: `backend/src/middleware/securityLogger.ts`

---

## 🧪 Testing Scenarios

### Scenario 1: Test Account Locking
```bash
# Try logging in with wrong password 5 times
curl -X POST http://localhost:3000/api/platform/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"wrong"}'

# Repeat 5 times, then check Security tab
```

### Scenario 2: View Security Events
1. Login to Platform Admin
2. Click Security tab
3. See your login event logged
4. Filter by "SUCCESSFUL_LOGIN"

### Scenario 3: Create Data Export
1. Go to Data Management tab
2. Click Data Exports
3. Create new export request
4. Process the request
5. Download when complete

### Scenario 4: Configure Retention Policy
1. Go to Data Management → Retention Policies
2. Click "New Policy"
3. Select entity type: "AUDIT_LOGS"
4. Set retention: 90 days
5. Enable auto-delete
6. Save

---

## 📱 Mobile Responsive

All dashboards are fully responsive:
- ✅ Desktop (1920px+)
- ✅ Laptop (1366px+)
- ✅ Tablet (768px+)
- ✅ Mobile (375px+)

---

## 🐛 Troubleshooting

### Issue: Security events not showing
**Solution**: Check backend logs for errors. Ensure database migration applied.

### Issue: Email notifications not sending
**Solution**: 
1. Check Azure email configuration in Settings
2. Verify SMTP settings as fallback
3. Check backend logs for email errors

### Issue: Account not locking
**Solution**: 
1. Verify 5 failed attempts within 15 minutes
2. Check `security_events` table in database
3. Review `securityLogger.ts` configuration

### Issue: Frontend not loading
**Solution**:
1. Ensure backend is running on port 3000
2. Check browser console for errors
3. Verify API_URL in components

---

## 📞 Support

### Documentation
- `docs/SECURITY_COMPLIANCE.md` - Full documentation
- `IMPLEMENTATION_COMPLETE.md` - Implementation details
- `docs/AZURE_EMAIL_SETUP.md` - Email configuration

### Database
- Check `security_events` table for all events
- Check `account_locks` table for locked accounts
- Check `data_export_requests` for GDPR exports

### Logs
- Backend: Check terminal output
- Frontend: Check browser console
- Database: Check Prisma logs

---

## ✅ Verification Checklist

Before going to production, verify:

- [ ] Database migration applied successfully
- [ ] Backend starts without errors
- [ ] Frontend starts without errors
- [ ] Can login to Platform Admin
- [ ] Security tab loads and shows data
- [ ] Data Management tab loads
- [ ] Failed login creates security event
- [ ] Account locks after 5 failures
- [ ] Email notifications work
- [ ] Can unlock accounts manually
- [ ] Can create data export requests
- [ ] Can configure retention policies
- [ ] Can trigger backups

---

## 🎉 You're All Set!

Your platform now has:
- ✅ Enterprise-grade security monitoring
- ✅ Automatic threat detection
- ✅ GDPR compliance tools
- ✅ Email notifications
- ✅ Real-time dashboards
- ✅ Audit trails

**Start using it now!** Login to Platform Admin and click the Security tab.

---

## 🚀 Next Steps

1. **Customize email templates** in `securityNotificationService.ts`
2. **Adjust lock thresholds** in `securityLogger.ts`
3. **Add 2FA** for extra security
4. **Set up async jobs** for exports/backups
5. **Configure retention policies** for your needs

**Happy securing!** 🔒
