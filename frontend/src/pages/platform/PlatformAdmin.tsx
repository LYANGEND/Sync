import { useState, useEffect } from 'react';
import {
    Building2,
    Users,
    GraduationCap,
    DollarSign,
    AlertTriangle,
    CheckCircle,
    XCircle,
    Clock,
    TrendingUp,
    Search,
    Filter,
    Ban,
    CheckSquare,
    LogOut,
    BarChart3,
    CreditCard,
    Settings,
    Eye,
    EyeOff,
    Briefcase,
    Target,
    Phone,
    Mail,
    Calendar,
    CheckCircle2,
    Plus,
    MessageSquare,
    RefreshCw,
    Save,
} from 'lucide-react';

interface DashboardStats {
    totals: {
        tenants: number;
        students: number;
        users: number;
        revenue: number;
    };
    tenantsByStatus: Record<string, number>;
    tenantsByTier: Record<string, number>;
    revenueByMonth: Record<string, number>;
    recentPayments: Array<{
        id: string;
        tenantName: string;
        planName: string;
        amount: number;
        currency: string;
        paidAt: string;
    }>;
    expiringSubscriptions: Array<{
        id: string;
        name: string;
        tier: string;
        subscriptionEndsAt: string;
    }>;
}

interface Tenant {
    id: string;
    name: string;
    slug: string;
    email: string;
    tier: string;
    status: string;
    currentStudentCount: number;
    maxStudents: number;
    subscriptionEndsAt: string | null;
    createdAt: string;
}

interface Payment {
    id: string;
    tenant: { name: string };
    plan: { name: string; tier: string };
    totalAmount: number;
    currency: string;
    status: string;
    paymentMethod: string;
    createdAt: string;
}

interface SmsConfig {
    platformSettings: {
        smsProvider: string;
        smsDefaultSenderId: string;
        smsBalanceUnits: number;
        smsCostPerUnit: number;
    };
    tenants: Array<{
        id: string;
        name: string;
        slug: string;
        tier: string;
        status: string;
        smsEnabled: boolean;
        smsSenderId: string | null;
    }>;
}

interface PlatformSettings {
    id: string;
    smsProvider: string;
    smsApiUrl: string | null;
    smsApiKey: string | null;
    smsApiSecret: string | null;
    smsDefaultSenderId: string | null;
    smsBalanceUnits: number;
    smsCostPerUnit: number;
    platformName: string;
    supportEmail: string | null;
    supportPhone: string | null;
}

interface Lead {
    id: string;
    schoolName: string;
    contactName: string;
    contactEmail?: string;
    status: 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'PROPOSAL' | 'NEGOTIATION' | 'WON' | 'LOST';
    source: string;
    assignedTo: { fullName: string } | null;
    createdAt: string;
    notes?: string;
    _count?: {
        activities: number;
        tasks: number;
    };
}

interface Task {
    id: string;
    title: string;
    description: string | null;
    status: 'PENDING' | 'COMPLETED' | 'OVERDUE';
    priority: 'LOW' | 'MEDIUM' | 'HIGH';
    dueDate: string | null;
    assignedTo: { fullName: string } | null;
    createdAt: string;
}

interface Activity {
    id: string;
    type: 'CALL' | 'EMAIL' | 'MEETING' | 'NOTE' | 'STATUS_CHANGE';
    description: string;
    createdAt: string;
    performedBy: { fullName: string };
}

interface Deal {
    id: string;
    name: string;
    value: number;
    stage: string;
    lead: { schoolName: string };
    owner: { fullName: string } | null;
    createdAt: string;
}

interface PipelineStats {
    totalValue: number;
    totalDeals: number;
    byStage: Record<string, number>;
}

const API_URL = 'http://localhost:3000';

const PlatformAdmin = () => {
    const [token, setToken] = useState<string | null>(localStorage.getItem('platform_token'));
    const [activeTab, setActiveTab] = useState<'dashboard' | 'tenants' | 'payments' | 'sms' | 'settings' | 'crm'>('dashboard');
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [tenants, setTenants] = useState<Tenant[]>([]);
    const [payments, setPayments] = useState<Payment[]>([]);
    const [smsConfig, setSmsConfig] = useState<SmsConfig | null>(null);
    const [platformSettings, setPlatformSettings] = useState<PlatformSettings | null>(null);
    const [leads, setLeads] = useState<Lead[]>([]);
    const [tasks, setTasks] = useState<Task[]>([]);
    const [pipeline, setPipeline] = useState<{ deals: Deal[]; stats: PipelineStats } | null>(null);
    const [showingLeadForm, setShowingLeadForm] = useState(false);
    const [leadForm, setLeadForm] = useState({
        schoolName: '',
        contactName: '',
        contactEmail: '',
        source: 'WEBSITE',
        status: 'NEW'
    });
    const [viewingLeadId, setViewingLeadId] = useState<string | null>(null);

    const [leadDetails, setLeadDetails] = useState<Lead & { activities: Activity[], tasks: Task[] } | null>(null);
    const [newActivity, setNewActivity] = useState({ type: 'NOTE', description: '' });
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [loginForm, setLoginForm] = useState({ email: '', password: '' });
    const [loginError, setLoginError] = useState('');
    const [editingSenderId, setEditingSenderId] = useState<string | null>(null);
    const [senderIdInput, setSenderIdInput] = useState('');
    const [showApiKey, setShowApiKey] = useState(false);
    const [showApiSecret, setShowApiSecret] = useState(false);
    const [settingsForm, setSettingsForm] = useState({
        smsProvider: 'africastalking',
        smsApiUrl: '',
        smsApiKey: '',
        smsApiSecret: '',
        smsDefaultSenderId: 'SYNC',
        smsCostPerUnit: 0.15,
    });

    // Login handler
    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setLoginError('');

        try {
            const response = await fetch(`${API_URL}/api/platform/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(loginForm),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Login failed');
            }

            localStorage.setItem('platform_token', data.token);
            setToken(data.token);
        } catch (error: any) {
            setLoginError(error.message);
        } finally {
            setLoading(false);
        }
    };

    // Logout
    const handleLogout = () => {
        localStorage.removeItem('platform_token');
        setToken(null);
    };

    // Fetch data
    const fetchDashboard = async () => {
        if (!token) return;
        setLoading(true);
        try {
            const response = await fetch(`${API_URL}/api/platform/dashboard`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (response.ok) {
                const data = await response.json();
                setStats(data);
            }
        } catch (error) {
            console.error('Failed to fetch dashboard:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchTenants = async () => {
        if (!token) return;
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (searchTerm) params.append('search', searchTerm);
            if (statusFilter) params.append('status', statusFilter);

            const response = await fetch(`${API_URL}/api/platform/tenants?${params}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (response.ok) {
                const data = await response.json();
                setTenants(data.tenants);
            }
        } catch (error) {
            console.error('Failed to fetch tenants:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchPayments = async () => {
        if (!token) return;
        setLoading(true);
        try {
            const response = await fetch(`${API_URL}/api/platform/payments`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (response.ok) {
                const data = await response.json();
                setPayments(data.payments);
            }
        } catch (error) {
            console.error('Failed to fetch payments:', error);
        } finally {
            setLoading(false);
        }
    };

    const confirmPayment = async (paymentId: string) => {
        if (!token) return;
        if (!window.confirm('Confirm this payment and activate subscription?')) return;

        try {
            const response = await fetch(`${API_URL}/api/platform/payments/${paymentId}/confirm`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ externalRef: 'Manual confirmation' }),
            });

            if (response.ok) {
                alert('Payment confirmed!');
                fetchPayments();
                fetchDashboard();
            } else {
                const data = await response.json();
                alert(data.error || 'Failed to confirm payment');
            }
        } catch (error) {
            console.error('Failed to confirm payment:', error);
        }
    };

    const suspendTenant = async (tenantId: string) => {
        if (!token) return;
        if (!window.confirm('Are you sure you want to suspend this tenant?')) return;

        try {
            const response = await fetch(`${API_URL}/api/platform/tenants/${tenantId}/suspend`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ reason: 'Administrative action' }),
            });

            if (response.ok) {
                alert('Tenant suspended');
                fetchTenants();
            }
        } catch (error) {
            console.error('Failed to suspend tenant:', error);
        }
    };

    const activateTenant = async (tenantId: string) => {
        if (!token) return;
        if (!window.confirm('Activate this tenant?')) return;

        try {
            const response = await fetch(`${API_URL}/api/platform/tenants/${tenantId}/activate`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            });

            if (response.ok) {
                alert('Tenant activated');
                fetchTenants();
            }
        } catch (error) {
            console.error('Failed to activate tenant:', error);
        }
    };

    const fetchSmsConfig = async () => {
        if (!token) return;
        try {
            const response = await fetch(`${API_URL}/api/platform/sms/tenants`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (response.ok) {
                const data = await response.json();
                setSmsConfig(data);
            }
        } catch (error) {
            console.error('Failed to fetch SMS config:', error);
        }
    };

    const updateTenantSenderId = async (tenantId: string, senderId: string, smsEnabled: boolean) => {
        if (!token) return;
        try {
            const response = await fetch(`${API_URL}/api/platform/sms/tenants/${tenantId}`, {
                method: 'PUT',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ smsSenderId: senderId, smsEnabled }),
            });

            if (response.ok) {
                setEditingSenderId(null);
                fetchSmsConfig();
            } else {
                const data = await response.json();
                alert(data.error || 'Failed to update');
            }
        } catch (error) {
            console.error('Failed to update tenant SMS:', error);
        }
    };

    const fetchPlatformSettings = async () => {
        if (!token) return;
        try {
            const response = await fetch(`${API_URL}/api/platform/settings`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (response.ok) {
                const data = await response.json();
                setPlatformSettings(data);
                setSettingsForm({
                    smsProvider: data.smsProvider || 'africastalking',
                    smsApiUrl: data.smsApiUrl || '',
                    smsApiKey: data.smsApiKey === '********' ? '' : (data.smsApiKey || ''),
                    smsApiSecret: data.smsApiSecret === '********' ? '' : (data.smsApiSecret || ''),
                    smsDefaultSenderId: data.smsDefaultSenderId || 'SYNC',
                    smsCostPerUnit: Number(data.smsCostPerUnit) || 0.15,
                });
            }
        } catch (error) {
            console.error('Failed to fetch platform settings:', error);
        }
    };

    const savePlatformSettings = async () => {
        if (!token) return;
        setLoading(true);
        try {
            const response = await fetch(`${API_URL}/api/platform/settings`, {
                method: 'PUT',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(settingsForm),
            });

            if (response.ok) {
                alert('Settings saved successfully!');
                fetchPlatformSettings();
            } else {
                const data = await response.json();
                alert(data.error || 'Failed to save settings');
            }
        } catch (error) {
            console.error('Failed to save settings:', error);
        } finally {
            setLoading(false);
        }
    };

    const saveLead = async () => {
        if (!token) return;
        setLoading(true);
        try {
            const response = await fetch(`${API_URL}/api/platform/crm/leads`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(leadForm)
            });

            if (response.ok) {
                setShowingLeadForm(false);
                setLeadForm({ schoolName: '', contactName: '', contactEmail: '', source: 'WEBSITE', status: 'NEW' });
                alert('Lead created successfully');
                fetchCrmData();
            } else {
                const data = await response.json();
                alert(data.error || 'Failed to create lead');
            }
        } catch (error) {
            console.error('Failed to create lead:', error);
        } finally {
            setLoading(false);
        }
    };

    const updateLeadStatus = async (leadId: string, status: string) => {
        if (!token) return;
        try {
            const response = await fetch(`${API_URL}/api/platform/crm/leads/${leadId}`, {
                method: 'PUT',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ status })
            });

            if (response.ok) {
                fetchCrmData();
            }
        } catch (error) {
            console.error('Failed to update lead status:', error);
        }
    };

    const fetchCrmData = async () => {
        if (!token) return;
        try {
            const [leadsRes, pipelineRes, tasksRes] = await Promise.all([
                fetch(`${API_URL}/api/platform/crm/leads`, {
                    headers: { Authorization: `Bearer ${token}` }
                }),
                fetch(`${API_URL}/api/platform/crm/pipeline`, {
                    headers: { Authorization: `Bearer ${token}` }
                }),
                fetch(`${API_URL}/api/platform/crm/tasks`, {
                    headers: { Authorization: `Bearer ${token}` }
                })
            ]);

            if (leadsRes.ok) {
                const leadsData = await leadsRes.json();
                setLeads(leadsData);
            }

            if (pipelineRes.ok) {
                const pipelineData = await pipelineRes.json();
                setPipeline(pipelineData);
            }

            if (tasksRes.ok) {
                const tasksData = await tasksRes.json();
                setTasks(tasksData);
            }
        } catch (error) {
            console.error('Failed to fetch CRM data:', error);
        }
    };

    const fetchLeadDetails = async (id: string) => {
        if (!token) return;
        setLeadDetails(null);
        try {
            const res = await fetch(`${API_URL}/api/platform/crm/leads/${id}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                setLeadDetails(await res.json());
            }
        } catch (err) {
            console.error(err);
        }
    };

    useEffect(() => {
        if (viewingLeadId) {
            fetchLeadDetails(viewingLeadId);
        }
    }, [viewingLeadId]);

    const logActivity = async () => {
        if (!token || !viewingLeadId) return;
        try {
            const res = await fetch(`${API_URL}/api/platform/crm/activities`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    leadId: viewingLeadId,
                    type: newActivity.type,
                    description: newActivity.description
                })
            });

            if (res.ok) {
                setNewActivity({ type: 'NOTE', description: '' });
                fetchLeadDetails(viewingLeadId);
            }
        } catch (error) {
            console.error('Failed to log activity:', error);
        }
    };

    useEffect(() => {
        if (token) {
            fetchDashboard();
            fetchTenants();
            fetchPayments();
            fetchSmsConfig();
            fetchPlatformSettings();
            fetchCrmData();
        }
    }, [token]);

    // Re-fetch CRM data when tab changes to CRM
    useEffect(() => {
        if (token && activeTab === 'crm') {
            fetchCrmData();
        }
    }, [activeTab]);

    // Login screen
    if (!token) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
                <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 w-full max-w-md border border-white/20">
                    <div className="text-center mb-8">
                        <div className="w-16 h-16 bg-purple-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
                            <Building2 className="w-8 h-8 text-white" />
                        </div>
                        <h1 className="text-2xl font-bold text-white">Platform Admin</h1>
                        <p className="text-purple-200 mt-1">Sync School Management</p>
                    </div>

                    <form onSubmit={handleLogin} className="space-y-4">
                        {loginError && (
                            <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-3 text-red-200 text-sm">
                                {loginError}
                            </div>
                        )}

                        <div>
                            <label className="block text-purple-200 text-sm mb-1">Email</label>
                            <input
                                type="email"
                                value={loginForm.email}
                                onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
                                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-500"
                                placeholder="admin@sync.com"
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-purple-200 text-sm mb-1">Password</label>
                            <input
                                type="password"
                                value={loginForm.password}
                                onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-500"
                                placeholder="••••••••"
                                required
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
                        >
                            {loading ? 'Signing in...' : 'Sign In'}
                        </button>
                    </form>
                </div>
            </div>
        );
    }

    // Dashboard
    return (
        <div className="min-h-screen bg-slate-100">
            {/* Header */}
            <header className="bg-slate-900 text-white px-6 py-4">
                <div className="flex items-center justify-between max-w-7xl mx-auto">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-purple-500 rounded-xl flex items-center justify-center">
                            <Building2 className="w-5 h-5" />
                        </div>
                        <div>
                            <h1 className="font-bold">Platform Admin</h1>
                            <p className="text-xs text-slate-400">Sync School Management</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => { fetchDashboard(); fetchTenants(); fetchPayments(); }}
                            className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
                            title="Refresh"
                        >
                            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
                        </button>
                        <button
                            onClick={handleLogout}
                            className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
                        >
                            <LogOut className="w-4 h-4" />
                            <span>Logout</span>
                        </button>
                    </div>
                </div>
            </header>

            {/* Tabs */}
            <div className="bg-white border-b">
                <div className="max-w-7xl mx-auto px-6">
                    <div className="flex gap-6">
                        {[
                            { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
                            { id: 'tenants', label: 'Tenants', icon: Building2 },
                            { id: 'payments', label: 'Payments', icon: CreditCard },
                            { id: 'sms', label: 'SMS Config', icon: MessageSquare },
                            { id: 'crm', label: 'Sales CRM', icon: Briefcase },
                            { id: 'settings', label: 'Settings', icon: Settings },
                        ].map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as any)}
                                className={`flex items-center gap-2 py-4 border-b-2 transition-colors ${activeTab === tab.id
                                    ? 'border-purple-600 text-purple-600'
                                    : 'border-transparent text-slate-500 hover:text-slate-700'
                                    }`}
                            >
                                <tab.icon className="w-4 h-4" />
                                <span>{tab.label}</span>
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Content */}
            <main className="max-w-7xl mx-auto px-6 py-8">
                {/* Dashboard Tab */}
                {activeTab === 'dashboard' && stats && (
                    <div className="space-y-6">
                        {/* Stats Cards */}
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <div className="bg-white rounded-xl p-6 border">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-sm text-slate-500">Total Tenants</p>
                                        <p className="text-2xl font-bold text-slate-900">{stats.totals.tenants}</p>
                                    </div>
                                    <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
                                        <Building2 className="w-6 h-6 text-purple-600" />
                                    </div>
                                </div>
                            </div>

                            <div className="bg-white rounded-xl p-6 border">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-sm text-slate-500">Total Students</p>
                                        <p className="text-2xl font-bold text-slate-900">{stats.totals.students.toLocaleString()}</p>
                                    </div>
                                    <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                                        <GraduationCap className="w-6 h-6 text-blue-600" />
                                    </div>
                                </div>
                            </div>

                            <div className="bg-white rounded-xl p-6 border">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-sm text-slate-500">Total Users</p>
                                        <p className="text-2xl font-bold text-slate-900">{stats.totals.users.toLocaleString()}</p>
                                    </div>
                                    <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
                                        <Users className="w-6 h-6 text-green-600" />
                                    </div>
                                </div>
                            </div>

                            <div className="bg-white rounded-xl p-6 border">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-sm text-slate-500">Total Revenue</p>
                                        <p className="text-2xl font-bold text-slate-900">K{stats.totals.revenue.toLocaleString()}</p>
                                    </div>
                                    <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center">
                                        <DollarSign className="w-6 h-6 text-amber-600" />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Tenants by Status & Tier */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="bg-white rounded-xl p-6 border">
                                <h3 className="font-semibold text-slate-900 mb-4">Tenants by Status</h3>
                                <div className="space-y-3">
                                    {Object.entries(stats.tenantsByStatus).map(([status, count]) => (
                                        <div key={status} className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                {status === 'ACTIVE' && <CheckCircle className="w-4 h-4 text-green-500" />}
                                                {status === 'TRIAL' && <Clock className="w-4 h-4 text-blue-500" />}
                                                {status === 'SUSPENDED' && <Ban className="w-4 h-4 text-red-500" />}
                                                {status === 'EXPIRED' && <XCircle className="w-4 h-4 text-orange-500" />}
                                                <span className="text-slate-600">{status}</span>
                                            </div>
                                            <span className="font-semibold text-slate-900">{count}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="bg-white rounded-xl p-6 border">
                                <h3 className="font-semibold text-slate-900 mb-4">Tenants by Tier</h3>
                                <div className="space-y-3">
                                    {Object.entries(stats.tenantsByTier).map(([tier, count]) => (
                                        <div key={tier} className="flex items-center justify-between">
                                            <span className={`px-2 py-1 rounded text-xs font-medium ${tier === 'ENTERPRISE' ? 'bg-amber-100 text-amber-800' :
                                                tier === 'PROFESSIONAL' ? 'bg-purple-100 text-purple-800' :
                                                    tier === 'STARTER' ? 'bg-blue-100 text-blue-800' :
                                                        'bg-slate-100 text-slate-800'
                                                }`}>
                                                {tier}
                                            </span>
                                            <span className="font-semibold text-slate-900">{count}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Expiring & Recent Payments */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Expiring Subscriptions */}
                            <div className="bg-white rounded-xl p-6 border">
                                <div className="flex items-center gap-2 mb-4">
                                    <AlertTriangle className="w-5 h-5 text-amber-500" />
                                    <h3 className="font-semibold text-slate-900">Expiring Soon</h3>
                                </div>
                                {stats.expiringSubscriptions.length === 0 ? (
                                    <p className="text-slate-500 text-sm">No subscriptions expiring soon</p>
                                ) : (
                                    <div className="space-y-2">
                                        {stats.expiringSubscriptions.map((tenant) => (
                                            <div key={tenant.id} className="flex items-center justify-between p-2 bg-amber-50 rounded-lg">
                                                <div>
                                                    <p className="font-medium text-slate-900">{tenant.name}</p>
                                                    <p className="text-xs text-slate-500">{tenant.tier}</p>
                                                </div>
                                                <p className="text-xs text-amber-600">
                                                    Expires {new Date(tenant.subscriptionEndsAt).toLocaleDateString()}
                                                </p>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Recent Payments */}
                            <div className="bg-white rounded-xl p-6 border">
                                <div className="flex items-center gap-2 mb-4">
                                    <TrendingUp className="w-5 h-5 text-green-500" />
                                    <h3 className="font-semibold text-slate-900">Recent Payments</h3>
                                </div>
                                {stats.recentPayments.length === 0 ? (
                                    <p className="text-slate-500 text-sm">No recent payments</p>
                                ) : (
                                    <div className="space-y-2">
                                        {stats.recentPayments.map((payment) => (
                                            <div key={payment.id} className="flex items-center justify-between p-2 bg-green-50 rounded-lg">
                                                <div>
                                                    <p className="font-medium text-slate-900">{payment.tenantName}</p>
                                                    <p className="text-xs text-slate-500">{payment.planName}</p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="font-semibold text-green-600">K{payment.amount.toLocaleString()}</p>
                                                    <p className="text-xs text-slate-500">
                                                        {new Date(payment.paidAt).toLocaleDateString()}
                                                    </p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Tenants Tab */}
                {activeTab === 'tenants' && (
                    <div className="space-y-4">
                        {/* Filters */}
                        <div className="flex items-center gap-4 bg-white p-4 rounded-xl border">
                            <div className="flex-1 relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                                <input
                                    type="text"
                                    placeholder="Search tenants..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                                />
                            </div>
                            <select
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value)}
                                className="px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                            >
                                <option value="">All Status</option>
                                <option value="ACTIVE">Active</option>
                                <option value="TRIAL">Trial</option>
                                <option value="SUSPENDED">Suspended</option>
                                <option value="EXPIRED">Expired</option>
                            </select>
                            <button
                                onClick={fetchTenants}
                                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                            >
                                <Filter className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Tenants Table */}
                        <div className="bg-white rounded-xl border overflow-hidden">
                            <table className="w-full">
                                <thead className="bg-slate-50">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">School</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Tier</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Status</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Students</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Expires</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {tenants.map((tenant) => (
                                        <tr key={tenant.id} className="hover:bg-slate-50">
                                            <td className="px-4 py-3">
                                                <div>
                                                    <p className="font-medium text-slate-900">{tenant.name}</p>
                                                    <p className="text-xs text-slate-500">{tenant.email}</p>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className={`px-2 py-1 rounded text-xs font-medium ${tenant.tier === 'ENTERPRISE' ? 'bg-amber-100 text-amber-800' :
                                                    tenant.tier === 'PROFESSIONAL' ? 'bg-purple-100 text-purple-800' :
                                                        tenant.tier === 'STARTER' ? 'bg-blue-100 text-blue-800' :
                                                            'bg-slate-100 text-slate-800'
                                                    }`}>
                                                    {tenant.tier}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className={`px-2 py-1 rounded text-xs font-medium ${tenant.status === 'ACTIVE' ? 'bg-green-100 text-green-800' :
                                                    tenant.status === 'TRIAL' ? 'bg-blue-100 text-blue-800' :
                                                        tenant.status === 'SUSPENDED' ? 'bg-red-100 text-red-800' :
                                                            'bg-orange-100 text-orange-800'
                                                    }`}>
                                                    {tenant.status}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-sm text-slate-600">
                                                {tenant.currentStudentCount} / {tenant.maxStudents === 0 ? '∞' : tenant.maxStudents}
                                            </td>
                                            <td className="px-4 py-3 text-sm text-slate-600">
                                                {tenant.subscriptionEndsAt
                                                    ? new Date(tenant.subscriptionEndsAt).toLocaleDateString()
                                                    : '—'}
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-2">
                                                    {tenant.status === 'SUSPENDED' ? (
                                                        <button
                                                            onClick={() => activateTenant(tenant.id)}
                                                            className="p-1 text-green-600 hover:bg-green-50 rounded"
                                                            title="Activate"
                                                        >
                                                            <CheckSquare className="w-4 h-4" />
                                                        </button>
                                                    ) : (
                                                        <button
                                                            onClick={() => suspendTenant(tenant.id)}
                                                            className="p-1 text-red-600 hover:bg-red-50 rounded"
                                                            title="Suspend"
                                                        >
                                                            <Ban className="w-4 h-4" />
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* Payments Tab */}
                {activeTab === 'payments' && (
                    <div className="bg-white rounded-xl border overflow-hidden">
                        <table className="w-full">
                            <thead className="bg-slate-50">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">School</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Plan</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Amount</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Method</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Status</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Date</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {payments.map((payment) => (
                                    <tr key={payment.id} className="hover:bg-slate-50">
                                        <td className="px-4 py-3 font-medium text-slate-900">{payment.tenant.name}</td>
                                        <td className="px-4 py-3">
                                            <span className={`px-2 py-1 rounded text-xs font-medium ${payment.plan.tier === 'ENTERPRISE' ? 'bg-amber-100 text-amber-800' :
                                                payment.plan.tier === 'PROFESSIONAL' ? 'bg-purple-100 text-purple-800' :
                                                    'bg-blue-100 text-blue-800'
                                                }`}>
                                                {payment.plan.name}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 font-semibold text-slate-900">
                                            {payment.currency} {payment.totalAmount.toLocaleString()}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-slate-600">{payment.paymentMethod}</td>
                                        <td className="px-4 py-3">
                                            <span className={`px-2 py-1 rounded text-xs font-medium ${payment.status === 'COMPLETED' ? 'bg-green-100 text-green-800' :
                                                payment.status === 'PENDING' ? 'bg-amber-100 text-amber-800' :
                                                    'bg-red-100 text-red-800'
                                                }`}>
                                                {payment.status}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-sm text-slate-600">
                                            {new Date(payment.createdAt).toLocaleDateString()}
                                        </td>
                                        <td className="px-4 py-3">
                                            {payment.status === 'PENDING' && (
                                                <button
                                                    onClick={() => confirmPayment(payment.id)}
                                                    className="px-3 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700 transition-colors"
                                                >
                                                    Confirm
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* SMS Config Tab */}
                {activeTab === 'sms' && smsConfig && (
                    <div className="space-y-6">
                        {/* Platform SMS Stats */}
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <div className="bg-white rounded-xl p-6 border">
                                <p className="text-sm text-slate-500">SMS Provider</p>
                                <p className="text-xl font-bold text-slate-900 uppercase">{smsConfig.platformSettings.smsProvider}</p>
                            </div>
                            <div className="bg-white rounded-xl p-6 border">
                                <p className="text-sm text-slate-500">Default Sender ID</p>
                                <p className="text-xl font-bold text-slate-900">{smsConfig.platformSettings.smsDefaultSenderId}</p>
                            </div>
                            <div className="bg-white rounded-xl p-6 border">
                                <p className="text-sm text-slate-500">SMS Balance</p>
                                <p className="text-xl font-bold text-green-600">{smsConfig.platformSettings.smsBalanceUnits.toLocaleString()} units</p>
                            </div>
                            <div className="bg-white rounded-xl p-6 border">
                                <p className="text-sm text-slate-500">Cost per SMS</p>
                                <p className="text-xl font-bold text-slate-900">K{Number(smsConfig.platformSettings.smsCostPerUnit).toFixed(2)}</p>
                            </div>
                        </div>

                        {/* Tenant SMS Configuration */}
                        <div className="bg-white rounded-xl border overflow-hidden">
                            <div className="px-6 py-4 border-b bg-slate-50">
                                <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                                    <MessageSquare className="w-5 h-5" />
                                    Tenant SMS Configuration
                                </h3>
                                <p className="text-sm text-slate-500 mt-1">Configure sender IDs for each school</p>
                            </div>
                            <table className="w-full">
                                <thead className="bg-slate-50">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">School</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Tier</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Status</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">SMS Enabled</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Sender ID</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {smsConfig.tenants.map((tenant) => (
                                        <tr key={tenant.id} className="hover:bg-slate-50">
                                            <td className="px-4 py-3">
                                                <p className="font-medium text-slate-900">{tenant.name}</p>
                                                <p className="text-xs text-slate-500">{tenant.slug}</p>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className={`px-2 py-1 rounded text-xs font-medium ${tenant.tier === 'ENTERPRISE' ? 'bg-amber-100 text-amber-800' :
                                                    tenant.tier === 'PROFESSIONAL' ? 'bg-purple-100 text-purple-800' :
                                                        tenant.tier === 'STARTER' ? 'bg-blue-100 text-blue-800' :
                                                            'bg-slate-100 text-slate-800'
                                                    }`}>
                                                    {tenant.tier}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className={`px-2 py-1 rounded text-xs font-medium ${tenant.status === 'ACTIVE' ? 'bg-green-100 text-green-800' :
                                                    tenant.status === 'TRIAL' ? 'bg-blue-100 text-blue-800' :
                                                        'bg-slate-100 text-slate-800'
                                                    }`}>
                                                    {tenant.status}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <button
                                                    onClick={() => updateTenantSenderId(tenant.id, tenant.smsSenderId || '', !tenant.smsEnabled)}
                                                    className={`px-3 py-1 rounded text-xs font-medium transition-colors ${tenant.smsEnabled
                                                        ? 'bg-green-100 text-green-800 hover:bg-green-200'
                                                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                                        }`}
                                                >
                                                    {tenant.smsEnabled ? 'Enabled' : 'Disabled'}
                                                </button>
                                            </td>
                                            <td className="px-4 py-3">
                                                {editingSenderId === tenant.id ? (
                                                    <div className="flex items-center gap-2">
                                                        <input
                                                            type="text"
                                                            value={senderIdInput}
                                                            onChange={(e) => setSenderIdInput(e.target.value.toUpperCase())}
                                                            className="px-2 py-1 border rounded text-sm w-28 uppercase"
                                                            placeholder="3-11 chars"
                                                            maxLength={11}
                                                        />
                                                        <button
                                                            onClick={() => {
                                                                updateTenantSenderId(tenant.id, senderIdInput, tenant.smsEnabled);
                                                            }}
                                                            className="p-1 bg-green-600 text-white rounded hover:bg-green-700"
                                                        >
                                                            <Save className="w-3 h-3" />
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <span className="text-sm font-mono bg-slate-100 px-2 py-1 rounded">
                                                        {tenant.smsSenderId || smsConfig.platformSettings.smsDefaultSenderId}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3">
                                                {editingSenderId === tenant.id ? (
                                                    <button
                                                        onClick={() => setEditingSenderId(null)}
                                                        className="text-xs text-slate-500 hover:text-slate-700"
                                                    >
                                                        Cancel
                                                    </button>
                                                ) : (
                                                    <button
                                                        onClick={() => {
                                                            setEditingSenderId(tenant.id);
                                                            setSenderIdInput(tenant.smsSenderId || '');
                                                        }}
                                                        className="text-xs text-purple-600 hover:text-purple-800"
                                                    >
                                                        Edit
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* SMS Info */}
                        <div className="bg-purple-50 rounded-xl p-4 flex items-start gap-3 border border-purple-200">
                            <MessageSquare className="w-5 h-5 text-purple-600 mt-0.5" />
                            <div>
                                <p className="font-medium text-purple-900">About Sender IDs</p>
                                <ul className="text-sm text-purple-700 mt-1 space-y-1">
                                    <li>• Sender ID must be 3-11 alphanumeric characters</li>
                                    <li>• Schools without a custom sender ID use the platform default</li>
                                    <li>• SMS must be enabled for schools on Professional tier or above</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                )}

                {/* CRM Tab */}
                {activeTab === 'crm' && (
                    <div className="space-y-6">
                        {/* CRM Stats */}
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <div className="bg-white p-4 rounded-xl border flex items-center gap-4">
                                <div className="p-3 bg-blue-100 rounded-lg text-blue-600">
                                    <Target className="w-6 h-6" />
                                </div>
                                <div>
                                    <p className="text-sm text-slate-500">Total Leads</p>
                                    <p className="text-2xl font-bold">{leads.length}</p>
                                </div>
                            </div>
                            <div className="bg-white p-4 rounded-xl border flex items-center gap-4">
                                <div className="p-3 bg-green-100 rounded-lg text-green-600">
                                    <CreditCard className="w-6 h-6" />
                                </div>
                                <div>
                                    <p className="text-sm text-slate-500">Pipeline Value</p>
                                    <p className="text-2xl font-bold">
                                        ZMW {pipeline?.stats?.totalValue?.toLocaleString() || '0'}
                                    </p>
                                </div>
                            </div>
                            <div className="bg-white p-4 rounded-xl border flex items-center gap-4">
                                <div className="p-3 bg-purple-100 rounded-lg text-purple-600">
                                    <Briefcase className="w-6 h-6" />
                                </div>
                                <div>
                                    <p className="text-sm text-slate-500">Active Deals</p>
                                    <p className="text-2xl font-bold">{pipeline?.stats?.totalDeals || 0}</p>
                                </div>
                            </div>
                            <div className="bg-white p-4 rounded-xl border flex items-center gap-4">
                                <div className="p-3 bg-orange-100 rounded-lg text-orange-600">
                                    <CheckCircle2 className="w-6 h-6" />
                                </div>
                                <div>
                                    <p className="text-sm text-slate-500">Conversion Rate</p>
                                    <p className="text-2xl font-bold">--%</p>
                                </div>
                            </div>
                        </div>

                        {/* Middle Section: Leads and Tasks */}
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            {/* Recent Leads */}
                            <div className="bg-white rounded-xl border overflow-hidden lg:col-span-2">
                                <div className="px-6 py-4 border-b flex justify-between items-center bg-slate-50">
                                    <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                                        <Users className="w-5 h-5" />
                                        Recent Leads
                                    </h3>
                                    <button
                                        onClick={() => setShowingLeadForm(true)}
                                        className="px-3 py-1.5 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 flex items-center gap-2"
                                    >
                                        <Plus className="w-4 h-4" />
                                        Add Lead
                                    </button>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full">
                                        <thead className="bg-slate-50">
                                            <tr>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">School</th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Source</th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Assigned</th>
                                            </tr>
                                        </thead>
                                        <tbody className="bg-white divide-y divide-slate-200">
                                            {leads.length === 0 ? (
                                                <tr>
                                                    <td colSpan={4} className="px-6 py-8 text-center text-slate-500">
                                                        No leads found.
                                                    </td>
                                                </tr>
                                            ) : (
                                                leads.map((lead) => (
                                                    <tr
                                                        key={lead.id}
                                                        onClick={() => setViewingLeadId(lead.id)}
                                                        className="hover:bg-slate-50 cursor-pointer transition-colors"
                                                    >
                                                        <td className="px-6 py-4">
                                                            <div className="font-medium text-slate-900">{lead.schoolName}</div>
                                                            <div className="text-xs text-slate-500">{lead.contactName}</div>
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap">
                                                            <div onClick={(e) => e.stopPropagation()}>
                                                                <select
                                                                    value={lead.status}
                                                                    onChange={(e) => updateLeadStatus(lead.id, e.target.value)}
                                                                    className={`px-2 py-1 text-xs font-semibold rounded-full border-0 cursor-pointer focus:ring-2 focus:ring-purple-500
                                                                    ${lead.status === 'NEW' ? 'bg-blue-100 text-blue-800' :
                                                                            lead.status === 'WON' ? 'bg-green-100 text-green-800' :
                                                                                'bg-slate-100 text-slate-800'}`}
                                                                >
                                                                    <option value="NEW">New</option>
                                                                    <option value="CONTACTED">Contacted</option>
                                                                    <option value="QUALIFIED">Qualified</option>
                                                                    <option value="PROPOSAL">Proposal</option>
                                                                    <option value="NEGOTIATION">Negotiation</option>
                                                                    <option value="WON">Won</option>
                                                                    <option value="LOST">Lost</option>
                                                                </select>
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                                                            {lead.source}
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                                                            {lead.assignedTo?.fullName || 'Unassigned'}
                                                        </td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* My Tasks */}
                            <div className="bg-white rounded-xl border overflow-hidden h-full">
                                <div className="px-6 py-4 border-b bg-slate-50 flex justify-between items-center">
                                    <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                                        <CheckSquare className="w-5 h-5" />
                                        My Tasks
                                    </h3>
                                    <button className="text-sm text-purple-600 hover:text-purple-800 font-medium">
                                        + New
                                    </button>
                                </div>
                                <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
                                    {tasks.length === 0 ? (
                                        <div className="p-6 text-center text-slate-500 text-sm">
                                            No tasks assigned to you.
                                        </div>
                                    ) : (
                                        tasks.map(task => (
                                            <div key={task.id} className="p-4 hover:bg-slate-50 flex gap-3">
                                                <div className={`mt-0.5 w-4 h-4 rounded border flex-shrink-0 cursor-pointer ${task.status === 'COMPLETED' ? 'bg-green-500 border-green-500' : 'border-slate-300'
                                                    }`}>
                                                    {task.status === 'COMPLETED' && <CheckCircle2 className="w-3 h-3 text-white" />}
                                                </div>
                                                <div>
                                                    <p className={`text-sm font-medium ${task.status === 'COMPLETED' ? 'text-slate-400 line-through' : 'text-slate-900'}`}>{task.title}</p>
                                                    {task.dueDate && (
                                                        <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                                                            <Calendar className="w-3 h-3" />
                                                            {new Date(task.dueDate).toLocaleDateString()}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Pipeline Overview */}
                        <div className="bg-white rounded-xl border overflow-hidden">
                            <div className="px-6 py-4 border-b bg-slate-50">
                                <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                                    <BarChart3 className="w-5 h-5" />
                                    Pipeline Overview
                                </h3>
                            </div>
                            <div className="p-6">
                                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                                    {['prospecting', 'qualification', 'proposal', 'negotiation', 'closed_won'].map((stage) => (
                                        <div key={stage} className="bg-slate-50 rounded-lg p-3 border h-96 overflow-y-auto">
                                            <h4 className="text-xs font-semibold uppercase text-slate-500 mb-3 border-b pb-2">
                                                {stage.replace('_', ' ')}
                                            </h4>
                                            <div className="space-y-2">
                                                {pipeline?.deals
                                                    .filter(d => d.stage === stage)
                                                    .map(deal => (
                                                        <div key={deal.id} className="bg-white p-3 rounded shadow-sm border text-sm hover:shadow-md cursor-pointer transition-shadow">
                                                            <div className="font-medium text-slate-800">{deal.name}</div>
                                                            <div className="flex justify-between items-center mt-2">
                                                                <span className="text-slate-500 text-xs">{deal.lead.schoolName}</span>
                                                            </div>
                                                            <div className="mt-2 text-xs font-semibold text-purple-600">
                                                                ZMW {Number(deal.value).toLocaleString()}
                                                            </div>
                                                        </div>
                                                    ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Lead Details Modal */}
                        {viewingLeadId && leadDetails && (
                            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                                <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto flex flex-col shadow-2xl">
                                    <div className="p-6 border-b flex justify-between items-start sticky top-0 bg-white z-10">
                                        <div>
                                            <h3 className="text-xl font-bold text-slate-900">{leadDetails.schoolName}</h3>
                                            <div className="flex items-center gap-2 mt-2">
                                                <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${leadDetails.status === 'NEW' ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-800'
                                                    }`}>
                                                    {leadDetails.status}
                                                </span>
                                                <span className="text-sm text-slate-500">• {leadDetails.source}</span>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => setViewingLeadId(null)}
                                            className="text-slate-400 hover:text-slate-600"
                                        >
                                            <XCircle className="w-6 h-6" />
                                        </button>
                                    </div>

                                    <div className="p-6 space-y-6">
                                        {/* Contact Info */}
                                        <div className="bg-slate-50 p-4 rounded-lg border">
                                            <h4 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                                                <Users className="w-4 h-4" /> Contact Information
                                            </h4>
                                            <div className="grid grid-cols-2 gap-4 text-sm">
                                                <div>
                                                    <p className="text-slate-500">Contact Person</p>
                                                    <p className="font-medium">{leadDetails.contactName}</p>
                                                </div>
                                                <div>
                                                    <p className="text-slate-500">Email</p>
                                                    <p className="font-medium">{leadDetails.contactEmail || 'N/A'}</p>
                                                </div>
                                                <div>
                                                    <p className="text-slate-500">Assigned To</p>
                                                    <p className="font-medium">{leadDetails.assignedTo?.fullName || 'Unassigned'}</p>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Activity Logging */}
                                        <div className="bg-slate-50 p-4 rounded-lg border">
                                            <h4 className="font-semibold text-slate-900 mb-2">Log Activity</h4>
                                            <div className="space-y-3">
                                                <select
                                                    className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-purple-500"
                                                    value={newActivity.type}
                                                    onChange={(e) => setNewActivity({ ...newActivity, type: e.target.value })}
                                                >
                                                    <option value="NOTE">Note</option>
                                                    <option value="CALL">Call</option>
                                                    <option value="EMAIL">Email</option>
                                                    <option value="MEETING">Meeting</option>
                                                </select>
                                                <textarea
                                                    className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-purple-500"
                                                    rows={3}
                                                    placeholder="Enter details..."
                                                    value={newActivity.description}
                                                    onChange={(e) => setNewActivity({ ...newActivity, description: e.target.value })}
                                                />
                                                <div className="flex justify-end">
                                                    <button
                                                        onClick={logActivity}
                                                        disabled={!newActivity.description.trim()}
                                                        className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700 disabled:opacity-50"
                                                    >
                                                        Log Activity
                                                    </button>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Activities Timeline */}
                                        <div>
                                            <h4 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
                                                <Clock className="w-4 h-4" /> Activity History
                                            </h4>
                                            <div className="relative pl-4 border-l-2 border-slate-200 space-y-6">
                                                {leadDetails.activities?.length === 0 ? (
                                                    <p className="text-sm text-slate-500 pl-4">No activities logged yet.</p>
                                                ) : (
                                                    leadDetails.activities?.map((activity) => (
                                                        <div key={activity.id} className="relative pl-4">
                                                            <div className="absolute -left-[21px] top-1 w-3 h-3 bg-purple-500 rounded-full border-2 border-white"></div>
                                                            <div className="text-sm">
                                                                <p className="font-medium text-slate-900">
                                                                    {activity.type} <span className="text-slate-400 font-normal">by {activity.performedBy.fullName}</span>
                                                                </p>
                                                                <p className="text-slate-600 mt-1">{activity.description}</p>
                                                                <p className="text-xs text-slate-400 mt-1">
                                                                    {new Date(activity.createdAt).toLocaleString()}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    ))
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Add Lead Modal */}
                        {showingLeadForm && (
                            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                                <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl">
                                    <h3 className="text-xl font-bold text-slate-900 mb-4">Add New Lead</h3>
                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1">School Name</label>
                                            <input
                                                type="text"
                                                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500"
                                                value={leadForm.schoolName}
                                                onChange={(e) => setLeadForm({ ...leadForm, schoolName: e.target.value })}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1">Contact Name</label>
                                            <input
                                                type="text"
                                                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500"
                                                value={leadForm.contactName}
                                                onChange={(e) => setLeadForm({ ...leadForm, contactName: e.target.value })}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1">Contact Email</label>
                                            <input
                                                type="email"
                                                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500"
                                                value={leadForm.contactEmail}
                                                onChange={(e) => setLeadForm({ ...leadForm, contactEmail: e.target.value })}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1">Source</label>
                                            <select
                                                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500"
                                                value={leadForm.source}
                                                onChange={(e) => setLeadForm({ ...leadForm, source: e.target.value })}
                                            >
                                                <option value="WEBSITE">Website</option>
                                                <option value="REFERRAL">Referral</option>
                                                <option value="COLD_CALL">Cold Call</option>
                                                <option value="CONFERENCE">Conference</option>
                                                <option value="OTHER">Other</option>
                                            </select>
                                        </div>
                                        <div className="flex justify-end gap-3 mt-6">
                                            <button
                                                onClick={() => setShowingLeadForm(false)}
                                                className="px-4 py-2 text-slate-600 hover:bg-slate-50 rounded-lg"
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                onClick={saveLead}
                                                disabled={loading || !leadForm.schoolName}
                                                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
                                            >
                                                {loading ? 'Creating...' : 'Create Lead'}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Settings Tab */}
                {activeTab === 'settings' && (
                    <div className="space-y-6">
                        <div className="bg-white rounded-xl border overflow-hidden">
                            <div className="px-6 py-4 border-b bg-slate-50">
                                <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                                    <Settings className="w-5 h-5" />
                                    SMS Gateway Configuration
                                </h3>
                                <p className="text-sm text-slate-500 mt-1">Configure your centralized SMS gateway credentials</p>
                            </div>

                            <div className="p-6 space-y-6">
                                {/* Provider Selection */}
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-2">SMS Provider</label>
                                    <select
                                        value={settingsForm.smsProvider}
                                        onChange={(e) => setSettingsForm({ ...settingsForm, smsProvider: e.target.value })}
                                        className="w-full md:w-1/2 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                                    >
                                        <option value="africastalking">Africa's Talking</option>
                                        <option value="twilio">Twilio</option>
                                        <option value="infobip">Infobip</option>
                                        <option value="termii">Termii</option>
                                        <option value="zamtel">Zamtel Bulk SMS</option>
                                    </select>
                                    <p className="text-xs text-slate-500 mt-1">
                                        {settingsForm.smsProvider === 'africastalking' && "Popular in Africa. Get credentials at africastalking.com"}
                                        {settingsForm.smsProvider === 'twilio' && "Global provider. Get credentials at twilio.com/console"}
                                        {settingsForm.smsProvider === 'infobip' && "Enterprise SMS. Get credentials at infobip.com"}
                                        {settingsForm.smsProvider === 'termii' && "Affordable African SMS. Get credentials at termii.com"}
                                        {settingsForm.smsProvider === 'zamtel' && "Local Zambian provider"}
                                    </p>
                                </div>

                                {/* Provider-specific fields */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {(settingsForm.smsProvider === 'zamtel' || settingsForm.smsProvider === 'infobip') && (
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-2">API URL</label>
                                            <input
                                                type="url"
                                                value={settingsForm.smsApiUrl}
                                                onChange={(e) => setSettingsForm({ ...settingsForm, smsApiUrl: e.target.value })}
                                                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                                                placeholder={settingsForm.smsProvider === 'infobip' ? 'https://xxxxx.api.infobip.com' : 'https://api.example.com/sms'}
                                            />
                                        </div>
                                    )}

                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-2">
                                            {settingsForm.smsProvider === 'twilio' ? 'Account SID' :
                                                settingsForm.smsProvider === 'africastalking' ? 'API Key' :
                                                    'API Key'}
                                        </label>
                                        <div className="relative">
                                            <input
                                                type={showApiKey ? 'text' : 'password'}
                                                value={settingsForm.smsApiKey}
                                                onChange={(e) => setSettingsForm({ ...settingsForm, smsApiKey: e.target.value })}
                                                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 pr-10"
                                                placeholder={platformSettings?.smsApiKey ? '••••••••' : 'Enter API key'}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowApiKey(!showApiKey)}
                                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                            >
                                                {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                            </button>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-2">
                                            {settingsForm.smsProvider === 'twilio' ? 'Auth Token' :
                                                settingsForm.smsProvider === 'africastalking' ? 'Username' :
                                                    'API Secret'}
                                        </label>
                                        <div className="relative">
                                            <input
                                                type={showApiSecret ? 'text' : 'password'}
                                                value={settingsForm.smsApiSecret}
                                                onChange={(e) => setSettingsForm({ ...settingsForm, smsApiSecret: e.target.value })}
                                                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 pr-10"
                                                placeholder={platformSettings?.smsApiSecret ? '••••••••' : settingsForm.smsProvider === 'africastalking' ? 'sandbox or your username' : 'Enter secret'}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowApiSecret(!showApiSecret)}
                                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                            >
                                                {showApiSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                            </button>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-2">Default Sender ID</label>
                                        <input
                                            type="text"
                                            value={settingsForm.smsDefaultSenderId}
                                            onChange={(e) => setSettingsForm({ ...settingsForm, smsDefaultSenderId: e.target.value.toUpperCase() })}
                                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 uppercase"
                                            placeholder="SYNC"
                                            maxLength={11}
                                        />
                                        <p className="text-xs text-slate-500 mt-1">3-11 alphanumeric characters. Used when tenant doesn't have custom ID.</p>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-2">Cost per SMS (ZMW)</label>
                                        <input
                                            type="number"
                                            step="0.01"
                                            value={settingsForm.smsCostPerUnit}
                                            onChange={(e) => setSettingsForm({ ...settingsForm, smsCostPerUnit: parseFloat(e.target.value) })}
                                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                                            placeholder="0.15"
                                        />
                                        <p className="text-xs text-slate-500 mt-1">Internal tracking cost per SMS unit</p>
                                    </div>
                                </div>

                                {/* Save Button */}
                                <div className="flex gap-3 pt-4 border-t">
                                    <button
                                        onClick={savePlatformSettings}
                                        disabled={loading}
                                        className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-2 disabled:opacity-50"
                                    >
                                        <Save className="w-4 h-4" />
                                        {loading ? 'Saving...' : 'Save Settings'}
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Provider Setup Guides */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="bg-orange-50 rounded-xl p-4 border border-orange-200">
                                <h4 className="font-semibold text-orange-900 mb-2">Africa's Talking Setup</h4>
                                <ol className="text-sm text-orange-800 space-y-1 list-decimal list-inside">
                                    <li>Go to africastalking.com and create an account</li>
                                    <li>Get your API Key from Settings → API Key</li>
                                    <li>Your Username is shown in the dashboard</li>
                                    <li>Register a sender ID (takes 24-48h approval)</li>
                                    <li>Buy SMS credits for your country</li>
                                </ol>
                            </div>

                            <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
                                <h4 className="font-semibold text-blue-900 mb-2">Twilio Setup</h4>
                                <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
                                    <li>Go to twilio.com/console and create an account</li>
                                    <li>Copy your Account SID and Auth Token</li>
                                    <li>Buy a phone number or register Alphanumeric Sender ID</li>
                                    <li>For Zambia, use +260 numbers or register with carriers</li>
                                </ol>
                            </div>

                            <div className="bg-green-50 rounded-xl p-4 border border-green-200">
                                <h4 className="font-semibold text-green-900 mb-2">Termii Setup</h4>
                                <ol className="text-sm text-green-800 space-y-1 list-decimal list-inside">
                                    <li>Go to termii.com and create an account</li>
                                    <li>Get your API Key from Settings</li>
                                    <li>Register a Sender ID (approval required)</li>
                                    <li>Affordable rates for African countries</li>
                                </ol>
                            </div>

                            <div className="bg-purple-50 rounded-xl p-4 border border-purple-200">
                                <h4 className="font-semibold text-purple-900 mb-2">Infobip Setup</h4>
                                <ol className="text-sm text-purple-800 space-y-1 list-decimal list-inside">
                                    <li>Go to infobip.com and create an account</li>
                                    <li>Get your API Key and Base URL from portal</li>
                                    <li>Register sender IDs for each country</li>
                                    <li>Enterprise-grade delivery and analytics</li>
                                </ol>
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
};

export default PlatformAdmin;
