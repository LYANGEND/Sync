import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, Users, CreditCard, CalendarCheck, Settings, 
  LogOut, BookOpen, UserCog, MessageSquare, X, GraduationCap, BookMarked, FileText
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

const Sidebar = ({ isOpen, onClose }: SidebarProps) => {
  const location = useLocation();
  const { logout, user } = useAuth();

  const menuItems = [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/', roles: ['SUPER_ADMIN', 'BURSAR', 'TEACHER', 'SECRETARY'] },
    { icon: Users, label: 'Students', path: '/students', roles: ['SUPER_ADMIN', 'BURSAR', 'TEACHER', 'SECRETARY'] },
    { icon: BookOpen, label: 'Academics', path: '/academics', roles: ['SUPER_ADMIN', 'TEACHER'] },
    { icon: CreditCard, label: 'Finance', path: '/finance', roles: ['SUPER_ADMIN', 'BURSAR'] },
    { icon: CalendarCheck, label: 'Attendance', path: '/attendance', roles: ['SUPER_ADMIN', 'TEACHER', 'SECRETARY'] },
    { icon: GraduationCap, label: 'Classes', path: '/classes', roles: ['SUPER_ADMIN', 'TEACHER', 'SECRETARY'] },
    { icon: BookMarked, label: 'Subjects', path: '/subjects', roles: ['SUPER_ADMIN', 'TEACHER'] },
    { icon: FileText, label: 'Reports', path: '/reports', roles: ['SUPER_ADMIN', 'BURSAR', 'TEACHER', 'SECRETARY'] },
    { icon: UserCog, label: 'Users', path: '/users', roles: ['SUPER_ADMIN'] },
    { icon: MessageSquare, label: 'Messages', path: '/communication', roles: ['SUPER_ADMIN', 'BURSAR', 'TEACHER', 'SECRETARY', 'PARENT'] },
    { icon: Settings, label: 'Settings', path: '/settings', roles: ['SUPER_ADMIN'] },
  ];

  const filteredMenuItems = menuItems.filter(item => user && item.roles.includes(user.role));

  const handleNavClick = () => onClose();

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  return (
    <>
      {/* Mobile Sidebar - Full screen drawer */}
      <div className={`
        fixed inset-y-0 left-0 w-72 bg-slate-900 text-white flex flex-col z-40
        transform transition-transform duration-300 ease-in-out lg:hidden
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-blue-400">Sync</h1>
            <p className="text-[10px] text-slate-400">School Management</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg">
            <X size={20} />
          </button>
        </div>

        {/* User Info - Clickable to go to profile */}
        <Link to="/profile" onClick={handleNavClick} className="block p-4 border-b border-slate-800 hover:bg-slate-800 transition-colors">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold">
              {user?.fullName?.charAt(0) || 'U'}
            </div>
            <div>
              <p className="font-medium text-white text-sm">{user?.fullName}</p>
              <p className="text-xs text-slate-400">{user?.role?.replace('_', ' ')}</p>
            </div>
          </div>
        </Link>

        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {filteredMenuItems.map((item) => {
            const active = isActive(item.path);
            return (
              <Link
                key={item.label}
                to={item.path}
                onClick={handleNavClick}
                className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-colors ${
                  active
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <item.icon size={20} />
                <span className="font-medium">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Logout */}
        <div className="p-4 border-t border-slate-800">
          <button 
            onClick={logout}
            className="w-full flex items-center space-x-3 px-4 py-3 text-red-400 hover:bg-slate-800 rounded-xl transition-colors"
          >
            <LogOut size={20} />
            <span className="font-medium">Sign Out</span>
          </button>
        </div>
      </div>

      {/* Desktop Sidebar - Always visible */}
      <div className="hidden lg:flex h-screen w-64 bg-slate-900 text-white flex-col fixed left-0 top-0">
        <div className="p-6 border-b border-slate-800">
          <h1 className="text-2xl font-bold text-blue-400">Sync</h1>
          <p className="text-xs text-slate-400">School Management</p>
        </div>

        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          {filteredMenuItems.map((item) => {
            const active = isActive(item.path);
            return (
              <Link
                key={item.label}
                to={item.path}
                className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${
                  active
                    ? 'bg-blue-600 text-white'
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
