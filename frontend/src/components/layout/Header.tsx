import { useState, useEffect, useRef } from 'react';
import { Bell, Check, X, BellRing, Trash2, ShieldCheck } from 'lucide-react';
import api from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { subscribeToPushNotifications } from '../../utils/push';
import { ThemeToggle } from '../mobile';
import { Button } from '../ui/DesignSystem';
import { useNavigate } from 'react-router-dom';

interface Notification {
  id: string;
  title: string;
  message: string;
  isRead: boolean;
  type: 'INFO' | 'WARNING' | 'SUCCESS' | 'ERROR';
  createdAt: string;
}

const Header = () => {
  const navigate = useNavigate();
  const { user, isAuthenticated, isLoading } = useAuth();
  const { settings: themeSettings } = useTheme();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const notificationRef = useRef<HTMLDivElement>(null);
  const notificationButtonRef = useRef<HTMLButtonElement>(null);
  const notificationPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isLoading || !isAuthenticated) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }

    if (user?.role === 'PLATFORM_ADMIN') {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }

    fetchNotifications();
    const interval = setInterval(fetchNotifications, 60000);
    return () => clearInterval(interval);
  }, [isAuthenticated, isLoading, user?.role]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const closeNotifications = () => {
    setShowNotifications(false);
    notificationButtonRef.current?.focus();
  };

  useEffect(() => {
    if (!showNotifications) return;
    notificationPanelRef.current?.focus();
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !document.querySelector('dialog[open]')) {
        event.preventDefault();
        closeNotifications();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [showNotifications]);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('app:notifications-count', { detail: unreadCount }));
  }, [unreadCount]);

  const fetchNotifications = async () => {
    if (!isAuthenticated || user?.role === 'PLATFORM_ADMIN') return;

    try {
      const response = await api.get('/communication/notifications');
      setNotifications(response.data);
      setUnreadCount(response.data.filter((n: Notification) => !n.isRead).length);
    } catch (error: any) {
      const status = error.response?.status;
      if (status === 401 || status === 403) {
        setNotifications([]);
        setUnreadCount(0);
        return;
      }
      console.error('Failed to fetch notifications', error);
    }
  };

  const markAsRead = async (id: string) => {
    try {
      await api.patch(`/communication/notifications/${id}/read`);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Failed to mark notification as read', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      await api.patch('/communication/notifications/read-all');
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error('Failed to mark all as read', error);
    }
  };

  const deleteNotification = async (id: string) => {
    try {
      await api.delete(`/communication/notifications/${id}`);
      setNotifications(prev => prev.filter(n => n.id !== id));
      setUnreadCount(prev => {
        const wasUnread = notifications.find(n => n.id === id && !n.isRead);
        return wasUnread ? Math.max(0, prev - 1) : prev;
      });
    } catch (error) {
      console.error('Failed to delete notification', error);
    }
  };

  const clearReadNotifications = async () => {
    try {
      await api.delete('/communication/notifications/clear-read');
      setNotifications(prev => prev.filter(n => !n.isRead));
    } catch (error) {
      console.error('Failed to clear read notifications', error);
    }
  };

  const handleEnablePush = async () => {
    try {
      const success = await subscribeToPushNotifications();
      if (success) {
        alert('Push notifications enabled!');
      } else {
        alert('Failed to enable push notifications. Please check your browser settings.');
      }
    } catch (error) {
      console.error('Error enabling push notifications:', error);
      alert('An error occurred while enabling push notifications.');
    }
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const returnToOps = () => {
    const savedSession = localStorage.getItem('platformSession');
    if (!savedSession) return;

    try {
      const parsed = JSON.parse(savedSession);
      localStorage.setItem('token', parsed.token);
      localStorage.setItem('user', JSON.stringify(parsed.user));
      localStorage.removeItem('tenantSlug');
      localStorage.removeItem('platformSession');
      window.location.href = '/ops';
    } catch {
      localStorage.removeItem('platformSession');
      window.location.href = '/ops/login';
    }
  };

  const isImpersonating = Boolean(user?.impersonatedBy || localStorage.getItem('platformSession'));

  return (
    <header
      className="ds-header fixed top-0 right-0 left-0 md:left-[17.5rem] z-40 border-b text-[var(--text-primary)]"
      style={{
        paddingTop: 'env(safe-area-inset-top)',
      }}
    >
      <div className="ds-shell flex h-16 min-w-0 items-center justify-between gap-2 lg:gap-4">
        {/* Mobile: Logo & Greeting */}
        <div className="md:hidden flex items-center gap-3 flex-1 min-w-0">
          {/* School Logo */}
          {themeSettings.logoUrl ? (
            <img
              src={themeSettings.logoUrl.startsWith('http') ? themeSettings.logoUrl : themeSettings.logoUrl}
              alt={`${themeSettings.schoolName} logo`}
              className="w-9 h-9 rounded-xl object-contain bg-[var(--surface-muted)] p-0.5 flex-shrink-0"
            />
          ) : (
            <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-[var(--action-color)] text-[var(--action-foreground)] font-bold text-lg flex-shrink-0">
              {themeSettings.schoolName?.charAt(0) || 'S'}
            </div>
          )}

          {/* Greeting */}
          <div className="min-w-0">
            <p className="text-xs text-[var(--text-secondary)] font-medium truncate">{getGreeting()}</p>
            <p className="text-sm font-semibold truncate">{user?.fullName?.split(' ')[0] || 'User'}</p>
          </div>
        </div>

        <div className="hidden md:block min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{themeSettings.schoolName}</p>
          <p className="text-xs text-muted">School workspace</p>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-1 lg:gap-2 flex-shrink-0">
          {isImpersonating && (
            <>
              <Button variant="secondary"
                onClick={returnToOps}
                className="hidden xl:inline-flex gap-1.5"
              >
                <ShieldCheck size={18} aria-hidden="true" />
                Return to Ops
              </Button>
              <Button variant="ghost"
                onClick={returnToOps}
                className="xl:hidden px-2"
                aria-label="Return to Ops"
                title="Return to Ops"
              >
                <ShieldCheck size={20} aria-hidden="true" />
              </Button>
            </>
          )}

          {/* Theme Toggle */}
          <ThemeToggle className="min-h-11 min-w-11" />

          {/* Push Notification Button - Desktop Only */}
          <Button variant="secondary"
            onClick={handleEnablePush}
            className="hidden md:flex gap-1.5 px-2 lg:px-3"
            aria-label="Enable push notifications"
            title="Enable Push Notifications"
          >
            <BellRing size={18} aria-hidden="true" />
            <span className="hidden xl:inline">Enable Push</span>
          </Button>

          {/* Notifications */}
          <div className="relative" ref={notificationRef}
            onBlur={event => {
              if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) setShowNotifications(false);
            }}>
            <Button variant="ghost"
              ref={notificationButtonRef}
              onClick={() => setShowNotifications(!showNotifications)}
              className="relative px-2"
              aria-label={`Notifications, ${unreadCount} unread`}
              aria-expanded={showNotifications}
              aria-controls="header-notifications"
            >
              <Bell size={20} aria-hidden="true" />
              {unreadCount > 0 && (
                <span aria-hidden="true" className="absolute top-1.5 right-1.5 min-w-[18px] h-[18px] bg-red-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </Button>

            {/* One non-modal disclosure on every viewport; Tab may leave it and Escape restores the trigger. */}
            {showNotifications && (
              <div id="header-notifications" ref={notificationPanelRef} role="region" tabIndex={-1}
                aria-labelledby="header-notifications-title"
                className="ds-surface fixed inset-x-4 top-[calc(4rem+env(safe-area-inset-top))] md:inset-x-auto md:absolute md:right-0 md:top-full mt-2 md:w-96 max-w-[calc(100vw-2rem)] max-h-[calc(100dvh-10rem)] flex flex-col overflow-hidden z-50">
                <div className="shrink-0 p-4 border-b border-[var(--border-color)] bg-[var(--surface-muted)]">
                  <div className="flex items-center justify-between gap-2">
                    <h2 id="header-notifications-title" className="text-lg font-semibold">Notifications</h2>
                    <Button variant="ghost" onClick={closeNotifications} aria-label="Close notifications" className="px-2">
                      <X size={20} aria-hidden="true" />
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {notifications.some(n => n.isRead) && (
                      <Button variant="outline" onClick={clearReadNotifications}>Clear read</Button>
                    )}
                    {unreadCount > 0 && (
                      <Button variant="outline" onClick={markAllAsRead}>Mark all read</Button>
                    )}
                  </div>
                </div>
                <div className="min-h-0 overflow-y-auto overscroll-contain">
                  {notifications.length === 0 ? (
                    <p className="p-8 text-center text-sm text-[var(--text-secondary)]">No notifications yet</p>
                  ) : notifications.map(notification => (
                    <div key={notification.id}
                      className={`p-4 border-b border-[var(--border-color)] ${!notification.isRead ? 'bg-[var(--surface-muted)]' : ''}`}>
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <h3 className="min-w-0 flex-1 break-words [overflow-wrap:anywhere] text-sm font-semibold">{notification.title}</h3>
                        <div className="flex shrink-0 gap-1">
                          {!notification.isRead && (
                            <Button variant="ghost" onClick={() => markAsRead(notification.id)}
                              aria-label={`Mark as read: ${notification.title}`} className="px-2">
                              <Check size={18} aria-hidden="true" />
                            </Button>
                          )}
                          <Button variant="ghost" onClick={() => deleteNotification(notification.id)}
                            aria-label={`Delete notification: ${notification.title}`} className="px-2">
                            <Trash2 size={18} aria-hidden="true" />
                          </Button>
                        </div>
                      </div>
                      {!notification.isRead && <span className="ds-badge ds-badge-info">Unread</span>}
                      <p className="text-sm text-[var(--text-secondary)] mt-1 break-words [overflow-wrap:anywhere]">{notification.message}</p>
                      <span className="text-xs text-[var(--text-secondary)] mt-2 block">{new Date(notification.createdAt).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Profile - Desktop */}
          <Button variant="ghost"
            aria-label={`Open profile for ${user?.fullName || 'User'}`}
            className="hidden md:flex items-center gap-3 px-2"
            onClick={() => navigate('/profile')}
          >
            <span className="hidden lg:block max-w-40 text-right">
              <span className="block truncate text-sm font-medium text-[var(--text-primary)]">{user?.fullName || 'User'}</span>
              <span className="block truncate text-xs text-[var(--text-secondary)]">{user?.role?.replace('_', ' ') || 'Role'}</span>
            </span>
            <span className="ds-avatar overflow-hidden" aria-hidden="true">
              {user?.profilePictureUrl ? (
                <img
                  src={user.profilePictureUrl.startsWith('http') ? user.profilePictureUrl : `${import.meta.env.VITE_API_URL || ''}${user.profilePictureUrl}`}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ) : (
                user?.fullName?.charAt(0) || 'U'
              )}
            </span>
          </Button>

          {/* Profile Avatar - Mobile (clickable) */}
          <button
            type="button"
            onClick={() => navigate('/profile')}
            aria-label="Open profile"
            className="ds-avatar md:hidden overflow-hidden"
          >
            {user?.profilePictureUrl ? (
              <img
                src={user.profilePictureUrl.startsWith('http') ? user.profilePictureUrl : `${import.meta.env.VITE_API_URL || ''}${user.profilePictureUrl}`}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : (
              user?.fullName?.charAt(0) || 'U'
            )}
          </button>
        </div>
      </div>
    </header>
  );
};

export default Header;
