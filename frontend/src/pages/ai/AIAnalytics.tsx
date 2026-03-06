import { useState, useEffect, useCallback } from 'react';
import {
  BarChart3, TrendingUp, Users, Zap, Brain, AlertTriangle,
  Bell, Check, X, ChevronRight, RefreshCw, Loader2,
  Activity, Clock, DollarSign, Target, Sparkles, Eye,
  ShieldAlert, Lightbulb, ArrowUpRight, Cpu
} from 'lucide-react';
import api from '../../utils/api';
import toast from 'react-hot-toast';

// ---- Types ----
interface UsageSummary {
  totalInteractions: number;
  successRate: number;
  uniqueUsers: number;
  totalTokens: number;
  estimatedCostUSD: number;
  byFeature: { feature: string; _count: { id: number }; _sum: { tokensUsed: number | null } }[];
  byAction: { action: string; _count: { id: number } }[];
  dailyTrend: { date: string; count: number; tokens: number }[];
  topUsers: { userId: string; _count: { id: number }; user?: { firstName: string; lastName: string; email: string } }[];
}

interface AdoptionMetrics {
  weeklyActiveUsers: number;
  monthlyActiveUsers: number;
  adoptionRate: number;
  totalConversations: number;
  totalMessages: number;
  estimatedTimeSavedHours: number;
}

interface ProactiveAlert {
  id: string;
  category: string;
  severity: string;
  title: string;
  description: string;
  actionType?: string;
  actionLabel?: string;
  isRead: boolean;
  isActioned: boolean;
  isDismissed: boolean;
  generatedBy: string;
  createdAt: string;
}

interface WeeklyDigest {
  cached: boolean;
  weeklyDigest?: string;
  actionItems?: { priority: string; title: string; description: string; category: string }[];
  opportunities?: { title: string; description: string; impact: string }[];
  risks?: { title: string; description: string; likelihood: string }[];
  generatedAt?: string;
}

type TabKey = 'overview' | 'alerts' | 'digest';

const AIAnalyticsDashboard = () => {
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [loading, setLoading] = useState(true);
  const [usageSummary, setUsageSummary] = useState<UsageSummary | null>(null);
  const [adoption, setAdoption] = useState<AdoptionMetrics | null>(null);
  const [alerts, setAlerts] = useState<ProactiveAlert[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [digest, setDigest] = useState<WeeklyDigest | null>(null);
  const [scanning, setScanning] = useState(false);
  const [aiScanning, setAiScanning] = useState(false);

  // ---- Data Loaders ----
  const loadOverview = useCallback(async () => {
    try {
      setLoading(true);
      const [usageRes, adoptionRes] = await Promise.all([
        api.get('/ai-analytics/usage/summary'),
        api.get('/ai-analytics/adoption'),
      ]);
      setUsageSummary(usageRes.data);
      setAdoption(adoptionRes.data);
    } catch (e: any) {
      toast.error('Failed to load AI analytics');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAlerts = useCallback(async () => {
    try {
      const res = await api.get('/ai-analytics/proactive/alerts');
      setAlerts(res.data.alerts);
      setUnreadCount(res.data.unreadCount);
    } catch (e: any) {
      toast.error('Failed to load alerts');
    }
  }, []);

  const loadDigest = useCallback(async () => {
    try {
      const res = await api.get('/ai-analytics/proactive/digest');
      setDigest(res.data);
    } catch (e: any) {
      toast.error('Failed to load digest');
    }
  }, []);

  useEffect(() => {
    loadOverview();
    loadAlerts();
    loadDigest();
  }, [loadOverview, loadAlerts, loadDigest]);

  // ---- Actions ----
  const runScan = async () => {
    setScanning(true);
    try {
      const res = await api.post('/ai-analytics/proactive/scan');
      toast.success(`Scan complete: ${res.data.alertsGenerated} alerts generated`);
      loadAlerts();
    } catch (e: any) {
      toast.error('Scan failed');
    } finally {
      setScanning(false);
    }
  };

  const runAIScan = async () => {
    setAiScanning(true);
    try {
      const res = await api.post('/ai-analytics/proactive/ai-scan');
      setDigest({ cached: false, ...res.data });
      toast.success('AI analysis complete');
      loadAlerts();
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'AI scan failed');
    } finally {
      setAiScanning(false);
    }
  };

  const handleAlertAction = async (id: string, action: 'read' | 'action' | 'dismiss') => {
    try {
      await api.put(`/ai-analytics/proactive/alerts/${id}/${action}`);
      loadAlerts();
    } catch (e: any) {
      toast.error('Failed to update alert');
    }
  };

  // ---- Render Helpers ----
  const severityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'text-red-600 bg-red-50 border-red-200';
      case 'warning': return 'text-amber-600 bg-amber-50 border-amber-200';
      case 'info': return 'text-blue-600 bg-blue-50 border-blue-200';
      case 'opportunity': return 'text-emerald-600 bg-emerald-50 border-emerald-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const categoryIcon = (cat: string) => {
    switch (cat) {
      case 'academic': return <Brain className="w-4 h-4" />;
      case 'financial': return <DollarSign className="w-4 h-4" />;
      case 'attendance': return <Users className="w-4 h-4" />;
      case 'operational': return <Activity className="w-4 h-4" />;
      default: return <AlertTriangle className="w-4 h-4" />;
    }
  };

  const tabs: { key: TabKey; label: string; icon: any; badge?: number }[] = [
    { key: 'overview', label: 'Usage Analytics', icon: BarChart3 },
    { key: 'alerts', label: 'Proactive Alerts', icon: Bell, badge: unreadCount },
    { key: 'digest', label: 'AI Digest', icon: Sparkles },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Cpu className="w-7 h-7 text-indigo-600" />
            AI Command Center
          </h1>
          <p className="text-gray-500 mt-1">Track AI usage, manage proactive alerts, and view intelligent insights</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={runScan}
            disabled={scanning}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Run Scan
          </button>
          <button
            onClick={runAIScan}
            disabled={aiScanning}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg hover:from-purple-700 hover:to-indigo-700 disabled:opacity-50 transition-all"
          >
            {aiScanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            AI Analysis
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-6">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`pb-3 px-1 flex items-center gap-2 border-b-2 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
              {tab.badge ? (
                <span className="ml-1 px-2 py-0.5 text-xs bg-red-100 text-red-600 rounded-full font-semibold">
                  {tab.badge}
                </span>
              ) : null}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <OverviewTab loading={loading} usage={usageSummary} adoption={adoption} />
      )}
      {activeTab === 'alerts' && (
        <AlertsTab
          alerts={alerts}
          onAction={handleAlertAction}
          severityColor={severityColor}
          categoryIcon={categoryIcon}
        />
      )}
      {activeTab === 'digest' && (
        <DigestTab
          digest={digest}
          loading={aiScanning}
          onRunAI={runAIScan}
        />
      )}
    </div>
  );
};

// ================================================================
// OVERVIEW TAB
// ================================================================
const OverviewTab = ({
  loading,
  usage,
  adoption,
}: {
  loading: boolean;
  usage: UsageSummary | null;
  adoption: AdoptionMetrics | null;
}) => {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="Total AI Interactions"
          value={usage?.totalInteractions?.toLocaleString() || '0'}
          icon={<Zap className="w-5 h-5 text-indigo-600" />}
          color="indigo"
        />
        <KPICard
          title="Success Rate"
          value={`${usage?.successRate?.toFixed(1) || '0'}%`}
          icon={<Target className="w-5 h-5 text-emerald-600" />}
          color="emerald"
          subtitle={`${usage?.uniqueUsers || 0} unique users`}
        />
        <KPICard
          title="Tokens Used"
          value={usage?.totalTokens?.toLocaleString() || '0'}
          icon={<Activity className="w-5 h-5 text-purple-600" />}
          color="purple"
          subtitle={`~$${usage?.estimatedCostUSD?.toFixed(2) || '0.00'} est. cost`}
        />
        <KPICard
          title="Time Saved"
          value={`${adoption?.estimatedTimeSavedHours?.toFixed(0) || '0'}h`}
          icon={<Clock className="w-5 h-5 text-amber-600" />}
          color="amber"
          subtitle={`${adoption?.totalConversations || 0} conversations`}
        />
      </div>

      {/* Adoption Metrics */}
      {adoption && (
        <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl p-6 border border-indigo-100">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-indigo-600" />
            AI Adoption Metrics
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div>
              <p className="text-sm text-gray-500">Weekly Active Users</p>
              <p className="text-2xl font-bold text-indigo-700">{adoption.weeklyActiveUsers}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Monthly Active Users</p>
              <p className="text-2xl font-bold text-indigo-700">{adoption.monthlyActiveUsers}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Adoption Rate</p>
              <p className="text-2xl font-bold text-indigo-700">{adoption.adoptionRate}%</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Messages</p>
              <p className="text-2xl font-bold text-indigo-700">{adoption.totalMessages}</p>
            </div>
          </div>
        </div>
      )}

      {/* Feature & User Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* By Feature */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Usage by Feature</h3>
          {usage?.byFeature && usage.byFeature.length > 0 ? (
            <div className="space-y-3">
              {usage.byFeature.map((f, i) => {
                const featureCount = f._count?.id ?? 0;
                const featureTokens = f._sum?.tokensUsed || 0;
                const pct = usage.totalInteractions > 0
                  ? (featureCount / usage.totalInteractions) * 100
                  : 0;
                return (
                  <div key={i}>
                    <div className="flex justify-between items-center text-sm mb-1">
                      <span className="font-medium text-gray-700 capitalize">
                        {(f.feature || 'unknown').replace(/-/g, ' ')}
                      </span>
                      <span className="text-gray-500">
                        {featureCount} calls · {(featureTokens / 1000).toFixed(1)}K tokens
                      </span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2">
                      <div
                        className="bg-indigo-500 h-2 rounded-full transition-all"
                        style={{ width: `${Math.max(pct, 2)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-gray-400 text-sm">No usage data yet. Start using AI features to see breakdown.</p>
          )}
        </div>

        {/* Top Users */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Top AI Users</h3>
          {usage?.topUsers && usage.topUsers.length > 0 ? (
            <div className="space-y-3">
              {usage.topUsers.map((u, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-semibold text-sm">
                      {i + 1}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {u.user ? `${u.user.firstName} ${u.user.lastName}` : 'Unknown User'}
                      </p>
                      <p className="text-xs text-gray-400">{u.user?.email || u.userId}</p>
                    </div>
                  </div>
                  <span className="text-sm font-semibold text-indigo-600">{u._count?.id ?? 0} uses</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-400 text-sm">No user data yet.</p>
          )}
        </div>
      </div>

      {/* Daily Trend */}
      {usage?.dailyTrend && usage.dailyTrend.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Daily Usage Trend (30 days)</h3>
          <div className="flex items-end gap-1 h-40">
            {usage.dailyTrend.map((d, i) => {
              const maxCount = Math.max(...usage.dailyTrend.map(x => x.count), 1);
              const height = (d.count / maxCount) * 100;
              return (
                <div key={i} className="flex-1 group relative flex flex-col items-center justify-end">
                  <div className="absolute -top-8 hidden group-hover:block bg-gray-800 text-white text-xs px-2 py-1 rounded whitespace-nowrap z-10">
                    {d.date}: {d.count} calls, {d.tokens} tokens
                  </div>
                  <div
                    className="w-full bg-indigo-400 hover:bg-indigo-500 rounded-t transition-all cursor-pointer min-h-[2px]"
                    style={{ height: `${height}%` }}
                  />
                </div>
              );
            })}
          </div>
          <div className="flex justify-between text-xs text-gray-400 mt-2">
            <span>{usage.dailyTrend[0]?.date}</span>
            <span>{usage.dailyTrend[usage.dailyTrend.length - 1]?.date}</span>
          </div>
        </div>
      )}
    </div>
  );
};

// ================================================================
// ALERTS TAB
// ================================================================
const AlertsTab = ({
  alerts,
  onAction,
  severityColor,
  categoryIcon,
}: {
  alerts: ProactiveAlert[];
  onAction: (id: string, action: 'read' | 'action' | 'dismiss') => void;
  severityColor: (s: string) => string;
  categoryIcon: (c: string) => JSX.Element;
}) => {
  if (alerts.length === 0) {
    return (
      <div className="text-center py-16">
        <ShieldAlert className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <h3 className="text-lg font-medium text-gray-600">No active alerts</h3>
        <p className="text-gray-400 mt-1">Run a scan to check your school's data for potential issues.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {alerts.map(alert => (
        <div
          key={alert.id}
          className={`rounded-xl border p-4 ${severityColor(alert.severity)} ${
            !alert.isRead ? 'ring-2 ring-offset-1 ring-current/20' : 'opacity-80'
          }`}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3 flex-1">
              <div className="mt-0.5">{categoryIcon(alert.category)}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="font-semibold text-sm">{alert.title}</h4>
                  <span className="text-[10px] font-bold uppercase tracking-wider opacity-60">
                    {alert.severity}
                  </span>
                  {alert.generatedBy === 'ai-analysis' && (
                    <span className="text-[10px] bg-purple-200 text-purple-700 px-1.5 py-0.5 rounded-full">
                      AI Generated
                    </span>
                  )}
                </div>
                <p className="text-sm mt-1 opacity-80">{alert.description}</p>
                <p className="text-xs mt-2 opacity-50">
                  {new Date(alert.createdAt).toLocaleDateString()} · {alert.category}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1 flex-shrink-0">
              {alert.actionLabel && !alert.isActioned && (
                <button
                  onClick={() => onAction(alert.id, 'action')}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-white/80 border rounded-lg hover:bg-white transition-colors"
                >
                  <ChevronRight className="w-3 h-3" />
                  {alert.actionLabel.length > 25
                    ? alert.actionLabel.slice(0, 25) + '…'
                    : alert.actionLabel}
                </button>
              )}
              {alert.isActioned && (
                <span className="text-xs flex items-center gap-1 text-emerald-600">
                  <Check className="w-3 h-3" /> Done
                </span>
              )}
              {!alert.isRead && (
                <button
                  onClick={() => onAction(alert.id, 'read')}
                  title="Mark as read"
                  className="p-1.5 hover:bg-white/50 rounded-lg transition-colors"
                >
                  <Eye className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={() => onAction(alert.id, 'dismiss')}
                title="Dismiss"
                className="p-1.5 hover:bg-white/50 rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

// ================================================================
// DIGEST TAB
// ================================================================
const DigestTab = ({
  digest,
  loading,
  onRunAI,
}: {
  digest: WeeklyDigest | null;
  loading: boolean;
  onRunAI: () => void;
}) => {
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-purple-600 mb-3" />
        <p className="text-gray-500">AI is analyzing your school data…</p>
      </div>
    );
  }

  if (!digest || (!digest.weeklyDigest && !digest.cached)) {
    return (
      <div className="text-center py-16">
        <Sparkles className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <h3 className="text-lg font-medium text-gray-600">No AI Digest Available</h3>
        <p className="text-gray-400 mt-1 mb-4">Generate an AI-powered analysis of your school's current state.</p>
        <button
          onClick={onRunAI}
          className="px-6 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg hover:from-purple-700 hover:to-indigo-700 transition-all font-medium"
        >
          <span className="flex items-center gap-2">
            <Sparkles className="w-4 h-4" /> Generate AI Digest
          </span>
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Executive Summary */}
      {digest.weeklyDigest && (
        <div className="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-xl p-6 border border-purple-100">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2 mb-3">
            <Brain className="w-5 h-5 text-purple-600" />
            Executive Summary
          </h3>
          <p className="text-gray-700 leading-relaxed">{digest.weeklyDigest}</p>
          {digest.generatedAt && (
            <p className="text-xs text-gray-400 mt-3">
              Generated: {new Date(digest.generatedAt).toLocaleString()}
              {digest.cached && ' (cached)'}
            </p>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Action Items */}
        {digest.actionItems && digest.actionItems.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2 mb-4">
              <Target className="w-5 h-5 text-red-500" />
              Action Items
            </h3>
            <div className="space-y-3">
              {digest.actionItems.map((item, i) => (
                <div key={i} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                  <span className={`px-2 py-0.5 text-xs font-bold rounded-full uppercase ${
                    item.priority === 'high' ? 'bg-red-100 text-red-700'
                    : item.priority === 'medium' ? 'bg-amber-100 text-amber-700'
                    : 'bg-blue-100 text-blue-700'
                  }`}>
                    {item.priority}
                  </span>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{item.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{item.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Opportunities */}
        {digest.opportunities && digest.opportunities.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2 mb-4">
              <Lightbulb className="w-5 h-5 text-amber-500" />
              Opportunities
            </h3>
            <div className="space-y-3">
              {digest.opportunities.map((opp, i) => (
                <div key={i} className="p-3 bg-emerald-50 rounded-lg border border-emerald-100">
                  <div className="flex items-center gap-2">
                    <ArrowUpRight className="w-4 h-4 text-emerald-600" />
                    <p className="text-sm font-medium text-gray-900">{opp.title}</p>
                  </div>
                  <p className="text-xs text-gray-600 mt-1">{opp.description}</p>
                  <p className="text-xs text-emerald-600 mt-1 font-medium">Impact: {opp.impact}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Risks */}
      {digest.risks && digest.risks.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2 mb-4">
            <AlertTriangle className="w-5 h-5 text-red-500" />
            Risk Factors
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {digest.risks.map((risk, i) => (
              <div key={i} className="p-4 bg-red-50 rounded-lg border border-red-100">
                <p className="text-sm font-medium text-gray-900">{risk.title}</p>
                <p className="text-xs text-gray-600 mt-1">{risk.description}</p>
                <span className={`inline-block mt-2 px-2 py-0.5 text-xs rounded-full font-medium ${
                  risk.likelihood === 'high' ? 'bg-red-200 text-red-800'
                  : risk.likelihood === 'medium' ? 'bg-amber-200 text-amber-800'
                  : 'bg-blue-200 text-blue-800'
                }`}>
                  {risk.likelihood} likelihood
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ================================================================
// KPI CARD
// ================================================================
const KPICard = ({
  title,
  value,
  icon,
  color,
  subtitle,
}: {
  title: string;
  value: string;
  icon: JSX.Element;
  color: string;
  subtitle?: string;
}) => (
  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
    <div className="flex items-center justify-between mb-2">
      <span className="text-sm font-medium text-gray-500">{title}</span>
      <div className={`p-2 rounded-lg bg-${color}-50`}>{icon}</div>
    </div>
    <p className="text-2xl font-bold text-gray-900">{value}</p>
    {subtitle && <p className="text-xs text-gray-400 mt-1">{subtitle}</p>}
  </div>
);

export default AIAnalyticsDashboard;
