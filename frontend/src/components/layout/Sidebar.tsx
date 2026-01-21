import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, CreditCard, CalendarCheck, Settings, LogOut, BookOpen, GraduationCap, UserCog, MessageSquare, X, Award, TrendingUp, Crown, Video } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

const Sidebar = ({ isOpen = false, onClose }: SidebarProps) => {
  const location = useLocation();
  const { logout, user } = useAuth();
  const { settings } = useTheme();

  const menuItems = [
    {
      icon: LayoutDashboard,
      label: 'Dashboard',
      path: '/',
      roles: ['SUPER_ADMIN', 'BURSAR', 'TEACHER', 'SECRETARY']
    },
    {
      icon: GraduationCap,
      label: 'My Children',
      path: '/my-children',
      roles: ['PARENT']
    },
    {
      icon: Users,
      label: 'Students',
      path: '/students',
      roles: ['SUPER_ADMIN', 'BURSAR', 'TEACHER', 'SECRETARY']
    },
    {
      icon: BookOpen,
      label: 'Academics',
      path: '/academics',
      roles: ['SUPER_ADMIN', 'TEACHER']
    },
    {
      icon: Video,
      label: 'Video Lessons',
      path: '/teacher/video-lessons',
      roles: ['SUPER_ADMIN', 'TEACHER']
    },
    {
      icon: CreditCard,
      label: 'Finance',
      path: '/finance',
      roles: ['SUPER_ADMIN', 'BURSAR']
    },
    {
      icon: Users,
      label: 'Attendance',
      path: '/academics/attendance',
      roles: ['SUPER_ADMIN', 'TEACHER', 'BURSAR', 'SECRETARY']
    },
    {
      icon: TrendingUp,
      label: 'Gradebook',
      path: '/academics/gradebook',
      roles: ['SUPER_ADMIN', 'TEACHER', 'BURSAR', 'SECRETARY']
    },
    {
      icon: UserCog,
      label: 'Users',
      path: '/users',
      roles: ['SUPER_ADMIN']
    },
    {
      icon: MessageSquare,
      label: 'Communication',
      path: '/communication',
      roles: ['SUPER_ADMIN', 'BURSAR', 'TEACHER', 'SECRETARY', 'PARENT']
    },
    {
      icon: Settings,
      label: 'Settings',
      path: '/settings',
      roles: ['SUPER_ADMIN']
    },
    {
      icon: Crown,
      label: 'Subscription',
      path: '/subscription',
      roles: ['SUPER_ADMIN']
    },
    {
      icon: CalendarCheck,
      label: 'Timetable',
      path: '/academics/timetable',
      roles: ['PARENT', 'STUDENT']
    },
    // Using BookOpen for Assignments for now, or ClipboardList if imported
    {
      icon: BookOpen,
      label: 'Assignments',
      path: '/student/assessments', // Re-using student assessments view or creating new?
      roles: ['PARENT', 'STUDENT']
    },
    {
      icon: Award,
      label: 'Academic Reports',
      path: '/academics/reports',
      roles: ['PARENT', 'STUDENT']
    },
    {
      icon: Video,
      label: 'Video Lessons',
      path: '/parent/video-lessons',
      roles: ['PARENT', 'STUDENT']
    },
  ];

  const filteredMenuItems = menuItems.filter(item =>
    user && item.roles.includes(user.role)
  );

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 md:hidden"
          onClick={onClose}
        />
      )}

      <div className={`
        h-screen w-64 bg-slate-900 text-white flex flex-col fixed left-0 top-0 z-50 transition-transform duration-300 ease-in-out
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        md:translate-x-0
      `}>
        <div className="p-6 border-b border-slate-800 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-blue-400" style={{ color: 'var(--primary-color)' }}>{settings.schoolName}</h1>
            <p className="text-xs text-slate-400">School Management</p>
          </div>
          <button onClick={onClose} className="md:hidden text-slate-400 hover:text-white">
            <X size={24} />
          </button>
        </div>

        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          {filteredMenuItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.label}
                to={item.path}
                onClick={onClose}
                className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${isActive
                  ? 'bg-primary text-white'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                  }`}
              >
                <item.icon size={20} />
                <span className="font-medium">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-800">
          <button
            onClick={logout}
            className="w-full flex items-center space-x-3 px-4 py-3 text-red-400 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <LogOut size={20} />
            <span className="font-medium">Sign Out</span>
          </button>
        </div>
      </div>
    </>
  );
};

export default Sidebar;
