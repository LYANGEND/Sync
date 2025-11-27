import React, { useState, useEffect, useRef } from 'react';
import { Bell, Search, Check, Menu } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import api from '../../utils/api';
import { useAuth } from '../../context/AuthContext';

interface Notification {
  id: string;
  title: string;
  message: string;
  isRead: boolean;
  type: 'INFO' | 'WARNING' | 'SUCCESS' | 'ERROR';
  createdAt: string;
}

interface HeaderProps {
  onMenuClick: () => void;
}

const Header = ({ onMenuClick }: HeaderProps) => {
  const { user } = useAuth();
  const location = useLocation();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showSearch, setShowSearch] = useState(false);
  const notificationRef = useRef<HTMLDivElement>(null);

  // Get page title based on route
  const getPageTitle = () => {
    const path = location.pathname;
    if (path === '/') return 'Dashboard';
    if (path.startsWith('/students')) return 'Students';
    if (path.startsWith('/finance')) return 'Finance';
    if (path.startsWith('/attendance')) return 'Attendance';
    if (path.startsWith('/academics')) return 'Academics';
    if (path.startsWith('/users')) return 'Users';
    if (path.startsWith('/settings')) return 'Settings';
    if (path.startsWith('/communication')) return 'Messages';
    if (path.startsWith('/classes')) return 'Classes';
    if (path.startsWith('/subjects')) return 'Subjects';
    return 'Sync';
  };

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

  return (
    <>
      <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4 fixed top-0 right-0 left-0 lg:left-64 z-10">
        {/* Left side - Menu button (mobile) or Search (desktop) */}
        <div className="flex items-center">
          <button onClick={onMenuClick} className="lg:hidden p-2 -ml-2 text-gray-500 hover:bg-gray-100 rounded-lg">
            <Menu size={22} />
          </button>
          
          {/* Mobile: Page Title */}
          <h1 className="lg:hidden font-semibold text-gray-800 ml-2">{getPageTitle()}</h1>
          
          {/* Desktop: Search */}
          <div className="hidden lg:flex items-center bg-gray-100 rounded-lg px-3 py-2 flex-1 max-w-md">
            <Search size={18} className="text-gray-400 flex-shrink-0" />
            <input type="text" placeholder="Search..." className="bg-transparent border-none focus:outline-none ml-2 w-full text-sm text-gray-700" />
          </div>
        </div>

        {/* Right side */}
        <div className="flex items-center space-x-1">
          {/* Mobile Search Button */}
          <button onClick={() => setShowSearch(!showSearch)} className="lg:hidden p-2 text-gray-500 hover:bg-gray-100 rounded-lg">
            <Search size={20} />
          </button>

          {/* Notifications */}
          <div className="relative" ref={notificationRef}>
            <button onClick={() => setShowNotifications(!showNotifications)} className="relative p-2 text-gray-500 hover:bg-gray-100 rounded-lg">
              <Bell size={20} />
              {unreadCount > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full"></span>
              )}
            </button>

            {showNotifications && (
              <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden z-50 max-h-[70vh]">
                <div className="p-3 border-b border-gray-100 flex justify-between items-center bg-gray-50 sticky top-0">
                  <h3 className="font-semibold text-gray-700 text-sm">Notifications</h3>
                  {unreadCount > 0 && (
                    <button onClick={markAllAsRead} className="text-xs text-blue-600 hover:text-blue-800 font-medium">Mark all read</button>
                  )}
                </div>
                <div className="overflow-y-auto max-h-80">
                  {notifications.length === 0 ? (
                    <div className="p-8 text-center text-gray-500 text-sm">No notifications</div>
                  ) : (
                    notifications.map(notification => (
                      <div key={notification.id} className={`p-3 border-b border-gray-50 hover:bg-gray-50 ${!notification.isRead ? 'bg-blue-50/50' : ''}`}>
                        <div className="flex justify-between items-start">
                          <h4 className={`text-sm font-medium ${!notification.isRead ? 'text-gray-900' : 'text-gray-600'}`}>{notification.title}</h4>
                          {!notification.isRead && (
                            <button onClick={() => markAsRead(notification.id)} className="text-gray-400 hover:text-blue-600 ml-2 p-1">
                              <Check size={14} />
                            </button>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 mt-1 line-clamp-2">{notification.message}</p>
                        <span className="text-[10px] text-gray-400 mt-1 block">{new Date(notification.createdAt).toLocaleString()}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
          
          {/* User Avatar */}
          <div className="flex items-center pl-2 border-l border-gray-200 ml-2">
            <div className="hidden sm:block text-right mr-2">
              <p className="text-sm font-medium text-gray-700 leading-tight">{user?.fullName || 'User'}</p>
              <p className="text-[10px] text-gray-500">{user?.role?.replace('_', ' ')}</p>
            </div>
            <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white font-semibold text-sm">
              {user?.fullName?.charAt(0) || 'U'}
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Search Overlay */}
      {showSearch && (
        <div className="fixed inset-0 bg-white z-50 lg:hidden">
          <div className="flex items-center p-4 border-b border-gray-200">
            <button onClick={() => setShowSearch(false)} className="p-2 -ml-2 text-gray-500">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <input 
              type="text" 
              placeholder="Search students, payments..." 
              className="flex-1 ml-2 text-base focus:outline-none"
              autoFocus
            />
          </div>
          <div className="p-4 text-center text-gray-500 text-sm">
            Start typing to search...
          </div>
        </div>
      )}
    </>
  );
};

export default Header;
