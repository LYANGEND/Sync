import React, { useState, useEffect, useCallback } from 'react';
import DOMPurify from 'dompurify';
import {
  Users, Send, Eye, Play, Plus, RefreshCw, Settings as SettingsIcon,
  TrendingUp, AlertTriangle, CheckCircle, Clock, DollarSign,
  Mail, MessageSquare, Phone, Search,
  BarChart3, Target, UserCheck, UserX, ArrowRight, X,
  Loader2, Sparkles, PieChart
} from 'lucide-react';
import api from '../../utils/api';
import toast from 'react-hot-toast';
import { PageHeader, Tabs, TabPanel } from '../../components/ui/DesignSystem';

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
  const tabsId = React.useId();
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
      <div className="ds-page flex items-center justify-center py-20" role="status">
        <Loader2 className="animate-spin text-[var(--primary-color)]" size={32} aria-hidden="true" />
        <span className="ml-3 text-[var(--text-secondary)]">Loading debt collection data...</span>
      </div>
    );
  }

  // ---- Render ----
  return (
    <div className="ds-page">
      {/* Header */}
      {!embedded && (
        <PageHeader title="Debt Collection" description="AI-powered fee recovery with multi-channel outreach" />
      )}

      {/* Sub-navigation */}
      <Tabs
        id={tabsId}
        label="Debt collection views"
        value={activeView}
        onChange={value => setActiveView(value as typeof activeView)}
        items={[
          { key: 'overview', label: 'Overview', icon: PieChart },
          { key: 'debtors', label: 'Debtors', icon: Users },
          { key: 'campaigns', label: 'Campaigns', icon: Target },
          { key: 'analytics', label: 'Analytics', icon: BarChart3 },
          { key: 'settings', label: 'Settings', icon: SettingsIcon },
        ].map(tab => ({
          id: tab.key,
          label: <span className="flex items-center gap-2"><tab.icon size={16} aria-hidden="true" />{tab.label}</span>,
        }))}
      />

      {/* ============== OVERVIEW ============== */}
      <div hidden={activeView !== 'overview'}>
      <TabPanel id={tabsId} value="overview">
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
          <div className="ds-card">
            <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Debtor Segmentation</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {Object.entries(SEGMENT_CONFIG).map(([key, cfg]) => {
                const count = debtors.filter(d => d.segment === key).length;
                const amount = debtors.filter(d => d.segment === key).reduce((s, d) => s + d.amountOwed, 0);
                return (
                  <div key={key} className="ds-surface-muted p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <cfg.icon size={18} className={`text-${cfg.color}-600 dark:text-${cfg.color}-400`} />
                      <span className={`text-sm font-semibold text-${cfg.color}-700 dark:text-${cfg.color}-300`}>{cfg.label}</span>
                    </div>
                    <p className="text-2xl font-bold text-[var(--text-primary)]">{count}</p>
                    <p className="text-sm text-[var(--text-secondary)]">ZMW {amount.toLocaleString()} owed</p>
                    <p className="text-xs text-[var(--text-secondary)] mt-1">{cfg.description}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button
              onClick={() => setShowQuickSend(true)}
              className="ds-button-outline justify-start gap-3 p-4"
            >
              <Send className="shrink-0 text-[var(--text-secondary)]" size={24} aria-hidden="true" />
              <div className="text-left">
                <p className="font-semibold text-[var(--text-primary)]">Quick Send</p>
                <p className="text-sm font-normal text-[var(--text-secondary)]">Send reminders to selected debtors</p>
              </div>
            </button>
            <button
              onClick={() => setShowCreateCampaign(true)}
              className="ds-button-outline justify-start gap-3 p-4"
            >
              <Target className="shrink-0 text-[var(--text-secondary)]" size={24} aria-hidden="true" />
              <div className="text-left">
                <p className="font-semibold text-[var(--text-primary)]">New Campaign</p>
                <p className="text-sm font-normal text-[var(--text-secondary)]">Create a targeted collection campaign</p>
              </div>
            </button>
            <button
              onClick={handleReconcile}
              disabled={actionLoading === 'reconcile'}
              className="ds-button-outline justify-start gap-3 p-4"
            >
              {actionLoading === 'reconcile' ? (
                <Loader2 className="animate-spin shrink-0 text-[var(--text-secondary)]" size={24} aria-hidden="true" />
              ) : (
                <RefreshCw className="shrink-0 text-[var(--text-secondary)]" size={24} aria-hidden="true" />
              )}
              <div className="text-left">
                <p className="font-semibold text-[var(--text-primary)]">Reconcile</p>
                <p className="text-sm font-normal text-[var(--text-secondary)]">Match campaign contacts to payments</p>
              </div>
            </button>
          </div>

          {/* Escalation Pipeline */}
          <div className="ds-card">
            <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Escalation Pipeline</h3>
            <div className="flex items-center gap-2 overflow-x-auto pb-2" role="region" aria-label="Escalation pipeline" tabIndex={0}>
              {[1, 2, 3, 4].map(level => {
                const count = debtors.filter(d => d.escalationLevel === level).length;
                const channel = settings ? (settings as any)[`escalationDay${level}Channel`] : '—';
                const days = settings ? (settings as any)[`escalationDay${level}Days`] : '—';
                const ChannelIcon = CHANNEL_ICONS[channel] || Send;
                return (
                  <React.Fragment key={level}>
                    <div className="ds-surface-muted flex-1 min-w-[160px] p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-[var(--text-secondary)] uppercase">Level {level}</span>
                        <ChannelIcon size={16} className="text-[var(--text-secondary)]" aria-hidden="true" />
                      </div>
                      <p className="text-xl font-bold text-[var(--text-primary)]">{count}</p>
                      <p className="text-xs text-[var(--text-secondary)]">{channel} after {days} days</p>
                    </div>
                    {level < 4 && <ArrowRight size={20} className="text-[var(--text-secondary)] flex-shrink-0" aria-hidden="true" />}
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          {/* Recent Campaigns */}
          {campaigns.length > 0 && (
            <div className="ds-card">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <h3 className="text-lg font-semibold text-[var(--text-primary)]">Recent Campaigns</h3>
                <button onClick={() => setActiveView('campaigns')} className="ds-button-ghost">
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
      </TabPanel>
      </div>
      <div hidden={activeView !== 'debtors'}>
      <TabPanel id={tabsId} value="debtors">
      {activeView === 'debtors' && (
        <div className="space-y-4">
          {/* Controls */}
          <div className="ds-toolbar">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" aria-hidden="true" />
              <input
                type="text"
                aria-label="Search students, parents, or classes"
                placeholder="Search students, parents, classes..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="ds-input pl-10"
              />
            </div>
            <select
              value={segmentFilter}
              onChange={e => setSegmentFilter(e.target.value)}
              aria-label="Filter by debtor segment"
              className="ds-select sm:w-auto"
            >
              <option value="ALL">All Segments</option>
              {Object.entries(SEGMENT_CONFIG).map(([key, cfg]) => (
                <option key={key} value={key}>{cfg.label}</option>
              ))}
            </select>
            <select
              value={escalationFilter}
              onChange={e => setEscalationFilter(e.target.value)}
              aria-label="Filter by escalation level"
              className="ds-select sm:w-auto"
            >
              <option value="ALL">All Levels</option>
              <option value="1">Level 1</option>
              <option value="2">Level 2</option>
              <option value="3">Level 3</option>
              <option value="4">Level 4</option>
            </select>
            {selectedDebtors.length > 0 && (
              <div className="ds-actions">
                <span className="text-sm text-[var(--text-secondary)] font-medium">{selectedDebtors.length} selected</span>
                <button
                  onClick={() => setShowQuickSend(true)}
                  className="ds-button-primary"
                >
                  <Send size={14} />
                  Send
                </button>
                <button
                  onClick={() => { setPreviewStudent(selectedDebtors[0]); setShowPreview(true); }}
                  className="ds-button-secondary"
                >
                  <Eye size={14} />
                  Preview
                </button>
              </div>
            )}
          </div>

          {/* Debtors Table */}
          <div className="ds-surface overflow-hidden">
            <div className="overflow-x-auto" role="region" aria-label="Debtors" tabIndex={0}>
              <table className="ds-table">
                <thead>
                  <tr>
                    <th className="px-4 py-3 text-left">
                      <label className="inline-flex min-h-11 min-w-11 items-center justify-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedDebtors.length === filteredDebtors.length && filteredDebtors.length > 0}
                        onChange={selectAllFiltered}
                        className="ds-choice"
                      />
                        <span className="sr-only">Select all filtered debtors</span>
                      </label>
                    </th>
                    <th className="text-left uppercase">Student</th>
                    <th className="text-left uppercase">Parent</th>
                    <th className="text-left uppercase">Class</th>
                    <th className="text-right uppercase">Owed</th>
                    <th className="text-center uppercase">Overdue</th>
                    <th className="text-center uppercase">Pay Rate</th>
                    <th className="text-center uppercase">Segment</th>
                    <th className="text-center uppercase">Level</th>
                    <th className="text-center uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDebtors.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-4 py-8 text-center text-[var(--text-secondary)]">
                        {debtors.length === 0 ? 'No debtors found — all fees are up to date!' : 'No debtors match your filters.'}
                      </td>
                    </tr>
                  ) : (
                    filteredDebtors.map(debtor => {
                      const segCfg = SEGMENT_CONFIG[debtor.segment];
                      return (
                        <tr key={debtor.studentId} className="transition-colors">
                          <td className="px-4 py-3">
                            <label className="inline-flex min-h-11 min-w-11 items-center justify-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={selectedDebtors.includes(debtor.studentId)}
                              onChange={() => toggleDebtorSelection(debtor.studentId)}
                              className="ds-choice"
                            />
                              <span className="sr-only">Select {debtor.studentName}</span>
                            </label>
                          </td>
                          <td className="px-4 py-3">
                            <p className="text-sm font-medium text-[var(--text-primary)]">{debtor.studentName}</p>
                          </td>
                          <td className="px-4 py-3">
                            <p className="text-sm text-[var(--text-secondary)]">{debtor.parentName}</p>
                            <p className="text-xs text-[var(--text-secondary)]">{debtor.parentPhone || debtor.parentEmail}</p>
                          </td>
                          <td className="px-4 py-3 text-sm text-[var(--text-secondary)]">{debtor.className}</td>
                          <td className="px-4 py-3 text-right">
                            <span className="text-sm font-semibold text-red-600 dark:text-red-400">ZMW {debtor.amountOwed.toLocaleString()}</span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`text-sm font-medium ${debtor.daysOverdue > 30 ? 'text-red-600 dark:text-red-400' : debtor.daysOverdue > 14 ? 'text-orange-600 dark:text-orange-400' : 'text-yellow-600 dark:text-yellow-400'}`}>
                              {debtor.daysOverdue}d
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="text-sm text-[var(--text-secondary)]">{(debtor.paymentRate * 100).toFixed(0)}%</span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`ds-badge border-transparent bg-${segCfg.color}-100 dark:bg-${segCfg.color}-900/30 text-${segCfg.color}-700 dark:text-${segCfg.color}-300`}>
                              <segCfg.icon size={12} />
                              {segCfg.label}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`ds-badge border-transparent justify-center font-bold ${
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
                              className="ds-button-ghost"
                              aria-label={`Preview AI message for ${debtor.studentName}`}
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
      </TabPanel>
      </div>
      <div hidden={activeView !== 'campaigns'}>
      <TabPanel id={tabsId} value="campaigns">
      {activeView === 'campaigns' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-lg font-semibold text-[var(--text-primary)]">Collection Campaigns</h3>
            <button
              onClick={() => setShowCreateCampaign(true)}
              className="ds-button-primary"
            >
              <Plus size={16} />
              New Campaign
            </button>
          </div>

          {campaigns.length === 0 ? (
            <div className="ds-card text-center">
              <Target className="mx-auto text-[var(--text-secondary)] mb-4" size={48} aria-hidden="true" />
              <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2">No Campaigns Yet</h3>
              <p className="text-[var(--text-secondary)] mb-4">Create your first collection campaign to start reaching out to debtors.</p>
              <button
                onClick={() => setShowCreateCampaign(true)}
                className="ds-button-primary"
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
      </TabPanel>
      </div>
      <div hidden={activeView !== 'analytics'}>
      <TabPanel id={tabsId} value="analytics">
      {activeView === 'analytics' && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-lg font-semibold text-[var(--text-primary)]">Collection Analytics</h3>
            <button
              onClick={handleReconcile}
              disabled={actionLoading === 'reconcile'}
              className="ds-button-primary"
            >
              {actionLoading === 'reconcile' ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}
              Reconcile Payments
            </button>
          </div>

          {!analytics ? (
            <div className="ds-card text-center">
              <BarChart3 className="mx-auto text-[var(--text-secondary)] mb-4" size={48} aria-hidden="true" />
              <p className="text-[var(--text-secondary)]">Run some campaigns first to see analytics here.</p>
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
                <div className="ds-card">
                  <h4 className="text-base font-semibold text-[var(--text-primary)] mb-4">Channel Effectiveness</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {analytics.byChannel.map((ch: any) => {
                      const Icon = CHANNEL_ICONS[ch.channel] || Send;
                      return (
                        <div key={ch.channel} className="ds-surface-muted p-4">
                          <div className="flex items-center gap-2 mb-3">
                            <Icon size={18} className="text-[var(--text-secondary)]" aria-hidden="true" />
                            <span className="font-medium text-[var(--text-primary)]">{ch.channel}</span>
                          </div>
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                              <span className="text-[var(--text-secondary)]">Sent</span>
                              <span className="font-medium text-[var(--text-primary)]">{ch.sent}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-[var(--text-secondary)]">Paid</span>
                              <span className="font-medium text-green-600 dark:text-green-400">{ch.paid}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-[var(--text-secondary)]">Response Rate</span>
                              <span className="font-medium text-[var(--text-primary)]">{((ch.responseRate || 0) * 100).toFixed(1)}%</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-[var(--text-secondary)]">Collected</span>
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
                <div className="ds-card">
                  <h4 className="text-base font-semibold text-[var(--text-primary)] mb-4">Segment Effectiveness</h4>
                  <div className="overflow-x-auto" role="region" aria-label="Segment effectiveness" tabIndex={0}>
                    <table className="ds-table">
                      <thead>
                        <tr>
                          <th className="text-left uppercase">Segment</th>
                          <th className="text-right uppercase">Sent</th>
                          <th className="text-right uppercase">Paid</th>
                          <th className="text-right uppercase">Rate</th>
                          <th className="text-right uppercase">Collected</th>
                        </tr>
                      </thead>
                      <tbody>
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
                              <td className="px-4 py-2 text-right text-sm text-[var(--text-secondary)]">{seg.sent}</td>
                              <td className="px-4 py-2 text-right text-sm text-green-600 dark:text-green-400">{seg.paid}</td>
                              <td className="px-4 py-2 text-right text-sm text-[var(--text-secondary)]">{((seg.responseRate || 0) * 100).toFixed(1)}%</td>
                              <td className="px-4 py-2 text-right text-sm font-medium text-[var(--text-primary)]">ZMW {(seg.collected || 0).toLocaleString()}</td>
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
      </TabPanel>
      </div>
      <div hidden={activeView !== 'settings'}>
      <TabPanel id={tabsId} value="settings">
      {activeView === 'settings' && settings && (
        <div className="max-w-3xl space-y-6">
          <div className="ds-card">
            <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-6">Debt Collection Settings</h3>

            {/* Enable/Disable */}
            <div className="mb-6 pb-6 border-b border-[var(--border-color)]">
              <label className="flex min-h-11 items-center justify-between gap-4 cursor-pointer">
                <span>
                  <span className="block font-medium text-[var(--text-primary)]">Enable Automated Collection</span>
                  <span className="block text-sm text-[var(--text-secondary)]">Automatically send reminders based on escalation schedule</span>
                </span>
                <input
                  type="checkbox"
                  checked={settings.debtCollectionEnabled}
                  onChange={e => setSettings({ ...settings, debtCollectionEnabled: e.target.checked })}
                  aria-label="Enable Automated Collection"
                  className="ds-choice"
                />
              </label>
            </div>

            {/* AI Personalization */}
            <div className="mb-6 pb-6 border-b border-[var(--border-color)]">
              <label className="flex min-h-11 items-center justify-between gap-4 cursor-pointer">
                <span>
                  <span className="block font-medium text-[var(--text-primary)]">AI Personalized Messages</span>
                  <span className="block text-sm text-[var(--text-secondary)]">Use AI to craft unique messages per debtor (uses AI credits)</span>
                </span>
                <input
                  type="checkbox"
                  checked={settings.aiPersonalizedMessages}
                  onChange={e => setSettings({ ...settings, aiPersonalizedMessages: e.target.checked })}
                  aria-label="AI Personalized Messages"
                  className="ds-choice"
                />
              </label>
            </div>

            {/* Min Amount */}
            <div className="mb-6 pb-6 border-b border-[var(--border-color)]">
              <label htmlFor={`${tabsId}-min-collection`} className="ds-label mb-1">Minimum Amount to Trigger Collection</label>
              <p id={`${tabsId}-min-collection-hint`} className="ds-helper mb-2">Debtors owing less than this amount will not be contacted</p>
              <div className="relative w-48 max-w-full">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] text-sm">ZMW</span>
                <input
                  type="number"
                  id={`${tabsId}-min-collection`}
                  aria-describedby={`${tabsId}-min-collection-hint`}
                  value={settings.debtCollectionMinAmount}
                  onChange={e => setSettings({ ...settings, debtCollectionMinAmount: parseFloat(e.target.value) || 0 })}
                  className="ds-input pl-14"
                />
              </div>
            </div>

            {/* Escalation Schedule */}
            <div className="mb-6">
              <h4 className="font-medium text-[var(--text-primary)] mb-4">Escalation Schedule</h4>
              <div className="space-y-4">
                {[1, 2, 3, 4].map(level => (
                  <div key={level} className="ds-surface-muted flex flex-wrap items-center gap-4 p-4">
                    <div className={`ds-badge border-transparent justify-center text-sm font-bold ${
                      level === 1 ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' :
                      level === 2 ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300' :
                      level === 3 ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' :
                      'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                    }`}>
                      {level}
                    </div>
                    <div className="min-w-0 flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label htmlFor={`${tabsId}-level-${level}-channel`} className="ds-label mb-1">Channel</label>
                        <select
                          id={`${tabsId}-level-${level}-channel`}
                          aria-label={`Level ${level} channel`}
                          value={(settings as any)[`escalationDay${level}Channel`]}
                          onChange={e => setSettings({ ...settings, [`escalationDay${level}Channel`]: e.target.value })}
                          className="ds-select"
                        >
                          <option value="EMAIL">Email</option>
                          <option value="SMS">SMS</option>
                          <option value="WHATSAPP">WhatsApp</option>
                          <option value="ALL">All Channels</option>
                        </select>
                      </div>
                      <div>
                        <label htmlFor={`${tabsId}-level-${level}-days`} className="ds-label mb-1">After Days Overdue</label>
                        <input
                          type="number"
                          id={`${tabsId}-level-${level}-days`}
                          aria-label={`Level ${level} after days overdue`}
                          value={(settings as any)[`escalationDay${level}Days`]}
                          onChange={e => setSettings({ ...settings, [`escalationDay${level}Days`]: parseInt(e.target.value) || 0 })}
                          className="ds-input"
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
              className="ds-button-primary"
            >
              {actionLoading === 'settings' ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle size={16} />}
              Save Settings
            </button>
          </div>
        </div>
      )}

      </TabPanel>
      </div>
      {/* ============== MODALS ============== */}

      {/* Create Campaign Modal */}
      {showCreateCampaign && (
        <Modal onClose={() => setShowCreateCampaign(false)} title="Create Collection Campaign">
          <div className="space-y-4">
            <div>
              <label htmlFor={`${tabsId}-campaign-name`} className="ds-label mb-1">Campaign Name *</label>
              <input
                type="text"
                id={`${tabsId}-campaign-name`}
                value={newCampaign.name}
                onChange={e => setNewCampaign({ ...newCampaign, name: e.target.value })}
                placeholder="e.g., Term 1 Fee Recovery"
                className="ds-input"
              />
            </div>
            <div>
              <label htmlFor={`${tabsId}-campaign-description`} className="ds-label mb-1">Description</label>
              <textarea
                id={`${tabsId}-campaign-description`}
                value={newCampaign.description}
                onChange={e => setNewCampaign({ ...newCampaign, description: e.target.value })}
                placeholder="Campaign objectives and notes..."
                rows={2}
                className="ds-textarea"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor={`${tabsId}-campaign-min-owed`} className="ds-label mb-1">Min Amount Owed (ZMW)</label>
                <input
                  type="number"
                  id={`${tabsId}-campaign-min-owed`}
                  value={newCampaign.minAmountOwed}
                  onChange={e => setNewCampaign({ ...newCampaign, minAmountOwed: parseFloat(e.target.value) || 0 })}
                  className="ds-input"
                />
              </div>
              <div>
                <label htmlFor={`${tabsId}-campaign-min-days`} className="ds-label mb-1">Min Days Overdue</label>
                <input
                  type="number"
                  id={`${tabsId}-campaign-min-days`}
                  value={newCampaign.minDaysOverdue}
                  onChange={e => setNewCampaign({ ...newCampaign, minDaysOverdue: parseInt(e.target.value) || 0 })}
                  className="ds-input"
                />
              </div>
            </div>
            <div>
              <p id={`${tabsId}-campaign-segments`} className="ds-label mb-1">Target Segments</p>
              <div className="ds-actions" role="group" aria-labelledby={`${tabsId}-campaign-segments`}>
                {Object.entries(SEGMENT_CONFIG).map(([key, cfg]) => (
                  <button
                    key={key}
                    onClick={() => {
                      const segs = newCampaign.targetSegments.includes(key)
                        ? newCampaign.targetSegments.filter(s => s !== key)
                        : [...newCampaign.targetSegments, key];
                      setNewCampaign({ ...newCampaign, targetSegments: segs });
                    }}
                    aria-pressed={newCampaign.targetSegments.includes(key)}
                    className={
                      newCampaign.targetSegments.includes(key)
                        ? 'ds-button-primary'
                        : 'ds-button-outline'
                    }
                  >
                    <cfg.icon size={12} />
                    {cfg.label}
                  </button>
                ))}
              </div>
              <p className="ds-helper mt-1">Leave empty to target all segments</p>
            </div>
            <div className="ds-form-actions border-t border-[var(--border-color)]">
              <button
                onClick={() => setShowCreateCampaign(false)}
                className="ds-button-ghost"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateCampaign}
                disabled={actionLoading === 'create-campaign'}
                className="ds-button-primary"
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
              <p className="text-sm text-[var(--text-secondary)] mb-3">
                {selectedDebtors.length > 0
                  ? `Sending to ${selectedDebtors.length} selected debtor(s)`
                  : 'Sending to all debtors matching filters'
                }
              </p>
            </div>
            <div>
              <p id={`${tabsId}-send-channels`} className="ds-label mb-2">Channels</p>
              <div className="ds-actions" role="group" aria-labelledby={`${tabsId}-send-channels`}>
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
                      aria-pressed={quickSendChannels.includes(ch)}
                      className={
                        quickSendChannels.includes(ch)
                          ? 'ds-button-primary'
                          : 'ds-button-outline'
                      }
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
                <p id={`${tabsId}-send-segments`} className="ds-label mb-2">Target Segments</p>
                <div className="ds-actions" role="group" aria-labelledby={`${tabsId}-send-segments`}>
                  {Object.entries(SEGMENT_CONFIG).map(([key, cfg]) => (
                    <button
                      key={key}
                      onClick={() => {
                        const segs = quickSendSegments.includes(key)
                          ? quickSendSegments.filter(s => s !== key)
                          : [...quickSendSegments, key];
                        setQuickSendSegments(segs);
                      }}
                      aria-pressed={quickSendSegments.includes(key)}
                      className={
                        quickSendSegments.includes(key)
                          ? 'ds-button-primary'
                          : 'ds-button-outline'
                      }
                    >
                      <cfg.icon size={12} />
                      {cfg.label}
                    </button>
                  ))}
                </div>
                <p className="ds-helper mt-1">Leave empty to target all</p>
              </div>
            )}
            <div className="ds-form-actions border-t border-[var(--border-color)]">
              <button
                onClick={() => setShowQuickSend(false)}
                className="ds-button-ghost"
              >
                Cancel
              </button>
              <button
                onClick={handleQuickSend}
                disabled={actionLoading === 'quick-send' || quickSendChannels.length === 0}
                className="ds-button-primary"
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor={`${tabsId}-preview-student`} className="ds-label mb-1">Student</label>
                <select
                  id={`${tabsId}-preview-student`}
                  value={previewStudent}
                  onChange={e => setPreviewStudent(e.target.value)}
                  className="ds-select"
                >
                  <option value="">Select student...</option>
                  {debtors.map(d => (
                    <option key={d.studentId} value={d.studentId}>{d.studentName} — ZMW {d.amountOwed.toLocaleString()}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor={`${tabsId}-preview-channel`} className="ds-label mb-1">Channel</label>
                <select
                  id={`${tabsId}-preview-channel`}
                  value={previewChannel}
                  onChange={e => setPreviewChannel(e.target.value)}
                  className="ds-select"
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
              className="ds-button-primary"
            >
              {previewLoading ? <Loader2 className="animate-spin" size={14} /> : <Sparkles size={14} />}
              Generate AI Preview
            </button>
            {previewMessage && (
              <div className="ds-surface-muted p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles size={14} className="text-[var(--text-secondary)]" aria-hidden="true" />
                  <span className="text-xs font-medium text-[var(--text-secondary)] uppercase">AI Generated Preview</span>
                </div>
                {previewChannel === 'EMAIL' ? (
                  <div className="prose prose-sm dark:prose-invert max-w-none text-sm" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(previewMessage) }} />
                ) : (
                  <p className="text-sm text-[var(--text-primary)] whitespace-pre-wrap">{previewMessage}</p>
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
              <div className="overflow-x-auto" role="region" aria-label="Campaign messages" tabIndex={0}>
                <table className="ds-table">
                  <thead>
                    <tr>
                      <th className="text-left">Student</th>
                      <th className="text-left">Parent</th>
                      <th className="text-center">Channel</th>
                      <th className="text-right">Owed</th>
                      <th className="text-center">Status</th>
                      <th className="text-right">Paid</th>
                      <th className="text-left">Sent At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaignDetail.messages.map((msg: CampaignMessage) => (
                      <tr key={msg.id} className="text-sm">
                        <td className="px-3 py-2 text-[var(--text-primary)]">{msg.studentName}</td>
                        <td className="px-3 py-2 text-[var(--text-secondary)]">{msg.parentName}</td>
                        <td className="px-3 py-2 text-center">
                          <span className="inline-flex items-center gap-1 text-xs text-[var(--text-secondary)]">
                            {React.createElement(CHANNEL_ICONS[msg.channel] || Send, { size: 12 })}
                            {msg.channel}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right text-[var(--text-secondary)]">ZMW {msg.amountOwed?.toLocaleString()}</td>
                        <td className="px-3 py-2 text-center">
                          <span className={`ds-badge border-transparent ${
                            msg.status === 'PAID' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' :
                            msg.status === 'SENT' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' :
                            msg.status === 'FAILED' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' :
                            'bg-[var(--surface-muted)] text-[var(--text-secondary)]'
                          }`}>
                            {msg.status}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right text-green-600 dark:text-green-400">{msg.paidAmount ? `ZMW ${msg.paidAmount.toLocaleString()}` : '—'}</td>
                        <td className="px-3 py-2 text-[var(--text-secondary)]">{new Date(msg.sentAt).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Execute button if DRAFT */}
            {campaignDetail.campaign?.status === 'DRAFT' && (
              <div className="ds-form-actions border-t border-[var(--border-color)]">
                <button
                  onClick={() => handleExecuteCampaign(campaignDetail.campaign.id)}
                  disabled={actionLoading === `execute-${campaignDetail.campaign.id}`}
                  className="ds-button-primary"
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
  <div className="ds-card">
    <div className="flex items-center justify-between mb-3">
      <div className={`text-${color}-600 dark:text-${color}-400`}>
        <Icon size={20} aria-hidden="true" />
      </div>
    </div>
    <p className="text-2xl font-bold text-[var(--text-primary)] break-words">{value}</p>
    <p className="text-sm text-[var(--text-secondary)] mt-1">{title}</p>
    {subtitle && <p className="text-xs text-[var(--text-secondary)]">{subtitle}</p>}
  </div>
);

const MiniStat: React.FC<{ label: string; value: string | number }> = ({ label, value }) => (
  <div className="ds-surface-muted min-w-0 p-3 text-center">
    <p className="text-lg font-bold text-[var(--text-primary)] break-words">{value}</p>
    <p className="text-xs text-[var(--text-secondary)]">{label}</p>
  </div>
);

const CampaignRow: React.FC<{
  campaign: Campaign;
  onExecute: (id: string) => void;
  onView: (id: string) => void;
  loading: string | null;
}> = ({ campaign, onExecute, onView, loading }) => {
  const statusColors: Record<string, string> = {
    DRAFT: 'bg-[var(--surface-muted)] text-[var(--text-secondary)]',
    ACTIVE: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    PAUSED: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
    COMPLETED: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  };

  return (
    <div className="ds-card flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <h4 className="text-sm font-semibold text-[var(--text-primary)] truncate">{campaign.name}</h4>
          <span className={`ds-badge border-transparent ${statusColors[campaign.status] || statusColors.DRAFT}`}>
            {campaign.status}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-xs text-[var(--text-secondary)]">
          <span>Targeted: {campaign.totalTargeted}</span>
          <span>Contacted: {campaign.totalContacted}</span>
          <span>Responded: {campaign.totalResponded}</span>
          {campaign.amountCollected > 0 && (
            <span className="text-green-600 dark:text-green-400 font-medium">ZMW {campaign.amountCollected.toLocaleString()}</span>
          )}
          <span>{new Date(campaign.createdAt).toLocaleDateString()}</span>
        </div>
      </div>
      <div className="ds-actions">
        <button
          onClick={() => onView(campaign.id)}
          className="ds-button-ghost"
          aria-label={`View details for ${campaign.name}`}
          title="View details"
        >
          <Eye size={16} />
        </button>
        {campaign.status === 'DRAFT' && (
          <button
            onClick={() => onExecute(campaign.id)}
            disabled={loading === `execute-${campaign.id}`}
            className="ds-button-primary"
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
  <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50" role="dialog" aria-modal="true" aria-label={title}>
    <div className={`ds-surface ${wide ? 'max-w-4xl' : 'max-w-lg'} min-w-0 w-full max-h-[85vh] overflow-y-auto`} role="region" aria-label={`${title} content`} tabIndex={0}>
      <div className="ds-modal-header border-b border-[var(--border-color)]">
        <h3 className="text-lg font-semibold text-[var(--text-primary)] break-words">{title}</h3>
        <button onClick={onClose} className="ds-button-ghost shrink-0" aria-label={`Close ${title}`}>
          <X size={20} />
        </button>
      </div>
      <div className="p-4 sm:p-6">
        {children}
      </div>
    </div>
  </div>
);

export default DebtCollection;
