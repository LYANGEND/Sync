# Quick Start Guide - Sync School Management System

## 🚀 5-Minute Setup

### Prerequisites Check
```bash
node --version  # Should be v14+
npm --version   # Should be 6+
mongod --version  # Should be 4.4+
```

### Quick Setup
```bash
# 1. Clone and install
git clone https://github.com/LYANGEND/Sync.git
cd Sync
cd backend && npm install
cd ../frontend && npm install

# 2. Setup environment
cd ../backend
cp .env.example .env

# 3. Start MongoDB (if not running)
# Ubuntu/Debian: sudo systemctl start mongod
# macOS: brew services start mongodb-community
# Windows: Start MongoDB from Services

# 4. Seed sample data
node seed.js

# 5. Start backend (Terminal 1)
npm run dev

# 6. Start frontend (Terminal 2 - new terminal)
cd ../frontend
npm run dev
```

### Access the Application
Open browser: `http://localhost:3000`

## 📱 Features Overview

### Dashboard
- View total students, payments collected, and outstanding fees
- Quick action buttons for common tasks
- Payment and attendance statistics

### Students Management
- Add new students with class assignments (Baby/Primary/Secondary)
- View student profiles with parent contact information
- Search and filter students by class level

### Students Owing Dashboard
- See all students with outstanding fees
- Filter by term and academic year
- One-click parent contact (phone call)
- Total outstanding amount display

### Attendance System
- Select class and date
- One-tap marking: Present, Absent, Late, Excused
- Bulk actions: Mark all present, Clear all
- Real-time status counts
- Save attendance with one click

### Payment Tracking
- Record payments with ZMW currency
- Payment status badges (Paid, Partial, Pending)
- Filter payments by status
- View payment history per student

### Class Management
- View all classes with teacher assignments
- See class capacity and room information
- Organized by class level (Baby/Primary/Secondary)

### Teacher Management
- View all registered teachers
- Teacher contact information
- Subject and qualification details

## 💡 Usage Tips

### For Teachers (Non-Technical Users)

1. **Taking Attendance**
   - Go to "Attendance" menu
   - Select your class from dropdown
   - Tap green "✓ Present" for students who are present
   - Tap red "✗ Absent" for absent students
   - Click "💾 Save Attendance" when done

2. **Checking Who Owes Fees**
   - Click "Students Owing" in menu
   - See list with amounts owed
   - Click "📞 Call" to contact parents directly

3. **Recording Payments**
   - Go to "Payments" menu
   - Click payment to view details
   - Update payment amounts as received

4. **Finding a Student**
   - Go to "Students" menu
   - Type name or student ID in search box
   - Filter by class level if needed

## 🎨 Mobile Experience

The system is designed mobile-first:
- Large touch-friendly buttons
- Simple navigation
- One-tap actions
- Optimized for phone screens
- Works offline once loaded (basic features)

## 📊 Understanding Payment Status

- **Paid** (Green): Full payment received
- **Partial** (Yellow): Some payment received, balance remaining
- **Pending** (Red): No payment received yet

## 🎓 Class Levels in Zambia

- **Baby**: Early childhood (Grades 1-3)
- **Primary**: Elementary education (Grades 4-7)
- **Secondary**: High school (Grades 8-12)

## 🗓️ Academic Terms

- **Term 1**: January - April
- **Term 2**: May - August
- **Term 3**: September - December

## 🔧 Common Tasks

### Adding a New Student
1. Dashboard → Click "➕ Add New Student"
2. Fill in student details
3. Add parent contact information
4. Select class level and grade
5. Save

### Marking Daily Attendance
1. Go to Attendance page
2. Select today's date (default)
3. Choose your class
4. Quick mark all present OR mark individually
5. Save attendance

### Checking Outstanding Fees
1. Click "Students Owing" in menu OR
2. Dashboard → Click "📊 Students Owing" button
3. View list sorted by amount owed
4. Contact parents using phone button

## ❓ FAQ

**Q: What if I make a mistake in attendance?**
A: You can re-mark attendance for the same day, it will update the existing record.

**Q: Can I see attendance history?**
A: Yes, go to Attendance page and change the date to view past records.

**Q: How do I print reports?**
A: Use your browser's print function (Ctrl+P or Cmd+P) on any page.

**Q: What if I forget to save attendance?**
A: All unmarked attendance is lost. Always click "Save Attendance" before leaving the page.

**Q: Can multiple teachers use the system at once?**
A: Yes! The system supports multiple concurrent users.

## 🆘 Getting Help

- Check the full documentation in `SETUP.md`
- Report issues on GitHub
- Contact system administrator

## 📱 Recommended Devices

- ✅ Smartphones (Android/iOS)
- ✅ Tablets
- ✅ Desktop computers
- ✅ Laptops

Internet connection required for syncing data.
