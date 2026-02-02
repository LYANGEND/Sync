import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import Login from './pages/auth/Login';
import Dashboard from './pages/dashboard/Dashboard';
import BranchManagement from './pages/branches/BranchManagement';
import BranchDetail from './pages/branches/BranchDetail';
import BranchSettings from './pages/branches/BranchSettings';
import BranchPaymentReport from './pages/branches/BranchPaymentReport';
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
import Subscription from './pages/subscription/Subscription';
import Profile from './pages/profile/Profile';
import Communication from './pages/communication/Communication';
import TeacherHomework from './pages/teacher/TeacherHomework';
import HomeworkGrading from './pages/teacher/HomeworkGrading';
import TeacherResources from './pages/teacher/TeacherResources';
import ParentHomework from './pages/parent/ParentHomework';
import ParentResources from './pages/parent/ParentResources';
import ParentQuizzes from './pages/parent/ParentQuizzes';
import ParentTimetable from './pages/parent/ParentTimetable';
import ParentGrades from './pages/parent/ParentGrades';
import ParentVideoLessons from './pages/parent/ParentVideoLessons';
import TeacherVideoLessons from './pages/teacher/TeacherVideoLessons';
import TeacherAIAssistant from './pages/teacher-assistant/TeacherAIAssistant';
import AITeacher from './pages/ai-teacher/AITeacher';
import MyChildren from './pages/parents/MyChildren';
import AcademicReports from './pages/parents/AcademicReports';
import PublicPayment from './pages/public/PublicPayment';
import ForumList from './pages/forums/ForumList';
import ForumView from './pages/forums/ForumView';
import TopicView from './pages/forums/TopicView';
import AnnouncementList from './pages/announcements/AnnouncementList';
import DashboardLayout from './components/layout/DashboardLayout';
import ProtectedRoute from './components/layout/ProtectedRoute';
import RoleGuard from './components/layout/RoleGuard';

import StudentQuiz from './pages/student/StudentQuiz';
import StudentAssessments from './pages/student/StudentAssessments';
import AttendanceRegister from './pages/academics/AttendanceRegister';
import TeacherGradebook from './pages/academics/TeacherGradebook';
import PlatformAdmin from './pages/platform/PlatformAdmin';
import { Toaster } from 'react-hot-toast';
import { BranchProvider } from './context/BranchContext';

function App() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <BranchProvider>
          <Router>
            <Toaster position="top-right" />
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/ops" element={<PlatformAdmin />} />
              
              {/* Public payment page - no auth required */}
              <Route path="/pay/:schoolSlug" element={<PublicPayment />} />

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

                  {/* Teacher LMS Routes */}
                  <Route path="/teacher/homework" element={
                    <RoleGuard allowedRoles={['TEACHER', 'SUPER_ADMIN']}>
                      <TeacherHomework />
                    </RoleGuard>
                  } />
                  <Route path="/teacher/homework/:homeworkId/submissions" element={
                    <RoleGuard allowedRoles={['TEACHER', 'SUPER_ADMIN']}>
                      <HomeworkGrading />
                    </RoleGuard>
                  } />
                  <Route path="/teacher/resources" element={
                    <RoleGuard allowedRoles={['TEACHER', 'SUPER_ADMIN']}>
                      <TeacherResources />
                    </RoleGuard>
                  } />
                  <Route path="/teacher/video-lessons" element={
                    <RoleGuard allowedRoles={['TEACHER', 'SUPER_ADMIN']}>
                      <TeacherVideoLessons />
                    </RoleGuard>
                  } />
                  <Route path="/teacher/ai-assistant" element={
                    <RoleGuard allowedRoles={['TEACHER', 'SUPER_ADMIN', 'BURSAR', 'SECRETARY']}>
                      <TeacherAIAssistant />
                    </RoleGuard>
                  } />
                  <Route path="/teacher/ai-assistant/:tab" element={
                    <RoleGuard allowedRoles={['TEACHER', 'SUPER_ADMIN', 'BURSAR', 'SECRETARY']}>
                      <TeacherAIAssistant />
                    </RoleGuard>
                  } />

                  {/* Parent/Student LMS Routes */}
                  <Route path="/parent/homework" element={
                    <RoleGuard allowedRoles={['PARENT', 'SUPER_ADMIN']}>
                      <ParentHomework />
                    </RoleGuard>
                  } />
                  <Route path="/parent/resources" element={
                    <RoleGuard allowedRoles={['PARENT', 'SUPER_ADMIN']}>
                      <ParentResources />
                    </RoleGuard>
                  } />
                  <Route path="/parent/quizzes" element={
                    <RoleGuard allowedRoles={['PARENT', 'SUPER_ADMIN']}>
                      <ParentQuizzes />
                    </RoleGuard>
                  } />
                  <Route path="/parent/timetable" element={
                    <RoleGuard allowedRoles={['PARENT', 'SUPER_ADMIN']}>
                      <ParentTimetable />
                    </RoleGuard>
                  } />
                  <Route path="/parent/grades" element={
                    <RoleGuard allowedRoles={['PARENT', 'SUPER_ADMIN']}>
                      <ParentGrades />
                    </RoleGuard>
                  } />
                  <Route path="/parent/video-lessons" element={
                    <RoleGuard allowedRoles={['PARENT', 'SUPER_ADMIN']}>
                      <ParentVideoLessons />
                    </RoleGuard>
                  } />

                  {/* Forums Routes (All authenticated users) */}
                  <Route path="/forums" element={<ForumList />} />
                  <Route path="/forums/:forumId" element={<ForumView />} />
                  <Route path="/forums/topics/:topicId" element={<TopicView />} />

                  {/* AI Teacher Route */}
                  <Route path="/ai-teacher" element={
                    <RoleGuard allowedRoles={['STUDENT', 'PARENT', 'TEACHER', 'SUPER_ADMIN']}>
                      <AITeacher />
                    </RoleGuard>
                  } />

                  {/* Announcements Routes (All authenticated users) */}
                  <Route path="/announcements" element={<AnnouncementList />} />

                  <Route path="/settings" element={
                    <RoleGuard allowedRoles={['SUPER_ADMIN']}>
                      <Settings />
                    </RoleGuard>
                  } />
                  <Route path="/subscription" element={
                    <RoleGuard allowedRoles={['SUPER_ADMIN']}>
                      <Subscription />
                    </RoleGuard>
                  } />

                  {/* Branch Management Routes */}
                  <Route path="/branches" element={
                    <RoleGuard allowedRoles={['SUPER_ADMIN', 'BRANCH_MANAGER']}>
                      <BranchManagement />
                    </RoleGuard>
                  } />
                  <Route path="/branches/:id" element={
                    <RoleGuard allowedRoles={['SUPER_ADMIN', 'BRANCH_MANAGER']}>
                      <BranchDetail />
                    </RoleGuard>
                  } />
                  <Route path="/branches/:id/payments" element={
                    <RoleGuard allowedRoles={['SUPER_ADMIN', 'BRANCH_MANAGER', 'BURSAR']}>
                      <BranchPaymentReport />
                    </RoleGuard>
                  } />
                  <Route path="/branches/:id/settings" element={
                    <RoleGuard allowedRoles={['SUPER_ADMIN', 'BRANCH_MANAGER']}>
                      <BranchSettings />
                    </RoleGuard>
                  } />
                </Route>
              </Route>


              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Router>
        </BranchProvider>
      </ThemeProvider>
    </AuthProvider>
  );
}

export default App;
