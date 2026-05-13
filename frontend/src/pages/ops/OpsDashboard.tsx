import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Database,
  Eye,
  FileWarning,
  KeyRound,
  Loader2,
  Lock,
  LogOut,
  Plus,
  RefreshCcw,
  Search,
  Server,
  Shield,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  ToggleLeft,
  ToggleRight,
  Users,
  Wrench,
  XCircle,
} from 'lucide-react';
import api from '../../utils/api';
import { useAuth } from '../../context/AuthContext';

type TenantStatus = 'ACTIVE' | 'SUSPENDED' | 'TRIAL';
type TenantPlan = 'FREE' | 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE';
type OpsView = 'tenants' | 'health' | 'operations' | 'security' | 'audit';
type TenantOnboardingStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'READY_TO_LAUNCH' | 'LIVE' | 'BLOCKED';
type TenantDomainStatus = 'NONE' | 'PENDING_DNS' | 'PENDING_VERIFICATION' | 'VERIFIED' | 'FAILED';

interface TenantCounts {
  users: number;
  activeUsers: number;
  students: number;
  activeStudents: number;
  branches: number;
  classes: number;
  payments: number;
  aiUsage: number;
  aiFailures: number;
  auditEvents: number;
}

interface TenantSummary {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  plan: TenantPlan;
  domain?: string | null;
  domainStatus: TenantDomainStatus;
  domainDnsTarget?: string | null;
  domainVerificationToken?: string | null;
  domainRequestedAt?: string | null;
  domainVerifiedAt?: string | null;
  domainLastCheckedAt?: string | null;
  locale: string;
  timezone: string;
  currency: string;
  maxUsers: number;
  maxStudents: number;
  onboardingStatus: TenantOnboardingStatus;
  onboardingChecklist?: Record<string, boolean> | null;
  onboardingOwner?: string | null;
  onboardingNotes?: string | null;
  onboardingStartedAt?: string | null;
  onboardingCompletedAt?: string | null;
  maintenanceMode: boolean;
  maintenanceMessage?: string | null;
  trialEndsAt?: string | null;
  createdAt: string;
  updatedAt: string;
  counts?: TenantCounts;
  enabledFeatures?: string[];
}

interface DomainCheckRecord {
  host: string;
  expected: string | null;
  resolved: string[];
  matched: boolean;
  error: string | null;
}

interface DomainCheckResult {
  status: TenantDomainStatus;
  verified: boolean;
  checkedAt: string;
  summary: string;
  cname: DomainCheckRecord;
  txt: DomainCheckRecord;
}

interface TenantFeature {
  feature: string;
  enabled: boolean;
  hasOverride: boolean;
  config?: unknown;
}

interface TenantAdmin {
  id: string;
  email: string;
  fullName: string;
  role: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface TenantDetail extends TenantSummary {
  counts: TenantCounts;
  usage?: {
    limits: {
      maxUsers: number;
      maxStudents: number;
      usersPercent: number;
      studentsPercent: number;
    };
    ai30d: {
      requests: number;
      failures: number;
      tokens: number;
      byFeature: Array<{ feature: string; count: number }>;
    };
    billing30d: {
      paymentCount: number;
      paymentAmount: number;
      overdueInvoiceCount: number;
      overdueBalance: number;
    };
  };
  features: TenantFeature[];
  admins: TenantAdmin[];
  settings?: {
    schoolName?: string;
    schoolEmail?: string;
    schoolPhone?: string;
    schoolWebsite?: string;
    logoUrl?: string;
  } | null;
  domainInstructions?: {
    type: string;
    host: string;
    target: string;
    txtName: string;
    txtValue: string;
  } | null;
  recentAudit: AuditLog[];
  recentAiUsage: Array<{
    id: string;
    feature: string;
    action: string;
    success: boolean;
    responseTimeMs?: number | null;
    createdAt: string;
  }>;
}

interface Overview {
  totals: {
    tenants: number;
    activeTenants: number;
    suspendedTenants: number;
    trialTenants: number;
    maintenanceTenants: number;
    users: number;
    students: number;
    branches: number;
    aiUsage7d: number;
    aiFailures7d: number;
    auditEvents7d: number;
    failedLogins24h: number;
    overdueInvoiceCount: number;
    overdueBalance: number;
  };
  tenantsByPlan: Array<{ plan: TenantPlan; count: number }>;
  recentTenants: TenantSummary[];
}

interface AuditLog {
  id: string;
  userId?: string | null;
  tenantId: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  createdAt: string;
  ipAddress?: string | null;
}

interface Health {
  api: { status: string; uptimeSeconds: number };
  database: { status: string; latencyMs?: number; error?: string };
  memory?: { rss: number; heapUsed: number; heapTotal: number };
  auditEvents24h?: number;
  aiFailures24h?: number;
  timestamp: string;
}

interface OperationsFeedItem {
  id: string;
  type: string;
  severity: 'info' | 'warning' | 'critical';
  tenantId: string;
  title: string;
  detail?: string;
  createdAt: string;
}

const PLANS: TenantPlan[] = ['FREE', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE'];
const STATUSES: TenantStatus[] = ['ACTIVE', 'TRIAL', 'SUSPENDED'];
const OPS_VIEWS: OpsView[] = ['tenants', 'health', 'operations', 'security', 'audit'];
const ONBOARDING_STATUSES: TenantOnboardingStatus[] = ['NOT_STARTED', 'IN_PROGRESS', 'READY_TO_LAUNCH', 'LIVE', 'BLOCKED'];
const onboardingTaskLabels: Record<string, string> = {
  tenantProvisioned: 'Tenant provisioned',
  schoolProfileConfigured: 'School profile configured',
  adminTrained: 'Admin trained',
  classesConfigured: 'Classes configured',
  usersImported: 'Users imported',
  studentsImported: 'Students imported',
  feesConfigured: 'Fees configured',
  communicationsConfigured: 'Communications configured',
  customDomainConfigured: 'Custom domain configured',
  goLiveApproved: 'Go-live approved',
};

const featureLabels: Record<string, string> = {
  ATTENDANCE: 'Attendance',
  GRADEBOOK: 'Gradebook',
  FEE_MANAGEMENT: 'Fee Management',
  NOTIFICATIONS: 'Notifications',
  SMS: 'SMS',
  REPORTS: 'Reports',
  TIMETABLE: 'Timetable',
  AI_TUTOR: 'AI Tutor',
  VIRTUAL_CLASSROOM: 'Virtual Classroom',
  DEBT_COLLECTION: 'Debt Collection',
  WHATSAPP: 'WhatsApp',
  BULK_IMPORT: 'Bulk Import',
  PAYROLL: 'Payroll',
  ACCOUNTING: 'Accounting',
  MULTI_BRANCH: 'Multi-Branch',
  API_ACCESS: 'API Access',
  CUSTOM_FIELDS: 'Custom Fields',
  WHITE_LABEL: 'White Label',
};

const statusClass = (status: string) => {
  if (status === 'ACTIVE') return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800';
  if (status === 'TRIAL') return 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800';
  return 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800';
};

const planClass = (plan: string) => {
  if (plan === 'ENTERPRISE') return 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-900/20 dark:text-violet-300 dark:border-violet-800';
  if (plan === 'PROFESSIONAL') return 'bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-900/20 dark:text-cyan-300 dark:border-cyan-800';
  if (plan === 'STARTER') return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800';
  return 'bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700';
};

const domainStatusClass = (status: TenantDomainStatus) => {
  if (status === 'VERIFIED') return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800';
  if (status === 'FAILED') return 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800';
  if (status === 'PENDING_DNS' || status === 'PENDING_VERIFICATION') return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800';
  return 'bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700';
};

const formatBytes = (value = 0) => {
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${Math.round(value / 1024 / 1024)} MB`;
};

const emptyTenantForm = {
  name: '',
  slug: '',
  plan: 'FREE' as TenantPlan,
  status: 'ACTIVE' as TenantStatus,
  domain: '',
  locale: 'en',
  timezone: 'Africa/Lusaka',
  currency: 'ZMW',
  maxUsers: 50,
  maxStudents: 500,
  trialEndsAt: '',
  adminEmail: '',
  adminPassword: '',
  adminFullName: '',
  branchName: 'Main Campus',
  branchCode: 'MAIN',
};

const OpsDashboard = () => {
  const { user, token, login, logout } = useAuth();
  const navigate = useNavigate();
  const { view } = useParams<{ view?: string }>();
  const routeView = OPS_VIEWS.includes(view as OpsView) ? (view as OpsView) : 'tenants';
  const [overview, setOverview] = useState<Overview | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [tenants, setTenants] = useState<TenantSummary[]>([]);
  const [selectedTenant, setSelectedTenant] = useState<TenantDetail | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [securityEvents, setSecurityEvents] = useState<AuditLog[]>([]);
  const [operationsFeed, setOperationsFeed] = useState<OperationsFeedItem[]>([]);
  const [activeView, setActiveView] = useState<OpsView>(routeView);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [planFilter, setPlanFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState(emptyTenantForm);
  const [editForm, setEditForm] = useState<Partial<TenantSummary>>({});
  const [domainCheckResult, setDomainCheckResult] = useState<DomainCheckResult | null>(null);
  const [impersonationReason, setImpersonationReason] = useState('Support investigation');
  const [temporaryPassword, setTemporaryPassword] = useState('');

  // Sidebar menu group collapse state
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    operations: true,
    security: false,
  });
  const toggleGroup = (group: string) => {
    setExpandedGroups(prev => ({ ...prev, [group]: !prev[group] }));
  };

  const selectedId = selectedTenant?.id;

  useEffect(() => {
    setActiveView(routeView);
  }, [routeView]);

  const changeView = (nextView: OpsView) => {
    setActiveView(nextView);
    navigate(`/ops/${nextView}`);
  };

  const loadOverview = useCallback(async () => {
    const response = await api.get('/platform/overview');
    setOverview(response.data);
  }, []);

  const loadHealth = useCallback(async () => {
    const response = await api.get('/platform/health');
    setHealth(response.data);
  }, []);

  const loadTenants = useCallback(async () => {
    const params = new URLSearchParams();
    if (search.trim()) params.set('search', search.trim());
    if (statusFilter !== 'ALL') params.set('status', statusFilter);
    if (planFilter !== 'ALL') params.set('plan', planFilter);

    const response = await api.get(`/platform/tenants?${params.toString()}`);
    setTenants(response.data);
  }, [search, statusFilter, planFilter]);

  const loadTenant = useCallback(async (id: string) => {
    const response = await api.get(`/platform/tenants/${id}`);
    setSelectedTenant(response.data);
    setEditForm(response.data);
    setDomainCheckResult(null);
  }, []);

  const loadAudit = useCallback(async () => {
    const params = new URLSearchParams();
    if (selectedId) params.set('tenantId', selectedId);
    params.set('limit', '50');
    const response = await api.get(`/platform/audit-logs?${params.toString()}`);
    setAuditLogs(response.data.logs || []);
  }, [selectedId]);

  const loadSecurityEvents = useCallback(async () => {
    const params = new URLSearchParams();
    if (selectedId) params.set('tenantId', selectedId);
    params.set('limit', '75');
    const response = await api.get(`/platform/security-events?${params.toString()}`);
    setSecurityEvents(response.data || []);
  }, [selectedId]);

  const loadOperationsFeed = useCallback(async () => {
    const response = await api.get('/platform/operations-feed');
    setOperationsFeed(response.data || []);
  }, []);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([loadOverview(), loadTenants(), loadHealth(), loadOperationsFeed(), loadSecurityEvents(), loadAudit()]);
    } finally {
      setLoading(false);
    }
  }, [loadAudit, loadHealth, loadOperationsFeed, loadOverview, loadSecurityEvents, loadTenants]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      loadTenants().catch(() => undefined);
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [loadTenants]);

  useEffect(() => {
    if (selectedId) {
      loadAudit().catch(() => undefined);
      loadSecurityEvents().catch(() => undefined);
    }
  }, [loadAudit, loadSecurityEvents, selectedId]);

  const selectTenant = async (tenant: TenantSummary) => {
    await loadTenant(tenant.id);
    changeView('tenants');
  };

  const handleCreateTenant = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...createForm,
        maxUsers: Number(createForm.maxUsers),
        maxStudents: Number(createForm.maxStudents),
        trialEndsAt: createForm.trialEndsAt ? new Date(createForm.trialEndsAt).toISOString() : null,
      };
      const response = await api.post('/platform/tenants', payload);
      setShowCreate(false);
      setCreateForm(emptyTenantForm);
      await Promise.all([loadOverview(), loadTenants(), loadTenant(response.data.tenant.id)]);
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to create tenant');
    } finally {
      setSaving(false);
    }
  };

  const saveTenant = async () => {
    if (!selectedTenant) return;
    setSaving(true);
    try {
      const payload = {
        name: editForm.name,
        status: editForm.status,
        plan: editForm.plan,
        domain: editForm.domain || null,
        locale: editForm.locale,
        timezone: editForm.timezone,
        currency: editForm.currency,
        maxUsers: Number(editForm.maxUsers || 1),
        maxStudents: Number(editForm.maxStudents || 1),
        maintenanceMode: Boolean(editForm.maintenanceMode),
        maintenanceMessage: editForm.maintenanceMessage || null,
        trialEndsAt: editForm.trialEndsAt ? new Date(editForm.trialEndsAt).toISOString() : null,
      };
      await api.put(`/platform/tenants/${selectedTenant.id}`, payload);
      await Promise.all([loadOverview(), loadTenants(), loadTenant(selectedTenant.id)]);
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to save tenant');
    } finally {
      setSaving(false);
    }
  };

  const setTenantStatus = async (status: 'ACTIVE' | 'SUSPENDED') => {
    if (!selectedTenant) return;
    const action = status === 'SUSPENDED' ? 'suspend' : 'activate';
    if (status === 'SUSPENDED' && !window.confirm(`Suspend ${selectedTenant.name}?`)) return;
    setSaving(true);
    try {
      await api.post(`/platform/tenants/${selectedTenant.id}/${action}`);
      await Promise.all([loadOverview(), loadTenants(), loadTenant(selectedTenant.id)]);
    } finally {
      setSaving(false);
    }
  };

  const setMaintenanceMode = async (maintenanceMode: boolean) => {
    if (!selectedTenant) return;
    if (maintenanceMode && !window.confirm(`Enable maintenance mode for ${selectedTenant.name}?`)) return;
    setSaving(true);
    try {
      await api.put(`/platform/tenants/${selectedTenant.id}/maintenance`, {
        maintenanceMode,
        maintenanceMessage: editForm.maintenanceMessage || null,
      });
      await Promise.all([loadOverview(), loadTenants(), loadTenant(selectedTenant.id), loadOperationsFeed(), loadSecurityEvents()]);
    } finally {
      setSaving(false);
    }
  };

  const saveOnboarding = async () => {
    if (!selectedTenant) return;
    setSaving(true);
    try {
      await api.put(`/platform/tenants/${selectedTenant.id}/onboarding`, {
        onboardingStatus: editForm.onboardingStatus || selectedTenant.onboardingStatus,
        onboardingOwner: editForm.onboardingOwner || null,
        onboardingNotes: editForm.onboardingNotes || null,
        onboardingChecklist: editForm.onboardingChecklist || selectedTenant.onboardingChecklist || null,
        onboardingStartedAt: editForm.onboardingStartedAt || selectedTenant.onboardingStartedAt || null,
        onboardingCompletedAt: editForm.onboardingCompletedAt || selectedTenant.onboardingCompletedAt || null,
      });
      await Promise.all([loadTenant(selectedTenant.id), loadOperationsFeed()]);
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to update onboarding');
    } finally {
      setSaving(false);
    }
  };

  const toggleOnboardingTask = (taskKey: string) => {
    const current = (editForm.onboardingChecklist || selectedTenant?.onboardingChecklist || {}) as Record<string, boolean>;
    setEditForm({
      ...editForm,
      onboardingChecklist: {
        ...current,
        [taskKey]: !current[taskKey],
      },
    });
  };

  const setupCustomDomain = async () => {
    if (!selectedTenant || !editForm.domain) return;
    setSaving(true);
    try {
      const response = await api.post(`/platform/tenants/${selectedTenant.id}/domain/setup`, {
        domain: editForm.domain,
      });
      setSelectedTenant((current) => current ? { ...current, ...response.data.tenant, domainInstructions: response.data.instructions } : response.data.tenant);
      setEditForm(response.data.tenant);
      setDomainCheckResult(response.data.result || null);
      await Promise.all([loadTenants(), loadOperationsFeed()]);
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to setup custom domain');
    } finally {
      setSaving(false);
    }
  };

  const checkCustomDomain = async () => {
    if (!selectedTenant) return;
    setSaving(true);
    try {
      const response = await api.post(`/platform/tenants/${selectedTenant.id}/domain/check`);
      setSelectedTenant((current) => current ? { ...current, ...response.data.tenant, domainInstructions: response.data.instructions } : response.data.tenant);
      setEditForm(response.data.tenant);
      setDomainCheckResult(response.data.result || null);
      await Promise.all([loadTenants(), loadOperationsFeed()]);
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to check domain DNS');
    } finally {
      setSaving(false);
    }
  };

  const verifyCustomDomain = async (status: 'VERIFIED' | 'FAILED') => {
    if (!selectedTenant) return;
    setSaving(true);
    try {
      await api.post(`/platform/tenants/${selectedTenant.id}/domain/verify`, { status });
      await Promise.all([loadTenant(selectedTenant.id), loadOperationsFeed()]);
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to update domain verification');
    } finally {
      setSaving(false);
    }
  };

  const toggleFeature = async (feature: string, enabled: boolean) => {
    if (!selectedTenant) return;
    setSaving(true);
    try {
      await api.put(`/platform/tenants/${selectedTenant.id}/features/${feature}`, { enabled });
      await loadTenant(selectedTenant.id);
    } finally {
      setSaving(false);
    }
  };

  const impersonateAdmin = async (admin: TenantAdmin) => {
    if (!selectedTenant || !token || !user) return;
    if (!window.confirm(`Impersonate ${admin.email}? This will switch your session into ${selectedTenant.name}.`)) return;
    setSaving(true);
    try {
      const response = await api.post(`/platform/tenants/${selectedTenant.id}/impersonate/${admin.id}`, {
        reason: impersonationReason,
      });
      localStorage.setItem('platformSession', JSON.stringify({ token, user }));
      localStorage.setItem('tenantSlug', selectedTenant.slug);
      login(response.data.token, response.data.user);
      window.location.href = '/';
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to impersonate admin');
    } finally {
      setSaving(false);
    }
  };

  const setAdminStatus = async (admin: TenantAdmin, isActive: boolean) => {
    if (!selectedTenant) return;
    setSaving(true);
    try {
      await api.patch(`/platform/users/${admin.id}/status`, { isActive });
      await loadTenant(selectedTenant.id);
    } finally {
      setSaving(false);
    }
  };

  const resetAdminPassword = async (admin: TenantAdmin) => {
    if (!selectedTenant) return;
    if (!window.confirm(`Reset password for ${admin.email}?`)) return;
    setSaving(true);
    try {
      const response = await api.post(`/platform/users/${admin.id}/reset-password`, {});
      setTemporaryPassword(response.data.temporaryPassword);
      await loadTenant(selectedTenant.id);
    } finally {
      setSaving(false);
    }
  };

  const tenantUtilization = useMemo(() => {
    if (!selectedTenant) return { users: 0, students: 0 };
    return {
      users: Math.min(100, Math.round((selectedTenant.counts.users / selectedTenant.maxUsers) * 100)),
      students: Math.min(100, Math.round((selectedTenant.counts.students / selectedTenant.maxStudents) * 100)),
    };
  }, [selectedTenant]);

  if (user?.role !== 'PLATFORM_ADMIN') {
    return <Navigate to="/" replace />;
  }

  const stats = overview?.totals;

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 text-white flex flex-col min-h-screen fixed left-0 top-0 z-30">
        {/* Logo */}
        <div className="px-6 py-5 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-500 rounded-xl flex items-center justify-center">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-bold">Platform Admin</h1>
              <p className="text-xs text-slate-400">Sync School Management</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 py-4 space-y-2 overflow-y-auto">
          {/* Operations Group */}
          <div className="space-y-1">
            <button
              onClick={() => toggleGroup('operations')}
              className="w-full flex items-center justify-between px-4 py-2 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
            >
              <div className="flex items-center gap-3">
                <Building2 className="w-5 h-5" />
                <span className="font-medium">Operations</span>
              </div>
              {expandedGroups.operations ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
            {expandedGroups.operations && (
              <div className="ml-4 space-y-1">
                {[
                  { id: 'tenants', label: 'Tenants', icon: Building2 },
                  { id: 'health', label: 'System Health', icon: Server },
                  { id: 'operations', label: 'Ops Feed', icon: FileWarning },
                ].map(item => (
                  <button
                    key={item.id}
                    onClick={() => changeView(item.id as OpsView)}
                    className={`w-full flex items-center gap-3 px-4 py-2 rounded-lg transition-colors text-sm ${
                      activeView === item.id
                        ? 'bg-purple-600 text-white'
                        : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    <item.icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Security & Compliance Group */}
          <div className="space-y-1">
            <button
              onClick={() => toggleGroup('security')}
              className="w-full flex items-center justify-between px-4 py-2 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
            >
              <div className="flex items-center gap-3">
                <Shield className="w-5 h-5" />
                <span className="font-medium">Security</span>
              </div>
              {expandedGroups.security ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
            {expandedGroups.security && (
              <div className="ml-4 space-y-1">
                {[
                  { id: 'security', label: 'Security Events', icon: ShieldAlert },
                  { id: 'audit', label: 'Audit Logs', icon: Activity },
                ].map(item => (
                  <button
                    key={item.id}
                    onClick={() => changeView(item.id as OpsView)}
                    className={`w-full flex items-center gap-3 px-4 py-2 rounded-lg transition-colors text-sm ${
                      activeView === item.id
                        ? 'bg-purple-600 text-white'
                        : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    <item.icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </nav>

        {/* User & Logout */}
        <div className="px-4 py-4 border-t border-slate-700 space-y-2">
          <div className="flex items-center gap-3 px-4 py-2">
            <div className="w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center text-sm font-bold">
              {user?.fullName?.charAt(0) || 'A'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user?.fullName || 'Admin'}</p>
              <p className="text-xs text-slate-400 truncate">{user?.email}</p>
            </div>
          </div>
          <button
            onClick={() => { logout(); navigate('/ops/login'); }}
            className="w-full flex items-center gap-3 px-4 py-2 rounded-lg text-slate-400 hover:bg-red-600/20 hover:text-red-400 transition-colors text-sm"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 ml-64 p-4 md:p-6 pb-24 md:pb-6 space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              {activeView === 'tenants' ? 'Tenant Management' : activeView === 'health' ? 'System Health' : activeView === 'operations' ? 'Operations Feed' : activeView === 'security' ? 'Security Events' : 'Audit Logs'}
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Manage tenants, platform health, feature access, and operational controls.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={refreshAll}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-800 dark:text-gray-200"
            >
              <RefreshCcw size={16} />
              Refresh
            </button>
            {activeView === 'tenants' && (
              <button
                onClick={() => setShowCreate(true)}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              >
                <Plus size={16} />
                New Tenant
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-8">
          {[
            { label: 'Tenants', value: stats?.tenants ?? 0, icon: Building2 },
            { label: 'Active', value: stats?.activeTenants ?? 0, icon: CheckCircle2 },
            { label: 'Suspended', value: stats?.suspendedTenants ?? 0, icon: XCircle },
            { label: 'Maintenance', value: stats?.maintenanceTenants ?? 0, icon: Wrench },
            { label: 'Users', value: stats?.users ?? 0, icon: Users },
            { label: 'Students', value: stats?.students ?? 0, icon: ShieldCheck },
            { label: 'AI failures', value: stats?.aiFailures7d ?? 0, icon: AlertTriangle },
            { label: 'Failed logins', value: stats?.failedLogins24h ?? 0, icon: ShieldAlert },
          ].map((item) => (
            <div key={item.label} className="rounded-lg border border-gray-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">{item.label}</p>
                <item.icon size={18} className="text-blue-600 dark:text-blue-300" />
              </div>
              <p className="mt-3 text-2xl font-bold text-gray-900 dark:text-white">{item.value.toLocaleString()}</p>
            </div>
          ))}
        </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-500">
          <Loader2 size={24} className="mr-2 animate-spin" />
          Loading ops workspace...
        </div>
      ) : activeView === 'tenants' ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
          <section className="space-y-4">
            <div className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800 md:flex-row">
              <div className="relative flex-1">
                <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-10 pr-3 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  placeholder="Search name, slug, or domain"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              >
                <option value="ALL">All statuses</option>
                {STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
              <select
                value={planFilter}
                onChange={(event) => setPlanFilter(event.target.value)}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              >
                <option value="ALL">All plans</option>
                {PLANS.map((plan) => <option key={plan} value={plan}>{plan}</option>)}
              </select>
            </div>

            <div className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-800">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-slate-700">
                  <thead className="bg-gray-50 dark:bg-slate-900">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-300">Tenant</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-300">Plan</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-300">Status</th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-600 dark:text-gray-300">Users</th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-600 dark:text-gray-300">Students</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                    {tenants.map((tenant) => (
                      <tr
                        key={tenant.id}
                        className={`cursor-pointer hover:bg-blue-50/60 dark:hover:bg-slate-700/60 ${selectedTenant?.id === tenant.id ? 'bg-blue-50 dark:bg-slate-700' : ''}`}
                        onClick={() => selectTenant(tenant)}
                      >
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900 dark:text-white">{tenant.name}</div>
                          <div className="text-xs text-gray-500">
                            {tenant.slug}{tenant.domain ? ` / ${tenant.domain}` : ''}
                            {tenant.maintenanceMode && <span className="ml-2 font-semibold text-amber-600 dark:text-amber-300">Maintenance</span>}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${planClass(tenant.plan)}`}>{tenant.plan}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${statusClass(tenant.status)}`}>{tenant.status}</span>
                        </td>
                        <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">{tenant.counts?.users ?? 0}</td>
                        <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">{tenant.counts?.students ?? 0}</td>
                        <td className="px-4 py-3 text-right"><ChevronRight size={16} className="ml-auto text-gray-400" /></td>
                      </tr>
                    ))}
                    {tenants.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-12 text-center text-gray-500">No tenants match the current filters.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <aside className="rounded-lg border border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-800">
            {!selectedTenant ? (
              <div className="p-8 text-center">
                <Building2 size={36} className="mx-auto text-gray-300" />
                <h2 className="mt-3 font-semibold text-gray-900 dark:text-white">Select a tenant</h2>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Tenant controls, limits, feature flags, and admins appear here.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-slate-700">
                <div className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-bold text-gray-900 dark:text-white">{selectedTenant.name}</h2>
                      <p className="text-sm text-gray-500">{selectedTenant.slug}</p>
                    </div>
                    <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${statusClass(selectedTenant.status)}`}>{selectedTenant.status}</span>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-gray-500">Users</p>
                      <p className="font-semibold text-gray-900 dark:text-white">{selectedTenant.counts.users} / {selectedTenant.maxUsers}</p>
                      <div className="mt-2 h-2 rounded-full bg-gray-100 dark:bg-slate-700">
                        <div className="h-2 rounded-full bg-blue-600" style={{ width: `${tenantUtilization.users}%` }} />
                      </div>
                    </div>
                    <div>
                      <p className="text-gray-500">Students</p>
                      <p className="font-semibold text-gray-900 dark:text-white">{selectedTenant.counts.students} / {selectedTenant.maxStudents}</p>
                      <div className="mt-2 h-2 rounded-full bg-gray-100 dark:bg-slate-700">
                        <div className="h-2 rounded-full bg-emerald-600" style={{ width: `${tenantUtilization.students}%` }} />
                      </div>
                    </div>
                  </div>
                  {selectedTenant.maintenanceMode && (
                    <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
                      {selectedTenant.maintenanceMessage || 'Maintenance mode is enabled.'}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3 p-5 text-sm">
                  <div className="rounded-lg border border-gray-200 p-3 dark:border-slate-700">
                    <p className="text-xs font-medium text-gray-500">AI requests 30d</p>
                    <p className="mt-1 text-lg font-bold text-gray-900 dark:text-white">{selectedTenant.usage?.ai30d.requests ?? 0}</p>
                    <p className="text-xs text-red-500">{selectedTenant.usage?.ai30d.failures ?? 0} failures</p>
                  </div>
                  <div className="rounded-lg border border-gray-200 p-3 dark:border-slate-700">
                    <p className="text-xs font-medium text-gray-500">Payments 30d</p>
                    <p className="mt-1 text-lg font-bold text-gray-900 dark:text-white">{selectedTenant.currency} {(selectedTenant.usage?.billing30d.paymentAmount ?? 0).toLocaleString()}</p>
                    <p className="text-xs text-gray-500">{selectedTenant.usage?.billing30d.paymentCount ?? 0} payments</p>
                  </div>
                  <div className="rounded-lg border border-gray-200 p-3 dark:border-slate-700">
                    <p className="text-xs font-medium text-gray-500">Overdue invoices</p>
                    <p className="mt-1 text-lg font-bold text-gray-900 dark:text-white">{selectedTenant.usage?.billing30d.overdueInvoiceCount ?? 0}</p>
                    <p className="text-xs text-gray-500">{selectedTenant.currency} {(selectedTenant.usage?.billing30d.overdueBalance ?? 0).toLocaleString()} due</p>
                  </div>
                  <div className="rounded-lg border border-gray-200 p-3 dark:border-slate-700">
                    <p className="text-xs font-medium text-gray-500">AI tokens 30d</p>
                    <p className="mt-1 text-lg font-bold text-gray-900 dark:text-white">{(selectedTenant.usage?.ai30d.tokens ?? 0).toLocaleString()}</p>
                    <p className="text-xs text-gray-500">{selectedTenant.usage?.ai30d.byFeature?.[0]?.feature || 'No feature usage'}</p>
                  </div>
                </div>

                <div className="space-y-3 p-5">
                  <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
                    <SlidersHorizontal size={16} />
                    Tenant controls
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="text-xs font-medium text-gray-500">
                      Name
                      <input value={editForm.name || ''} onChange={(event) => setEditForm({ ...editForm, name: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
                    </label>
                    <label className="text-xs font-medium text-gray-500">
                      Domain
                      <input value={editForm.domain || ''} onChange={(event) => setEditForm({ ...editForm, domain: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
                    </label>
                    <label className="text-xs font-medium text-gray-500">
                      Plan
                      <select value={editForm.plan || 'FREE'} onChange={(event) => setEditForm({ ...editForm, plan: event.target.value as TenantPlan })} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white">
                        {PLANS.map((plan) => <option key={plan} value={plan}>{plan}</option>)}
                      </select>
                    </label>
                    <label className="text-xs font-medium text-gray-500">
                      Status
                      <select value={editForm.status || 'ACTIVE'} onChange={(event) => setEditForm({ ...editForm, status: event.target.value as TenantStatus })} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white">
                        {STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                      </select>
                    </label>
                    <label className="text-xs font-medium text-gray-500">
                      Max users
                      <input type="number" value={editForm.maxUsers || 1} onChange={(event) => setEditForm({ ...editForm, maxUsers: Number(event.target.value) })} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
                    </label>
                    <label className="text-xs font-medium text-gray-500">
                      Max students
                      <input type="number" value={editForm.maxStudents || 1} onChange={(event) => setEditForm({ ...editForm, maxStudents: Number(event.target.value) })} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
                    </label>
                  </div>
                  <div className="rounded-lg border border-gray-200 p-3 dark:border-slate-700">
                    <label className="flex items-center justify-between gap-3 text-sm font-medium text-gray-900 dark:text-white">
                      <span className="inline-flex items-center gap-2"><Wrench size={16} /> Maintenance mode</span>
                      <input
                        type="checkbox"
                        checked={Boolean(editForm.maintenanceMode)}
                        onChange={(event) => setEditForm({ ...editForm, maintenanceMode: event.target.checked })}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                    </label>
                    <textarea
                      value={editForm.maintenanceMessage || ''}
                      onChange={(event) => setEditForm({ ...editForm, maintenanceMessage: event.target.value })}
                      className="mt-3 min-h-[72px] w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                      placeholder="Maintenance message"
                    />
                    <button
                      onClick={() => setMaintenanceMode(Boolean(editForm.maintenanceMode))}
                      disabled={saving}
                      className="mt-2 w-full rounded-lg border border-amber-200 px-3 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-60 dark:border-amber-800 dark:text-amber-300"
                    >
                      Apply maintenance
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={saveTenant} disabled={saving} className="flex-1 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">Save</button>
                    {selectedTenant.status === 'SUSPENDED' ? (
                      <button onClick={() => setTenantStatus('ACTIVE')} disabled={saving} className="rounded-lg border border-emerald-200 px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300">Activate</button>
                    ) : (
                      <button onClick={() => setTenantStatus('SUSPENDED')} disabled={saving} className="rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300">Suspend</button>
                    )}
                  </div>
                </div>

                <div className="space-y-3 p-5">
                  <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
                    <CheckCircle2 size={16} />
                    Onboarding
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="text-xs font-medium text-gray-500">
                      Status
                      <select
                        value={(editForm.onboardingStatus as TenantOnboardingStatus) || selectedTenant.onboardingStatus}
                        onChange={(event) => setEditForm({ ...editForm, onboardingStatus: event.target.value as TenantOnboardingStatus })}
                        className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                      >
                        {ONBOARDING_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                      </select>
                    </label>
                    <label className="text-xs font-medium text-gray-500">
                      Onboarding owner
                      <input
                        value={editForm.onboardingOwner || ''}
                        onChange={(event) => setEditForm({ ...editForm, onboardingOwner: event.target.value })}
                        className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                        placeholder="Assigned ops owner"
                      />
                    </label>
                  </div>
                  <textarea
                    value={editForm.onboardingNotes || ''}
                    onChange={(event) => setEditForm({ ...editForm, onboardingNotes: event.target.value })}
                    className="min-h-[72px] w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    placeholder="Onboarding notes, blockers, next steps"
                  />
                  <div className="grid grid-cols-1 gap-2">
                    {Object.entries(onboardingTaskLabels).map(([taskKey, label]) => {
                      const checklist = (editForm.onboardingChecklist || selectedTenant.onboardingChecklist || {}) as Record<string, boolean>;
                      const done = Boolean(checklist[taskKey]);
                      return (
                        <button
                          key={taskKey}
                          onClick={() => toggleOnboardingTask(taskKey)}
                          className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-left text-sm hover:bg-gray-50 dark:border-slate-700 dark:hover:bg-slate-700"
                        >
                          <span className="font-medium text-gray-900 dark:text-white">{label}</span>
                          {done ? <CheckCircle2 size={18} className="text-emerald-600" /> : <XCircle size={18} className="text-gray-300" />}
                        </button>
                      );
                    })}
                  </div>
                  <button onClick={saveOnboarding} disabled={saving} className="w-full rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">
                    Save onboarding
                  </button>
                </div>

                <div className="space-y-3 p-5">
                  <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
                    <Building2 size={16} />
                    Custom domain
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 p-3 dark:border-slate-700">
                    <div>
                      <p className="text-xs font-medium text-gray-500">Status</p>
                      <span className={`mt-1 inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${domainStatusClass(selectedTenant.domainStatus)}`}>
                        {selectedTenant.domainStatus}
                      </span>
                    </div>
                    <div className="text-right text-xs text-gray-500">
                      {selectedTenant.domainLastCheckedAt && !selectedTenant.domainVerifiedAt
                        ? `Last checked ${new Date(selectedTenant.domainLastCheckedAt).toLocaleString()}`
                        : null}
                      <br />
                      {selectedTenant.domainVerifiedAt
                        ? `Verified ${new Date(selectedTenant.domainVerifiedAt).toLocaleString()}`
                        : selectedTenant.domainRequestedAt
                          ? `Requested ${new Date(selectedTenant.domainRequestedAt).toLocaleString()}`
                          : 'No custom domain yet'}
                    </div>
                  </div>
                  {selectedTenant.domainInstructions && (
                    <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800 dark:border-blue-900 dark:bg-blue-950/20 dark:text-blue-200">
                      <p className="font-semibold">DNS setup instructions</p>
                      <p className="mt-2">Create CNAME: <span className="font-mono">{selectedTenant.domainInstructions.host}</span> → <span className="font-mono">{selectedTenant.domainInstructions.target}</span></p>
                      <p className="mt-1">Create TXT: <span className="font-mono">{selectedTenant.domainInstructions.txtName}</span> = <span className="font-mono">{selectedTenant.domainInstructions.txtValue}</span></p>
                    </div>
                  )}
                  {domainCheckResult && (
                    <div className={`rounded-lg border p-3 text-xs ${domainCheckResult.verified ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-200' : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-200'}`}>
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-semibold">Latest DNS check</p>
                        <span>{new Date(domainCheckResult.checkedAt).toLocaleString()}</span>
                      </div>
                      <p className="mt-2">{domainCheckResult.summary}</p>
                      <div className="mt-3 space-y-2">
                        <div>
                          <p className="font-semibold">CNAME</p>
                          <p>Expected: <span className="font-mono">{domainCheckResult.cname.expected || '—'}</span></p>
                          <p>Resolved: <span className="font-mono">{domainCheckResult.cname.resolved.length ? domainCheckResult.cname.resolved.join(', ') : domainCheckResult.cname.error || 'Not found'}</span></p>
                        </div>
                        <div>
                          <p className="font-semibold">TXT</p>
                          <p>Expected: <span className="font-mono">{domainCheckResult.txt.expected || '—'}</span></p>
                          <p>Resolved: <span className="font-mono">{domainCheckResult.txt.resolved.length ? domainCheckResult.txt.resolved.join(', ') : domainCheckResult.txt.error || 'Not found'}</span></p>
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button onClick={setupCustomDomain} disabled={saving || !editForm.domain} className="flex-1 rounded-lg border border-blue-200 px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-60 dark:border-blue-800 dark:text-blue-300">
                      Setup / refresh domain
                    </button>
                    <button onClick={checkCustomDomain} disabled={saving || !selectedTenant.domain} className="rounded-lg border border-indigo-200 px-3 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-60 dark:border-indigo-800 dark:text-indigo-300">
                      Check DNS now
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => verifyCustomDomain('VERIFIED')} disabled={saving || !selectedTenant.domain} className="flex-1 rounded-lg border border-emerald-200 px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-60 dark:border-emerald-800 dark:text-emerald-300">
                      Override verified
                    </button>
                    <button onClick={() => verifyCustomDomain('FAILED')} disabled={saving || !selectedTenant.domain} className="rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60 dark:border-red-800 dark:text-red-300">
                      Override failed
                    </button>
                  </div>
                </div>

                <div className="space-y-3 p-5">
                  <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
                    <ToggleRight size={16} />
                    Feature flags
                  </div>
                  <div className="grid grid-cols-1 gap-2">
                    {selectedTenant.features.map((feature) => (
                      <button
                        key={feature.feature}
                        onClick={() => toggleFeature(feature.feature, !feature.enabled)}
                        className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-left text-sm hover:bg-gray-50 dark:border-slate-700 dark:hover:bg-slate-700"
                      >
                        <span>
                          <span className="font-medium text-gray-900 dark:text-white">{featureLabels[feature.feature] || feature.feature}</span>
                          {feature.hasOverride && <span className="ml-2 text-xs text-blue-600 dark:text-blue-300">Override</span>}
                        </span>
                        {feature.enabled ? <ToggleRight size={22} className="text-emerald-600" /> : <ToggleLeft size={22} className="text-gray-400" />}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-3 p-5">
                  <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
                    <Lock size={16} />
                    Admin accounts
                  </div>
                  <input
                    value={impersonationReason}
                    onChange={(event) => setImpersonationReason(event.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    placeholder="Impersonation reason"
                  />
                  <div className="space-y-2">
                    {selectedTenant.admins.map((admin) => (
                      <div key={admin.id} className="rounded-lg border border-gray-200 p-3 dark:border-slate-700">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-medium text-gray-900 dark:text-white">{admin.fullName}</p>
                            <p className="text-xs text-gray-500">{admin.email} / {admin.role}</p>
                          </div>
                          <span className={`rounded-full px-2 py-1 text-xs font-medium ${admin.isActive ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300' : 'bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-gray-300'}`}>
                            {admin.isActive ? 'Active' : 'Disabled'}
                          </span>
                        </div>
                        <div className="mt-3 flex gap-2">
                          <button onClick={() => setAdminStatus(admin, !admin.isActive)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-slate-700 dark:text-gray-200">
                            {admin.isActive ? 'Disable' : 'Enable'}
                          </button>
                          <button onClick={() => resetAdminPassword(admin)} className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-slate-700 dark:text-gray-200">
                            <KeyRound size={13} />
                            Reset password
                          </button>
                          <button onClick={() => impersonateAdmin(admin)} className="inline-flex items-center gap-1 rounded-lg border border-blue-200 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50 dark:border-blue-800 dark:text-blue-300">
                            <Eye size={13} />
                            Impersonate
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </aside>
        </div>
      ) : activeView === 'health' ? (
        <section className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
            <div className="flex items-center gap-2 font-semibold text-gray-900 dark:text-white"><Server size={18} /> API</div>
            <p className="mt-4 text-3xl font-bold text-gray-900 dark:text-white">{health?.api.status || 'unknown'}</p>
            <p className="mt-1 text-sm text-gray-500">Uptime {health?.api.uptimeSeconds?.toLocaleString() || 0}s</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
            <div className="flex items-center gap-2 font-semibold text-gray-900 dark:text-white"><Database size={18} /> Database</div>
            <p className="mt-4 text-3xl font-bold text-gray-900 dark:text-white">{health?.database.status || 'unknown'}</p>
            <p className="mt-1 text-sm text-gray-500">{health?.database.latencyMs ?? 0} ms latency</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
            <div className="flex items-center gap-2 font-semibold text-gray-900 dark:text-white"><Activity size={18} /> Last 24h</div>
            <p className="mt-4 text-sm text-gray-600 dark:text-gray-300">Audit events: <span className="font-semibold">{health?.auditEvents24h ?? 0}</span></p>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">AI failures: <span className="font-semibold">{health?.aiFailures24h ?? 0}</span></p>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">Heap: <span className="font-semibold">{formatBytes(health?.memory?.heapUsed)}</span></p>
          </div>
        </section>
      ) : activeView === 'operations' ? (
        <section className="rounded-lg border border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-800">
          <div className="border-b border-gray-200 p-4 dark:border-slate-700">
            <h2 className="font-semibold text-gray-900 dark:text-white">Operations feed</h2>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-slate-700">
            {operationsFeed.map((event) => (
              <div key={event.id} className="flex items-start gap-3 p-4">
                <div className={`mt-0.5 rounded-lg p-2 ${
                  event.severity === 'critical'
                    ? 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-300'
                    : event.severity === 'warning'
                      ? 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-300'
                      : 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-300'
                }`}>
                  <FileWarning size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-gray-900 dark:text-white">{event.title}</p>
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-slate-700 dark:text-gray-300">{event.type.replace(/_/g, ' ')}</span>
                  </div>
                  <p className="mt-1 text-sm text-gray-500">{event.detail || event.tenantId}</p>
                </div>
                <span className="text-xs text-gray-400">{new Date(event.createdAt).toLocaleString()}</span>
              </div>
            ))}
            {operationsFeed.length === 0 && (
              <div className="p-10 text-center text-gray-500">No operational events in the current window.</div>
            )}
          </div>
        </section>
      ) : activeView === 'security' ? (
        <section className="rounded-lg border border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-800">
          <div className="border-b border-gray-200 p-4 dark:border-slate-700">
            <h2 className="font-semibold text-gray-900 dark:text-white">Security events {selectedTenant ? `for ${selectedTenant.name}` : ''}</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-slate-700">
              <thead className="bg-gray-50 dark:bg-slate-900">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-300">Time</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-300">Event</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-300">Entity</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-300">Tenant</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-300">IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                {securityEvents.map((event) => (
                  <tr key={event.id}>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{new Date(event.createdAt).toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
                        event.action === 'LOGIN_FAILED'
                          ? 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300'
                          : 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300'
                      }`}>
                        {event.action.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{event.entityType}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{event.tenantId}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{event.ipAddress || '-'}</td>
                  </tr>
                ))}
                {securityEvents.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-12 text-center text-gray-500">No security events found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <section className="rounded-lg border border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-800">
          <div className="border-b border-gray-200 p-4 dark:border-slate-700">
            <h2 className="font-semibold text-gray-900 dark:text-white">Audit events {selectedTenant ? `for ${selectedTenant.name}` : ''}</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-slate-700">
              <thead className="bg-gray-50 dark:bg-slate-900">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-300">Time</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-300">Action</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-300">Entity</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-300">Tenant</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-300">IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                {auditLogs.map((log) => (
                  <tr key={log.id}>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{new Date(log.createdAt).toLocaleString()}</td>
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{log.action}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{log.entityType}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{log.tenantId}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{log.ipAddress || '-'}</td>
                  </tr>
                ))}
                {auditLogs.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-12 text-center text-gray-500">No audit events found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg bg-white shadow-xl dark:bg-slate-900">
            <form onSubmit={handleCreateTenant} className="space-y-5 p-5">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-lg font-bold text-gray-900 dark:text-white">Create tenant</h2>
                  <p className="text-sm text-gray-500">Provision a school, main campus, settings, and first admin.</p>
                </div>
                <button type="button" onClick={() => setShowCreate(false)} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-800">
                  <XCircle size={20} />
                </button>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <input required value={createForm.name} onChange={(e) => setCreateForm({ ...createForm, name: e.target.value, slug: createForm.slug || e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') })} className="rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" placeholder="School name" />
                <input required value={createForm.slug} onChange={(e) => setCreateForm({ ...createForm, slug: e.target.value.toLowerCase() })} className="rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" placeholder="tenant-slug" />
                <input value={createForm.domain} onChange={(e) => setCreateForm({ ...createForm, domain: e.target.value })} className="rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" placeholder="Domain" />
                <select value={createForm.plan} onChange={(e) => setCreateForm({ ...createForm, plan: e.target.value as TenantPlan })} className="rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white">
                  {PLANS.map((plan) => <option key={plan} value={plan}>{plan}</option>)}
                </select>
                <input required value={createForm.adminFullName} onChange={(e) => setCreateForm({ ...createForm, adminFullName: e.target.value })} className="rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" placeholder="Admin full name" />
                <input required type="email" value={createForm.adminEmail} onChange={(e) => setCreateForm({ ...createForm, adminEmail: e.target.value })} className="rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" placeholder="Admin email" />
                <input required type="password" value={createForm.adminPassword} onChange={(e) => setCreateForm({ ...createForm, adminPassword: e.target.value })} className="rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" placeholder="Admin temporary password" />
                <input value={createForm.branchName} onChange={(e) => setCreateForm({ ...createForm, branchName: e.target.value })} className="rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" placeholder="Main branch name" />
                <input value={createForm.branchCode} onChange={(e) => setCreateForm({ ...createForm, branchCode: e.target.value.toUpperCase() })} className="rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" placeholder="Branch code" />
                <input type="number" value={createForm.maxUsers} onChange={(e) => setCreateForm({ ...createForm, maxUsers: Number(e.target.value) })} className="rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" placeholder="Max users" />
                <input type="number" value={createForm.maxStudents} onChange={(e) => setCreateForm({ ...createForm, maxStudents: Number(e.target.value) })} className="rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" placeholder="Max students" />
                <input type="date" value={createForm.trialEndsAt} onChange={(e) => setCreateForm({ ...createForm, trialEndsAt: e.target.value })} className="rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowCreate(false)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-slate-700 dark:text-gray-200">Cancel</button>
                <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
                  {saving && <Loader2 size={16} className="animate-spin" />}
                  Create tenant
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {temporaryPassword && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl dark:bg-slate-900">
            <div className="flex items-center gap-2 text-lg font-bold text-gray-900 dark:text-white"><KeyRound size={20} /> Temporary password</div>
            <p className="mt-2 text-sm text-gray-500">Share this once with the admin, then ask them to change it after signing in.</p>
            <div className="mt-4 rounded-lg bg-gray-100 p-3 font-mono text-sm text-gray-900 dark:bg-slate-800 dark:text-white">{temporaryPassword}</div>
            <button onClick={() => setTemporaryPassword('')} className="mt-4 w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">Done</button>
          </div>
        </div>
      )}
    </main>
    </div>
  );
};

export default OpsDashboard;
