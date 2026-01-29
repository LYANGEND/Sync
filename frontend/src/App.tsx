import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { BranchProvider } from './context/BranchContext';
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
import Branches from './pages/branches/Branches';
import BranchDetail from './pages/branches/BranchDetail';
import Settings from './pages/settings/Settings';
import Profile from './pages/profile/Profile';
import Communication from './pages/communication/Communication';
import MyChildren from './pages/parents/MyChildren';
import AcademicReports from './pages/parents/AcademicReports';
import DashboardLayout from './components/layout/DashboardLayout';
import ProtectedRoute from './components/layout/ProtectedRoute';
import RoleGuard from './components/layout/RoleGuard';

import StudentQuiz from './pages/student/StudentQuiz';
import StudentAssessments from './pages/student/StudentAssessments';
import AttendanceRegister from './pages/academics/AttendanceRegister';
import TeacherGradebook from './pages/academics/TeacherGradebook';
import { Toaster } from 'react-hot-toast';
import VerifyReport from './pages/public/VerifyReport';
import PublicPayment from './pages/public/PublicPayment';
import ShareTargetHandler from './pages/public/ShareTargetHandler';

function App() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <BranchProvider>
          <Router>
            <Toaster position="top-right" />
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/verify/report/:id" element={<VerifyReport />} />
              <Route path="/pay" element={<PublicPayment />} />
              <Route path="/share-target" element={<ShareTargetHandler />} />
              <Route path="/open-file" element={<ShareTargetHandler />} />

              <Route element={<ProtectedRoute />}>
                <Route path="/student/quiz/:assessmentId" element={<StudentQuiz />} />

                <Route element={<DashboardLayout />}>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/profile" element={<Profile />} />
                  <Route path="/my-children" element={
                    <RoleGuard allowedRoles={['PARENT']}>
                      <MyChildren />
                    </RoleGuard>
                  } />
                  <Route path="/student/assessments" element={
                    <RoleGuard allowedRoles={['STUDENT', 'SUPER_ADMIN', 'PARENT']}>
                      <StudentAssessments />
                    </RoleGuard>
                  } />

                  <Route path="/students" element={
                    <RoleGuard allowedRoles={['SUPER_ADMIN', 'BURSAR', 'TEACHER', 'SECRETARY']}>
                      <Students />
                    </RoleGuard>
                  } />
                  <Route path="/students/:id" element={
                    <RoleGuard allowedRoles={['SUPER_ADMIN', 'BURSAR', 'TEACHER', 'SECRETARY']}>
                      <StudentProfile />
                    </RoleGuard>
                  } />

                  <Route path="/finance" element={
                    <RoleGuard allowedRoles={['SUPER_ADMIN', 'BURSAR']}>
                      <Finance />
                    </RoleGuard>
                  } />

                  <Route path="/attendance" element={
                    <RoleGuard allowedRoles={['SUPER_ADMIN', 'TEACHER', 'SECRETARY']}>
                      <Attendance />
                    </RoleGuard>
                  } />

                  <Route path="/academics" element={
                    <RoleGuard allowedRoles={['SUPER_ADMIN', 'TEACHER']}>
                      <Academics />
                    </RoleGuard>
                  } />
                  <Route path="/academics/grading-scales" element={
                    <RoleGuard allowedRoles={['SUPER_ADMIN', 'TEACHER']}>
                      <GradingScales />
                    </RoleGuard>
                  } />
                  <Route path="/academics/report-cards" element={
                    <RoleGuard allowedRoles={['SUPER_ADMIN', 'TEACHER']}>
                      <ReportCards />
                    </RoleGuard>
                  } />


                // ... (In Routes)
                  <Route path="/academics/attendance" element={
                    <RoleGuard allowedRoles={['SUPER_ADMIN', 'TEACHER', 'SECRETARY']}>
                      <AttendanceRegister />
                    </RoleGuard>
                  } />
                  <Route path="/academics/gradebook" element={
                    <RoleGuard allowedRoles={['SUPER_ADMIN', 'TEACHER', 'BURSAR', 'SECRETARY']}>
                      <TeacherGradebook />
                    </RoleGuard>
                  } />

                  <Route path="/academics/timetable" element={
                    <RoleGuard allowedRoles={['SUPER_ADMIN', 'TEACHER', 'STUDENT', 'PARENT']}>
                      <Timetable />
                    </RoleGuard>
                  } />
                  <Route path="/subjects" element={
                    <RoleGuard allowedRoles={['SUPER_ADMIN', 'TEACHER']}>
                      <Subjects />
                    </RoleGuard>
                  } />
                  <Route path="/classes" element={
                    <RoleGuard allowedRoles={['SUPER_ADMIN', 'TEACHER', 'SECRETARY']}>
                      <Classes />
                    </RoleGuard>
                  } />

                  <Route path="/users" element={
                    <RoleGuard allowedRoles={['SUPER_ADMIN']}>
                      <Users />
                    </RoleGuard>
                  } />

                  <Route path="/branches" element={
                    <RoleGuard allowedRoles={['SUPER_ADMIN', 'BRANCH_MANAGER']}>
                      <Branches />
                    </RoleGuard>
                  } />
                  <Route path="/branches/:id" element={
                    <RoleGuard allowedRoles={['SUPER_ADMIN', 'BRANCH_MANAGER']}>
                      <BranchDetail />
                    </RoleGuard>
                  } />

                  <Route path="/communication" element={
                    <RoleGuard allowedRoles={['SUPER_ADMIN', 'BURSAR', 'TEACHER', 'SECRETARY', 'PARENT']}>
                      <Communication />
                    </RoleGuard>
                  } />

                  <Route path="/academics/reports" element={
                    <RoleGuard allowedRoles={['PARENT', 'STUDENT']}>
                      <AcademicReports />
                    </RoleGuard>
                  } />
                  <Route path="/settings" element={
                    <RoleGuard allowedRoles={['SUPER_ADMIN']}>
                      <Settings />
                    </RoleGuard>
                  } />
                </Route>
              </Route>

            </Routes>
          </Router>
        </BranchProvider>
      </ThemeProvider>
    </AuthProvider>
  );
}

export default App;
