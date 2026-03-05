import { useState, useEffect, useCallback } from 'react';
import api from '../../utils/api';
import { 
  Megaphone, Mail, Bell, Users, ChevronLeft, ChevronRight, 
  Calendar, User
} from 'lucide-react';

interface Announcement {
  id: string;
  subject: string;
  message: string;
  targetRoles: string[];
  sentViaEmail: boolean;
  sentViaNotification: boolean;
  recipientCount: number;
  createdAt: string;
  createdBy: {
    id: string;
    fullName: string;
    role: string;
  };
}

const roleColors: Record<string, string> = {
  SUPER_ADMIN: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
  BURSAR: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
  TEACHER: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
  SECRETARY: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300',
  PARENT: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300',
  STUDENT: 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300',
  ALL: 'bg-gray-100 dark:bg-gray-900/30 text-gray-700 dark:text-gray-300',
};

const AnnouncementHistory = () => {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchAnnouncements = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get(`/communication/announcements/history?page=${page}&limit=15`);
      setAnnouncements(response.data.announcements);
      setTotalPages(response.data.totalPages);
      setTotal(response.data.total);
    } catch (error) {
      console.error('Failed to fetch announcement history', error);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    fetchAnnouncements();
  }, [fetchAnnouncements]);

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) + ' at ' +
           d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const timeAgo = (dateStr: string) => {
    const now = new Date();
    const date = new Date(dateStr);
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return formatDate(dateStr);
  };

  if (loading) {
    return (
      <div className="p-12 text-center text-gray-400">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
        Loading announcements...
      </div>
    );
  }

  if (announcements.length === 0) {
    return (
      <div className="text-center py-16">
        <Megaphone size={48} className="mx-auto mb-4 text-gray-300 dark:text-gray-600" />
        <p className="text-gray-500 dark:text-gray-400">No announcements have been sent yet</p>
        <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">Announcements will appear here once created</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex justify-between items-center">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Showing {announcements.length} of {total} announcements
        </p>
      </div>

      {/* Announcement Cards */}
      <div className="space-y-3">
        {announcements.map((announcement) => (
          <div
            key={announcement.id}
            className="bg-white dark:bg-slate-800 rounded-xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden transition-all hover:shadow-md"
          >
            <div
              className="p-4 cursor-pointer"
              onClick={() => setExpandedId(expandedId === announcement.id ? null : announcement.id)}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Megaphone size={16} className="text-blue-600 dark:text-blue-400 shrink-0" />
                    <h3 className="font-semibold text-gray-800 dark:text-white truncate">{announcement.subject}</h3>
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2">
                    {announcement.message}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">{timeAgo(announcement.createdAt)}</p>
                  <div className="flex items-center gap-1.5 mt-1 justify-end">
                    <Users size={12} className="text-gray-400" />
                    <span className="text-xs text-gray-500 dark:text-gray-400">{announcement.recipientCount}</span>
                  </div>
                </div>
              </div>

              {/* Delivery channels & roles */}
              <div className="flex items-center gap-2 mt-3 flex-wrap">
                {announcement.sentViaNotification && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400">
                    <Bell size={12} /> In-App
                  </span>
                )}
                {announcement.sentViaEmail && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400">
                    <Mail size={12} /> Email
                  </span>
                )}
                <span className="text-gray-300 dark:text-gray-600">|</span>
                {announcement.targetRoles.map(role => (
                  <span
                    key={role}
                    className={`px-2 py-0.5 rounded-full text-xs font-medium ${roleColors[role] || roleColors.ALL}`}
                  >
                    {role.replace('_', ' ')}
                  </span>
                ))}
              </div>
            </div>

            {/* Expanded Details */}
            {expandedId === announcement.id && (
              <div className="px-4 pb-4 pt-2 border-t border-gray-100 dark:border-slate-700 space-y-3">
                <div className="p-3 bg-gray-50 dark:bg-slate-700/50 rounded-lg">
                  <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{announcement.message}</p>
                </div>
                <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                  <span className="flex items-center gap-1">
                    <User size={12} />
                    {announcement.createdBy.fullName}
                  </span>
                  <span className="flex items-center gap-1">
                    <Calendar size={12} />
                    {formatDate(announcement.createdAt)}
                  </span>
                  <span className="flex items-center gap-1">
                    <Users size={12} />
                    {announcement.recipientCount} recipients
                  </span>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-between items-center pt-2">
          <p className="text-sm text-gray-500 dark:text-gray-400">Page {page} of {totalPages}</p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-2 rounded-lg border border-gray-200 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="p-2 rounded-lg border border-gray-200 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AnnouncementHistory;
