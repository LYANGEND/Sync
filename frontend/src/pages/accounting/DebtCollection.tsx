import React, { useState, useEffect, useCallback } from 'react';
import {
  Users, Send, Eye, Play, Plus, RefreshCw, Settings as SettingsIcon,
  TrendingUp, AlertTriangle, CheckCircle, Clock, DollarSign,
  Mail, MessageSquare, Phone, Search,
  BarChart3, Target, UserCheck, UserX, ArrowRight, X,
  Loader2, Sparkles, PieChart
} from 'lucide-react';
import api from '../../utils/api';
import toast from 'react-hot-toast';

interface DebtorProfile {
  studentId: string;
  studentName: string;
  className: string;
  gradeLevel: string;
  parentName: string;
  parentEmail: string;
  parentPhone: string;
  amountOwed: number;
  totalDue: number;
  totalPaid: number;
  paymentRate: number;
  daysOverdue: number;
  paymentCount: number;
  lastPaymentDate: string | null;
  daysSinceLastPayment: number | null;
  segment: 'WILL_PAY' | 'NEEDS_NUDGE' | 'AT_RISK' | 'HARDSHIP';
  paymentLikelihood: number;
  escalationLevel: number;
}

interface Campaign {
  id: string;
  name: string;
  description?: string;
  status: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'COMPLETED';
  minAmountOwed?: number;
  minDaysOverdue?: number;
  targetSegments: string[];
  targetGradeLevels: string[];
  totalTargeted: number;
  totalContacted: number;
  totalResponded: number;
  amountCollected: number;
  createdAt: string;
  updatedAt: string;
  createdBy?: { firstName: string; lastName: string };
  _count?: { messages: number };
}

interface CampaignMessage {
  id: string;
  studentName: string;
  parentName: string;
  channel: string;
  escalationLevel: number;
  amountOwed: number;
  status: string;
  paidAmount?: number;
  sentAt: string;
  segment: string;
}

interface CollectionSettings {
  debtCollectionEnabled: boolean;
  escalationDay1Channel: string;
  escalationDay2Channel: string;
  escalationDay3Channel: string;
  escalationDay4Channel: string;
  escalationDay1Days: number;
  escalationDay2Days: number;
  escalationDay3Days: number;
  escalationDay4Days: number;
  debtCollectionMinAmount: number;
  aiPersonalizedMessages: boolean;
}

interface DebtCollection {
  embedded?: boolean;
}

const SEGMENT_CONFIG = {
  WILL_PAY: { label: 'Will Pay', color: 'green', icon: UserCheck, description: 'High payment likelihood' },
  NEEDS_NUDGE: { label: 'Needs Nudge', color: 'yellow', icon: Clock, description: 'Moderate — needs a reminder' },
  AT_RISK: { label: 'At Risk', color: 'orange', icon: AlertTriangle, description: 'Low payment rate' },
  HARDSHIP: { label: 'Hardship', color: 'red', icon: UserX, description: 'No payment history' },
};

const CHANNEL_ICONS: Record<string, React.ElementType> = {
  EMAIL: Mail,
  SMS: Phone,
  WHATSAPP: MessageSquare,
  ALL: Send,
};

const DebtCollection: React.FC<DebtCollection> = ({ embedded }) => {
  // State
  const [activeView, setActiveView] = useState<'overview' | 'debtors' | 'campaigns' | 'analytics' | 'settings'>('overview');
  const [debtors, setDebtors] = useState<DebtorProfile[]>([]);
  const [debtorSummary, setDebtorSummary] = useState<any>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [analytics, setAnalytics] = useState<any>(null);
  const [settings, setSettings] = useState<CollectionSettings | null>(null);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [segmentFilter, setSegmentFilter] = useState<string>('ALL');
  const [escalationFilter, setEscalationFilter] = useState<string>('ALL');

  // Modals
  const [showCreateCampaign, setShowCreateCampaign] = useState(false);
  const [showQuickSend, setShowQuickSend] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showCampaignDetail, setShowCampaignDetail] = useState<string | null>(null);
  const [campaignDetail, setCampaignDetail] = useState<any>(null);

  // Selection
  const [selectedDebtors, setSelectedDebtors] = useState<string[]>([]);

  // Quick Send state
  const [quickSendChannels, setQuickSendChannels] = useState<string[]>(['EMAIL']);
  const [quickSendSegments, setQuickSendSegments] = useState<string[]>([]);

  // Campaign creation
  const [newCampaign, setNewCampaign] = useState({ name: '', description: '', minAmountOwed: 0, minDaysOverdue: 0, targetSegments: [] as string[], targetGradeLevels: [] as string[] });

  // Preview
  const [previewStudent, setPreviewStudent] = useState<string>('');
  const [previewChannel, setPreviewChannel] = useState<string>('EMAIL');
  const [previewMessage, setPreviewMessage] = useState<string>('');
  const [previewLoading, setPreviewLoading] = useState(false);

  // Action loading
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // ---- Data Fetching ----
  const fetchDebtors = useCallback(async () => {
    try {
      const res = await api.get('/debt-collection/debtors');
      setDebtors(res.data.debtors || []);
      setDebtorSummary(res.data.summary || null);
    } catch (err: any) {
      console.error('Failed to load debtors:', err);
    }
  }, []);

  const fetchCampaigns = useCallback(async () => {
    try {
      const res = await api.get('/debt-collection/campaigns');
      setCampaigns(res.data.campaigns || []);
    } catch (err: any) {
      console.error('Failed to load campaigns:', err);
    }
  }, []);

  const fetchAnalytics = useCallback(async () => {
    try {
      const res = await api.get('/debt-collection/analytics');
      setAnalytics(res.data.analytics || null);
    } catch (err: any) {
      console.error('Failed to load analytics:', err);
    }
  }, []);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await api.get('/debt-collection/settings');
      setSettings(res.data.settings || null);
    } catch (err: any) {
      console.error('Failed to load settings:', err);
    }
  }, []);

  useEffect(() => {
    const loadAll = async () => {
      setLoading(true);
      await Promise.all([fetchDebtors(), fetchCampaigns(), fetchAnalytics(), fetchSettings()]);
      setLoading(false);
    };
    loadAll();
  }, [fetchDebtors, fetchCampaigns, fetchAnalytics, fetchSettings]);

  // ---- Actions ----
  const handleCreateCampaign = async () => {
    if (!newCampaign.name.trim()) {
      toast.error('Campaign name is required');
      return;
    }
    setActionLoading('create-campaign');
    try {
      const res = await api.post('/debt-collection/campaigns', newCampaign);
      toast.success('Campaign created!');
      setCampaigns(prev => [res.data.campaign, ...prev]);
      setShowCreateCampaign(false);
      setNewCampaign({ name: '', description: '', minAmountOwed: 0, minDaysOverdue: 0, targetSegments: [], targetGradeLevels: [] });
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to create campaign');
    } finally {
      setActionLoading(null);
    }
  };

  const handleExecuteCampaign = async (campaignId: string) => {
    setActionLoading(`execute-${campaignId}`);
    try {
      const res = await api.post(`/debt-collection/campaigns/${campaignId}/execute`);
      toast.success(`Campaign executed! ${res.data.result?.totalContacted || 0} contacted`);
      await fetchCampaigns();
      if (showCampaignDetail === campaignId) {
        await loadCampaignDetail(campaignId);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to execute campaign');
    } finally {
      setActionLoading(null);
    }
  };

  const handleQuickSend = async () => {
    const targets = selectedDebtors.length > 0 ? selectedDebtors : undefined;
    setActionLoading('quick-send');
    try {
      const res = await api.post('/debt-collection/send', {
        channels: quickSendChannels,
        segments: quickSendSegments.length > 0 ? quickSendSegments : undefined,
        studentIds: targets,
      });
      toast.success(`Sent ${res.data.result?.totalSent || 0} reminders!`);
      setShowQuickSend(false);
      setSelectedDebtors([]);
      await fetchDebtors();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to send reminders');
    } finally {
      setActionLoading(null);
    }
  };

  const handlePreviewMessage = async () => {
    if (!previewStudent) {
      toast.error('Select a student first');
      return;
    }
    setPreviewLoading(true);
    try {
      const res = await api.post('/debt-collection/preview-message', {
        studentId: previewStudent,
        channel: previewChannel,
      });
      setPreviewMessage(res.data.message || 'No preview available');
    } catch (err: any) {
      toast.error('Failed to generate preview');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleReconcile = async () => {
    setActionLoading('reconcile');
    try {
      const res = await api.post('/debt-collection/reconcile');
      toast.success(`Reconciled: ${res.data.result?.updatedCount || 0} payments matched`);
      await fetchCampaigns();
      await fetchAnalytics();
    } catch (err: any) {
      toast.error('Failed to reconcile payments');
    } finally {
      setActionLoading(null);
    }
  };

  const handleUpdateSettings = async () => {
    if (!settings) return;
    setActionLoading('settings');
    try {
      await api.put('/debt-collection/settings', settings);
      toast.success('Settings updated!');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to update settings');
    } finally {
      setActionLoading(null);
    }
  };

  const loadCampaignDetail = async (id: string) => {
    try {
      const res = await api.get(`/debt-collection/campaigns/${id}`);
      setCampaignDetail(res.data);
    } catch (err: any) {
      toast.error('Failed to load campaign details');
    }
  };

  // ---- Filtering ----
  const filteredDebtors = debtors.filter(d => {
    const matchesSearch = d.studentName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.parentName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.className.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesSegment = segmentFilter === 'ALL' || d.segment === segmentFilter;
    const matchesEscalation = escalationFilter === 'ALL' || d.escalationLevel === parseInt(escalationFilter);
    return matchesSearch && matchesSegment && matchesEscalation;
  });

  const toggleDebtorSelection = (id: string) => {
    setSelectedDebtors(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const selectAllFiltered = () => {
    if (selectedDebtors.length === filteredDebtors.length) {
      setSelectedDebtors([]);
    } else {
      setSelectedDebtors(filteredDebtors.map(d => d.studentId));
    }
  };

  // ---- Loading State ----
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-blue-600" size={32} />
        <span className="ml-3 text-slate-600 dark:text-gray-400">Loading debt collection data...</span>
      </div>
    );
  }

  // ---- Render ----
  return (
    <div className="space-y-6">
      {/* Header */}
      {!embedded && (
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Debt Collection</h1>
            <p className="text-slate-500 dark:text-gray-400">AI-powered fee recovery with multi-channel outreach</p>
          </div>
        </div>
      )}

      {/* Sub-navigation */}
      <div className="flex flex-wrap gap-2 bg-slate-100 dark:bg-slate-800/50 p-1 rounded-xl">
        {[
          { key: 'overview', label: 'Overview', icon: PieChart },
          { key: 'debtors', label: 'Debtors', icon: Users },
          { key: 'campaigns', label: 'Campaigns', icon: Target },
          { key: 'analytics', label: 'Analytics', icon: BarChart3 },
          { key: 'settings', label: 'Settings', icon: SettingsIcon },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveView(tab.key as any)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeView === tab.key
                ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm'
                : 'text-slate-500 dark:text-gray-400 hover:text-slate-700 dark:hover:text-gray-200'
            }`}
          >
            <tab.icon size={16} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* ============== OVERVIEW ============== */}
      {activeView === 'overview' && (
        <div className="space-y-6">
          {/* Quick Stats */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              title="Total Outstanding"
              value={`ZMW ${(debtorSummary?.totalOwed || 0).toLocaleString()}`}
              icon={DollarSign}
              color="red"
              subtitle={`${debtorSummary?.totalDebtors || 0} debtors`}
            />
            <StatCard
              title="Campaigns Sent"
              value={campaigns.filter(c => c.status === 'COMPLETED' || c.status === 'ACTIVE').length.toString()}
              icon={Send}
              color="blue"
              subtitle={`${campaigns.length} total campaigns`}
            />
            <StatCard
              title="Collection Rate"
              value={analytics?.collectionRate ? `${(analytics.collectionRate * 100).toFixed(1)}%` : '—'}
              icon={TrendingUp}
              color="green"
              subtitle="Of contacted debtors paid"
            />
            <StatCard
              title="Amount Recovered"
              value={`ZMW ${(analytics?.totalCollected || 0).toLocaleString()}`}
              icon={CheckCircle}
              color="emerald"
              subtitle="From collection campaigns"
            />
          </div>

          {/* Segment Breakdown */}
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
            <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-4">Debtor Segmentation</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {Object.entries(SEGMENT_CONFIG).map(([key, cfg]) => {
                const count = debtors.filter(d => d.segment === key).length;
                const amount = debtors.filter(d => d.segment === key).reduce((s, d) => s + d.amountOwed, 0);
                return (
                  <div key={key} className={`p-4 rounded-lg border-2 border-${cfg.color}-200 dark:border-${cfg.color}-800/50 bg-${cfg.color}-50 dark:bg-${cfg.color}-900/20`}>
                    <div className="flex items-center gap-2 mb-2">
                      <cfg.icon size={18} className={`text-${cfg.color}-600 dark:text-${cfg.color}-400`} />
                      <span className={`text-sm font-semibold text-${cfg.color}-700 dark:text-${cfg.color}-300`}>{cfg.label}</span>
                    </div>
                    <p className="text-2xl font-bold text-slate-800 dark:text-white">{count}</p>
                    <p className="text-sm text-slate-500 dark:text-gray-400">ZMW {amount.toLocaleString()} owed</p>
                    <p className="text-xs text-slate-400 dark:text-gray-500 mt-1">{cfg.description}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button
              onClick={() => setShowQuickSend(true)}
              className="flex items-center gap-3 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
            >
              <Send className="text-blue-600 dark:text-blue-400" size={24} />
              <div className="text-left">
                <p className="font-semibold text-slate-800 dark:text-white">Quick Send</p>
                <p className="text-sm text-slate-500 dark:text-gray-400">Send reminders to selected debtors</p>
              </div>
            </button>
            <button
              onClick={() => setShowCreateCampaign(true)}
              className="flex items-center gap-3 p-4 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-xl hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors"
            >
              <Target className="text-purple-600 dark:text-purple-400" size={24} />
              <div className="text-left">
                <p className="font-semibold text-slate-800 dark:text-white">New Campaign</p>
                <p className="text-sm text-slate-500 dark:text-gray-400">Create a targeted collection campaign</p>
              </div>
            </button>
            <button
              onClick={handleReconcile}
              disabled={actionLoading === 'reconcile'}
              className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors disabled:opacity-50"
            >
              {actionLoading === 'reconcile' ? (
                <Loader2 className="animate-spin text-green-600" size={24} />
              ) : (
                <RefreshCw className="text-green-600 dark:text-green-400" size={24} />
              )}
              <div className="text-left">
                <p className="font-semibold text-slate-800 dark:text-white">Reconcile</p>
                <p className="text-sm text-slate-500 dark:text-gray-400">Match campaign contacts to payments</p>
              </div>
            </button>
          </div>

          {/* Escalation Pipeline */}
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
            <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-4">Escalation Pipeline</h3>
            <div className="flex items-center gap-2 overflow-x-auto pb-2">
              {[1, 2, 3, 4].map(level => {
                const count = debtors.filter(d => d.escalationLevel === level).length;
                const channel = settings ? (settings as any)[`escalationDay${level}Channel`] : '—';
                const days = settings ? (settings as any)[`escalationDay${level}Days`] : '—';
                const ChannelIcon = CHANNEL_ICONS[channel] || Send;
                return (
                  <React.Fragment key={level}>
                    <div className="flex-1 min-w-[160px] p-4 rounded-lg bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-slate-500 dark:text-gray-400 uppercase">Level {level}</span>
                        <ChannelIcon size={16} className="text-slate-400" />
                      </div>
                      <p className="text-xl font-bold text-slate-800 dark:text-white">{count}</p>
                      <p className="text-xs text-slate-500 dark:text-gray-400">{channel} after {days} days</p>
                    </div>
                    {level < 4 && <ArrowRight size={20} className="text-slate-300 dark:text-slate-600 flex-shrink-0" />}
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          {/* Recent Campaigns */}
          {campaigns.length > 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-slate-800 dark:text-white">Recent Campaigns</h3>
                <button onClick={() => setActiveView('campaigns')} className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
                  View All
                </button>
              </div>
              <div className="space-y-3">
                {campaigns.slice(0, 3).map(c => (
                  <CampaignRow key={c.id} campaign={c} onExecute={handleExecuteCampaign} onView={(id) => { setShowCampaignDetail(id); loadCampaignDetail(id); }} loading={actionLoading} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ============== DEBTORS LIST ============== */}
      {activeView === 'debtors' && (
        <div className="space-y-4">
          {/* Controls */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search students, parents, classes..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-800 dark:text-white"
              />
            </div>
            <select
              value={segmentFilter}
              onChange={e => setSegmentFilter(e.target.value)}
              className="px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-800 dark:text-white"
            >
              <option value="ALL">All Segments</option>
              {Object.entries(SEGMENT_CONFIG).map(([key, cfg]) => (
                <option key={key} value={key}>{cfg.label}</option>
              ))}
            </select>
            <select
              value={escalationFilter}
              onChange={e => setEscalationFilter(e.target.value)}
              className="px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-800 dark:text-white"
            >
              <option value="ALL">All Levels</option>
              <option value="1">Level 1</option>
              <option value="2">Level 2</option>
              <option value="3">Level 3</option>
              <option value="4">Level 4</option>
            </select>
            {selectedDebtors.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-blue-600 dark:text-blue-400 font-medium">{selectedDebtors.length} selected</span>
                <button
                  onClick={() => setShowQuickSend(true)}
                  className="flex items-center gap-1 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors"
                >
                  <Send size={14} />
                  Send
                </button>
                <button
                  onClick={() => { setPreviewStudent(selectedDebtors[0]); setShowPreview(true); }}
                  className="flex items-center gap-1 px-3 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700 transition-colors"
                >
                  <Eye size={14} />
                  Preview
                </button>
              </div>
            )}
          </div>

          {/* Debtors Table */}
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 dark:bg-slate-700/50">
                  <tr>
                    <th className="px-4 py-3 text-left">
                      <input
                        type="checkbox"
                        checked={selectedDebtors.length === filteredDebtors.length && filteredDebtors.length > 0}
                        onChange={selectAllFiltered}
                        className="rounded border-slate-300 dark:border-slate-600"
                      />
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase">Student</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase">Parent</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase">Class</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase">Owed</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase">Overdue</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase">Pay Rate</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase">Segment</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase">Level</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {filteredDebtors.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-4 py-8 text-center text-slate-500 dark:text-gray-400">
                        {debtors.length === 0 ? 'No debtors found — all fees are up to date!' : 'No debtors match your filters.'}
                      </td>
                    </tr>
                  ) : (
                    filteredDebtors.map(debtor => {
                      const segCfg = SEGMENT_CONFIG[debtor.segment];
                      return (
                        <tr key={debtor.studentId} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                          <td className="px-4 py-3">
                            <input
                              type="checkbox"
                              checked={selectedDebtors.includes(debtor.studentId)}
                              onChange={() => toggleDebtorSelection(debtor.studentId)}
                              className="rounded border-slate-300 dark:border-slate-600"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <p className="text-sm font-medium text-slate-800 dark:text-white">{debtor.studentName}</p>
                          </td>
                          <td className="px-4 py-3">
                            <p className="text-sm text-slate-600 dark:text-gray-300">{debtor.parentName}</p>
                            <p className="text-xs text-slate-400 dark:text-gray-500">{debtor.parentPhone || debtor.parentEmail}</p>
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-600 dark:text-gray-300">{debtor.className}</td>
                          <td className="px-4 py-3 text-right">
                            <span className="text-sm font-semibold text-red-600 dark:text-red-400">ZMW {debtor.amountOwed.toLocaleString()}</span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`text-sm font-medium ${debtor.daysOverdue > 30 ? 'text-red-600 dark:text-red-400' : debtor.daysOverdue > 14 ? 'text-orange-600 dark:text-orange-400' : 'text-yellow-600 dark:text-yellow-400'}`}>
                              {debtor.daysOverdue}d
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="text-sm text-slate-600 dark:text-gray-300">{(debtor.paymentRate * 100).toFixed(0)}%</span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-${segCfg.color}-100 dark:bg-${segCfg.color}-900/30 text-${segCfg.color}-700 dark:text-${segCfg.color}-300`}>
                              <segCfg.icon size={12} />
                              {segCfg.label}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${
                              debtor.escalationLevel === 1 ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' :
                              debtor.escalationLevel === 2 ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300' :
                              debtor.escalationLevel === 3 ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' :
                              'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                            }`}>
                              {debtor.escalationLevel}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <button
                              onClick={() => { setPreviewStudent(debtor.studentId); setShowPreview(true); }}
                              className="p-1.5 text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 transition-colors"
                              title="Preview AI message"
                            >
                              <Sparkles size={16} />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ============== CAMPAIGNS ============== */}
      {activeView === 'campaigns' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-800 dark:text-white">Collection Campaigns</h3>
            <button
              onClick={() => setShowCreateCampaign(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors"
            >
              <Plus size={16} />
              New Campaign
            </button>
          </div>

          {campaigns.length === 0 ? (
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-12 text-center">
              <Target className="mx-auto text-slate-300 dark:text-slate-600 mb-4" size={48} />
              <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-2">No Campaigns Yet</h3>
              <p className="text-slate-500 dark:text-gray-400 mb-4">Create your first collection campaign to start reaching out to debtors.</p>
              <button
                onClick={() => setShowCreateCampaign(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus size={16} />
                Create Campaign
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {campaigns.map(c => (
                <CampaignRow
                  key={c.id}
                  campaign={c}
                  onExecute={handleExecuteCampaign}
                  onView={(id) => { setShowCampaignDetail(id); loadCampaignDetail(id); }}
                  loading={actionLoading}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ============== ANALYTICS ============== */}
      {activeView === 'analytics' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-800 dark:text-white">Collection Analytics</h3>
            <button
              onClick={handleReconcile}
              disabled={actionLoading === 'reconcile'}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 transition-colors disabled:opacity-50"
            >
              {actionLoading === 'reconcile' ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}
              Reconcile Payments
            </button>
          </div>

          {!analytics ? (
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-12 text-center">
              <BarChart3 className="mx-auto text-slate-300 dark:text-slate-600 mb-4" size={48} />
              <p className="text-slate-500 dark:text-gray-400">Run some campaigns first to see analytics here.</p>
            </div>
          ) : (
            <>
              {/* Top-level stats */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <StatCard title="Total Contacted" value={analytics.totalContacted?.toString() || '0'} icon={Send} color="blue" />
                <StatCard title="Total Responded" value={analytics.totalResponded?.toString() || '0'} icon={CheckCircle} color="green" />
                <StatCard title="Response Rate" value={`${((analytics.responseRate || 0) * 100).toFixed(1)}%`} icon={TrendingUp} color="purple" />
                <StatCard title="Amount Collected" value={`ZMW ${(analytics.totalCollected || 0).toLocaleString()}`} icon={DollarSign} color="emerald" />
              </div>

              {/* Channel Effectiveness */}
              {analytics.byChannel && analytics.byChannel.length > 0 && (
                <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
                  <h4 className="text-md font-semibold text-slate-800 dark:text-white mb-4">Channel Effectiveness</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {analytics.byChannel.map((ch: any) => {
                      const Icon = CHANNEL_ICONS[ch.channel] || Send;
                      return (
                        <div key={ch.channel} className="p-4 rounded-lg bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600">
                          <div className="flex items-center gap-2 mb-3">
                            <Icon size={18} className="text-blue-600 dark:text-blue-400" />
                            <span className="font-medium text-slate-800 dark:text-white">{ch.channel}</span>
                          </div>
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                              <span className="text-slate-500 dark:text-gray-400">Sent</span>
                              <span className="font-medium text-slate-800 dark:text-white">{ch.sent}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-500 dark:text-gray-400">Paid</span>
                              <span className="font-medium text-green-600 dark:text-green-400">{ch.paid}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-500 dark:text-gray-400">Response Rate</span>
                              <span className="font-medium text-slate-800 dark:text-white">{((ch.responseRate || 0) * 100).toFixed(1)}%</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-500 dark:text-gray-400">Collected</span>
                              <span className="font-medium text-green-600 dark:text-green-400">ZMW {(ch.collected || 0).toLocaleString()}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Segment Effectiveness */}
              {analytics.bySegment && analytics.bySegment.length > 0 && (
                <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
                  <h4 className="text-md font-semibold text-slate-800 dark:text-white mb-4">Segment Effectiveness</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-slate-50 dark:bg-slate-700/50">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase">Segment</th>
                          <th className="px-4 py-2 text-right text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase">Sent</th>
                          <th className="px-4 py-2 text-right text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase">Paid</th>
                          <th className="px-4 py-2 text-right text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase">Rate</th>
                          <th className="px-4 py-2 text-right text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase">Collected</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                        {analytics.bySegment.map((seg: any) => {
                          const segCfg = SEGMENT_CONFIG[seg.segment as keyof typeof SEGMENT_CONFIG];
                          return (
                            <tr key={seg.segment}>
                              <td className="px-4 py-2">
                                <span className={`inline-flex items-center gap-1 text-sm font-medium text-${segCfg?.color || 'slate'}-700 dark:text-${segCfg?.color || 'slate'}-300`}>
                                  {segCfg && <segCfg.icon size={14} />}
                                  {segCfg?.label || seg.segment}
                                </span>
                              </td>
                              <td className="px-4 py-2 text-right text-sm text-slate-600 dark:text-gray-300">{seg.sent}</td>
                              <td className="px-4 py-2 text-right text-sm text-green-600 dark:text-green-400">{seg.paid}</td>
                              <td className="px-4 py-2 text-right text-sm text-slate-600 dark:text-gray-300">{((seg.responseRate || 0) * 100).toFixed(1)}%</td>
                              <td className="px-4 py-2 text-right text-sm font-medium text-slate-800 dark:text-white">ZMW {(seg.collected || 0).toLocaleString()}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ============== SETTINGS ============== */}
      {activeView === 'settings' && settings && (
        <div className="max-w-3xl space-y-6">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
            <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-6">Debt Collection Settings</h3>

            {/* Enable/Disable */}
            <div className="flex items-center justify-between mb-6 pb-6 border-b border-slate-200 dark:border-slate-700">
              <div>
                <p className="font-medium text-slate-800 dark:text-white">Enable Automated Collection</p>
                <p className="text-sm text-slate-500 dark:text-gray-400">Automatically send reminders based on escalation schedule</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.debtCollectionEnabled}
                  onChange={e => setSettings({ ...settings, debtCollectionEnabled: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-slate-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:after:border-slate-500 peer-checked:bg-blue-600"></div>
              </label>
            </div>

            {/* AI Personalization */}
            <div className="flex items-center justify-between mb-6 pb-6 border-b border-slate-200 dark:border-slate-700">
              <div>
                <p className="font-medium text-slate-800 dark:text-white">AI Personalized Messages</p>
                <p className="text-sm text-slate-500 dark:text-gray-400">Use AI to craft unique messages per debtor (uses AI credits)</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.aiPersonalizedMessages}
                  onChange={e => setSettings({ ...settings, aiPersonalizedMessages: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-slate-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:after:border-slate-500 peer-checked:bg-blue-600"></div>
              </label>
            </div>

            {/* Min Amount */}
            <div className="mb-6 pb-6 border-b border-slate-200 dark:border-slate-700">
              <label className="block font-medium text-slate-800 dark:text-white mb-1">Minimum Amount to Trigger Collection</label>
              <p className="text-sm text-slate-500 dark:text-gray-400 mb-2">Debtors owing less than this amount will not be contacted</p>
              <div className="relative w-48">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">ZMW</span>
                <input
                  type="number"
                  value={settings.debtCollectionMinAmount}
                  onChange={e => setSettings({ ...settings, debtCollectionMinAmount: parseFloat(e.target.value) || 0 })}
                  className="w-full pl-14 pr-4 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-800 dark:text-white"
                />
              </div>
            </div>

            {/* Escalation Schedule */}
            <div className="mb-6">
              <h4 className="font-medium text-slate-800 dark:text-white mb-4">Escalation Schedule</h4>
              <div className="space-y-4">
                {[1, 2, 3, 4].map(level => (
                  <div key={level} className="flex items-center gap-4 p-4 rounded-lg bg-slate-50 dark:bg-slate-700/50">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                      level === 1 ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' :
                      level === 2 ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300' :
                      level === 3 ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' :
                      'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                    }`}>
                      {level}
                    </div>
                    <div className="flex-1 grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs text-slate-500 dark:text-gray-400 mb-1">Channel</label>
                        <select
                          value={(settings as any)[`escalationDay${level}Channel`]}
                          onChange={e => setSettings({ ...settings, [`escalationDay${level}Channel`]: e.target.value })}
                          className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-800 dark:text-white"
                        >
                          <option value="EMAIL">Email</option>
                          <option value="SMS">SMS</option>
                          <option value="WHATSAPP">WhatsApp</option>
                          <option value="ALL">All Channels</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-slate-500 dark:text-gray-400 mb-1">After Days Overdue</label>
                        <input
                          type="number"
                          value={(settings as any)[`escalationDay${level}Days`]}
                          onChange={e => setSettings({ ...settings, [`escalationDay${level}Days`]: parseInt(e.target.value) || 0 })}
                          className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-800 dark:text-white"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={handleUpdateSettings}
              disabled={actionLoading === 'settings'}
              className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {actionLoading === 'settings' ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle size={16} />}
              Save Settings
            </button>
          </div>
        </div>
      )}

      {/* ============== MODALS ============== */}

      {/* Create Campaign Modal */}
      {showCreateCampaign && (
        <Modal onClose={() => setShowCreateCampaign(false)} title="Create Collection Campaign">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">Campaign Name *</label>
              <input
                type="text"
                value={newCampaign.name}
                onChange={e => setNewCampaign({ ...newCampaign, name: e.target.value })}
                placeholder="e.g., Term 1 Fee Recovery"
                className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-800 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">Description</label>
              <textarea
                value={newCampaign.description}
                onChange={e => setNewCampaign({ ...newCampaign, description: e.target.value })}
                placeholder="Campaign objectives and notes..."
                rows={2}
                className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-800 dark:text-white"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">Min Amount Owed (ZMW)</label>
                <input
                  type="number"
                  value={newCampaign.minAmountOwed}
                  onChange={e => setNewCampaign({ ...newCampaign, minAmountOwed: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-800 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">Min Days Overdue</label>
                <input
                  type="number"
                  value={newCampaign.minDaysOverdue}
                  onChange={e => setNewCampaign({ ...newCampaign, minDaysOverdue: parseInt(e.target.value) || 0 })}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-800 dark:text-white"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">Target Segments</label>
              <div className="flex flex-wrap gap-2">
                {Object.entries(SEGMENT_CONFIG).map(([key, cfg]) => (
                  <button
                    key={key}
                    onClick={() => {
                      const segs = newCampaign.targetSegments.includes(key)
                        ? newCampaign.targetSegments.filter(s => s !== key)
                        : [...newCampaign.targetSegments, key];
                      setNewCampaign({ ...newCampaign, targetSegments: segs });
                    }}
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                      newCampaign.targetSegments.includes(key)
                        ? `bg-${cfg.color}-100 border-${cfg.color}-300 text-${cfg.color}-700 dark:bg-${cfg.color}-900/30 dark:border-${cfg.color}-600 dark:text-${cfg.color}-300`
                        : 'bg-slate-100 border-slate-200 text-slate-500 dark:bg-slate-700 dark:border-slate-600 dark:text-gray-400'
                    }`}
                  >
                    <cfg.icon size={12} />
                    {cfg.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-slate-400 dark:text-gray-500 mt-1">Leave empty to target all segments</p>
            </div>
            <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
              <button
                onClick={() => setShowCreateCampaign(false)}
                className="px-4 py-2 text-sm text-slate-600 dark:text-gray-400 hover:text-slate-800 dark:hover:text-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateCampaign}
                disabled={actionLoading === 'create-campaign'}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {actionLoading === 'create-campaign' ? <Loader2 className="animate-spin" size={14} /> : <Plus size={14} />}
                Create Campaign
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Quick Send Modal */}
      {showQuickSend && (
        <Modal onClose={() => setShowQuickSend(false)} title="Quick Send Reminders">
          <div className="space-y-4">
            <div>
              <p className="text-sm text-slate-600 dark:text-gray-300 mb-3">
                {selectedDebtors.length > 0
                  ? `Sending to ${selectedDebtors.length} selected debtor(s)`
                  : 'Sending to all debtors matching filters'
                }
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">Channels</label>
              <div className="flex flex-wrap gap-2">
                {(['EMAIL', 'SMS', 'WHATSAPP'] as const).map(ch => {
                  const Icon = CHANNEL_ICONS[ch];
                  return (
                    <button
                      key={ch}
                      onClick={() => {
                        const chs = quickSendChannels.includes(ch)
                          ? quickSendChannels.filter(c => c !== ch)
                          : [...quickSendChannels, ch];
                        setQuickSendChannels(chs);
                      }}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm border transition-colors ${
                        quickSendChannels.includes(ch)
                          ? 'bg-blue-50 border-blue-300 text-blue-700 dark:bg-blue-900/30 dark:border-blue-600 dark:text-blue-300'
                          : 'bg-slate-50 border-slate-200 text-slate-500 dark:bg-slate-700 dark:border-slate-600 dark:text-gray-400'
                      }`}
                    >
                      <Icon size={16} />
                      {ch}
                    </button>
                  );
                })}
              </div>
            </div>
            {selectedDebtors.length === 0 && (
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">Target Segments</label>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(SEGMENT_CONFIG).map(([key, cfg]) => (
                    <button
                      key={key}
                      onClick={() => {
                        const segs = quickSendSegments.includes(key)
                          ? quickSendSegments.filter(s => s !== key)
                          : [...quickSendSegments, key];
                        setQuickSendSegments(segs);
                      }}
                      className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                        quickSendSegments.includes(key)
                          ? `bg-${cfg.color}-100 border-${cfg.color}-300 text-${cfg.color}-700 dark:bg-${cfg.color}-900/30 dark:border-${cfg.color}-600 dark:text-${cfg.color}-300`
                          : 'bg-slate-100 border-slate-200 text-slate-500 dark:bg-slate-700 dark:border-slate-600 dark:text-gray-400'
                      }`}
                    >
                      <cfg.icon size={12} />
                      {cfg.label}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-slate-400 dark:text-gray-500 mt-1">Leave empty to target all</p>
              </div>
            )}
            <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
              <button
                onClick={() => setShowQuickSend(false)}
                className="px-4 py-2 text-sm text-slate-600 dark:text-gray-400"
              >
                Cancel
              </button>
              <button
                onClick={handleQuickSend}
                disabled={actionLoading === 'quick-send' || quickSendChannels.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {actionLoading === 'quick-send' ? <Loader2 className="animate-spin" size={14} /> : <Send size={14} />}
                Send Reminders
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Preview Message Modal */}
      {showPreview && (
        <Modal onClose={() => { setShowPreview(false); setPreviewMessage(''); }} title="AI Message Preview">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">Student</label>
                <select
                  value={previewStudent}
                  onChange={e => setPreviewStudent(e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-800 dark:text-white"
                >
                  <option value="">Select student...</option>
                  {debtors.map(d => (
                    <option key={d.studentId} value={d.studentId}>{d.studentName} — ZMW {d.amountOwed.toLocaleString()}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">Channel</label>
                <select
                  value={previewChannel}
                  onChange={e => setPreviewChannel(e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-800 dark:text-white"
                >
                  <option value="EMAIL">Email</option>
                  <option value="SMS">SMS</option>
                  <option value="WHATSAPP">WhatsApp</option>
                </select>
              </div>
            </div>
            <button
              onClick={handlePreviewMessage}
              disabled={previewLoading || !previewStudent}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700 transition-colors disabled:opacity-50"
            >
              {previewLoading ? <Loader2 className="animate-spin" size={14} /> : <Sparkles size={14} />}
              Generate AI Preview
            </button>
            {previewMessage && (
              <div className="p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg border border-slate-200 dark:border-slate-600">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles size={14} className="text-purple-500" />
                  <span className="text-xs font-medium text-purple-600 dark:text-purple-400 uppercase">AI Generated Preview</span>
                </div>
                {previewChannel === 'EMAIL' ? (
                  <div className="prose prose-sm dark:prose-invert max-w-none text-sm" dangerouslySetInnerHTML={{ __html: previewMessage }} />
                ) : (
                  <p className="text-sm text-slate-700 dark:text-gray-300 whitespace-pre-wrap">{previewMessage}</p>
                )}
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Campaign Detail Modal */}
      {showCampaignDetail && campaignDetail && (
        <Modal onClose={() => { setShowCampaignDetail(null); setCampaignDetail(null); }} title={`Campaign: ${campaignDetail.campaign?.name || ''}`} wide>
          <div className="space-y-4">
            {/* Campaign Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <MiniStat label="Targeted" value={campaignDetail.campaign?.totalTargeted || 0} />
              <MiniStat label="Contacted" value={campaignDetail.campaign?.totalContacted || 0} />
              <MiniStat label="Responded" value={campaignDetail.campaign?.totalResponded || 0} />
              <MiniStat label="Collected" value={`ZMW ${(campaignDetail.campaign?.amountCollected || 0).toLocaleString()}`} />
            </div>

            {/* Messages */}
            {campaignDetail.messages && campaignDetail.messages.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50 dark:bg-slate-700/50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 dark:text-gray-400">Student</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 dark:text-gray-400">Parent</th>
                      <th className="px-3 py-2 text-center text-xs font-semibold text-slate-500 dark:text-gray-400">Channel</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-slate-500 dark:text-gray-400">Owed</th>
                      <th className="px-3 py-2 text-center text-xs font-semibold text-slate-500 dark:text-gray-400">Status</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-slate-500 dark:text-gray-400">Paid</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 dark:text-gray-400">Sent At</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {campaignDetail.messages.map((msg: CampaignMessage) => (
                      <tr key={msg.id} className="text-sm">
                        <td className="px-3 py-2 text-slate-800 dark:text-white">{msg.studentName}</td>
                        <td className="px-3 py-2 text-slate-600 dark:text-gray-300">{msg.parentName}</td>
                        <td className="px-3 py-2 text-center">
                          <span className="inline-flex items-center gap-1 text-xs text-slate-600 dark:text-gray-300">
                            {React.createElement(CHANNEL_ICONS[msg.channel] || Send, { size: 12 })}
                            {msg.channel}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right text-slate-600 dark:text-gray-300">ZMW {msg.amountOwed?.toLocaleString()}</td>
                        <td className="px-3 py-2 text-center">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                            msg.status === 'PAID' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' :
                            msg.status === 'SENT' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' :
                            msg.status === 'FAILED' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' :
                            'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-gray-300'
                          }`}>
                            {msg.status}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right text-green-600 dark:text-green-400">{msg.paidAmount ? `ZMW ${msg.paidAmount.toLocaleString()}` : '—'}</td>
                        <td className="px-3 py-2 text-slate-500 dark:text-gray-400">{new Date(msg.sentAt).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Execute button if DRAFT */}
            {campaignDetail.campaign?.status === 'DRAFT' && (
              <div className="flex justify-end pt-4 border-t border-slate-200 dark:border-slate-700">
                <button
                  onClick={() => handleExecuteCampaign(campaignDetail.campaign.id)}
                  disabled={actionLoading === `execute-${campaignDetail.campaign.id}`}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 transition-colors disabled:opacity-50"
                >
                  {actionLoading === `execute-${campaignDetail.campaign.id}` ? <Loader2 className="animate-spin" size={14} /> : <Play size={14} />}
                  Execute Campaign
                </button>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
};

// ---- Sub-components ----

const StatCard: React.FC<{ title: string; value: string; icon: React.ElementType; color: string; subtitle?: string }> = ({ title, value, icon: Icon, color, subtitle }) => (
  <div className="bg-white dark:bg-slate-800 p-5 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
    <div className="flex items-center justify-between mb-3">
      <div className={`p-2.5 rounded-lg bg-${color}-100 dark:bg-${color}-900/30 text-${color}-600 dark:text-${color}-400`}>
        <Icon size={20} />
      </div>
    </div>
    <p className="text-2xl font-bold text-slate-800 dark:text-white">{value}</p>
    <p className="text-sm text-slate-500 dark:text-gray-400 mt-1">{title}</p>
    {subtitle && <p className="text-xs text-slate-400 dark:text-gray-500">{subtitle}</p>}
  </div>
);

const MiniStat: React.FC<{ label: string; value: string | number }> = ({ label, value }) => (
  <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 text-center">
    <p className="text-lg font-bold text-slate-800 dark:text-white">{value}</p>
    <p className="text-xs text-slate-500 dark:text-gray-400">{label}</p>
  </div>
);

const CampaignRow: React.FC<{
  campaign: Campaign;
  onExecute: (id: string) => void;
  onView: (id: string) => void;
  loading: string | null;
}> = ({ campaign, onExecute, onView, loading }) => {
  const statusColors: Record<string, string> = {
    DRAFT: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-gray-300',
    ACTIVE: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    PAUSED: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
    COMPLETED: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-4 flex items-center justify-between">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <h4 className="text-sm font-semibold text-slate-800 dark:text-white truncate">{campaign.name}</h4>
          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[campaign.status] || statusColors.DRAFT}`}>
            {campaign.status}
          </span>
        </div>
        <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-gray-400">
          <span>Targeted: {campaign.totalTargeted}</span>
          <span>Contacted: {campaign.totalContacted}</span>
          <span>Responded: {campaign.totalResponded}</span>
          {campaign.amountCollected > 0 && (
            <span className="text-green-600 dark:text-green-400 font-medium">ZMW {campaign.amountCollected.toLocaleString()}</span>
          )}
          <span>{new Date(campaign.createdAt).toLocaleDateString()}</span>
        </div>
      </div>
      <div className="flex items-center gap-2 ml-4">
        <button
          onClick={() => onView(campaign.id)}
          className="p-2 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
          title="View details"
        >
          <Eye size={16} />
        </button>
        {campaign.status === 'DRAFT' && (
          <button
            onClick={() => onExecute(campaign.id)}
            disabled={loading === `execute-${campaign.id}`}
            className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs hover:bg-green-700 transition-colors disabled:opacity-50"
            title="Execute campaign"
          >
            {loading === `execute-${campaign.id}` ? <Loader2 className="animate-spin" size={12} /> : <Play size={12} />}
            Execute
          </button>
        )}
      </div>
    </div>
  );
};

const Modal: React.FC<{ onClose: () => void; title: string; children: React.ReactNode; wide?: boolean }> = ({ onClose, title, children, wide }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
    <div className={`bg-white dark:bg-slate-800 rounded-2xl shadow-2xl ${wide ? 'max-w-4xl' : 'max-w-lg'} w-full max-h-[85vh] overflow-y-auto`}>
      <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-700">
        <h3 className="text-lg font-semibold text-slate-800 dark:text-white">{title}</h3>
        <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-gray-200 transition-colors">
          <X size={20} />
        </button>
      </div>
      <div className="p-5">
        {children}
      </div>
    </div>
  </div>
);

export default DebtCollection;
