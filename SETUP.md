# Sync School Management System - Setup Guide

## System Requirements

- **Node.js**: v14 or higher
- **MongoDB**: v4.4 or higher
- **npm** or **yarn**: Latest version
- **Web Browser**: Modern browser (Chrome, Firefox, Safari, Edge)

## Installation Steps

### 1. Install MongoDB

#### On Ubuntu/Debian:
```bash
# Import MongoDB public GPG key
wget -qO - https://www.mongodb.org/static/pgp/server-6.0.asc | sudo apt-key add -

# Create list file for MongoDB
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu focal/mongodb-org/6.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-6.0.list

# Update packages and install MongoDB
sudo apt-get update
sudo apt-get install -y mongodb-org

# Start MongoDB service
sudo systemctl start mongod
sudo systemctl enable mongod
```

#### On macOS:
```bash
# Using Homebrew
brew tap mongodb/brew
brew install mongodb-community@6.0

# Start MongoDB service
brew services start mongodb-community@6.0
```

#### On Windows:
Download and install MongoDB from: https://www.mongodb.com/try/download/community

### 2. Clone and Setup the Project

```bash
# Clone the repository
git clone https://github.com/LYANGEND/Sync.git
cd Sync

# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

### 3. Configure the Backend

```bash
# Navigate to backend directory
cd backend

# Create .env file from example
cp .env.example .env

# Edit .env file with your settings
# Default settings work for local development
```

### 4. Seed Sample Data (Optional)

```bash
# From backend directory
node seed.js
```

This will create:
- 3 Teachers
- 3 Classes
- 5 Students
- 5 Payment records
- 5 Attendance records

### 5. Run the Application

#### Terminal 1 - Start Backend:
```bash
cd backend
npm run dev
```
The backend will start on http://localhost:5000

#### Terminal 2 - Start Frontend:
```bash
cd frontend
npm run dev
```
The frontend will start on http://localhost:3000

### 6. Access the Application

Open your web browser and navigate to:
```
http://localhost:3000
```

## Default Configuration

### MongoDB Connection
```
URI: mongodb://localhost:27017/sync-school-management
Database: sync-school-management
```

### Backend API
```
Port: 5000
Base URL: http://localhost:5000/api
```

### Frontend
```
Port: 3000
URL: http://localhost:3000
```

## API Endpoints

### Students
- `GET /api/students` - Get all students
- `GET /api/students/:id` - Get single student
- `GET /api/students/with-payment-status` - Get students with payment info
- `POST /api/students` - Create new student
- `PUT /api/students/:id` - Update student
- `DELETE /api/students/:id` - Delete student

### Payments
- `GET /api/payments` - Get all payments
- `GET /api/payments/owing` - Get students with outstanding payments
- `GET /api/payments/stats` - Get payment statistics
- `POST /api/payments` - Create payment record
- `PUT /api/payments/:id` - Update payment
- `DELETE /api/payments/:id` - Delete payment

### Attendance
- `GET /api/attendance` - Get attendance records
- `GET /api/attendance/stats` - Get attendance statistics
- `POST /api/attendance` - Mark single attendance
- `POST /api/attendance/bulk` - Mark bulk attendance
- `DELETE /api/attendance/:id` - Delete attendance record

### Classes
- `GET /api/classes` - Get all classes
- `GET /api/classes/:id/students` - Get students in a class
- `POST /api/classes` - Create new class
- `PUT /api/classes/:id` - Update class
- `DELETE /api/classes/:id` - Delete class

### Teachers
- `GET /api/teachers` - Get all teachers
- `POST /api/teachers` - Create new teacher
- `PUT /api/teachers/:id` - Update teacher
- `DELETE /api/teachers/:id` - Delete teacher

## Troubleshooting

### MongoDB Connection Error
If you see "MongooseServerSelectionError", ensure MongoDB is running:
```bash
# Check MongoDB status
sudo systemctl status mongod

# Start MongoDB if not running
sudo systemctl start mongod
```

### Port Already in Use
If port 3000 or 5000 is already in use:
```bash
# Kill process on port 5000
sudo lsof -t -i:5000 | xargs kill -9

# Kill process on port 3000
sudo lsof -t -i:3000 | xargs kill -9
```

### Module Not Found Errors
Reinstall dependencies:
```bash
# Backend
cd backend
rm -rf node_modules package-lock.json
npm install

# Frontend
cd ../frontend
rm -rf node_modules package-lock.json
npm install
```

## Production Deployment

### Environment Variables for Production

Create a `.env` file in the backend directory with:
```
PORT=5000
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/sync-school-management
NODE_ENV=production
```

### Build Frontend for Production
```bash
cd frontend
npm run build
```

The built files will be in `frontend/dist/`

### Deploy Options
- **Heroku**: For backend and MongoDB Atlas for database
- **Vercel**: For frontend
- **DigitalOcean**: For full-stack deployment
- **AWS**: EC2 for backend, S3 + CloudFront for frontend

## Mobile Access

The application is mobile-first and fully responsive. Access from any device:
- Smartphones (iOS/Android)
- Tablets
- Desktop computers

## Support

For issues or questions:
- GitHub Issues: https://github.com/LYANGEND/Sync/issues
- Documentation: See README.md

## Security Notes

1. Change default MongoDB credentials in production
2. Use environment variables for sensitive data
3. Enable HTTPS in production
4. Implement authentication and authorization
5. Regular backups of the database
