import { ACADEMICS_ROLES } from './utils/academicNavigation';
import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { BranchProvider } from './context/BranchContext';
import Login from './pages/auth/Login';
import DashboardLayout from './components/layout/DashboardLayout';
import ProtectedRoute from './components/layout/ProtectedRoute';
import RoleGuard from './components/layout/RoleGuard';
import { Toaster } from 'react-hot-toast';
import { AppDialogProvider } from './components/ui/AppDialogProvider';
import AppLoadingScreen from './components/ui/AppLoadingScreen';
import { shouldExposePlatformRoutes } from './utils/platformAccess';
import { PWAManager } from './components/pwa/PWAManager';

const PlatformLogin = lazy(() => import('./pages/auth/PlatformLogin'));
const Dashboard = lazy(() => import('./pages/dashboard/Dashboard'));
const Students = lazy(() => import('./pages/students/Students'));
const StudentProfile = lazy(() => import('./pages/students/StudentProfile'));
const Finance = lazy(() => import('./pages/finance/Finance'));
const Academics = lazy(() => import('./pages/academics/Academics'));
const GradingScales = lazy(() => import('./pages/academics/GradingScales'));
const ReportCards = lazy(() => import('./pages/academics/ReportCards'));
const Timetable = lazy(() => import('./pages/academics/Timetable'));
const Subjects = lazy(() => import('./pages/subjects/Subjects'));
const Classes = lazy(() => import('./pages/classes/Classes'));
const Users = lazy(() => import('./pages/users/Users'));
const Branches = lazy(() => import('./pages/branches/Branches'));
const BranchDetail = lazy(() => import('./pages/branches/BranchDetail'));
const Settings = lazy(() => import('./pages/settings/Settings'));
const Profile = lazy(() => import('./pages/profile/Profile'));
const Communication = lazy(() => import('./pages/communication/Communication'));
const MyChildren = lazy(() => import('./pages/parents/MyChildren'));
const AcademicReports = lazy(() => import('./pages/parents/AcademicReports'));
const StudentQuiz = lazy(() => import('./pages/student/StudentQuiz'));
const StudentAssessments = lazy(() => import('./pages/student/StudentAssessments'));
const AttendanceRegister = lazy(() => import('./pages/academics/AttendanceRegister'));
const TeacherGradebook = lazy(() => import('./pages/academics/TeacherGradebook'));
const StudentAcademicPortal = lazy(() => import('./pages/academics/StudentAcademicPortal'));
const AcademicCalendar = lazy(() => import('./pages/academics/AcademicCalendar'));
const VirtualClassrooms = lazy(() => import('./pages/academics/VirtualClassrooms'));
const VirtualClassroom = lazy(() => import('./pages/academics/VirtualClassroom'));
const VerifyReport = lazy(() => import('./pages/public/VerifyReport'));
const PublicPayment = lazy(() => import('./pages/public/PublicPayment'));
const ShareTargetHandler = lazy(() => import('./pages/public/ShareTargetHandler'));
const OpsDashboard = lazy(() => import('./pages/ops/OpsDashboard'));
const Analytics = lazy(() => import('./pages/analytics/Analytics'));
const AIAssistant = lazy(() => import('./pages/ai/AIAssistant'));
const AIAnalyticsDashboard = lazy(() => import('./pages/ai/AIAnalytics'));
const MasterAI = lazy(() => import('./pages/ai/MasterAI'));
const AIIntelligenceHub = lazy(() => import('./pages/ai/AIIntelligenceHub'));

function App() {
  return (
    <AppDialogProvider>
      <AuthProvider>
        <ThemeProvider>
          <BranchProvider>
            <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
              <Toaster
                position="top-right"
                containerStyle={{
                  zIndex: 120,
                  top: 'calc(1rem + env(safe-area-inset-top))',
                  right: 'max(1rem, env(safe-area-inset-right))',
                }}
                toastOptions={{
                  duration: 2800,
                  className: 'ds-toast',
                  style: {
                    borderRadius: 'var(--radius-md)',
                    padding: '14px 16px',
                    background: 'var(--surface)',
                    color: 'var(--text-primary)',
                    boxShadow: 'var(--shadow-md)',
                    border: '1px solid var(--border-color)',
                    maxWidth: 'min(24rem, calc(100vw - 2rem))',
                    overflowWrap: 'anywhere',
                  },
                }}
              />
            <PWAManager />
            <Suspense fallback={<AppLoadingScreen compact />}>
            <Routes>
              <Route path="/login" element={shouldExposePlatformRoutes() ? <Navigate to="/ops/login" replace /> : <Login />} />
              <Route path="/ops/login" element={shouldExposePlatformRoutes() ? <PlatformLogin /> : <Navigate to="/login" replace />} />
              <Route path="/verify/report/:id" element={<VerifyReport />} />
              <Route path="/pay" element={<PublicPayment />} />
              <Route path="/share-target" element={<ShareTargetHandler />} />
              <Route path="/open-file" element={<ShareTargetHandler />} />

              <Route element={<ProtectedRoute />}>
                <Route path="/student/quiz/:assessmentId" element={<StudentQuiz />} />

                <Route element={<DashboardLayout />}>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/ops" element={
                    <RoleGuard allowedRoles={['PLATFORM_ADMIN']}>
                      <Navigate to="/ops/tenants" replace />
                    </RoleGuard>
                  } />
                  <Route path="/ops/:view" element={
                    <RoleGuard allowedRoles={['PLATFORM_ADMIN']}>
                      <OpsDashboard />
                    </RoleGuard>
                  } />
                  <Route path="/profile" element={<Profile />} />
                  <Route path="/my-children" element={
                    <RoleGuard allowedRoles={['PARENT']}>
                      <MyChildren />
                    </RoleGuard>
                  } />
                  <Route path="/student/assessments" element={
                    <RoleGuard allowedRoles={['SUPER_ADMIN', 'PARENT']}>
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
                      <AttendanceRegister />
                    </RoleGuard>
                  } />

                  <Route path="/academics" element={
                    <RoleGuard allowedRoles={ACADEMICS_ROLES}>
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
                    <RoleGuard allowedRoles={['SUPER_ADMIN', 'TEACHER', 'PARENT']}>
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
                  <Route path="/branches/:id/edit" element={
                    <RoleGuard allowedRoles={['SUPER_ADMIN', 'BRANCH_MANAGER']}>
                      <Branches />
                    </RoleGuard>
                  } />

                  <Route path="/communication" element={
                    <RoleGuard allowedRoles={['SUPER_ADMIN', 'BURSAR', 'TEACHER', 'SECRETARY', 'PARENT']}>
                      <Communication />
                    </RoleGuard>
                  } />

                  <Route path="/analytics" element={
                    <RoleGuard allowedRoles={['SUPER_ADMIN', 'BRANCH_MANAGER']}>
                      <Analytics />
                    </RoleGuard>
                  } />
                  <Route path="/ai-assistant" element={
                    <RoleGuard allowedRoles={['SUPER_ADMIN', 'TEACHER']}>
                      <AIAssistant />
                    </RoleGuard>
                  } />

                  <Route path="/ai-analytics" element={
                    <RoleGuard allowedRoles={['SUPER_ADMIN', 'BRANCH_MANAGER']}>
                      <AIAnalyticsDashboard />
                    </RoleGuard>
                  } />
                  <Route path="/master-ai" element={
                    <RoleGuard allowedRoles={['SUPER_ADMIN']}>
                      <MasterAI />
                    </RoleGuard>
                  } />
                  <Route path="/ai-intelligence" element={
                    <RoleGuard allowedRoles={['SUPER_ADMIN', 'BRANCH_MANAGER', 'BURSAR', 'TEACHER']}>
                      <AIIntelligenceHub />
                    </RoleGuard>
                  } />

                  <Route path="/academics/reports" element={
                    <RoleGuard allowedRoles={['PARENT']}>
                      <AcademicReports />
                    </RoleGuard>
                  } />
                  <Route path="/academics/progress" element={
                    <RoleGuard allowedRoles={['PARENT', 'SUPER_ADMIN', 'TEACHER']}>
                      <StudentAcademicPortal />
                    </RoleGuard>
                  } />
                  <Route path="/virtual-classroom" element={
                    <RoleGuard allowedRoles={['SUPER_ADMIN', 'TEACHER', 'STUDENT', 'PARENT']}>
                      <VirtualClassrooms />
                    </RoleGuard>
                  } />
                  <Route path="/virtual-classroom/:id" element={
                    <VirtualClassroom />
                  } />
                  <Route path="/academics/calendar" element={
                    <AcademicCalendar />
                  } />
                  <Route path="/settings" element={
                    <RoleGuard allowedRoles={['SUPER_ADMIN']}>
                      <Settings />
                    </RoleGuard>
                  } />
                </Route>
              </Route>

            </Routes>
            </Suspense>
            </Router>
          </BranchProvider>
        </ThemeProvider>
      </AuthProvider>
    </AppDialogProvider>
  );
}

export default App;
