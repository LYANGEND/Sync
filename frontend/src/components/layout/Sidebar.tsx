import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, CreditCard, CalendarCheck, Settings, LogOut, BookOpen, GraduationCap, UserCog, MessageSquare, X, Award, TrendingUp, GitBranch, BarChart3, Brain, Cpu, Video, Sparkles, Database, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

const Sidebar = ({ isOpen = false, onClose, isCollapsed, onToggleCollapse }: SidebarProps) => {
  const location = useLocation();
  const { logout, user } = useAuth();
  const { settings } = useTheme();
  const schoolName = settings.schoolName?.trim();
  const schoolLabel = !schoolName || schoolName.toLowerCase() === 'my school'
    ? 'School workspace'
    : schoolName;

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
        { icon: BookOpen, label: 'Academics', path: '/academics', roles: ['SUPER_ADMIN', 'TEACHER', 'BURSAR', 'SECRETARY'] },
        { icon: Users, label: 'Students', path: '/students', roles: ['SUPER_ADMIN', 'BRANCH_MANAGER', 'BURSAR', 'TEACHER', 'SECRETARY'] },
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
        { icon: BarChart3, label: 'Analytics', path: '/analytics', roles: ['SUPER_ADMIN', 'BRANCH_MANAGER', 'BURSAR', 'TEACHER'] },
        { icon: Sparkles, label: 'Master AI Ops', path: '/master-ai', roles: ['SUPER_ADMIN'] },
      ]
    },
    {
      title: 'Administration',
      items: [
        { icon: GitBranch, label: 'Branches', path: '/branches', roles: ['SUPER_ADMIN', 'BRANCH_MANAGER'] },
        { icon: UserCog, label: 'User Directory', path: '/users', roles: ['SUPER_ADMIN'] },
        { icon: Database, label: 'Data Management', path: '/data-management', roles: ['SUPER_ADMIN'] },
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

      <aside className={`
        fixed left-0 top-0 z-50 flex h-dvh w-64 flex-col bg-[linear-gradient(180deg,#003366_0%,#021a33_100%)] text-white shadow-[18px_0_48px_-32px_rgba(0,18,38,0.8)] transition-[width,transform] duration-200 ease-out
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        md:translate-x-0 ${isCollapsed ? 'md:w-20' : 'md:w-64'}
      `}>
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label={isCollapsed ? 'Expand navigation' : 'Collapse navigation'}
          aria-controls="primary-navigation"
          aria-expanded={!isCollapsed}
          title={isCollapsed ? 'Expand navigation' : 'Collapse navigation'}
          className="group absolute -right-[22px] top-[4.5rem] z-10 hidden size-11 place-items-center rounded-full focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-[#003366] md:grid"
        >
          <span className="grid size-7 place-items-center rounded-full border border-slate-200 bg-white text-primary shadow-md transition-colors group-hover:border-blue-200 group-hover:bg-blue-50" aria-hidden="true">
            {isCollapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
          </span>
        </button>

        <div className={`relative flex items-center justify-between border-b border-white/10 p-4 ${isCollapsed ? 'md:justify-center md:gap-0 md:px-3' : ''}`}>
          <span className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-accent/70 to-transparent" aria-hidden="true" />
          <div className={`flex min-w-0 items-center gap-3 ${isCollapsed ? 'md:justify-center md:gap-0' : ''}`}>
            <img
              src={settings.logoUrl || '/logo.svg'}
              alt={settings.logoUrl ? `${schoolLabel} logo` : 'Sync logo'}
              className="size-11 shrink-0 rounded-[14px] bg-white object-contain p-1 shadow-[0_8px_24px_-12px_rgba(0,0,0,0.8)] ring-1 ring-white/25"
            />
            <div className={`max-w-[11rem] min-w-0 overflow-hidden transition-[max-width,opacity] duration-150 ${isCollapsed ? 'md:max-w-0 md:opacity-0' : 'md:opacity-100'}`}>
              <p className="text-[15px] font-extrabold uppercase tracking-[0.2em] text-white">
                Sync<span className="text-accent">.</span>
              </p>
              <p className="mt-0.5 truncate text-[11px] font-medium text-blue-100/70" title={schoolLabel}>{schoolLabel}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation"
            className="ml-2 grid size-11 shrink-0 place-items-center rounded-xl text-blue-100/70 transition hover:bg-white/10 hover:text-white md:hidden"
          >
            <X size={24} />
          </button>
        </div>

        <nav
          id="primary-navigation"
          className={`custom-scrollbar flex-1 space-y-5 overflow-y-auto px-3 py-5 transition-[padding] duration-200 ${isCollapsed ? 'md:px-2 md:[scrollbar-width:none] md:[&::-webkit-scrollbar]:hidden' : ''}`}
          aria-label="Primary navigation"
        >
          {menuGroups.map((group) => {
            const filteredItems = group.items.filter(item => user && item.roles.includes(user.role));
            if (filteredItems.length === 0) return null;

            return (
              <div key={group.title} className="space-y-1">
                <h3 className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-blue-100/50">
                  <span className={isCollapsed ? 'md:sr-only' : undefined}>{group.title}</span>
                  <span className={`hidden h-px bg-white/10 ${isCollapsed ? 'md:block' : ''}`} aria-hidden="true" />
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
                      aria-current={isActive ? 'page' : undefined}
                      title={isCollapsed ? item.label : undefined}
                      className={`flex min-h-11 w-full items-center space-x-3 rounded-xl px-3.5 py-2.5 text-sm transition-[padding,background-color,color,box-shadow] duration-200 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-[#003366] ${isCollapsed ? 'md:space-x-0 md:px-5' : ''} ${
                        isActive
                          ? 'bg-white/[0.12] font-semibold text-white ring-1 ring-white/10'
                          : 'text-blue-50/75 hover:bg-white/[0.08] hover:text-white'
                      }`}
                      style={isActive ? { boxShadow: 'inset 3px 0 0 var(--accent-color), 0 8px 24px -18px rgba(0, 0, 0, 0.9)' } : undefined}
                    >
                      <item.icon size={18} className={`shrink-0 ${isActive ? 'text-accent' : 'text-blue-100/55'}`} aria-hidden="true" />
                      <span className={`max-w-[10rem] overflow-hidden whitespace-nowrap transition-[max-width,opacity] duration-150 ${isCollapsed ? 'md:max-w-0 md:opacity-0' : 'md:opacity-100'}`}>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>

        <div className="border-t border-white/10 p-3">
          <button
            type="button"
            onClick={logout}
            title={isCollapsed ? 'Sign Out' : undefined}
            className={`flex min-h-11 w-full items-center space-x-3 rounded-xl px-3.5 py-2.5 text-sm text-red-200/80 transition-[padding,background-color,color] duration-200 hover:bg-red-500/10 hover:text-red-100 focus:outline-none focus:ring-2 focus:ring-red-300 focus:ring-offset-2 focus:ring-offset-[#003366] ${isCollapsed ? 'md:space-x-0 md:px-[19px]' : ''}`}
          >
            <LogOut size={18} className="shrink-0" />
            <span className={`max-w-[10rem] overflow-hidden whitespace-nowrap font-medium transition-[max-width,opacity] duration-150 ${isCollapsed ? 'md:max-w-0 md:opacity-0' : 'md:opacity-100'}`}>Sign Out</span>
          </button>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
