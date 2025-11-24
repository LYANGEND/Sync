import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Login from './pages/auth/Login';
import Dashboard from './pages/dashboard/Dashboard';
import Students from './pages/students/Students';
import StudentProfile from './pages/students/StudentProfile';
import Finance from './pages/finance/Finance';
import Attendance from './pages/attendance/Attendance';
import Academics from './pages/academics/Academics';
import GradingScales from './pages/academics/GradingScales';
import ReportCards from './pages/academics/ReportCards';
import Timetable from './pages/academics/Timetable';
import Subjects from './pages/subjects/Subjects';
import Classes from './pages/classes/Classes';
import Users from './pages/users/Users';
import Settings from './pages/settings/Settings';
import Communication from './pages/communication/Communication';
import DashboardLayout from './components/layout/DashboardLayout';
import ProtectedRoute from './components/layout/ProtectedRoute';
import RoleGuard from './components/layout/RoleGuard';

import StudentQuiz from './pages/student/StudentQuiz';
import StudentAssessments from './pages/student/StudentAssessments';

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          
          <Route element={<ProtectedRoute />}>
            <Route path="/student/quiz/:assessmentId" element={<StudentQuiz />} />
            
            <Route element={<DashboardLayout />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/student/assessments" element={
                <RoleGuard allowedRoles={['STUDENT', 'SUPER_ADMIN', 'SYSTEM_OWNER']}>
                  <StudentAssessments />
                </RoleGuard>
              } />
              
              <Route path="/students" element={
                <RoleGuard allowedRoles={['SUPER_ADMIN', 'BURSAR', 'TEACHER', 'SECRETARY', 'SYSTEM_OWNER']}>
                  <Students />
                </RoleGuard>
              } />
              <Route path="/students/:id" element={
                <RoleGuard allowedRoles={['SUPER_ADMIN', 'BURSAR', 'TEACHER', 'SECRETARY', 'SYSTEM_OWNER']}>
                  <StudentProfile />
                </RoleGuard>
              } />
              
              <Route path="/finance" element={
                <RoleGuard allowedRoles={['SUPER_ADMIN', 'BURSAR', 'SYSTEM_OWNER']}>
                  <Finance />
                </RoleGuard>
              } />
              
              <Route path="/attendance" element={
                <RoleGuard allowedRoles={['SUPER_ADMIN', 'TEACHER', 'SECRETARY', 'SYSTEM_OWNER']}>
                  <Attendance />
                </RoleGuard>
              } />
              
              <Route path="/academics" element={
                <RoleGuard allowedRoles={['SUPER_ADMIN', 'TEACHER', 'SYSTEM_OWNER']}>
                  <Academics />
                </RoleGuard>
              } />
              <Route path="/academics/grading-scales" element={
                <RoleGuard allowedRoles={['SUPER_ADMIN', 'TEACHER', 'SYSTEM_OWNER']}>
                  <GradingScales />
                </RoleGuard>
              } />
              <Route path="/academics/report-cards" element={
                <RoleGuard allowedRoles={['SUPER_ADMIN', 'TEACHER', 'SYSTEM_OWNER']}>
                  <ReportCards />
                </RoleGuard>
              } />
              <Route path="/academics/timetable" element={
                <RoleGuard allowedRoles={['SUPER_ADMIN', 'TEACHER', 'STUDENT', 'PARENT', 'SYSTEM_OWNER']}>
                  <Timetable />
                </RoleGuard>
              } />
              <Route path="/subjects" element={
                <RoleGuard allowedRoles={['SUPER_ADMIN', 'TEACHER', 'SYSTEM_OWNER']}>
                  <Subjects />
                </RoleGuard>
              } />
              <Route path="/classes" element={
                <RoleGuard allowedRoles={['SUPER_ADMIN', 'TEACHER', 'SECRETARY', 'SYSTEM_OWNER']}>
                  <Classes />
                </RoleGuard>
              } />
              
              <Route path="/users" element={
                <RoleGuard allowedRoles={['SUPER_ADMIN', 'SYSTEM_OWNER']}>
                  <Users />
                </RoleGuard>
              } />

              <Route path="/communication" element={
                <RoleGuard allowedRoles={['SUPER_ADMIN', 'BURSAR', 'TEACHER', 'SECRETARY', 'PARENT', 'SYSTEM_OWNER']}>
                  <Communication />
                </RoleGuard>
              } />

              <Route path="/settings" element={
                <RoleGuard allowedRoles={['SUPER_ADMIN', 'SYSTEM_OWNER']}>
                  <Settings />
                </RoleGuard>
              } />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
