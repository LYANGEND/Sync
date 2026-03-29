import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, CreditCard, CalendarCheck, Calendar, Settings, LogOut, BookOpen, GraduationCap, UserCog, MessageSquare, X, Award, TrendingUp, GitBranch, BarChart3, Brain, Cpu, Video, Sparkles } from 'lucide-react';
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

  const menuGroups = [
    {
      title: 'Overview',
      items: [
        { icon: LayoutDashboard, label: 'Dashboard', path: '/', roles: ['SUPER_ADMIN', 'BRANCH_MANAGER', 'BURSAR', 'TEACHER', 'SECRETARY'] }
      ]
    },
    {
      title: 'My Family',
      items: [
        { icon: GraduationCap, label: 'My Children', path: '/my-children', roles: ['PARENT'] },
        { icon: TrendingUp, label: 'Academic Progress', path: '/academics/progress', roles: ['PARENT'] },
        { icon: CalendarCheck, label: 'Timetable', path: '/academics/timetable', roles: ['PARENT'] },
        { icon: Award, label: 'Academic Reports', path: '/academics/reports', roles: ['PARENT'] },
      ]
    },
    {
      title: 'Academics',
      items: [
        { icon: BookOpen, label: 'Class Overview', path: '/academics', roles: ['SUPER_ADMIN', 'BRANCH_MANAGER', 'TEACHER'] },
        { icon: Users, label: 'Students', path: '/students', roles: ['SUPER_ADMIN', 'BRANCH_MANAGER', 'BURSAR', 'TEACHER', 'SECRETARY'] },
        { icon: Users, label: 'Attendance', path: '/academics/attendance', roles: ['SUPER_ADMIN', 'BRANCH_MANAGER', 'TEACHER', 'BURSAR', 'SECRETARY'] },
        { icon: TrendingUp, label: 'Gradebook', path: '/academics/gradebook', roles: ['SUPER_ADMIN', 'BRANCH_MANAGER', 'TEACHER', 'BURSAR', 'SECRETARY'] },
        { icon: Calendar, label: 'Academic Calendar', path: '/academics/calendar', roles: ['SUPER_ADMIN', 'BRANCH_MANAGER', 'TEACHER', 'PARENT'] },
      ]
    },
    {
      title: 'Finance',
      items: [
        { icon: CreditCard, label: 'Finance Hub', path: '/finance', roles: ['SUPER_ADMIN', 'BRANCH_MANAGER', 'BURSAR'] }
      ]
    },
    {
      title: 'Communication',
      items: [
        { icon: MessageSquare, label: 'Messages', path: '/communication', roles: ['SUPER_ADMIN', 'BRANCH_MANAGER', 'BURSAR', 'TEACHER', 'SECRETARY', 'PARENT'] },
        { icon: Video, label: 'Virtual Classroom', path: '/virtual-classroom', roles: ['SUPER_ADMIN', 'TEACHER', 'PARENT'] },
      ]
    },
    {
      title: 'Intelligence & AI',
      items: [
        { icon: Brain, label: 'Intelligence Hub', path: '/ai-intelligence', roles: ['SUPER_ADMIN', 'BRANCH_MANAGER', 'BURSAR', 'TEACHER'] },
        { icon: Cpu, label: 'Command Center', path: '/ai-analytics', roles: ['SUPER_ADMIN', 'BRANCH_MANAGER'] },
        { icon: GraduationCap, label: 'Teaching AI', path: '/ai-assistant', roles: ['SUPER_ADMIN', 'TEACHER'] },
        { icon: BarChart3, label: 'Analytics', path: '/analytics', roles: ['SUPER_ADMIN', 'BRANCH_MANAGER'] },
        { icon: Sparkles, label: 'Master AI Ops', path: '/master-ai', roles: ['SUPER_ADMIN'] },
      ]
    },
    {
      title: 'Administration',
      items: [
        { icon: GitBranch, label: 'Branches', path: '/branches', roles: ['SUPER_ADMIN', 'BRANCH_MANAGER'] },
        { icon: UserCog, label: 'User Directory', path: '/users', roles: ['SUPER_ADMIN'] },
        { icon: Settings, label: 'Settings', path: '/settings', roles: ['SUPER_ADMIN'] },
      ]
    }
  ];

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

        <nav className="flex-1 px-4 py-6 space-y-6 overflow-y-auto custom-scrollbar">
          {menuGroups.map((group, groupIdx) => {
            const filteredItems = group.items.filter(item => user && item.roles.includes(user.role));
            if (filteredItems.length === 0) return null;

            return (
              <div key={groupIdx} className="space-y-1">
                <h3 className="px-4 text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                  {group.title}
                </h3>
                {filteredItems.map((item) => {
                  const isActive = item.path === '/'
                    ? location.pathname === '/'
                    : location.pathname.startsWith(item.path);
                  return (
                    <Link
                      key={item.label}
                      to={item.path}
                      onClick={onClose}
                      className={`w-full flex items-center space-x-3 px-4 py-2.5 rounded-lg transition-colors text-sm ${
                        isActive
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                      }`}
                      style={isActive ? { backgroundColor: 'var(--primary-color)' } : {}}
                    >
                      <item.icon size={18} className={isActive ? "text-white" : "text-slate-400"} />
                      <span className={isActive ? "font-medium" : ""}>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-800">
          <button
            onClick={logout}
            className="w-full flex items-center space-x-3 px-4 py-3 text-red-400 hover:bg-slate-800 rounded-lg transition-colors text-sm"
          >
            <LogOut size={18} />
            <span className="font-medium">Sign Out</span>
          </button>
        </div>
      </div>
    </>
  );
};

export default Sidebar;
