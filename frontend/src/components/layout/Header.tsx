import { useState, useEffect, useRef } from 'react';
import { Bell, Search, Check, X, BellRing } from 'lucide-react';
import api from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import { subscribeToPushNotifications } from '../../utils/push';
import { ThemeToggle, VoiceSearchButton } from '../mobile';
import { hapticLight } from '../../utils/haptic';

interface Notification {
  id: string;
  title: string;
  message: string;
  isRead: boolean;
  type: 'INFO' | 'WARNING' | 'SUCCESS' | 'ERROR';
  createdAt: string;
}

const Header = () => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const notificationRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (showSearch && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [showSearch]);

  const fetchNotifications = async () => {
    try {
      const response = await api.get('/communication/notifications');
      setNotifications(response.data);
      setUnreadCount(response.data.filter((n: Notification) => !n.isRead).length);
    } catch (error) {
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

  return (
    <header
      className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-lg border-b border-gray-200/50 dark:border-slate-700/50 fixed top-0 right-0 left-0 md:left-64 z-40 transition-all duration-300"
      style={{
        paddingTop: 'env(safe-area-inset-top)',
      }}
    >
      <div className="h-16 px-4 flex items-center justify-between gap-4">
        {/* Mobile: Logo & Greeting */}
        <div className="md:hidden flex items-center gap-3 flex-1 min-w-0">
          {/* Logo */}
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center text-white font-bold text-lg shadow-sm flex-shrink-0">
            S
          </div>

          {/* Greeting */}
          <div className="min-w-0">
            <p className="text-[11px] text-gray-500 dark:text-gray-400 font-medium truncate">{getGreeting()}</p>
            <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{user?.fullName?.split(' ')[0] || 'User'}</p>
          </div>
        </div>

        {/* Desktop: Search Bar */}
        <div className="hidden md:flex items-center bg-gray-100 dark:bg-slate-800 rounded-xl px-4 py-2.5 w-full max-w-sm">
          <Search size={18} className="text-gray-400 dark:text-gray-500 flex-shrink-0" />
          <input
            type="text"
            placeholder="Search students, payments..."
            className="bg-transparent border-none focus:outline-none ml-3 w-full text-sm text-gray-700 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500"
          />
          <VoiceSearchButton onResult={(text) => console.log('Voice search:', text)} size={18} />
        </div>

        {/* Mobile: Expandable Search */}
        {showSearch && (
          <div className="md:hidden absolute inset-x-0 top-0 h-full bg-white z-50 px-4 flex items-center gap-3 animate-fade-in"
            style={{ paddingTop: 'env(safe-area-inset-top)' }}
          >
            <div className="flex-1 flex items-center bg-gray-100 rounded-xl px-4 py-2.5">
              <Search size={18} className="text-gray-400" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search..."
                className="bg-transparent border-none focus:outline-none ml-3 w-full text-sm text-gray-700"
              />
            </div>
            <button
              onClick={() => {
                setShowSearch(false);
                setSearchQuery('');
              }}
              className="p-2 text-gray-500 hover:text-gray-700"
            >
              <X size={20} />
            </button>
          </div>
        )}

        {/* Right Actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Mobile Search Toggle */}
          <button
            onClick={() => {
              hapticLight();
              setShowSearch(true);
            }}
            className="md:hidden p-2.5 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
          >
            <Search size={20} />
          </button>

          {/* Theme Toggle */}
          <ThemeToggle />

          {/* Push Notification Button - Desktop Only */}
          <button
            onClick={handleEnablePush}
            className="hidden md:flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-3 py-2 rounded-xl transition-colors"
            title="Enable Push Notifications"
          >
            <BellRing size={14} />
            <span>Enable Push</span>
          </button>

          {/* Notifications */}
          <div className="relative" ref={notificationRef}>
            <button
              onClick={() => setShowNotifications(!showNotifications)}
              className="relative p-2.5 text-gray-500 hover:bg-gray-100 rounded-xl transition-colors"
            >
              <Bell size={20} />
              {unreadCount > 0 && (
                <span className="absolute top-1.5 right-1.5 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {/* Notification Dropdown/Sheet */}
            {showNotifications && (
              <>
                {/* Mobile: Full-width bottom sheet style */}
                <div className="md:hidden fixed inset-x-0 bottom-0 top-auto bg-white rounded-t-3xl shadow-2xl z-50 animate-slide-up max-h-[80vh] flex flex-col">
                  {/* Handle */}
                  <div className="flex justify-center py-3">
                    <div className="w-10 h-1 bg-gray-300 rounded-full" />
                  </div>

                  {/* Header */}
                  <div className="px-5 pb-3 flex justify-between items-center border-b border-gray-100">
                    <h3 className="text-lg font-bold text-gray-900">Notifications</h3>
                    <div className="flex items-center gap-2">
                      {unreadCount > 0 && (
                        <button
                          onClick={markAllAsRead}
                          className="text-sm text-blue-600 font-medium"
                        >
                          Mark all read
                        </button>
                      )}
                      <button
                        onClick={() => setShowNotifications(false)}
                        className="p-2 text-gray-400 hover:text-gray-600"
                      >
                        <X size={20} />
                      </button>
                    </div>
                  </div>

                  {/* List */}
                  <div className="flex-1 overflow-y-auto overscroll-contain">
                    {notifications.length === 0 ? (
                      <div className="p-12 text-center">
                        <Bell size={40} className="mx-auto text-gray-300 mb-3" />
                        <p className="text-gray-500">No notifications yet</p>
                      </div>
                    ) : (
                      notifications.map(notification => (
                        <div
                          key={notification.id}
                          className={`px-5 py-4 border-b border-gray-50 active:bg-gray-50 ${!notification.isRead ? 'bg-blue-50/50' : ''}`}
                        >
                          <div className="flex justify-between items-start gap-2">
                            <div className="flex-1 min-w-0">
                              <h4 className={`text-sm font-semibold ${!notification.isRead ? 'text-gray-900' : 'text-gray-600'}`}>
                                {notification.title}
                              </h4>
                              <p className="text-sm text-gray-500 mt-1 line-clamp-2">{notification.message}</p>
                              <span className="text-xs text-gray-400 mt-2 block">
                                {new Date(notification.createdAt).toLocaleString()}
                              </span>
                            </div>
                            {!notification.isRead && (
                              <button
                                onClick={() => markAsRead(notification.id)}
                                className="p-2 text-gray-400 hover:text-blue-600 flex-shrink-0"
                              >
                                <Check size={16} />
                              </button>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Safe area padding */}
                  <div style={{ paddingBottom: 'env(safe-area-inset-bottom)' }} />
                </div>

                {/* Overlay */}
                <div
                  className="md:hidden fixed inset-0 bg-black/30 z-40"
                  onClick={() => setShowNotifications(false)}
                />

                {/* Desktop: Traditional dropdown */}
                <div className="hidden md:block absolute right-0 mt-2 w-80 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden z-50 animate-scale-in">
                  <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                    <h3 className="font-semibold text-gray-700">Notifications</h3>
                    {unreadCount > 0 && (
                      <button
                        onClick={markAllAsRead}
                        className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                      >
                        Mark all read
                      </button>
                    )}
                  </div>
                  <div className="max-h-96 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className="p-8 text-center text-gray-500 text-sm">
                        No notifications
                      </div>
                    ) : (
                      notifications.map(notification => (
                        <div
                          key={notification.id}
                          className={`p-4 border-b border-gray-50 hover:bg-gray-50 transition-colors ${!notification.isRead ? 'bg-blue-50/50' : ''}`}
                        >
                          <div className="flex justify-between items-start">
                            <h4 className={`text-sm font-medium ${!notification.isRead ? 'text-gray-900' : 'text-gray-600'}`}>
                              {notification.title}
                            </h4>
                            {!notification.isRead && (
                              <button
                                onClick={() => markAsRead(notification.id)}
                                className="text-gray-400 hover:text-blue-600"
                                title="Mark as read"
                              >
                                <Check size={14} />
                              </button>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 mt-1">{notification.message}</p>
                          <span className="text-[10px] text-gray-400 mt-2 block">
                            {new Date(notification.createdAt).toLocaleString()}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Profile - Desktop */}
          <div
            className="hidden md:flex items-center gap-3 pl-4 border-l border-gray-200 cursor-pointer hover:bg-gray-50 rounded-xl py-2 pr-3 -mr-3 transition-colors"
            onClick={() => window.location.href = '/profile'}
          >
            <div className="text-right">
              <p className="text-sm font-medium text-gray-900">{user?.fullName || 'User'}</p>
              <p className="text-xs text-gray-500">{user?.role?.replace('_', ' ') || 'Role'}</p>
            </div>
            <div className="w-10 h-10 rounded-xl overflow-hidden bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-bold shadow-sm">
              {user?.profilePictureUrl ? (
                <img
                  src={user.profilePictureUrl.startsWith('http') ? user.profilePictureUrl : `${import.meta.env.VITE_API_URL || ''}${user.profilePictureUrl}`}
                  alt={user.fullName}
                  className="w-full h-full object-cover"
                />
              ) : (
                user?.fullName?.charAt(0) || 'U'
              )}
            </div>
          </div>

          {/* Profile Avatar - Mobile (clickable) */}
          <button
            onClick={() => window.location.href = '/profile'}
            className="md:hidden w-9 h-9 rounded-xl overflow-hidden bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-bold text-sm shadow-sm"
          >
            {user?.profilePictureUrl ? (
              <img
                src={user.profilePictureUrl.startsWith('http') ? user.profilePictureUrl : `${import.meta.env.VITE_API_URL || ''}${user.profilePictureUrl}`}
                alt={user?.fullName || 'User'}
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
