import React, { useState, useEffect, useCallback } from 'react';
import api from '../../utils/api';
import { 
  Mail, MessageSquare as Sms, Phone, Bell, 
  CheckCircle, XCircle, Clock, Search, 
  ChevronLeft, ChevronRight, Filter, 
  BarChart3, Send, AlertTriangle, Eye
} from 'lucide-react';

interface CommunicationLog {
  id: string;
  channel: 'EMAIL' | 'SMS' | 'WHATSAPP' | 'PUSH';
  status: 'SENT' | 'FAILED' | 'PENDING';
  recipientEmail: string | null;
  recipientPhone: string | null;
  recipientName: string | null;
  subject: string | null;
  message: string;
  htmlBody: string | null;
  source: string;
  errorMessage: string | null;
  createdAt: string;
  sentBy: {
    id: string;
    fullName: string;
    role: string;
  } | null;
}

interface Stats {
  totalSent: number;
  totalFailed: number;
  sentToday: number;
  sentThisMonth: number;
  byChannel: Record<string, number>;
}

const channelIcons: Record<string, React.ReactNode> = {
  EMAIL: <Mail size={16} />,
  SMS: <Sms size={16} />,
  WHATSAPP: <Phone size={16} />,
  PUSH: <Bell size={16} />,
};

const channelColors: Record<string, string> = {
  EMAIL: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
  SMS: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
  WHATSAPP: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300',
  PUSH: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300',
};

const statusIcons: Record<string, React.ReactNode> = {
  SENT: <CheckCircle size={14} className="text-green-500" />,
  FAILED: <XCircle size={14} className="text-red-500" />,
  PENDING: <Clock size={14} className="text-yellow-500" />,
};

const sourceLabels: Record<string, string> = {
  announcement: 'Announcement',
  fee_reminder: 'Fee Reminder',
  payment_receipt: 'Payment Receipt',
  attendance_alert: 'Attendance Alert',
  notification_service: 'System Notification',
  manual: 'Manual',
};

const SentItems = () => {
  const [logs, setLogs] = useState<CommunicationLog[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [channelFilter, setChannelFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [selectedLog, setSelectedLog] = useState<CommunicationLog | null>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (channelFilter) params.set('channel', channelFilter);
      if (statusFilter) params.set('status', statusFilter);
      if (sourceFilter) params.set('source', sourceFilter);
      params.set('page', page.toString());
      params.set('limit', '20');

      const response = await api.get(`/communication/logs?${params.toString()}`);
      setLogs(response.data.logs);
      setTotalPages(response.data.totalPages);
      setTotal(response.data.total);
    } catch (error) {
      console.error('Failed to fetch communication logs', error);
    } finally {
      setLoading(false);
    }
  }, [search, channelFilter, statusFilter, sourceFilter, page]);

  const fetchStats = async () => {
    try {
      const response = await api.get('/communication/stats');
      setStats(response.data);
    } catch (error) {
      console.error('Failed to fetch communication stats', error);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    setPage(1);
  }, [search, channelFilter, statusFilter, sourceFilter]);

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) + ' ' +
           d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-gray-100 dark:border-slate-700 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400">
                <Send size={20} />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-800 dark:text-white">{stats.totalSent}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Total Sent</p>
              </div>
            </div>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-gray-100 dark:border-slate-700 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400">
                <AlertTriangle size={20} />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-800 dark:text-white">{stats.totalFailed}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Failed</p>
              </div>
            </div>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-gray-100 dark:border-slate-700 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                <BarChart3 size={20} />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-800 dark:text-white">{stats.sentToday}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Today</p>
              </div>
            </div>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-gray-100 dark:border-slate-700 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400">
                <Mail size={20} />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-800 dark:text-white">{stats.sentThisMonth}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">This Month</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-100 dark:border-slate-700 p-4 shadow-sm">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="Search by recipient, subject..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 dark:border-slate-600 rounded-lg focus:outline-none focus:border-blue-500 bg-white dark:bg-slate-700 dark:text-white text-sm"
            />
          </div>
          <div className="flex gap-2">
            <select
              value={channelFilter}
              onChange={(e) => setChannelFilter(e.target.value)}
              className="px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-700 dark:text-gray-200 text-sm focus:outline-none focus:border-blue-500"
            >
              <option value="">All Channels</option>
              <option value="EMAIL">Email</option>
              <option value="SMS">SMS</option>
              <option value="WHATSAPP">WhatsApp</option>
              <option value="PUSH">Push</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-700 dark:text-gray-200 text-sm focus:outline-none focus:border-blue-500"
            >
              <option value="">All Status</option>
              <option value="SENT">Sent</option>
              <option value="FAILED">Failed</option>
              <option value="PENDING">Pending</option>
            </select>
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="px-3 py-2 border border-gray-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-700 dark:text-gray-200 text-sm focus:outline-none focus:border-blue-500"
            >
              <option value="">All Sources</option>
              <option value="announcement">Announcement</option>
              <option value="fee_reminder">Fee Reminder</option>
              <option value="payment_receipt">Payment Receipt</option>
              <option value="attendance_alert">Attendance Alert</option>
              <option value="notification_service">System</option>
              <option value="manual">Manual</option>
            </select>
          </div>
        </div>
      </div>

      {/* Logs Table */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-100 dark:border-slate-700 flex justify-between items-center">
          <h3 className="font-semibold text-gray-800 dark:text-white flex items-center gap-2">
            <Filter size={18} className="text-blue-600" />
            Sent Communications
            <span className="text-sm font-normal text-gray-500 dark:text-gray-400">({total} total)</span>
          </h3>
        </div>

        {loading ? (
          <div className="p-12 text-center text-gray-400">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
            Loading...
          </div>
        ) : logs.length === 0 ? (
          <div className="p-12 text-center text-gray-400 dark:text-gray-500">
            <Mail size={48} className="mx-auto mb-4 opacity-20" />
            <p>No communications found</p>
            <p className="text-sm mt-1">Sent emails, SMS and other messages will appear here</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 dark:bg-slate-700/50 text-left">
                    <th className="px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Channel</th>
                    <th className="px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Status</th>
                    <th className="px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Recipient</th>
                    <th className="px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase hidden md:table-cell">Subject</th>
                    <th className="px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase hidden lg:table-cell">Source</th>
                    <th className="px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Date</th>
                    <th className="px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/30 transition-colors">
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${channelColors[log.channel]}`}>
                          {channelIcons[log.channel]}
                          {log.channel}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 text-sm">
                          {statusIcons[log.status]}
                          <span className={`text-xs font-medium ${
                            log.status === 'SENT' ? 'text-green-600 dark:text-green-400' :
                            log.status === 'FAILED' ? 'text-red-600 dark:text-red-400' :
                            'text-yellow-600 dark:text-yellow-400'
                          }`}>
                            {log.status}
                          </span>
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div>
                          {log.recipientName && (
                            <p className="text-sm font-medium text-gray-800 dark:text-white truncate max-w-[200px]">{log.recipientName}</p>
                          )}
                          <p className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[200px]">
                            {log.recipientEmail || log.recipientPhone || 'N/A'}
                          </p>
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <p className="text-sm text-gray-700 dark:text-gray-300 truncate max-w-[250px]">
                          {log.subject || log.message.substring(0, 60) + '...'}
                        </p>
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <span className="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-slate-600 text-gray-600 dark:text-gray-300">
                          {sourceLabels[log.source] || log.source}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">{formatDate(log.createdAt)}</p>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setSelectedLog(log)}
                          className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-600 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                          title="View details"
                        >
                          <Eye size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="p-4 border-t border-gray-100 dark:border-slate-700 flex justify-between items-center">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Page {page} of {totalPages}
                </p>
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
          </>
        )}
      </div>

      {/* Detail Modal */}
      {selectedLog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setSelectedLog(null)}>
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-lg w-full max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-100 dark:border-slate-700 flex justify-between items-start">
              <div>
                <h3 className="font-semibold text-gray-800 dark:text-white text-lg">Communication Details</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">{formatDate(selectedLog.createdAt)}</p>
              </div>
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${channelColors[selectedLog.channel]}`}>
                {channelIcons[selectedLog.channel]}
                {selectedLog.channel}
              </span>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Status</p>
                  <span className="inline-flex items-center gap-1.5">
                    {statusIcons[selectedLog.status]}
                    <span className="text-sm font-medium text-gray-800 dark:text-white">{selectedLog.status}</span>
                  </span>
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Source</p>
                  <p className="text-sm text-gray-800 dark:text-white">{sourceLabels[selectedLog.source] || selectedLog.source}</p>
                </div>
              </div>

              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Recipient</p>
                <p className="text-sm font-medium text-gray-800 dark:text-white">{selectedLog.recipientName || 'N/A'}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">{selectedLog.recipientEmail || selectedLog.recipientPhone || 'N/A'}</p>
              </div>

              {selectedLog.subject && (
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Subject</p>
                  <p className="text-sm text-gray-800 dark:text-white">{selectedLog.subject}</p>
                </div>
              )}

              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Message</p>
                <div className="p-3 bg-gray-50 dark:bg-slate-700 rounded-lg text-sm text-gray-700 dark:text-gray-300 max-h-48 overflow-y-auto">
                  {selectedLog.message}
                </div>
              </div>

              {selectedLog.sentBy && (
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Sent By</p>
                  <p className="text-sm text-gray-800 dark:text-white">{selectedLog.sentBy.fullName} ({selectedLog.sentBy.role})</p>
                </div>
              )}

              {selectedLog.errorMessage && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
                  <p className="text-xs text-red-500 mb-1">Error</p>
                  <p className="text-sm text-red-700 dark:text-red-300">{selectedLog.errorMessage}</p>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-gray-100 dark:border-slate-700 flex justify-end">
              <button
                onClick={() => setSelectedLog(null)}
                className="px-4 py-2 bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors text-sm font-medium"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SentItems;
