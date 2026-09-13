import { useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, CreditCard, Settings, LogOut, BookOpen, GraduationCap, UserCog, MessageSquare, X, Award, TrendingUp, GitBranch, BarChart3, Brain, Cpu, Video, Sparkles, Building2, Server, FileWarning, ShieldAlert, Activity, Sliders } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { Button } from '../ui/DesignSystem';
import { ACADEMICS_ROLES } from '../../utils/academicNavigation';

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

const Sidebar = ({ isOpen = false, onClose }: SidebarProps) => {
  const location = useLocation();
  const { logout, user } = useAuth();
  const { settings } = useTheme();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;
    const panel = panelRef.current;
    if (!panel) return;
    // CSS owns visibility. This query only enables modal behavior below the same md breakpoint.
    const desktop = window.matchMedia('(min-width: 768px)');
    let release: (() => void) | undefined;
    const sync = () => {
      release?.();
      release = undefined;
      if (desktop.matches) return;

      const previous = document.activeElement as HTMLElement | null;
      const overflow = document.body.style.overflow;
      const background = ['dashboard-content', 'dashboard-skip-link']
        .map(id => document.getElementById(id))
        .filter((element): element is HTMLElement => Boolean(element));
      const inertValues = background.map(element => element.hasAttribute('inert'));
      background.forEach(element => element.setAttribute('inert', ''));
      document.body.style.overflow = 'hidden';
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-modal', 'true');
      panel.setAttribute('aria-label', 'Navigation');

      const focusable = () => Array.from(panel.querySelectorAll<HTMLElement>(
        'a[href], button:not(:disabled), [tabindex]:not([tabindex="-1"])'
      )).filter(element => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden');
      const focusFirst = () => (focusable()[0] || panel).focus();
      const handleKey = (event: KeyboardEvent) => {
        // Native dialogs (e.g. a sign-out confirmation) own their own focus/Escape handling.
        if (document.querySelector('dialog[open]')) return;
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          closeRef.current?.();
        } else if (event.key === 'Tab') {
          const elements = focusable();
          const first = elements[0];
          const last = elements[elements.length - 1];
          if (!first) {
            event.preventDefault();
            panel.focus();
          } else if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panel)) {
            event.preventDefault();
            first.focus();
          }
        }
      };
      const containFocus = (event: FocusEvent) => {
        if (!panel.contains(event.target as Node) && !document.querySelector('dialog[open]')) focusFirst();
      };
      focusFirst();
      document.addEventListener('keydown', handleKey, true);
      document.addEventListener('focusin', containFocus);
      release = () => {
        document.removeEventListener('keydown', handleKey, true);
        document.removeEventListener('focusin', containFocus);
        background.forEach((element, index) => { if (!inertValues[index]) element.removeAttribute('inert'); });
        document.body.style.overflow = overflow;
        panel.removeAttribute('role');
        panel.removeAttribute('aria-modal');
        panel.removeAttribute('aria-label');
        if (previous?.isConnected && previous.getClientRects().length > 0) previous.focus();
        else if (desktop.matches && panel.contains(document.activeElement)) {
          panel.querySelector<HTMLElement>('[aria-current="page"], a[href]')?.focus();
        }
      };
    };
    sync();
    desktop.addEventListener('change', sync);
    return () => { desktop.removeEventListener('change', sync); release?.(); };
  }, [isOpen]);

  const menuGroups = [
    {
      title: 'Overview',
      items: [
        { icon: LayoutDashboard, label: 'Dashboard', path: '/', roles: ['SUPER_ADMIN', 'BRANCH_MANAGER', 'BURSAR', 'TEACHER', 'SECRETARY'] },
        { icon: GraduationCap, label: 'My Children', path: '/my-children', roles: ['PARENT'] },
      ]
    },
    {
      title: 'Learning',
      items: [
        { icon: BookOpen, label: 'Academics', path: '/academics', roles: ACADEMICS_ROLES },
        { icon: Users, label: 'Students', path: '/students', roles: ['SUPER_ADMIN', 'BRANCH_MANAGER', 'BURSAR', 'TEACHER', 'SECRETARY'] },
        { icon: TrendingUp, label: 'Academic Progress', path: '/academics/progress', roles: ['PARENT'] },
        { icon: Award, label: 'Academic Reports', path: '/academics/reports', roles: ['PARENT'] },
      ]
    },
    {
      title: 'Operations',
      items: [
        { icon: CreditCard, label: 'Finance Hub', path: '/finance', roles: ['SUPER_ADMIN', 'BRANCH_MANAGER', 'BURSAR'] },
        { icon: MessageSquare, label: 'Messages', path: '/communication', roles: ['SUPER_ADMIN', 'BRANCH_MANAGER', 'BURSAR', 'TEACHER', 'SECRETARY', 'PARENT'] },
        { icon: Video, label: 'Virtual Classroom', path: '/virtual-classroom', roles: ['SUPER_ADMIN', 'TEACHER', 'PARENT'] },
      ]
    },
    {
      title: 'Intelligence',
      items: [
        { icon: Brain, label: 'Intelligence Hub', path: '/ai-intelligence', roles: ['SUPER_ADMIN', 'BRANCH_MANAGER', 'BURSAR', 'TEACHER'] },
        { icon: BarChart3, label: 'Analytics', path: '/analytics', roles: ['SUPER_ADMIN', 'BRANCH_MANAGER'] },
        { icon: Cpu, label: 'Command Center', path: '/ai-analytics', roles: ['SUPER_ADMIN', 'BRANCH_MANAGER'] },
        { icon: GraduationCap, label: 'Teaching AI', path: '/ai-assistant', roles: ['SUPER_ADMIN', 'TEACHER'] },
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
    },
    {
      title: 'Platform',
      items: [
        { icon: Building2, label: 'Tenants', path: '/ops/tenants', roles: ['PLATFORM_ADMIN'] },
        { icon: Server, label: 'Health', path: '/ops/health', roles: ['PLATFORM_ADMIN'] },
        { icon: FileWarning, label: 'Ops Feed', path: '/ops/operations', roles: ['PLATFORM_ADMIN'] },
        { icon: ShieldAlert, label: 'Security', path: '/ops/security', roles: ['PLATFORM_ADMIN'] },
        { icon: CreditCard, label: 'Billing', path: '/ops/billing', roles: ['PLATFORM_ADMIN'] },
        { icon: Sliders, label: 'Settings', path: '/ops/settings', roles: ['PLATFORM_ADMIN'] },
        { icon: Activity, label: 'Audit', path: '/ops/audit', roles: ['PLATFORM_ADMIN'] }
      ]
    }
  ];

  const activePath = menuGroups.flatMap(group => group.items)
    .filter(item => user && item.roles.includes(user.role))
    .filter(item => location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(`${item.path}/`)))
    .sort((a, b) => b.path.length - a.path.length)[0]?.path;

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-slate-950/60 z-[100] md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <div id="primary-sidebar" ref={panelRef} tabIndex={-1} className={`
        ds-sidebar fixed left-0 top-0 z-[100] flex h-[100dvh] w-[17.5rem] max-w-[calc(100vw-2rem)] flex-col border-r border-[var(--border-color)] bg-[var(--surface)] text-[var(--text-primary)] shadow-[0_0_0_1px_rgba(15,23,42,0.02),8px_0_30px_rgba(15,23,42,0.08)] transition-transform duration-200 ease-in-out motion-reduce:transition-none md:z-50
        ${isOpen ? 'visible translate-x-0' : 'invisible -translate-x-full'}
        md:visible md:translate-x-0
      `} style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-[var(--border-color)] px-4">
          <div className="flex min-w-0 items-center gap-3">
            {settings.logoUrl ? (
              <img
                src={settings.logoUrl.startsWith('http') ? settings.logoUrl : settings.logoUrl}
                alt={`${settings.schoolName} logo`}
                className="h-10 w-10 shrink-0 rounded-2xl bg-[var(--surface-muted)] p-1 object-contain ring-1 ring-[var(--border-color)]"
              />
            ) : (
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--action-color)] text-lg font-bold text-[var(--action-foreground)]"
              >
                {settings.schoolName?.charAt(0) || 'S'}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text-secondary)]">Sync workspace</p>
              <p className="mt-0.5 truncate text-sm font-semibold text-[var(--text-primary)]">{settings.schoolName}</p>
            </div>
          </div>
          <Button variant="ghost"
            onClick={onClose}
            aria-label="Close navigation"
            className="ml-2 shrink-0 px-2 md:hidden"
          >
            <X size={24} aria-hidden="true" />
          </Button>
        </div>

        <nav className="custom-scrollbar min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-3 py-4" aria-label="Primary navigation">
          {menuGroups.map((group, groupIdx) => {
            const filteredItems = group.items.filter(item => user && item.roles.includes(user.role));
            if (filteredItems.length === 0) return null;

            return (
              <div key={groupIdx} className="space-y-1.5">
                <h2 className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--text-secondary)]">
                  {group.title}
                </h2>
                {filteredItems.map((item) => {
                  const isActive = item.path === activePath;
                  return (
                    <Link
                      key={item.label}
                      to={item.path}
                      onClick={onClose}
                      aria-current={isActive ? 'page' : undefined}
                      className={`ds-nav-item ${isActive ? 'ds-nav-item-active' : ''}`}
                    >
                      {isActive && <span className="ds-nav-indicator" aria-hidden="true" />}
                      <item.icon size={17} className="shrink-0" aria-hidden="true" />
                      <span className={isActive ? 'font-semibold' : 'font-medium'}>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>

        <div className="border-t border-[var(--border-color)] p-3">
          <Button variant="ghost"
            onClick={logout}
            className="w-full justify-start gap-3 rounded-xl px-3 py-2.5 text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]"
          >
            <LogOut size={18} aria-hidden="true" />
            <span>Sign Out</span>
          </Button>
        </div>
      </div>
    </>
  );
};

export default Sidebar;
