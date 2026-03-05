import React, { useState, useEffect } from 'react';
import api from '../../utils/api';
import { 
  Send, Mail, Bell, Users, CheckCircle, AlertCircle, MessageSquare, 
  Megaphone, Clock, BarChart3
} from 'lucide-react';
import ChatInterface from './ChatInterface';
import SentItems from './SentItems';
import AnnouncementHistory from './AnnouncementHistory';
import { useAuth } from '../../context/AuthContext';

const ROLES = ['SUPER_ADMIN', 'BURSAR', 'TEACHER', 'SECRETARY', 'PARENT', 'STUDENT'];

type TabType = 'announcements' | 'messages' | 'sent' | 'history';

const Communication = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('announcements');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [targetRoles, setTargetRoles] = useState<string[]>([]);
  const [sendEmail, setSendEmail] = useState(false);
  const [sendNotification, setSendNotification] = useState(true);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);

  const isAdmin = ['SUPER_ADMIN', 'BURSAR', 'SECRETARY'].includes(user?.role || '');
  const canSendAnnouncements = ['SUPER_ADMIN', 'BURSAR', 'SECRETARY', 'TEACHER'].includes(user?.role || '');
  const canChat = ['SUPER_ADMIN', 'BURSAR', 'SECRETARY', 'TEACHER', 'PARENT'].includes(user?.role || '');
  const canViewLogs = isAdmin;

  useEffect(() => {
    if (!canSendAnnouncements && canChat) {
      setActiveTab('messages');
    }
  }, [canSendAnnouncements, canChat]);

  const handleRoleToggle = (role: string) => {
    setTargetRoles(prev => 
      prev.includes(role) 
        ? prev.filter(r => r !== role)
        : [...prev, role]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject || !message) {
      setStatus({ type: 'error', message: 'Please fill in all fields' });
      return;
    }

    setSending(true);
    setStatus(null);

    try {
      const response = await api.post('/communication/announcements', {
        subject,
        message,
        targetRoles: targetRoles.length > 0 ? targetRoles : undefined,
        sendEmail,
        sendNotification,
      });

      setStatus({ type: 'success', message: response.data.message });
      setSubject('');
      setMessage('');
      setTargetRoles([]);
      setSendEmail(false);
    } catch (error: any) {
      console.error('Failed to send announcement', error);
      setStatus({ type: 'error', message: error.response?.data?.message || 'Failed to send announcement' });
    } finally {
      setSending(false);
    }
  };

  if (!canSendAnnouncements && !canChat) {
    return (
      <div className="p-4 md:p-6 pb-24 md:pb-6 max-w-5xl mx-auto text-center text-gray-500 dark:text-gray-400">
        You do not have permission to access this page.
      </div>
    );
  }

  const tabs: { key: TabType; label: string; icon: React.ReactNode; show: boolean }[] = [
    { key: 'announcements', label: 'New Announcement', icon: <Megaphone size={18} />, show: canSendAnnouncements },
    { key: 'history', label: 'History', icon: <Clock size={18} />, show: canSendAnnouncements },
    { key: 'messages', label: 'Messages', icon: <MessageSquare size={18} />, show: canChat },
    { key: 'sent', label: 'Sent Items', icon: <BarChart3 size={18} />, show: canViewLogs },
  ];

  return (
    <div className="p-4 md:p-6 pb-24 md:pb-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Communication Hub</h1>
        <p className="text-gray-500 dark:text-gray-400">Manage announcements, messages, and track all communications</p>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
        {tabs.filter(t => t.show).map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 rounded-lg font-medium transition-all flex items-center gap-2 whitespace-nowrap text-sm ${
              activeTab === tab.key
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                : 'bg-white dark:bg-slate-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700 border border-gray-200 dark:border-slate-600'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'messages' && canChat ? (
        <ChatInterface />
      ) : activeTab === 'sent' && canViewLogs ? (
        <SentItems />
      ) : activeTab === 'history' && canSendAnnouncements ? (
        <AnnouncementHistory />
      ) : canSendAnnouncements ? (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 overflow-hidden">
          <div className="p-6 border-b border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-slate-700">
            <h2 className="font-semibold text-gray-800 dark:text-white flex items-center gap-2">
              <Send size={20} className="text-blue-600" />
              New Announcement
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Broadcast a message to users. Emails will be tracked in Sent Items.</p>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            {status && (
              <div className={`p-4 rounded-lg flex items-center gap-2 ${
                status.type === 'success' ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300' : 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300'
              }`}>
                {status.type === 'success' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
                {status.message}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Subject</label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-white dark:bg-slate-700 dark:text-white"
                placeholder="e.g. School Closure Notice"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Message</label>
              <textarea
                rows={6}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-white dark:bg-slate-700 dark:text-white"
                placeholder="Type your announcement here..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-3 flex items-center gap-2">
                <Users size={16} />
                Target Audience (Leave empty for ALL users)
              </label>
              <div className="flex flex-wrap gap-3">
                {ROLES.map(role => (
                  <button
                    key={role}
                    type="button"
                    onClick={() => handleRoleToggle(role)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors border ${
                      targetRoles.includes(role)
                        ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800'
                        : 'bg-white dark:bg-slate-700 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-600'
                    }`}
                  >
                    {role.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-gray-100 dark:border-slate-700">
              <label className={`flex items-center p-4 border rounded-lg cursor-pointer transition-all ${
                sendNotification ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-700'
              }`}>
                <input
                  type="checkbox"
                  checked={sendNotification}
                  onChange={(e) => setSendNotification(e.target.checked)}
                  className="sr-only"
                />
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-full ${sendNotification ? 'bg-blue-200 dark:bg-blue-800 text-blue-700 dark:text-blue-300' : 'bg-gray-200 dark:bg-slate-600 text-gray-500 dark:text-gray-400'}`}>
                    <Bell size={20} />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">In-App Notification</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Show in dashboard bell icon</p>
                  </div>
                </div>
                {sendNotification && <CheckCircle size={20} className="ml-auto text-blue-600" />}
              </label>

              <label className={`flex items-center p-4 border rounded-lg cursor-pointer transition-all ${
                sendEmail ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-700'
              }`}>
                <input
                  type="checkbox"
                  checked={sendEmail}
                  onChange={(e) => setSendEmail(e.target.checked)}
                  className="sr-only"
                />
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-full ${sendEmail ? 'bg-blue-200 dark:bg-blue-800 text-blue-700 dark:text-blue-300' : 'bg-gray-200 dark:bg-slate-600 text-gray-500 dark:text-gray-400'}`}>
                    <Mail size={20} />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">Email Broadcast</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Send to registered email addresses</p>
                  </div>
                </div>
                {sendEmail && <CheckCircle size={20} className="ml-auto text-blue-600" />}
              </label>
            </div>

            <div className="flex justify-end pt-4">
              <button
                type="submit"
                disabled={sending || (!sendEmail && !sendNotification)}
                className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed transition-colors font-medium shadow-sm"
              >
                <Send size={18} />
                {sending ? 'Sending...' : 'Send Announcement'}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
};

export default Communication;
