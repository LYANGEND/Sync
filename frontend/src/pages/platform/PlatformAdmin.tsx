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
    Trash2,
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
    Download,
    Send,
    TrendingDown,
    Percent,
    Shield,
    Database,
    ChevronDown,
    ChevronRight,
    FileText,
} from 'lucide-react';
import SecurityDashboard from '../../components/SecurityDashboard';
import DataManagement from '../../components/DataManagement';
import InvoiceManagement from '../../components/InvoiceManagement';
import RevenueReconciliation from '../../components/RevenueReconciliation';

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
    revenueAnalytics: {
        currentMonthRevenue: number;
        lastMonthRevenue: number;
        revenueGrowth: number;
        revenueByTier: Record<string, number>;
        avgRevenuePerSchool: number;
        paymentSuccessRate: number;
        schoolTransactionVolume: {
            total: number;
            count: number;
        };
    };
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
        email: string;
    }>;
}

interface Tenant {
    id: string;
    name: string;
    slug: string;
    email: string;
    phone?: string;
    address?: string;
    tier: string;
    status: string;
    currentStudentCount: number;
    maxStudents: number;
    maxTeachers?: number;
    maxParents?: number;
    features?: string[];
    subscriptionEndsAt: string | null;
    createdAt: string;
}

interface Payment {
    id: string;
    tenant: { name: string; slug: string };
    plan: { name: string; tier: string };
    totalAmount: number;
    currency: string;
    status: string;
    paymentMethod: string;
    createdAt: string;
    billingCycle: string;
    studentCount: number;
    baseAmount: number;
    overageStudents: number;
    overageAmount: number;
    externalRef?: string;
    receiptNumber?: string;
}

interface SchoolTransaction {
    id: string;
    tenant: { name: string; slug: string };
    studentName: string;
    admissionNumber?: string;
    amount: number;
    mobileMoneyFee: number;
    currency: string;
    method: string;
    status: string;
    transactionId: string;
    mobileMoneyOperator?: string;
    mobileMoneyPhone?: string;
    mobileMoneyStatus?: string;
    date: string;
}

interface FinanceAnalytics {
    period: string;
    subscriptionRevenue: {
        current: number;
        previous: number;
        growth: number;
        transactionCount: number;
        byStatus: Array<{ status: string; amount: number; count: number }>;
        byTier: Record<string, number>;
    };
    schoolCollections: {
        current: number;
        previous: number;
        growth: number;
        transactionCount: number;
        byMethod: Array<{ method: string; amount: number; fees: number; count: number }>;
        byStatus: Array<{ status: string; amount: number; count: number }>;
        topSchools: Array<{ tenant: { name: string; slug: string }; amount: number; fees: number; count: number }>;
    };
    processingFees: {
        current: number;
        previous: number;
        growth: number;
        transactionCount: number;
    };
    issues: {
        failed: Array<{ id: string; tenant: { name: string }; student: string; amount: number; transactionId: string; mobileMoneyStatus?: string; date: string }>;
        pending: Array<{ id: string; tenant: { name: string }; student: string; amount: number; transactionId: string; date: string }>;
    };
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
    // Mobile Money Settings (configurable in UI)
    paymentGatewayProvider: string | null;
    mobileMoneyFeePercent: number | null;
    mobileMoneyFeeCap: number | null;
    mobileMoneyEnabled: boolean;
    allowedPaymentMethods: string[];
    allowedOrigins: string[];
    publicApiRateLimitPerMinute: number;
    paymentApiRateLimitPerMinute: number;
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

interface Plan {
    id: string;
    name: string;
    tier: string;
    monthlyPriceZMW: number;
    yearlyPriceZMW: number;
    monthlyPriceUSD: number;
    yearlyPriceUSD: number;
    includedStudents: number;
    maxStudents: number;
    maxTeachers: number;
    maxUsers: number;
    maxClasses: number;
    maxStorageGB: number;
    features: string[];
    isPopular: boolean;
    isActive: boolean;
    description: string;
    _count?: {
        subscriptionPayments: number;
    };
}

interface Announcement {
    id: string;
    title: string;
    message: string;
    type: 'INFO' | 'WARNING' | 'SUCCESS' | 'ERROR';
    isActive: boolean;
    expiresAt: string | null;
    createdAt: string;
}

const API_URL = 'http://localhost:3000';

// Message Templates
const MESSAGE_TEMPLATES = [
    {
        id: 'welcome',
        name: 'Welcome Message',
        description: 'Onboarding new schools',
        category: 'Onboarding',
        categoryColor: 'blue',
        subject: '🎉 Welcome to Sync! Let\'s Transform Your School Together',
        message: `Dear {{schoolName}},

Welcome to Sync - your comprehensive school management platform! We're thrilled to have you on board.

Sync is designed to streamline your school operations, from student enrollment to fee management, attendance tracking, and parent communication. Everything you need, perfectly in sync.

Here's what you can do to get started:
1. Complete your school profile
2. Add your staff members
3. Import or add students
4. Configure your academic calendar
5. Set up fee structures

Our Sync support team is here to help you every step of the way. If you have any questions, please don't hesitate to reach out.

Best regards,
The Sync Team`,
    },
    {
        id: 'payment_reminder',
        name: 'Payment Reminder',
        description: 'Billing reminders',
        category: 'Billing',
        categoryColor: 'green',
        subject: '💳 Payment Reminder - Keep Your Sync Active',
        message: `Dear {{schoolName}},

This is a friendly reminder about your upcoming Sync subscription payment.

Subscription Details:
- Plan: {{planName}}
- Amount: {{amount}}
- Due Date: {{dueDate}}

To ensure uninterrupted service and keep your school in sync, please make your payment before the due date.

Payment Methods:
- Mobile Money
- Bank Transfer
- Online Payment

If you've already made the payment, please disregard this message.

Thank you for your continued partnership with Sync!

Best regards,
The Sync Billing Team`,
    },
    {
        id: 'feature_update',
        name: 'Feature Update',
        description: 'New feature announcements',
        category: 'Updates',
        categoryColor: 'purple',
        subject: '✨ Exciting New Sync Features Available!',
        message: `Dear {{schoolName}},

We're excited to announce new features that will enhance your Sync experience!

What's New in Sync:
✨ Enhanced reporting dashboard with real-time analytics
✨ Bulk SMS messaging for parent communication
✨ Automated fee reminders
✨ Mobile app improvements
✨ Advanced attendance tracking

These features are now available in your Sync account. Log in to explore and start using them today!

We're constantly working to improve Sync based on your feedback. If you have suggestions, we'd love to hear from you.

Best regards,
The Sync Product Team`,
    },
    {
        id: 'maintenance',
        name: 'Maintenance Notice',
        description: 'System maintenance alerts',
        category: 'System',
        categoryColor: 'orange',
        subject: '🔧 Scheduled Sync Maintenance - {{date}}',
        message: `Dear {{schoolName}},

We will be performing scheduled maintenance to improve Sync's performance and security.

Maintenance Window:
- Date: {{date}}
- Time: {{time}}
- Duration: Approximately {{duration}}

During this time, Sync may be temporarily unavailable. We apologize for any inconvenience this may cause.

What to expect:
- Brief service interruption
- Improved performance after maintenance
- Enhanced security features

We recommend saving your work before the maintenance window. All your data will be safe and secure.

Thank you for your patience and understanding!

Best regards,
The Sync Operations Team`,
    },
    {
        id: 'support',
        name: 'Support Follow-up',
        description: 'Customer support check-ins',
        category: 'Support',
        categoryColor: 'indigo',
        subject: '💬 How Can Sync Help You Today?',
        message: `Dear {{schoolName}},

We hope you're enjoying Sync and finding it helpful for your school management needs!

We wanted to check in and see if you need any assistance or have questions about using Sync.

Our Sync support team is here to help with:
- Platform setup and configuration
- Training for your staff
- Technical issues
- Feature requests
- Best practices

You can reach us:
- Email: support@sync.com
- Phone: +260 XXX XXX XXX
- Live Chat: Available in your Sync dashboard

We're committed to your success and want to ensure you're getting the most out of Sync.

Best regards,
The Sync Support Team`,
    },
];

const PlatformAdmin = () => {
    const [token, setToken] = useState<string | null>(localStorage.getItem('platform_token'));
    const [activeTab, setActiveTab] = useState<'dashboard' | 'tenants' | 'payments' | 'sms' | 'settings' | 'crm' | 'plans' | 'announcements' | 'audit' | 'security' | 'data' | 'invoices' | 'reconciliation' | 'communication'>('dashboard');
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [tenants, setTenants] = useState<Tenant[]>([]);
    
    // Menu group collapse state
    const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
        operations: true,
        finance: false,
        security: false,
        sales: true,
        system: false,
    });

    const toggleGroup = (group: string) => {
        setExpandedGroups(prev => ({ ...prev, [group]: !prev[group] }));
    };
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
    // Plans State
    const [plans, setPlans] = useState<Plan[]>([]);
    const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
    const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);
    const [newPlan, setNewPlan] = useState<Partial<Plan>>({
        name: '',
        tier: 'STARTER',
        monthlyPriceZMW: 0,
        yearlyPriceZMW: 0,
        monthlyPriceUSD: 0,
        yearlyPriceUSD: 0,
        includedStudents: 50,
        maxStudents: 50,
        maxTeachers: 5,
        maxUsers: 10,
        maxClasses: 5,
        maxStorageGB: 1,
        features: [],
        isActive: true,
        isPopular: false,
        description: ''
    });
    // Announcements State
    const [announcements, setAnnouncements] = useState<Announcement[]>([]);
    const [newAnnouncement, setNewAnnouncement] = useState({ title: '', message: '', type: 'INFO', expiresAt: '' });
    const [isAnnouncementModalOpen, setIsAnnouncementModalOpen] = useState(false);
    const [editingSenderId, setEditingSenderId] = useState<string | null>(null);
    const [senderIdInput, setSenderIdInput] = useState('');
    const [showApiKey, setShowApiKey] = useState(false);
    const [showApiSecret, setShowApiSecret] = useState(false);
    const [settingsForm, setSettingsForm] = useState<any>({
        smsProvider: 'africastalking',
        smsApiUrl: '',
        smsApiKey: '',
        smsApiSecret: '',
        smsDefaultSenderId: 'SYNC',
        smsCostPerUnit: 0.15,
        availableFeatures: [],
        availableTiers: [],
        // Email Provider Settings
        emailProvider: 'smtp',
        // Azure Email Settings
        azureEmailEnabled: false,
        azureEmailConnectionString: '',
        azureEmailFromAddress: '',
        azureEmailEndpoint: '',
        azureEmailAccessKey: '',
        // Payment Gateway Settings
        lencoEnabled: false,
        lencoApiUrl: 'https://api.lenco.co/access/v2',
        lencoApiToken: '',
        lencoWebhookSecret: '',
        mtnMomoEnabled: false,
        mtnMomoApiUrl: '',
        mtnMomoApiUserId: '',
        mtnMomoApiKey: '',
        mtnMomoSubscriptionKey: '',
        airtelMoneyEnabled: false,
        airtelMoneyApiUrl: '',
        airtelMoneyClientId: '',
        airtelMoneyClientSecret: '',
        bankTransferEnabled: true,
        bankName: '',
        bankAccountName: '',
        bankAccountNumber: '',
        bankBranchCode: '',
        bankSwiftCode: '',
        paymentCurrency: 'ZMW',
        paymentWebhookUrl: '',
        autoConfirmThreshold: 0,
        // Mobile Money Settings (non-secret, configurable in UI)
        paymentGatewayProvider: 'lenco',
        mobileMoneyFeePercent: 2.5,
        mobileMoneyFeeCap: 0,
        mobileMoneyEnabled: true,
        allowedPaymentMethods: ['CASH', 'MOBILE_MONEY', 'BANK_DEPOSIT'],
        allowedOrigins: ['https://pay.yourdomain.com'],
        publicApiRateLimitPerMinute: 30,
        paymentApiRateLimitPerMinute: 10,
    });
    const [logs, setLogs] = useState<any[]>([]);

    // Bulk Email State
    const [showBulkEmailModal, setShowBulkEmailModal] = useState(false);
    const [bulkEmailForm, setBulkEmailForm] = useState({
        subject: '',
        message: '',
        targetTiers: [] as string[],
        targetStatuses: [] as string[],
    });

    // Bulk SMS State
    const [showBulkSMSModal, setShowBulkSMSModal] = useState(false);
    const [bulkSMSForm, setBulkSMSForm] = useState({
        message: '',
        targetTiers: [] as string[],
        targetStatuses: [] as string[],
    });

    // Bulk Notification State
    const [showBulkNotificationModal, setShowBulkNotificationModal] = useState(false);
    const [bulkNotificationForm, setBulkNotificationForm] = useState({
        title: '',
        message: '',
        type: 'INFO' as 'INFO' | 'WARNING' | 'SUCCESS' | 'ERROR',
        targetTiers: [] as string[],
        targetStatuses: [] as string[],
    });

    // Template Preview State
    const [showTemplatePreview, setShowTemplatePreview] = useState(false);
    const [selectedTemplate, setSelectedTemplate] = useState<any>(null);

    // Tenant Form State
    const [showTenantModal, setShowTenantModal] = useState(false);
    const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
    const [tenantForm, setTenantForm] = useState({
        // School details
        name: '',
        slug: '',
        email: '',
        phone: '',
        address: '',
        city: '',
        country: 'ZM',
        tier: 'FREE',
        // Admin user details (for new tenant creation)
        adminEmail: '',
        adminPassword: '',
        adminFullName: '',
    });

    // Payment State
    const [activePaymentType, setActivePaymentType] = useState<'subscription' | 'school'>('subscription');
    const [schoolTransactions, setSchoolTransactions] = useState<SchoolTransaction[]>([]);
    const [schoolTransactionFeeStats, setSchoolTransactionFeeStats] = useState<{ totalFeesCollected: number; totalTransactionVolume: number; transactionCount: number } | null>(null);
    const [financeAnalytics, setFinanceAnalytics] = useState<FinanceAnalytics | null>(null);
    const [financeAnalyticsPeriod, setFinanceAnalyticsPeriod] = useState<'day' | 'week' | 'month' | 'year'>('month');
    const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [paymentFilters, setPaymentFilters] = useState({
        status: '',
        search: '',
        tenantId: '', // For filtering school transactions by specific school
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
            const queryParams = new URLSearchParams();
            if (paymentFilters.status) queryParams.append('status', paymentFilters.status);

            let url = `${API_URL}/api/platform/payments`;
            if (activePaymentType === 'school') {
                url = `${API_URL}/api/platform/payments/school-transactions`;
                if (paymentFilters.search) queryParams.append('search', paymentFilters.search);
                if (paymentFilters.tenantId) queryParams.append('tenantId', paymentFilters.tenantId);
            }

            const response = await fetch(`${url}?${queryParams}`, {
                headers: { Authorization: `Bearer ${token}` },
            });

            if (response.ok) {
                const data = await response.json();

                if (activePaymentType === 'school') {
                    setSchoolTransactions(data.payments);
                    if (data.feeStats) {
                        setSchoolTransactionFeeStats(data.feeStats);
                    }
                } else {
                    // Client-side filtering for search query if provided for subscription payments
                    let filteredPayments = data.payments;
                    if (paymentFilters.search) {
                        const searchLower = paymentFilters.search.toLowerCase();
                        filteredPayments = filteredPayments.filter((p: any) =>
                            p.tenant.name.toLowerCase().includes(searchLower) ||
                            p.receiptNumber?.toLowerCase().includes(searchLower)
                        );
                    }
                    setPayments(filteredPayments);
                }
            }
        } catch (error) {
            console.error('Failed to fetch payments:', error);
        } finally {
            setLoading(false);
        }
    };

    // Fetch finance analytics
    const fetchFinanceAnalytics = async () => {
        if (!token) return;
        try {
            const response = await fetch(`${API_URL}/api/platform/payments/finance-analytics?period=${financeAnalyticsPeriod}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (response.ok) {
                const data = await response.json();
                setFinanceAnalytics(data);
            }
        } catch (error) {
            console.error('Failed to fetch finance analytics:', error);
        }
    };

    // Refetch payments when filters change (debounced or effect)
    useEffect(() => {
        if (activeTab === 'payments') {
            const timer = setTimeout(() => {
                fetchPayments();
            }, 500);
            return () => clearTimeout(timer);
        }
    }, [paymentFilters, activeTab, activePaymentType]);

    // Fetch finance analytics when period changes or tab is payments
    useEffect(() => {
        if (activeTab === 'payments') {
            fetchFinanceAnalytics();
        }
    }, [activeTab, financeAnalyticsPeriod]);

    const viewPaymentDetails = (payment: Payment) => {
        setSelectedPayment(payment);
        setShowPaymentModal(true);
    };

    const fetchPlans = async () => {
        try {
            const token = localStorage.getItem('platform_token');
            const res = await fetch(`${API_URL}/api/platform/plans`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setPlans(data);
            }
        } catch (error) {
            console.error('Fetch plans error:', error);
        }
    };

    const fetchAnnouncements = async () => {
        try {
            const token = localStorage.getItem('platform_token');
            const res = await fetch(`${API_URL}/api/platform/announcements`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                setAnnouncements(await res.json());
            }
        } catch (error) {
            console.error('Fetch announcements error:', error);
        }
    };

    const saveAnnouncement = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const token = localStorage.getItem('platform_token');
            const res = await fetch(`${API_URL}/api/platform/announcements`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify(newAnnouncement)
            });
            if (res.ok) {
                alert('Announcement broadcasted!');
                setIsAnnouncementModalOpen(false);
                setNewAnnouncement({ title: '', message: '', type: 'INFO', expiresAt: '' });
                fetchAnnouncements();
            }
        } catch (error) {
            console.error('Save announcement error:', error);
        }
    };

    const deleteAnnouncement = async (id: string) => {
        if (!confirm('Delete this announcement?')) return;
        try {
            const token = localStorage.getItem('platform_token');
            await fetch(`${API_URL}/api/platform/announcements/${id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` }
            });
            fetchAnnouncements();
        } catch (error) {
            console.error('Delete announcement error:', error);
        }
    };

    const savePlan = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const token = localStorage.getItem('platform_token');
            const url = editingPlan
                ? `${API_URL}/api/platform/plans/${editingPlan.id}`
                : `${API_URL}/api/platform/plans`;

            const method = editingPlan ? 'PUT' : 'POST';

            const payload = editingPlan ? { ...newPlan, id: undefined } : newPlan;

            const res = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                alert('Plan saved successfully');
                fetchPlans();
                setIsPlanModalOpen(false);
                setEditingPlan(null);
                setNewPlan({
                    name: '',
                    tier: 'STARTER',
                    monthlyPriceZMW: 0,
                    yearlyPriceZMW: 0,
                    includedStudents: 50,
                    maxStudents: 50,
                    maxTeachers: 5,
                    maxUsers: 10,
                    isActive: true
                });
            } else {
                const err = await res.json();
                alert(`Error: ${err.error}`);
            }
        } catch (error) {
            console.error('Save plan error:', error);
            alert('Failed to save plan');
        }
    };

    const togglePlanStatus = async (plan: Plan) => {
        try {
            const token = localStorage.getItem('platform_token');
            const res = await fetch(`${API_URL}/api/platform/plans/${plan.id}/status`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ isActive: !plan.isActive })
            });

            if (res.ok) {
                fetchPlans();
            }
        } catch (error) {
            console.error('Toggle plan error:', error);
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

    const resetTenantForm = () => {
        setTenantForm({
            name: '',
            slug: '',
            email: '',
            phone: '',
            address: '',
            city: '',
            country: 'ZM',
            tier: 'FREE',
            adminEmail: '',
            adminPassword: '',
            adminFullName: '',
        });
        setEditingTenant(null);
    };

    const openEditTenantModal = (tenant: Tenant) => {
        setEditingTenant(tenant);
        setTenantForm({
            name: tenant.name,
            slug: tenant.slug,
            email: tenant.email || '',
            phone: tenant.phone || '',
            address: tenant.address || '',
            city: '', // Add city if available in Tenant interface
            country: 'ZM', // Default or from tenant
            tier: tenant.tier,
            adminEmail: '', // Not needed for edit
            adminPassword: '', // Not needed for edit
            adminFullName: '', // Not needed for edit
        });
        setShowTenantModal(true);
    };

    const saveTenant = async () => {
        if (!token) return;

        // Basic validation
        if (!tenantForm.name || !tenantForm.slug || !tenantForm.email) {
            alert('Please fill in all required fields (Name, Slug, Email)');
            return;
        }

        // Admin validation for new tenants
        if (!editingTenant) {
            if (!tenantForm.adminEmail || !tenantForm.adminPassword || !tenantForm.adminFullName) {
                alert('Please fill in all Admin details for new school');
                return;
            }
        }

        setLoading(true);
        try {
            const url = editingTenant
                ? `${API_URL}/api/platform/tenants/${editingTenant.id}`
                : `${API_URL}/api/platform/tenants`;

            const response = await fetch(url, {
                method: editingTenant ? 'PUT' : 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(tenantForm),
            });

            if (response.ok) {
                alert(editingTenant ? 'Tenant updated successfully!' : 'Tenant created successfully!');
                setShowTenantModal(false);
                resetTenantForm();
                fetchTenants();
            } else {
                const data = await response.json();
                alert(data.error || 'Failed to save tenant');
            }
        } catch (error) {
            console.error('Failed to save tenant:', error);
            alert('Failed to save tenant');
        } finally {
            setLoading(false);
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
                    availableFeatures: data.availableFeatures || [],
                    availableTiers: data.availableTiers || [],
                    // Email Provider Settings
                    emailProvider: data.emailProvider || 'smtp',
                    // Azure Email Settings
                    azureEmailEnabled: data.azureEmailEnabled || false,
                    azureEmailConnectionString: data.azureEmailConnectionString === '********' ? '' : (data.azureEmailConnectionString || ''),
                    azureEmailFromAddress: data.azureEmailFromAddress || '',
                    azureEmailEndpoint: data.azureEmailEndpoint || '',
                    azureEmailAccessKey: data.azureEmailAccessKey === '********' ? '' : (data.azureEmailAccessKey || ''),
                    // Payment Gateway Settings
                    lencoEnabled: data.lencoEnabled || false,
                    lencoApiUrl: data.lencoApiUrl || 'https://api.lenco.co/access/v2',
                    lencoApiToken: data.lencoApiToken === '********' ? '' : (data.lencoApiToken || ''),
                    lencoWebhookSecret: data.lencoWebhookSecret === '********' ? '' : (data.lencoWebhookSecret || ''),
                    mtnMomoEnabled: data.mtnMomoEnabled || false,
                    mtnMomoApiUrl: data.mtnMomoApiUrl || '',
                    mtnMomoApiUserId: data.mtnMomoApiUserId || '',
                    mtnMomoApiKey: data.mtnMomoApiKey === '********' ? '' : (data.mtnMomoApiKey || ''),
                    mtnMomoSubscriptionKey: data.mtnMomoSubscriptionKey === '********' ? '' : (data.mtnMomoSubscriptionKey || ''),
                    airtelMoneyEnabled: data.airtelMoneyEnabled || false,
                    airtelMoneyApiUrl: data.airtelMoneyApiUrl || '',
                    airtelMoneyClientId: data.airtelMoneyClientId || '',
                    airtelMoneyClientSecret: data.airtelMoneyClientSecret === '********' ? '' : (data.airtelMoneyClientSecret || ''),
                    bankTransferEnabled: data.bankTransferEnabled !== false,
                    bankName: data.bankName || '',
                    bankAccountName: data.bankAccountName || '',
                    bankAccountNumber: data.bankAccountNumber || '',
                    bankBranchCode: data.bankBranchCode || '',
                    bankSwiftCode: data.bankSwiftCode || '',
                    paymentCurrency: data.paymentCurrency || 'ZMW',
                    paymentWebhookUrl: data.paymentWebhookUrl || '',
                    autoConfirmThreshold: Number(data.autoConfirmThreshold) || 0,
                    // Mobile Money Settings (non-secret, configurable in UI)
                    paymentGatewayProvider: data.paymentGatewayProvider || 'lenco',
                    mobileMoneyFeePercent: Number(data.mobileMoneyFeePercent) * 100 || 2.5, // Convert from decimal to percentage
                    mobileMoneyFeeCap: Number(data.mobileMoneyFeeCap) || 0,
                    mobileMoneyEnabled: data.mobileMoneyEnabled !== false,
                    allowedPaymentMethods: data.allowedPaymentMethods || ['CASH', 'MOBILE_MONEY', 'BANK_DEPOSIT'],
                    allowedOrigins: data.allowedOrigins || [],
                    publicApiRateLimitPerMinute: data.publicApiRateLimitPerMinute || 30,
                    paymentApiRateLimitPerMinute: data.paymentApiRateLimitPerMinute || 10,
                });
            }
        } catch (error) {
            console.error('Failed to fetch platform settings:', error);
        }
    };

    const fetchLogs = async () => {
        if (!token) return;
        try {
            const response = await fetch(`${API_URL}/api/platform/audit-logs`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (response.ok) {
                const data = await response.json();
                setLogs(data.logs || []);
            }
        } catch (error) {
            console.error('Failed to fetch audit logs:', error);
        }
    };

    const savePlatformSettings = async () => {
        if (!token) return;
        setLoading(true);
        try {
            // Prepare payload with fee percent converted to decimal
            const payload = {
                ...settingsForm,
                mobileMoneyFeePercent: settingsForm.mobileMoneyFeePercent / 100, // Convert from percentage to decimal
            };
            
            const response = await fetch(`${API_URL}/api/platform/settings`, {
                method: 'PUT',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
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

    // Export Functions
    const exportData = async (type: 'tenants' | 'subscription-payments' | 'school-transactions') => {
        if (!token) return;
        try {
            let url = `${API_URL}/api/platform/export/${type}`;
            const params = new URLSearchParams();
            
            if (type === 'tenants') {
                if (statusFilter) params.append('status', statusFilter);
            } else if (type === 'subscription-payments') {
                if (paymentFilters.status) params.append('status', paymentFilters.status);
            } else if (type === 'school-transactions') {
                if (paymentFilters.status) params.append('status', paymentFilters.status);
                if (paymentFilters.tenantId) params.append('tenantId', paymentFilters.tenantId);
            }

            if (params.toString()) url += `?${params}`;

            const response = await fetch(url, {
                headers: { Authorization: `Bearer ${token}` },
            });

            if (response.ok) {
                const blob = await response.blob();
                const downloadUrl = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = downloadUrl;
                a.download = `${type}-${Date.now()}.csv`;
                document.body.appendChild(a);
                a.click();
                a.remove();
                window.URL.revokeObjectURL(downloadUrl);
            } else {
                alert('Failed to export data');
            }
        } catch (error) {
            console.error('Export error:', error);
            alert('Failed to export data');
        }
    };

    // Bulk Email Function
    const sendBulkEmail = async () => {
        if (!token) return;
        if (!bulkEmailForm.subject || !bulkEmailForm.message) {
            alert('Please fill in subject and message');
            return;
        }

        setLoading(true);
        try {
            const response = await fetch(`${API_URL}/api/platform/bulk/email`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(bulkEmailForm),
            });

            if (response.ok) {
                const data = await response.json();
                alert(`Email queued for ${data.recipientCount} schools`);
                setShowBulkEmailModal(false);
                setBulkEmailForm({
                    subject: '',
                    message: '',
                    targetTiers: [],
                    targetStatuses: [],
                });
            } else {
                const data = await response.json();
                alert(data.error || 'Failed to send bulk email');
            }
        } catch (error) {
            console.error('Bulk email error:', error);
            alert('Failed to send bulk email');
        } finally {
            setLoading(false);
        }
    };

    // Template Preview Handlers
    const handleTemplatePreview = (template: any) => {
        setSelectedTemplate(template);
        setShowTemplatePreview(true);
    };

    const handleUseTemplate = (template: any) => {
        setBulkEmailForm({
            ...bulkEmailForm,
            subject: template.subject,
            message: template.message,
        });
        setShowTemplatePreview(false);
        setShowBulkEmailModal(true);
    };

    // Bulk SMS Function
    const sendBulkSMS = async () => {
        if (!token) return;
        if (!bulkSMSForm.message) {
            alert('Please enter SMS message');
            return;
        }

        setLoading(true);
        try {
            const response = await fetch(`${API_URL}/api/platform/communication/bulk-sms`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    message: bulkSMSForm.message,
                    targetTiers: bulkSMSForm.targetTiers,
                    targetStatuses: bulkSMSForm.targetStatuses,
                }),
            });

            if (response.ok) {
                const data = await response.json();
                alert(`SMS queued for ${data.total} schools`);
                setShowBulkSMSModal(false);
                setBulkSMSForm({
                    message: '',
                    targetTiers: [],
                    targetStatuses: [],
                });
            } else {
                const data = await response.json();
                alert(data.error || 'Failed to send bulk SMS');
            }
        } catch (error) {
            console.error('Bulk SMS error:', error);
            alert('Failed to send bulk SMS');
        } finally {
            setLoading(false);
        }
    };

    // Bulk Notification Function
    const sendBulkNotification = async () => {
        if (!token) return;
        if (!bulkNotificationForm.title || !bulkNotificationForm.message) {
            alert('Please fill in title and message');
            return;
        }

        setLoading(true);
        try {
            const response = await fetch(`${API_URL}/api/platform/communication/bulk-notification`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    title: bulkNotificationForm.title,
                    message: bulkNotificationForm.message,
                    type: bulkNotificationForm.type,
                    targetTiers: bulkNotificationForm.targetTiers,
                    targetStatuses: bulkNotificationForm.targetStatuses,
                }),
            });

            if (response.ok) {
                const data = await response.json();
                alert(`Notifications sent to ${data.total} schools`);
                setShowBulkNotificationModal(false);
                setBulkNotificationForm({
                    title: '',
                    message: '',
                    type: 'INFO',
                    targetTiers: [],
                    targetStatuses: [],
                });
            } else {
                const data = await response.json();
                alert(data.error || 'Failed to send bulk notification');
            }
        } catch (error) {
            console.error('Bulk notification error:', error);
            alert('Failed to send bulk notification');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (token) {
            const init = async () => {
                try {
                    // Verify session first with strict role check
                    const res = await fetch(`${API_URL}/api/platform/auth/me`, {
                        headers: { Authorization: `Bearer ${token}` }
                    });

                    if (res.status === 401 || res.status === 403) {
                        handleLogout();
                        return;
                    }

                    if (res.ok) {
                        const userData = await res.json();
                        // Check strict platform role
                        if (!userData.role || !userData.role.startsWith('PLATFORM_')) {
                            handleLogout();
                            return;
                        }
                    }

                    // Fetch Dashboard Stats
                    const dashRes = await fetch(`${API_URL}/api/platform/dashboard`, {
                        headers: { Authorization: `Bearer ${token}` }
                    });
                    if (dashRes.ok) {
                        setStats(await dashRes.json());
                    }

                    // Fetch other data if verified
                    fetchPlans();
                    fetchAnnouncements();
                    fetchTenants();
                    fetchPayments();
                    fetchSmsConfig();
                    fetchPlatformSettings();
                    fetchCrmData();
                } catch (error) {
                    console.error('Init error:', error);
                }
            };
            init();
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
        <div className="min-h-screen bg-slate-100 flex">
            {/* Sidebar */}
            <aside className="w-64 bg-slate-900 text-white flex flex-col min-h-screen fixed left-0 top-0">
                {/* Logo Section */}
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
                    {/* Dashboard - Always visible */}
                    <button
                        onClick={() => setActiveTab('dashboard')}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg transition-colors ${
                            activeTab === 'dashboard'
                                ? 'bg-purple-600 text-white'
                                : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                        }`}
                    >
                        <BarChart3 className="w-5 h-5" />
                        <span>Dashboard</span>
                    </button>

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
                            {expandedGroups.operations ? (
                                <ChevronDown className="w-4 h-4" />
                            ) : (
                                <ChevronRight className="w-4 h-4" />
                            )}
                        </button>
                        {expandedGroups.operations && (
                            <div className="ml-4 space-y-1">
                                <button
                                    onClick={() => setActiveTab('tenants')}
                                    className={`w-full flex items-center gap-3 px-4 py-2 rounded-lg transition-colors text-sm ${
                                        activeTab === 'tenants'
                                            ? 'bg-purple-600 text-white'
                                            : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                                    }`}
                                >
                                    <Building2 className="w-4 h-4" />
                                    <span>Tenants</span>
                                </button>
                                <button
                                    onClick={() => setActiveTab('payments')}
                                    className={`w-full flex items-center gap-3 px-4 py-2 rounded-lg transition-colors text-sm ${
                                        activeTab === 'payments'
                                            ? 'bg-purple-600 text-white'
                                            : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                                    }`}
                                >
                                    <CreditCard className="w-4 h-4" />
                                    <span>Payments</span>
                                </button>
                                <button
                                    onClick={() => setActiveTab('plans')}
                                    className={`w-full flex items-center gap-3 px-4 py-2 rounded-lg transition-colors text-sm ${
                                        activeTab === 'plans'
                                            ? 'bg-purple-600 text-white'
                                            : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                                    }`}
                                >
                                    <DollarSign className="w-4 h-4" />
                                    <span>Plans</span>
                                </button>
                                <button
                                    onClick={() => setActiveTab('sms')}
                                    className={`w-full flex items-center gap-3 px-4 py-2 rounded-lg transition-colors text-sm ${
                                        activeTab === 'sms'
                                            ? 'bg-purple-600 text-white'
                                            : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                                    }`}
                                >
                                    <MessageSquare className="w-4 h-4" />
                                    <span>SMS Config</span>
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Finance Group */}
                    <div className="space-y-1">
                        <button
                            onClick={() => toggleGroup('finance')}
                            className="w-full flex items-center justify-between px-4 py-2 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
                        >
                            <div className="flex items-center gap-3">
                                <DollarSign className="w-5 h-5" />
                                <span className="font-medium">Finance</span>
                            </div>
                            {expandedGroups.finance ? (
                                <ChevronDown className="w-4 h-4" />
                            ) : (
                                <ChevronRight className="w-4 h-4" />
                            )}
                        </button>
                        {expandedGroups.finance && (
                            <div className="ml-4 space-y-1">
                                <button
                                    onClick={() => setActiveTab('invoices')}
                                    className={`w-full flex items-center gap-3 px-4 py-2 rounded-lg transition-colors text-sm ${
                                        activeTab === 'invoices'
                                            ? 'bg-purple-600 text-white'
                                            : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                                    }`}
                                >
                                    <CreditCard className="w-4 h-4" />
                                    <span>Invoice Management</span>
                                </button>
                                <button
                                    onClick={() => setActiveTab('reconciliation')}
                                    className={`w-full flex items-center gap-3 px-4 py-2 rounded-lg transition-colors text-sm ${
                                        activeTab === 'reconciliation'
                                            ? 'bg-purple-600 text-white'
                                            : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                                    }`}
                                >
                                    <TrendingUp className="w-4 h-4" />
                                    <span>Revenue Reconciliation</span>
                                </button>
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
                            {expandedGroups.security ? (
                                <ChevronDown className="w-4 h-4" />
                            ) : (
                                <ChevronRight className="w-4 h-4" />
                            )}
                        </button>
                        {expandedGroups.security && (
                            <div className="ml-4 space-y-1">
                                <button
                                    onClick={() => setActiveTab('security')}
                                    className={`w-full flex items-center gap-3 px-4 py-2 rounded-lg transition-colors text-sm ${
                                        activeTab === 'security'
                                            ? 'bg-purple-600 text-white'
                                            : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                                    }`}
                                >
                                    <Shield className="w-4 h-4" />
                                    <span>Security Dashboard</span>
                                </button>
                                <button
                                    onClick={() => setActiveTab('data')}
                                    className={`w-full flex items-center gap-3 px-4 py-2 rounded-lg transition-colors text-sm ${
                                        activeTab === 'data'
                                            ? 'bg-purple-600 text-white'
                                            : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                                    }`}
                                >
                                    <Database className="w-4 h-4" />
                                    <span>Data Management</span>
                                </button>
                                <button
                                    onClick={() => setActiveTab('audit')}
                                    className={`w-full flex items-center gap-3 px-4 py-2 rounded-lg transition-colors text-sm ${
                                        activeTab === 'audit'
                                            ? 'bg-purple-600 text-white'
                                            : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                                    }`}
                                >
                                    <Clock className="w-4 h-4" />
                                    <span>Audit Logs</span>
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Sales & CRM Group */}
                    <div className="space-y-1">
                        <button
                            onClick={() => toggleGroup('sales')}
                            className="w-full flex items-center justify-between px-4 py-2 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
                        >
                            <div className="flex items-center gap-3">
                                <Briefcase className="w-5 h-5" />
                                <span className="font-medium">Sales</span>
                            </div>
                            {expandedGroups.sales ? (
                                <ChevronDown className="w-4 h-4" />
                            ) : (
                                <ChevronRight className="w-4 h-4" />
                            )}
                        </button>
                        {expandedGroups.sales && (
                            <div className="ml-4 space-y-1">
                                <button
                                    onClick={() => setActiveTab('crm')}
                                    className={`w-full flex items-center gap-3 px-4 py-2 rounded-lg transition-colors text-sm ${
                                        activeTab === 'crm'
                                            ? 'bg-purple-600 text-white'
                                            : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                                    }`}
                                >
                                    <Briefcase className="w-4 h-4" />
                                    <span>CRM</span>
                                </button>
                                <button
                                    onClick={() => setActiveTab('communication')}
                                    className={`w-full flex items-center gap-3 px-4 py-2 rounded-lg transition-colors text-sm ${
                                        activeTab === 'communication'
                                            ? 'bg-purple-600 text-white'
                                            : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                                    }`}
                                >
                                    <Send className="w-4 h-4" />
                                    <span>Communication Center</span>
                                </button>
                                <button
                                    onClick={() => setActiveTab('announcements')}
                                    className={`w-full flex items-center gap-3 px-4 py-2 rounded-lg transition-colors text-sm ${
                                        activeTab === 'announcements'
                                            ? 'bg-purple-600 text-white'
                                            : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                                    }`}
                                >
                                    <MessageSquare className="w-4 h-4" />
                                    <span>Announcements</span>
                                </button>
                            </div>
                        )}
                    </div>

                    {/* System Group */}
                    <div className="space-y-1">
                        <button
                            onClick={() => toggleGroup('system')}
                            className="w-full flex items-center justify-between px-4 py-2 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
                        >
                            <div className="flex items-center gap-3">
                                <Settings className="w-5 h-5" />
                                <span className="font-medium">System</span>
                            </div>
                            {expandedGroups.system ? (
                                <ChevronDown className="w-4 h-4" />
                            ) : (
                                <ChevronRight className="w-4 h-4" />
                            )}
                        </button>
                        {expandedGroups.system && (
                            <div className="ml-4 space-y-1">
                                <button
                                    onClick={() => setActiveTab('settings')}
                                    className={`w-full flex items-center gap-3 px-4 py-2 rounded-lg transition-colors text-sm ${
                                        activeTab === 'settings'
                                            ? 'bg-purple-600 text-white'
                                            : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                                    }`}
                                >
                                    <Settings className="w-4 h-4" />
                                    <span>Settings</span>
                                </button>
                            </div>
                        )}
                    </div>
                </nav>

                {/* Bottom Actions */}
                <div className="px-4 py-4 border-t border-slate-700 space-y-2">
                    <button
                        onClick={() => { fetchDashboard(); fetchPlans(); fetchTenants(); fetchPayments(); }}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
                        title="Refresh"
                    >
                        <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
                        <span>Refresh Data</span>
                    </button>
                    <button
                        onClick={handleLogout}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-slate-400 hover:bg-red-600 hover:text-white transition-colors"
                    >
                        <LogOut className="w-5 h-5" />
                        <span>Logout</span>
                    </button>
                </div>
            </aside>

            {/* Main Content Area */}
            <div className="flex-1 ml-64">
                {/* Top Header Bar */}
                <header className="bg-white border-b px-8 py-4 sticky top-0 z-10">
                    <div className="flex items-center justify-between">
                        <h2 className="text-xl font-bold text-slate-900 capitalize">
                            {activeTab === 'crm' ? 'Sales CRM' : activeTab === 'sms' ? 'SMS Configuration' : activeTab}
                        </h2>
                        <div className="text-sm text-slate-500">
                            {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                        </div>
                    </div>
                </header>

                {/* Content */}
                <main className="p-8">
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

                            {/* Enhanced Revenue Analytics */}
                            {stats.revenueAnalytics && (
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                    <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-6 border border-green-200">
                                        <div className="flex items-center justify-between mb-2">
                                            <p className="text-sm text-green-700 font-medium">This Month</p>
                                            <TrendingUp className="w-5 h-5 text-green-600" />
                                        </div>
                                        <p className="text-2xl font-bold text-green-900">
                                            K{stats.revenueAnalytics.currentMonthRevenue.toLocaleString()}
                                        </p>
                                        <div className="flex items-center gap-1 mt-2">
                                            {stats.revenueAnalytics.revenueGrowth >= 0 ? (
                                                <TrendingUp className="w-4 h-4 text-green-600" />
                                            ) : (
                                                <TrendingDown className="w-4 h-4 text-red-600" />
                                            )}
                                            <span className={`text-sm font-medium ${stats.revenueAnalytics.revenueGrowth >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                {stats.revenueAnalytics.revenueGrowth.toFixed(1)}%
                                            </span>
                                            <span className="text-xs text-green-600">vs last month</span>
                                        </div>
                                    </div>

                                    <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-6 border border-blue-200">
                                        <div className="flex items-center justify-between mb-2">
                                            <p className="text-sm text-blue-700 font-medium">Avg per School</p>
                                            <BarChart3 className="w-5 h-5 text-blue-600" />
                                        </div>
                                        <p className="text-2xl font-bold text-blue-900">
                                            K{stats.revenueAnalytics.avgRevenuePerSchool.toLocaleString()}
                                        </p>
                                        <p className="text-xs text-blue-600 mt-2">Average revenue</p>
                                    </div>

                                    <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-6 border border-purple-200">
                                        <div className="flex items-center justify-between mb-2">
                                            <p className="text-sm text-purple-700 font-medium">Payment Success</p>
                                            <Percent className="w-5 h-5 text-purple-600" />
                                        </div>
                                        <p className="text-2xl font-bold text-purple-900">
                                            {stats.revenueAnalytics.paymentSuccessRate.toFixed(1)}%
                                        </p>
                                        <p className="text-xs text-purple-600 mt-2">Last 30 days</p>
                                    </div>

                                    <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-xl p-6 border border-amber-200">
                                        <div className="flex items-center justify-between mb-2">
                                            <p className="text-sm text-amber-700 font-medium">School Fees</p>
                                            <CreditCard className="w-5 h-5 text-amber-600" />
                                        </div>
                                        <p className="text-2xl font-bold text-amber-900">
                                            K{stats.revenueAnalytics.schoolTransactionVolume.total.toLocaleString()}
                                        </p>
                                        <p className="text-xs text-amber-600 mt-2">
                                            {stats.revenueAnalytics.schoolTransactionVolume.count.toLocaleString()} transactions
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* Revenue Trend Chart */}
                            {stats.revenueByMonth && Object.keys(stats.revenueByMonth).length > 0 && (
                                <div className="bg-white rounded-xl p-6 border">
                                    <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
                                        <TrendingUp className="w-5 h-5 text-purple-600" />
                                        Revenue Trend (Last 12 Months)
                                    </h3>
                                    <div className="space-y-3">
                                        {Object.entries(stats.revenueByMonth)
                                            .sort(([a], [b]) => a.localeCompare(b))
                                            .slice(-12)
                                            .map(([month, amount]) => {
                                                const maxAmount = Math.max(...Object.values(stats.revenueByMonth));
                                                const percentage = maxAmount > 0 ? (amount / maxAmount) * 100 : 0;
                                                const date = new Date(month + '-01');
                                                const monthName = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

                                                return (
                                                    <div key={month} className="flex items-center gap-3">
                                                        <div className="w-20 text-xs text-slate-600 font-medium">{monthName}</div>
                                                        <div className="flex-1 bg-slate-100 rounded-full h-8 relative overflow-hidden">
                                                            <div
                                                                className="absolute inset-y-0 left-0 bg-gradient-to-r from-purple-500 to-purple-600 rounded-full transition-all duration-500 flex items-center justify-end pr-3"
                                                                style={{ width: `${Math.max(percentage, 5)}%` }}
                                                            >
                                                                {amount > 0 && (
                                                                    <span className="text-xs font-semibold text-white">
                                                                        K{amount.toLocaleString()}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                    </div>
                                    
                                    {/* Summary */}
                                    <div className="mt-6 pt-4 border-t flex justify-between items-center">
                                        <div>
                                            <p className="text-xs text-slate-500">Total (12 months)</p>
                                            <p className="text-lg font-bold text-purple-600">
                                                K{Object.values(stats.revenueByMonth).reduce((sum, val) => sum + val, 0).toLocaleString()}
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-slate-500">Average/month</p>
                                            <p className="text-lg font-bold text-slate-900">
                                                K{(Object.values(stats.revenueByMonth).reduce((sum, val) => sum + val, 0) / Object.keys(stats.revenueByMonth).length).toFixed(0)}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}

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
                                    className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition-colors"
                                >
                                    <Filter className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={() => exportData('tenants')}
                                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
                                    title="Export to CSV"
                                >
                                    <Download className="w-4 h-4" />
                                    Export
                                </button>
                                <button
                                    onClick={() => setShowBulkEmailModal(true)}
                                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
                                    title="Send Bulk Email"
                                >
                                    <Send className="w-4 h-4" />
                                    Bulk Email
                                </button>
                                <button
                                    onClick={() => { resetTenantForm(); setShowTenantModal(true); }}
                                    className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-2"
                                >
                                    <Plus className="w-4 h-4" />
                                    Add School
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
                                                        <button
                                                            onClick={() => openEditTenantModal(tenant)}
                                                            className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                                                            title="Edit"
                                                        >
                                                            <Eye className="w-4 h-4" />
                                                        </button>
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
                    {/* Add/Edit Tenant Modal */}
                    {showTenantModal && (
                        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                            <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                                <div className="px-6 py-4 border-b flex items-center justify-between">
                                    <h3 className="text-lg font-semibold text-slate-900">
                                        {editingTenant ? 'Edit School' : 'Add New School'}
                                    </h3>
                                    <button
                                        onClick={() => { setShowTenantModal(false); resetTenantForm(); }}
                                        className="p-2 hover:bg-slate-100 rounded-lg"
                                    >
                                        <XCircle className="w-5 h-5 text-slate-500" />
                                    </button>
                                </div>
                                <div className="p-6 space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1">School Name *</label>
                                            <input
                                                type="text"
                                                value={tenantForm.name}
                                                onChange={(e) => setTenantForm({ ...tenantForm, name: e.target.value })}
                                                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                                                placeholder="Lusaka Academy"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1">Slug *</label>
                                            <input
                                                type="text"
                                                value={tenantForm.slug}
                                                onChange={(e) => setTenantForm({ ...tenantForm, slug: e.target.value.toLowerCase().replace(/\s+/g, '-') })}
                                                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                                                placeholder="lusaka-academy"
                                            />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1">Email *</label>
                                            <input
                                                type="email"
                                                value={tenantForm.email}
                                                onChange={(e) => setTenantForm({ ...tenantForm, email: e.target.value })}
                                                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                                                placeholder="admin@school.com"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
                                            <input
                                                type="tel"
                                                value={tenantForm.phone}
                                                onChange={(e) => setTenantForm({ ...tenantForm, phone: e.target.value })}
                                                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                                                placeholder="+260 97 1234567"
                                            />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1">Address</label>
                                            <input
                                                type="text"
                                                value={tenantForm.address}
                                                onChange={(e) => setTenantForm({ ...tenantForm, address: e.target.value })}
                                                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                                                placeholder="123 Main Street"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1">City</label>
                                            <input
                                                type="text"
                                                value={tenantForm.city}
                                                onChange={(e) => setTenantForm({ ...tenantForm, city: e.target.value })}
                                                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                                                placeholder="Lusaka"
                                            />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1">Country</label>
                                            <select
                                                value={tenantForm.country}
                                                onChange={(e) => setTenantForm({ ...tenantForm, country: e.target.value })}
                                                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                                            >
                                                <option value="ZM">Zambia</option>
                                                <option value="MW">Malawi</option>
                                                <option value="ZW">Zimbabwe</option>
                                                <option value="BW">Botswana</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1">Subscription Tier</label>
                                            <select
                                                value={tenantForm.tier}
                                                onChange={(e) => setTenantForm({ ...tenantForm, tier: e.target.value })}
                                                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                                            >
                                                <option value="FREE">Free</option>
                                                <option value="STARTER">Starter</option>
                                                <option value="PROFESSIONAL">Professional</option>
                                                <option value="ENTERPRISE">Enterprise</option>
                                            </select>
                                        </div>
                                    </div>

                                    {/* Admin User Details (Only for new tenants) */}
                                    {!editingTenant && (
                                        <div className="pt-4 border-t">
                                            <h4 className="text-sm font-semibold text-slate-900 mb-4">Initial Administrator</h4>
                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="col-span-2">
                                                    <label className="block text-sm font-medium text-slate-700 mb-1">Full Name *</label>
                                                    <input
                                                        type="text"
                                                        value={tenantForm.adminFullName}
                                                        onChange={(e) => setTenantForm({ ...tenantForm, adminFullName: e.target.value })}
                                                        className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                                                        placeholder="John Doe"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-slate-700 mb-1">Admin Email *</label>
                                                    <input
                                                        type="email"
                                                        value={tenantForm.adminEmail}
                                                        onChange={(e) => setTenantForm({ ...tenantForm, adminEmail: e.target.value })}
                                                        className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                                                        placeholder="admin@school.com"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-slate-700 mb-1">Password *</label>
                                                    <input
                                                        type="password"
                                                        value={tenantForm.adminPassword}
                                                        onChange={(e) => setTenantForm({ ...tenantForm, adminPassword: e.target.value })}
                                                        className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                                                        placeholder="••••••••"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                                <div className="px-6 py-4 border-t bg-slate-50 flex justify-end gap-3">
                                    <button
                                        onClick={() => { setShowTenantModal(false); resetTenantForm(); }}
                                        className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={saveTenant}
                                        disabled={loading}
                                        className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                                    >
                                        <Save className="w-4 h-4" />
                                        {loading ? 'Saving...' : (editingTenant ? 'Update School' : 'Create School')}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Payments Tab */}
                    {activeTab === 'payments' && (
                        <div className="space-y-6">
                            {/* Finance Analytics Dashboard */}
                            {financeAnalytics && (
                                <div className="space-y-4">
                                    {/* Period Selector */}
                                    <div className="flex items-center justify-between">
                                        <h2 className="text-lg font-semibold text-slate-900">Finance Overview</h2>
                                        <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-lg">
                                            {(['day', 'week', 'month', 'year'] as const).map((period) => (
                                                <button
                                                    key={period}
                                                    onClick={() => setFinanceAnalyticsPeriod(period)}
                                                    className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                                                        financeAnalyticsPeriod === period
                                                            ? 'bg-white text-purple-600 shadow-sm'
                                                            : 'text-slate-600 hover:text-slate-900'
                                                    }`}
                                                >
                                                    {period.charAt(0).toUpperCase() + period.slice(1)}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Key Metrics Cards */}
                                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                        {/* Subscription Revenue */}
                                        <div className="bg-white rounded-xl p-4 border shadow-sm">
                                            <div className="flex items-center justify-between">
                                                <div className="p-2 bg-purple-100 rounded-lg">
                                                    <CreditCard className="w-5 h-5 text-purple-600" />
                                                </div>
                                                <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                                                    financeAnalytics.subscriptionRevenue.growth >= 0 
                                                        ? 'bg-green-100 text-green-700' 
                                                        : 'bg-red-100 text-red-700'
                                                }`}>
                                                    {financeAnalytics.subscriptionRevenue.growth >= 0 ? '+' : ''}
                                                    {financeAnalytics.subscriptionRevenue.growth.toFixed(1)}%
                                                </span>
                                            </div>
                                            <div className="mt-3">
                                                <p className="text-2xl font-bold text-slate-900">
                                                    ZMW {financeAnalytics.subscriptionRevenue.current.toLocaleString()}
                                                </p>
                                                <p className="text-sm text-slate-500">Subscription Revenue</p>
                                                <p className="text-xs text-slate-400 mt-1">
                                                    {financeAnalytics.subscriptionRevenue.transactionCount} transactions
                                                </p>
                                            </div>
                                        </div>

                                        {/* School Collections */}
                                        <div className="bg-white rounded-xl p-4 border shadow-sm">
                                            <div className="flex items-center justify-between">
                                                <div className="p-2 bg-blue-100 rounded-lg">
                                                    <DollarSign className="w-5 h-5 text-blue-600" />
                                                </div>
                                                <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                                                    financeAnalytics.schoolCollections.growth >= 0 
                                                        ? 'bg-green-100 text-green-700' 
                                                        : 'bg-red-100 text-red-700'
                                                }`}>
                                                    {financeAnalytics.schoolCollections.growth >= 0 ? '+' : ''}
                                                    {financeAnalytics.schoolCollections.growth.toFixed(1)}%
                                                </span>
                                            </div>
                                            <div className="mt-3">
                                                <p className="text-2xl font-bold text-slate-900">
                                                    ZMW {financeAnalytics.schoolCollections.current.toLocaleString()}
                                                </p>
                                                <p className="text-sm text-slate-500">School Collections</p>
                                                <p className="text-xs text-slate-400 mt-1">
                                                    {financeAnalytics.schoolCollections.transactionCount} transactions
                                                </p>
                                            </div>
                                        </div>

                                        {/* Processing Fees */}
                                        <div className="bg-white rounded-xl p-4 border shadow-sm">
                                            <div className="flex items-center justify-between">
                                                <div className="p-2 bg-emerald-100 rounded-lg">
                                                    <Percent className="w-5 h-5 text-emerald-600" />
                                                </div>
                                                <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                                                    financeAnalytics.processingFees.growth >= 0 
                                                        ? 'bg-green-100 text-green-700' 
                                                        : 'bg-red-100 text-red-700'
                                                }`}>
                                                    {financeAnalytics.processingFees.growth >= 0 ? '+' : ''}
                                                    {financeAnalytics.processingFees.growth.toFixed(1)}%
                                                </span>
                                            </div>
                                            <div className="mt-3">
                                                <p className="text-2xl font-bold text-slate-900">
                                                    ZMW {financeAnalytics.processingFees.current.toLocaleString()}
                                                </p>
                                                <p className="text-sm text-slate-500">Processing Fees Earned</p>
                                                <p className="text-xs text-slate-400 mt-1">
                                                    From {financeAnalytics.processingFees.transactionCount} mobile payments
                                                </p>
                                            </div>
                                        </div>

                                        {/* Issues */}
                                        <div className="bg-white rounded-xl p-4 border shadow-sm">
                                            <div className="flex items-center justify-between">
                                                <div className="p-2 bg-amber-100 rounded-lg">
                                                    <AlertTriangle className="w-5 h-5 text-amber-600" />
                                                </div>
                                            </div>
                                            <div className="mt-3">
                                                <p className="text-2xl font-bold text-slate-900">
                                                    {financeAnalytics.issues.failed.length + financeAnalytics.issues.pending.length}
                                                </p>
                                                <p className="text-sm text-slate-500">Payment Issues</p>
                                                <div className="flex gap-3 text-xs text-slate-400 mt-1">
                                                    <span className="text-red-500">{financeAnalytics.issues.failed.length} failed</span>
                                                    <span className="text-amber-500">{financeAnalytics.issues.pending.length} pending</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Detailed Breakdown */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {/* Collections by Method */}
                                        <div className="bg-white rounded-xl p-4 border">
                                            <h3 className="font-medium text-slate-900 mb-3">Collections by Method</h3>
                                            <div className="space-y-3">
                                                {financeAnalytics.schoolCollections.byMethod.map((method) => (
                                                    <div key={method.method} className="flex items-center justify-between">
                                                        <div className="flex items-center gap-2">
                                                            <span className={`w-3 h-3 rounded-full ${
                                                                method.method === 'MOBILE_MONEY' ? 'bg-blue-500' : 'bg-green-500'
                                                            }`}></span>
                                                            <span className="text-sm text-slate-700">{method.method.replace('_', ' ')}</span>
                                                        </div>
                                                        <div className="text-right">
                                                            <p className="text-sm font-semibold text-slate-900">ZMW {method.amount.toLocaleString()}</p>
                                                            <p className="text-xs text-slate-400">{method.count} transactions</p>
                                                            {method.fees > 0 && (
                                                                <p className="text-xs text-emerald-600">+ZMW {method.fees.toLocaleString()} fees</p>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Top Schools */}
                                        <div className="bg-white rounded-xl p-4 border">
                                            <h3 className="font-medium text-slate-900 mb-3">Top Schools by Collections</h3>
                                            <div className="space-y-2 max-h-48 overflow-y-auto">
                                                {financeAnalytics.schoolCollections.topSchools.slice(0, 5).map((school, index) => (
                                                    <div key={school.tenant.slug} className="flex items-center justify-between py-1">
                                                        <div className="flex items-center gap-2">
                                                            <span className="w-5 h-5 rounded-full bg-slate-100 text-xs flex items-center justify-center font-medium text-slate-600">
                                                                {index + 1}
                                                            </span>
                                                            <span className="text-sm text-slate-700">{school.tenant.name}</span>
                                                        </div>
                                                        <div className="text-right">
                                                            <p className="text-sm font-semibold text-slate-900">ZMW {school.amount.toLocaleString()}</p>
                                                            <p className="text-xs text-slate-400">{school.count} payments</p>
                                                        </div>
                                                    </div>
                                                ))}
                                                {financeAnalytics.schoolCollections.topSchools.length === 0 && (
                                                    <p className="text-sm text-slate-400 text-center py-4">No collections this period</p>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Subscription Revenue by Tier */}
                                    <div className="bg-white rounded-xl p-4 border">
                                        <h3 className="font-medium text-slate-900 mb-3">Subscription Revenue by Tier</h3>
                                        <div className="flex gap-4 flex-wrap">
                                            {Object.entries(financeAnalytics.subscriptionRevenue.byTier).map(([tier, amount]) => (
                                                <div key={tier} className={`px-4 py-2 rounded-lg ${
                                                    tier === 'ENTERPRISE' ? 'bg-amber-50 border border-amber-200' :
                                                    tier === 'PROFESSIONAL' ? 'bg-purple-50 border border-purple-200' :
                                                    'bg-blue-50 border border-blue-200'
                                                }`}>
                                                    <p className="text-xs font-medium text-slate-500">{tier}</p>
                                                    <p className="text-lg font-bold text-slate-900">ZMW {amount.toLocaleString()}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Payment Type Switcher */}
                            <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-lg w-fit">
                                <button
                                    onClick={() => setActivePaymentType('subscription')}
                                    className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                                        activePaymentType === 'subscription'
                                            ? 'bg-white text-purple-600 shadow-sm'
                                            : 'text-slate-600 hover:text-slate-900'
                                    }`}
                                >
                                    Subscription Payments
                                </button>
                                <button
                                    onClick={() => setActivePaymentType('school')}
                                    className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                                        activePaymentType === 'school'
                                            ? 'bg-white text-purple-600 shadow-sm'
                                            : 'text-slate-600 hover:text-slate-900'
                                    }`}
                                >
                                    School Transactions
                                </button>
                            </div>

                            {/* Filters */}
                            <div className="flex gap-4">
                                <div className="relative flex-1 max-w-sm">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                    <input
                                        type="text"
                                        placeholder={activePaymentType === 'subscription' ? "Search schools or receipts..." : "Search schools or students..."}
                                        className="w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                                        value={paymentFilters.search}
                                        onChange={(e) => setPaymentFilters({ ...paymentFilters, search: e.target.value })}
                                    />
                                </div>
                                
                                {/* School Filter - Only for School Transactions */}
                                {activePaymentType === 'school' && (
                                    <select
                                        className="px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                                        value={paymentFilters.tenantId}
                                        onChange={(e) => setPaymentFilters({ ...paymentFilters, tenantId: e.target.value })}
                                    >
                                        <option value="">All Schools</option>
                                        {tenants.map((tenant) => (
                                            <option key={tenant.id} value={tenant.id}>
                                                {tenant.name}
                                            </option>
                                        ))}
                                    </select>
                                )}
                                
                                <select
                                    className="px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                                    value={paymentFilters.status}
                                    onChange={(e) => setPaymentFilters({ ...paymentFilters, status: e.target.value })}
                                >
                                    <option value="">All Status</option>
                                    <option value="COMPLETED">Completed</option>
                                    <option value="PENDING">Pending</option>
                                    <option value="FAILED">Failed</option>
                                </select>

                                <button
                                    onClick={() => exportData(activePaymentType === 'subscription' ? 'subscription-payments' : 'school-transactions')}
                                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
                                    title="Export to CSV"
                                >
                                    <Download className="w-4 h-4" />
                                    Export
                                </button>
                            </div>

                            {/* Subscription Payments Table */}
                            {activePaymentType === 'subscription' && (
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
                                            {payments.length === 0 ? (
                                                <tr>
                                                    <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                                                        No subscription payments found.
                                                    </td>
                                                </tr>
                                            ) : (
                                                payments.map((payment) => (
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
                                                        <td className="px-4 py-3 flex gap-2">
                                                            <button
                                                                onClick={() => viewPaymentDetails(payment)}
                                                                title="View Details"
                                                                className="p-1 hover:bg-slate-100 rounded text-slate-500 hover:text-purple-600"
                                                            >
                                                                <Eye className="w-4 h-4" />
                                                            </button>
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
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {/* School Transactions Table */}
                            {activePaymentType === 'school' && (
                                <div className="bg-white rounded-xl border overflow-hidden">
                                    <div className="px-6 py-4 border-b bg-slate-50">
                                        <h3 className="font-semibold text-slate-900">School Fee Collections (Gateway Payments)</h3>
                                        <p className="text-sm text-slate-500 mt-1">Payments collected by schools through payment gateways - Mobile Money & Bank Deposits only</p>
                                    </div>
                                    <table className="w-full">
                                        <thead className="bg-slate-50">
                                            <tr>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">School</th>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Student</th>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Amount</th>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Method</th>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Fee</th>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Transaction ID</th>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Status</th>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Date</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {schoolTransactions.length === 0 ? (
                                                <tr>
                                                    <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                                                        No school transactions found.
                                                    </td>
                                                </tr>
                                            ) : (
                                                schoolTransactions.map((transaction) => (
                                                    <tr key={transaction.id} className="hover:bg-slate-50">
                                                        <td className="px-4 py-3">
                                                            <div className="font-medium text-slate-900">{transaction.tenant.name}</div>
                                                            <div className="text-xs text-slate-500">{transaction.tenant.slug}</div>
                                                        </td>
                                                        <td className="px-4 py-3 text-sm text-slate-700">
                                                            {transaction.studentName}
                                                            {transaction.admissionNumber && (
                                                                <div className="text-xs text-slate-400">{transaction.admissionNumber}</div>
                                                            )}
                                                        </td>
                                                        <td className="px-4 py-3 font-semibold text-slate-900">
                                                            {transaction.currency} {transaction.amount.toLocaleString()}
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                                                                transaction.method === 'MOBILE_MONEY' ? 'bg-blue-100 text-blue-800' :
                                                                transaction.method === 'BANK_DEPOSIT' ? 'bg-green-100 text-green-800' :
                                                                'bg-slate-100 text-slate-800'
                                                            }`}>
                                                                {transaction.method.replace('_', ' ')}
                                                            </span>
                                                            {transaction.mobileMoneyOperator && (
                                                                <div className="text-xs text-slate-400 mt-0.5">{transaction.mobileMoneyOperator.toUpperCase()}</div>
                                                            )}
                                                        </td>
                                                        <td className="px-4 py-3 text-sm text-emerald-600 font-medium">
                                                            {transaction.mobileMoneyFee > 0 ? `+ZMW ${transaction.mobileMoneyFee.toLocaleString()}` : '-'}
                                                        </td>
                                                        <td className="px-4 py-3 text-xs font-mono text-slate-600">{transaction.transactionId}</td>
                                                        <td className="px-4 py-3">
                                                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                                                                transaction.status === 'COMPLETED' ? 'bg-green-100 text-green-800' :
                                                                transaction.status === 'PENDING' ? 'bg-amber-100 text-amber-800' :
                                                                'bg-red-100 text-red-800'
                                                            }`}>
                                                                {transaction.status}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-3 text-sm text-slate-600">
                                                            {new Date(transaction.date).toLocaleDateString()}
                                                        </td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {/* Payment Detail Modal */}
                            {showPaymentModal && selectedPayment && (
                                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                                    <div className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
                                        <div className="px-6 py-4 border-b flex items-center justify-between">
                                            <h3 className="text-lg font-semibold text-slate-900">Payment Details</h3>
                                            <button
                                                onClick={() => setShowPaymentModal(false)}
                                                className="p-2 hover:bg-slate-100 rounded-lg"
                                            >
                                                <XCircle className="w-5 h-5 text-slate-500" />
                                            </button>
                                        </div>
                                        <div className="p-6 space-y-4">
                                            <div className="flex justify-between items-start">
                                                <div>
                                                    <div className="text-sm text-slate-500">School</div>
                                                    <div className="font-semibold text-lg">{selectedPayment.tenant.name}</div>
                                                    <div className="text-xs text-slate-400">{selectedPayment.tenant.slug}</div>
                                                </div>
                                                <div className="text-right">
                                                    <div className="text-sm text-slate-500">Amount</div>
                                                    <div className="font-bold text-xl text-purple-600">
                                                        {selectedPayment.currency} {selectedPayment.totalAmount.toLocaleString()}
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-2 gap-4 py-4 border-t border-b border-slate-100">
                                                <div>
                                                    <div className="text-sm text-slate-500">Plan</div>
                                                    <div className="font-medium">{selectedPayment.plan.name}</div>
                                                </div>
                                                <div>
                                                    <div className="text-sm text-slate-500">Status</div>
                                                    <div className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${selectedPayment.status === 'COMPLETED' ? 'bg-green-100 text-green-800' :
                                                        selectedPayment.status === 'PENDING' ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'}`}>
                                                        {selectedPayment.status}
                                                    </div>
                                                </div>
                                                <div>
                                                    <div className="text-sm text-slate-500">Billing Cycle</div>
                                                    <div className="font-medium capitalize">{selectedPayment.billingCycle.toLowerCase()}</div>
                                                </div>
                                                <div>
                                                    <div className="text-sm text-slate-500">Method</div>
                                                    <div className="font-medium capitalize">{selectedPayment.paymentMethod.replace('_', ' ')}</div>
                                                </div>
                                                <div>
                                                    <div className="text-sm text-slate-500">Student Count</div>
                                                    <div className="font-medium">{selectedPayment.studentCount}</div>
                                                </div>
                                                <div>
                                                    <div className="text-sm text-slate-500">Date</div>
                                                    <div className="font-medium">{new Date(selectedPayment.createdAt).toLocaleDateString()}</div>
                                                </div>
                                            </div>

                                            <div>
                                                <div className="text-sm text-slate-500 mb-2">Breakdown</div>
                                                <div className="bg-slate-50 rounded-lg p-3 space-y-2 text-sm">
                                                    <div className="flex justify-between">
                                                        <span>Base Plan</span>
                                                        <span className="font-medium">{selectedPayment.currency} {selectedPayment.baseAmount.toLocaleString()}</span>
                                                    </div>
                                                    {selectedPayment.overageAmount > 0 && (
                                                        <div className="flex justify-between text-amber-600">
                                                            <span>Overage ({selectedPayment.overageStudents} students)</span>
                                                            <span className="font-medium">+ {selectedPayment.currency} {selectedPayment.overageAmount.toLocaleString()}</span>
                                                        </div>
                                                    )}
                                                    <div className="flex justify-between pt-2 border-t font-semibold">
                                                        <span>Total</span>
                                                        <span>{selectedPayment.currency} {selectedPayment.totalAmount.toLocaleString()}</span>
                                                    </div>
                                                </div>
                                            </div>

                                            {selectedPayment.externalRef && (
                                                <div className="text-xs text-slate-400 text-center pt-2">
                                                    Ref: {selectedPayment.externalRef} • Receipt: {selectedPayment.receiptNumber}
                                                </div>
                                            )}

                                            {/* Download Invoice Button */}
                                            {selectedPayment.status === 'COMPLETED' && (
                                                <div className="mt-4 pt-4 border-t">
                                                    <button
                                                        onClick={() => {
                                                            const url = `${API_URL}/api/platform/invoices/${selectedPayment.id}/pdf`;
                                                            const a = document.createElement('a');
                                                            a.href = url;
                                                            a.download = `invoice-${selectedPayment.receiptNumber || selectedPayment.id}.pdf`;
                                                            a.target = '_blank';
                                                            // Add auth header
                                                            fetch(url, {
                                                                headers: { Authorization: `Bearer ${token}` }
                                                            }).then(res => res.blob()).then(blob => {
                                                                const blobUrl = window.URL.createObjectURL(blob);
                                                                a.href = blobUrl;
                                                                a.click();
                                                                window.URL.revokeObjectURL(blobUrl);
                                                            });
                                                        }}
                                                        className="w-full px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center justify-center gap-2"
                                                    >
                                                        <Download className="w-4 h-4" />
                                                        Download Invoice PDF
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}
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

                    {/* Plans Tab */}
                    {activeTab === 'plans' && (
                        <div className="space-y-6">
                            <div className="flex justify-between items-center">
                                <div>
                                    <h2 className="text-2xl font-bold text-slate-900">Subscription Plans</h2>
                                    <p className="text-slate-600 mt-1">Manage pricing tiers and features for schools</p>
                                </div>
                                <button
                                    onClick={() => {
                                        setEditingPlan(null);
                                        setNewPlan({
                                            name: '',
                                            tier: 'STARTER',
                                            monthlyPriceZMW: 0,
                                            yearlyPriceZMW: 0,
                                            includedStudents: 50,
                                            maxStudents: 50,
                                            maxTeachers: 5,
                                            maxUsers: 10,
                                            maxClasses: 5,
                                            maxStorageGB: 1,
                                            features: [],
                                            isActive: true,
                                            isPopular: false,
                                            description: ''
                                        });
                                        setIsPlanModalOpen(true);
                                    }}
                                    className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-2"
                                >
                                    <Plus className="w-4 h-4" />
                                    Create Plan
                                </button>
                            </div>

                            {/* Plans Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {plans.map((plan) => (
                                    <div 
                                        key={plan.id} 
                                        className={`bg-white rounded-xl border-2 overflow-hidden transition-all hover:shadow-lg ${
                                            plan.isPopular 
                                                ? 'border-purple-500 shadow-md' 
                                                : plan.isActive 
                                                    ? 'border-slate-200' 
                                                    : 'border-slate-100 opacity-60'
                                        }`}
                                    >
                                        {/* Header */}
                                        <div className={`px-6 py-4 ${
                                            plan.isPopular 
                                                ? 'bg-gradient-to-r from-purple-500 to-purple-600' 
                                                : 'bg-slate-50'
                                        }`}>
                                            <div className="flex items-start justify-between">
                                                <div>
                                                    <h3 className={`text-xl font-bold ${
                                                        plan.isPopular ? 'text-white' : 'text-slate-900'
                                                    }`}>
                                                        {plan.name}
                                                    </h3>
                                                    <span className={`inline-block mt-1 px-2 py-0.5 rounded text-xs font-medium ${
                                                        plan.isPopular 
                                                            ? 'bg-white/20 text-white' 
                                                            : 'bg-slate-200 text-slate-700'
                                                    }`}>
                                                        {plan.tier}
                                                    </span>
                                                </div>
                                                {plan.isPopular && (
                                                    <span className="px-2 py-1 bg-yellow-400 text-yellow-900 text-xs font-bold rounded">
                                                        POPULAR
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Pricing */}
                                        <div className="px-6 py-4 border-b">
                                            <div className="flex items-baseline gap-1">
                                                <span className="text-3xl font-bold text-slate-900">
                                                    K{plan.monthlyPriceZMW}
                                                </span>
                                                <span className="text-slate-600">/month</span>
                                            </div>
                                            {plan.yearlyPriceZMW > 0 && (
                                                <p className="text-sm text-slate-600 mt-1">
                                                    or K{plan.yearlyPriceZMW}/year
                                                </p>
                                            )}
                                        </div>

                                        {/* Limits */}
                                        <div className="px-6 py-4 space-y-3">
                                            <div className="flex items-center justify-between text-sm">
                                                <span className="text-slate-600 flex items-center gap-2">
                                                    <Users className="w-4 h-4" />
                                                    Students
                                                </span>
                                                <span className="font-semibold text-slate-900">
                                                    {plan.maxStudents === 0 ? 'Unlimited' : plan.maxStudents}
                                                </span>
                                            </div>
                                            <div className="flex items-center justify-between text-sm">
                                                <span className="text-slate-600 flex items-center gap-2">
                                                    <GraduationCap className="w-4 h-4" />
                                                    Teachers
                                                </span>
                                                <span className="font-semibold text-slate-900">
                                                    {plan.maxTeachers === 0 ? 'Unlimited' : plan.maxTeachers}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Features */}
                                        {plan.features && plan.features.length > 0 && (
                                            <div className="px-6 py-4 border-t bg-slate-50">
                                                <p className="text-xs font-medium text-slate-700 mb-2">FEATURES</p>
                                                <div className="space-y-1 max-h-48 overflow-y-auto">
                                                    {plan.features.map((feature, idx) => (
                                                        <div key={idx} className="flex items-center gap-2 text-sm text-slate-600">
                                                            <CheckCircle className="w-3 h-3 text-green-600 flex-shrink-0" />
                                                            <span className="truncate">{feature}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Status & Actions */}
                                        <div className="px-6 py-4 border-t bg-white flex items-center justify-between gap-3">
                                            <button
                                                onClick={() => togglePlanStatus(plan)}
                                                className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                                                    plan.isActive 
                                                        ? 'bg-green-100 text-green-700 hover:bg-green-200' 
                                                        : 'bg-red-100 text-red-700 hover:bg-red-200'
                                                }`}
                                            >
                                                {plan.isActive ? '✓ Active' : '✕ Inactive'}
                                            </button>
                                            <button
                                                onClick={() => {
                                                    setEditingPlan(plan);
                                                    setNewPlan(plan);
                                                    setIsPlanModalOpen(true);
                                                }}
                                                className="flex-1 px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm font-medium transition-colors flex items-center justify-center gap-1"
                                            >
                                                <Settings className="w-3 h-3" />
                                                Edit
                                            </button>
                                        </div>

                                        {/* Subscription Count */}
                                        {plan._count && plan._count.subscriptionPayments > 0 && (
                                            <div className="px-6 py-2 bg-blue-50 border-t border-blue-100">
                                                <p className="text-xs text-blue-700 text-center">
                                                    {plan._count.subscriptionPayments} active subscription{plan._count.subscriptionPayments !== 1 ? 's' : ''}
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>

                            {/* Empty State */}
                            {plans.length === 0 && (
                                <div className="bg-white rounded-xl border-2 border-dashed border-slate-300 p-12 text-center">
                                    <CreditCard className="w-12 h-12 text-slate-400 mx-auto mb-4" />
                                    <h3 className="text-lg font-semibold text-slate-900 mb-2">No Plans Yet</h3>
                                    <p className="text-slate-600 mb-4">Create your first subscription plan to get started</p>
                                    <button
                                        onClick={() => {
                                            setEditingPlan(null);
                                            setNewPlan({
                                                name: '',
                                                tier: 'STARTER',
                                                monthlyPriceZMW: 0,
                                                yearlyPriceZMW: 0,
                                                includedStudents: 50,
                                                maxStudents: 50,
                                                maxTeachers: 5,
                                                maxUsers: 10,
                                                maxClasses: 5,
                                                maxStorageGB: 1,
                                                features: [],
                                                isActive: true,
                                                isPopular: false,
                                                description: ''
                                            });
                                            setIsPlanModalOpen(true);
                                        }}
                                        className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors inline-flex items-center gap-2"
                                    >
                                        <Plus className="w-4 h-4" />
                                        Create First Plan
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Plan Modal */}
                    {isPlanModalOpen && (
                        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                            <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-xl max-h-[90vh] overflow-y-auto">
                                <h3 className="text-xl font-bold mb-4">{editingPlan ? 'Edit Plan' : 'Create Plan'}</h3>
                                <form onSubmit={savePlan} className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700">Name</label>
                                            <input
                                                type="text"
                                                value={newPlan.name}
                                                onChange={e => setNewPlan({ ...newPlan, name: e.target.value })}
                                                className="w-full border rounded px-3 py-2"
                                                required
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700">Tier</label>
                                            <select
                                                value={newPlan.tier}
                                                onChange={e => setNewPlan({ ...newPlan, tier: e.target.value })}
                                                className="w-full border rounded px-3 py-2"
                                                disabled={!!editingPlan}
                                            >
                                                {(settingsForm.availableTiers?.length > 0 ? settingsForm.availableTiers : [
                                                    { key: 'FREE', label: 'Free' },
                                                    { key: 'STARTER', label: 'Starter' },
                                                    { key: 'PROFESSIONAL', label: 'Professional' },
                                                    { key: 'ENTERPRISE', label: 'Enterprise' },
                                                ]).map((tier: any) => (
                                                    <option key={tier.key} value={tier.key}>{tier.label.toUpperCase()}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700">Price (ZMW)</label>
                                            <input
                                                type="number"
                                                value={newPlan.monthlyPriceZMW}
                                                onChange={e => setNewPlan({ ...newPlan, monthlyPriceZMW: Number(e.target.value) })}
                                                className="w-full border rounded px-3 py-2"
                                                required
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700">Yearly (ZMW)</label>
                                            <input
                                                type="number"
                                                value={newPlan.yearlyPriceZMW}
                                                onChange={e => setNewPlan({ ...newPlan, yearlyPriceZMW: Number(e.target.value) })}
                                                className="w-full border rounded px-3 py-2"
                                            />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700">Max Students</label>
                                            <input
                                                type="number"
                                                value={newPlan.maxStudents}
                                                onChange={e => setNewPlan({ ...newPlan, maxStudents: Number(e.target.value) })}
                                                className="w-full border rounded px-3 py-2"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700">Max Teachers</label>
                                            <input
                                                type="number"
                                                value={newPlan.maxTeachers}
                                                onChange={e => setNewPlan({ ...newPlan, maxTeachers: Number(e.target.value) })}
                                                className="w-full border rounded px-3 py-2"
                                            />
                                        </div>
                                    </div>

                                    {/* Features Section */}
                                    <div className="border-t pt-4">
                                        <label className="block text-sm font-medium text-slate-700 mb-3">Included Features</label>
                                        <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                                            {(settingsForm.availableFeatures?.length > 0 ? settingsForm.availableFeatures : [
                                                { key: 'attendance', label: 'Attendance Tracking' },
                                                { key: 'fee_management', label: 'Fee Management' },
                                                { key: 'report_cards', label: 'Report Cards' },
                                                { key: 'parent_portal', label: 'Parent Portal' },
                                                { key: 'email_notifications', label: 'Email Notifications' },
                                                { key: 'sms_notifications', label: 'SMS Notifications' },
                                                { key: 'online_assessments', label: 'Online Assessments' },
                                                { key: 'timetable', label: 'Timetable Management' },
                                                { key: 'syllabus_tracking', label: 'Syllabus Tracking' },
                                                { key: 'advanced_reports', label: 'Advanced Reports' },
                                                { key: 'api_access', label: 'API Access' },
                                                { key: 'white_label', label: 'White Label Branding' },
                                                { key: 'data_export', label: 'Data Export' },
                                                { key: 'basic_reports', label: 'Basic Reports' },
                                                { key: 'dedicated_support', label: 'Dedicated Support' },
                                                { key: 'custom_integrations', label: 'Custom Integrations' },
                                                { key: 'priority_support', label: 'Priority Support' },
                                            ]).map((feat: any) => (
                                                <label key={feat.key} className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer hover:bg-slate-50 p-1 rounded">
                                                    <input
                                                        type="checkbox"
                                                        checked={newPlan.features?.includes(feat.key) || false}
                                                        onChange={(e) => {
                                                            const features = newPlan.features || [];
                                                            if (e.target.checked) {
                                                                setNewPlan({ ...newPlan, features: [...features, feat.key] });
                                                            } else {
                                                                setNewPlan({ ...newPlan, features: features.filter(f => f !== feat.key) });
                                                            }
                                                        }}
                                                        className="rounded border-slate-300 text-purple-600 focus:ring-purple-500"
                                                    />
                                                    {feat.label}
                                                </label>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Popular & Description */}
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700">Description</label>
                                            <input
                                                type="text"
                                                value={newPlan.description || ''}
                                                onChange={e => setNewPlan({ ...newPlan, description: e.target.value })}
                                                className="w-full border rounded px-3 py-2"
                                                placeholder="Best for small schools"
                                            />
                                        </div>
                                        <div className="flex items-center gap-2 pt-6">
                                            <input
                                                type="checkbox"
                                                id="isPopular"
                                                checked={newPlan.isPopular || false}
                                                onChange={e => setNewPlan({ ...newPlan, isPopular: e.target.checked })}
                                                className="rounded border-slate-300 text-purple-600 focus:ring-purple-500"
                                            />
                                            <label htmlFor="isPopular" className="text-sm font-medium text-slate-700">Mark as Popular</label>
                                        </div>
                                    </div>

                                    <div className="flex justify-end gap-3 mt-6">
                                        <button
                                            type="button"
                                            onClick={() => setIsPlanModalOpen(false)}
                                            className="px-4 py-2 text-slate-600 hover:text-slate-800"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="submit"
                                            className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700"
                                        >
                                            Save Plan
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    )}

                    {/* Announcements Tab */}
                    {activeTab === 'announcements' && (
                        <div className="space-y-6">
                            <div className="flex justify-between items-center">
                                <h2 className="text-xl font-bold text-slate-800">System Broadcasts</h2>
                                <button
                                    onClick={() => setIsAnnouncementModalOpen(true)}
                                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
                                >
                                    <Plus className="w-4 h-4" />
                                    New Broadcast
                                </button>
                            </div>

                            <div className="grid grid-cols-1 gap-4">
                                {announcements.map(ann => (
                                    <div key={ann.id} className={`p-4 rounded-xl border flex justify-between items-start ${ann.type === 'WARNING' ? 'bg-orange-50 border-orange-100' :
                                        ann.type === 'ERROR' ? 'bg-red-50 border-red-100' :
                                            'bg-blue-50 border-blue-100'
                                        }`}>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <span className={`text-xs font-bold px-2 py-0.5 rounded uppercase ${ann.type === 'WARNING' ? 'bg-orange-200 text-orange-800' :
                                                    ann.type === 'ERROR' ? 'bg-red-200 text-red-800' :
                                                        'bg-blue-200 text-blue-800'
                                                    }`}>{ann.type}</span>
                                                <h3 className="font-bold text-slate-900">{ann.title}</h3>
                                            </div>
                                            <p className="mt-1 text-slate-700">{ann.message}</p>
                                            <p className="mt-2 text-xs text-slate-500">Posted: {new Date(ann.createdAt).toLocaleString()}</p>
                                        </div>
                                        <button onClick={() => deleteAnnouncement(ann.id)} className="text-slate-400 hover:text-red-600">
                                            <Trash2 className="w-5 h-5" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Announcement Modal */}
                    {isAnnouncementModalOpen && (
                        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                            <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl">
                                <h3 className="text-xl font-bold mb-4">New Broadcast</h3>
                                <form onSubmit={saveAnnouncement} className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700">Title</label>
                                        <input
                                            type="text"
                                            value={newAnnouncement.title}
                                            onChange={e => setNewAnnouncement({ ...newAnnouncement, title: e.target.value })}
                                            className="w-full border rounded px-3 py-2"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700">Type</label>
                                        <select
                                            value={newAnnouncement.type}
                                            onChange={e => setNewAnnouncement({ ...newAnnouncement, type: e.target.value })}
                                            className="w-full border rounded px-3 py-2"
                                        >
                                            <option value="INFO">Info</option>
                                            <option value="WARNING">Warning</option>
                                            <option value="ERROR">Alert (Red)</option>
                                            <option value="SUCCESS">Success (Green)</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700">Message</label>
                                        <textarea
                                            value={newAnnouncement.message}
                                            onChange={e => setNewAnnouncement({ ...newAnnouncement, message: e.target.value })}
                                            className="w-full border rounded px-3 py-2 h-24"
                                            required
                                        />
                                    </div>
                                    <div className="flex justify-end gap-3 mt-6">
                                        <button type="button" onClick={() => setIsAnnouncementModalOpen(false)} className="text-slate-600">Cancel</button>
                                        <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded">Broadcast</button>
                                    </div>
                                </form>
                            </div>
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

                            {/* Azure Email Configuration */}
                            <div className="bg-white rounded-xl border overflow-hidden">
                                <div className="px-6 py-4 border-b bg-slate-50">
                                    <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                                        <Mail className="w-5 h-5" />
                                        Azure Email Service Configuration
                                    </h3>
                                    <p className="text-sm text-slate-500 mt-1">Configure Azure Communication Services for high-volume email sending (recommended for &gt;100 emails/day)</p>
                                </div>

                                <div className="p-6 space-y-6">
                                    {/* Enable Azure Email */}
                                    <div className="flex items-center justify-between p-4 bg-blue-50 border border-blue-200 rounded-lg">
                                        <div className="flex-1">
                                            <label className="flex items-center gap-3 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={settingsForm.azureEmailEnabled}
                                                    onChange={(e) => setSettingsForm({ ...settingsForm, azureEmailEnabled: e.target.checked })}
                                                    className="w-5 h-5 rounded border-blue-300 text-blue-600 focus:ring-blue-500"
                                                />
                                                <div>
                                                    <span className="font-medium text-blue-900">Enable Azure Communication Services</span>
                                                    <p className="text-sm text-blue-700 mt-1">
                                                        Use Azure for reliable, high-volume email delivery. Falls back to SMTP if Azure fails.
                                                    </p>
                                                </div>
                                            </label>
                                        </div>
                                    </div>

                                    {settingsForm.azureEmailEnabled && (
                                        <>
                                            {/* Info Box */}
                                            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                                                <div className="flex gap-3">
                                                    <div className="text-amber-600 mt-0.5">ℹ️</div>
                                                    <div className="flex-1">
                                                        <p className="text-sm font-medium text-amber-900 mb-2">How to get Azure credentials:</p>
                                                        <ol className="text-sm text-amber-800 space-y-1 list-decimal list-inside">
                                                            <li>Go to <a href="https://portal.azure.com" target="_blank" rel="noopener noreferrer" className="underline">Azure Portal</a></li>
                                                            <li>Create a Communication Services resource</li>
                                                            <li>Go to Keys section and copy the connection string</li>
                                                            <li>Configure your email domain in Azure</li>
                                                        </ol>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Connection Method Selection */}
                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 mb-2">Connection Method</label>
                                                <div className="flex gap-4">
                                                    <label className="flex items-center gap-2 cursor-pointer">
                                                        <input
                                                            type="radio"
                                                            name="azureConnectionMethod"
                                                            checked={!!settingsForm.azureEmailConnectionString || !settingsForm.azureEmailEndpoint}
                                                            onChange={() => setSettingsForm({ 
                                                                ...settingsForm, 
                                                                azureEmailEndpoint: '',
                                                                azureEmailAccessKey: ''
                                                            })}
                                                            className="text-blue-600 focus:ring-blue-500"
                                                        />
                                                        <span className="text-sm text-slate-700">Connection String (Recommended)</span>
                                                    </label>
                                                    <label className="flex items-center gap-2 cursor-pointer">
                                                        <input
                                                            type="radio"
                                                            name="azureConnectionMethod"
                                                            checked={!!settingsForm.azureEmailEndpoint}
                                                            onChange={() => setSettingsForm({ 
                                                                ...settingsForm, 
                                                                azureEmailConnectionString: ''
                                                            })}
                                                            className="text-blue-600 focus:ring-blue-500"
                                                        />
                                                        <span className="text-sm text-slate-700">Endpoint + Access Key</span>
                                                    </label>
                                                </div>
                                            </div>

                                            {/* Connection String Method */}
                                            {(!settingsForm.azureEmailEndpoint || settingsForm.azureEmailConnectionString) && (
                                                <div>
                                                    <label className="block text-sm font-medium text-slate-700 mb-2">
                                                        Azure Connection String *
                                                    </label>
                                                    <input
                                                        type="password"
                                                        value={settingsForm.azureEmailConnectionString}
                                                        onChange={(e) => setSettingsForm({ ...settingsForm, azureEmailConnectionString: e.target.value })}
                                                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
                                                        placeholder={platformSettings?.azureEmailConnectionString ? '••••••••' : 'endpoint=https://...;accesskey=...'}
                                                    />
                                                    <p className="text-xs text-slate-500 mt-1">
                                                        Full connection string from Azure Portal → Communication Services → Keys
                                                    </p>
                                                </div>
                                            )}

                                            {/* Endpoint + Key Method */}
                                            {settingsForm.azureEmailEndpoint && !settingsForm.azureEmailConnectionString && (
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    <div>
                                                        <label className="block text-sm font-medium text-slate-700 mb-2">
                                                            Azure Endpoint *
                                                        </label>
                                                        <input
                                                            type="url"
                                                            value={settingsForm.azureEmailEndpoint}
                                                            onChange={(e) => setSettingsForm({ ...settingsForm, azureEmailEndpoint: e.target.value })}
                                                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                                            placeholder="https://your-resource.communication.azure.com"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-sm font-medium text-slate-700 mb-2">
                                                            Access Key *
                                                        </label>
                                                        <input
                                                            type="password"
                                                            value={settingsForm.azureEmailAccessKey}
                                                            onChange={(e) => setSettingsForm({ ...settingsForm, azureEmailAccessKey: e.target.value })}
                                                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
                                                            placeholder={platformSettings?.azureEmailAccessKey ? '••••••••' : 'Your access key'}
                                                        />
                                                    </div>
                                                </div>
                                            )}

                                            {/* From Address */}
                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 mb-2">
                                                    From Email Address *
                                                </label>
                                                <input
                                                    type="email"
                                                    value={settingsForm.azureEmailFromAddress}
                                                    onChange={(e) => setSettingsForm({ ...settingsForm, azureEmailFromAddress: e.target.value })}
                                                    className="w-full md:w-1/2 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                                    placeholder="DoNotReply@yourdomain.com"
                                                />
                                                <p className="text-xs text-slate-500 mt-1">
                                                    Must be a verified domain in your Azure Communication Services
                                                </p>
                                            </div>

                                            {/* Test Connection Button */}
                                            <div className="flex gap-3 pt-4 border-t">
                                                <button
                                                    onClick={savePlatformSettings}
                                                    disabled={loading}
                                                    className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 disabled:opacity-50"
                                                >
                                                    <Save className="w-4 h-4" />
                                                    {loading ? 'Saving...' : 'Save Azure Settings'}
                                                </button>
                                                <button
                                                    type="button"
                                                    className="px-6 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
                                                    onClick={() => alert('Test email feature coming soon!')}
                                                >
                                                    Send Test Email
                                                </button>
                                            </div>
                                        </>
                                    )}

                                    {!settingsForm.azureEmailEnabled && (
                                        <div className="text-center py-8 text-slate-500">
                                            <p className="text-sm">Azure Email is disabled. Enable it above to configure settings.</p>
                                            <p className="text-xs mt-2">System will use SMTP for email delivery.</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Feature & Tier Management */}
                            <div className="bg-white rounded-xl border overflow-hidden">
                                <div className="px-6 py-4 border-b bg-slate-50">
                                    <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                                        <Settings className="w-5 h-5" />
                                        Feature & Tier Configuration
                                    </h3>
                                    <p className="text-sm text-slate-500 mt-1">Manage available features and subscription tiers</p>
                                </div>
                                <div className="p-6 space-y-6">
                                    {/* Available Features */}
                                    <div>
                                        <label className="block text-sm font-semibold text-slate-700 mb-3">Available Features</label>
                                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-3">
                                            {(settingsForm.availableFeatures || [
                                                { key: 'attendance', label: 'Attendance Tracking' },
                                                { key: 'fee_management', label: 'Fee Management' },
                                                { key: 'report_cards', label: 'Report Cards' },
                                                { key: 'parent_portal', label: 'Parent Portal' },
                                                { key: 'email_notifications', label: 'Email Notifications' },
                                                { key: 'sms_notifications', label: 'SMS Notifications' },
                                                { key: 'online_assessments', label: 'Online Assessments' },
                                                { key: 'timetable', label: 'Timetable Management' },
                                                { key: 'syllabus_tracking', label: 'Syllabus Tracking' },
                                                { key: 'advanced_reports', label: 'Advanced Reports' },
                                                { key: 'api_access', label: 'API Access' },
                                                { key: 'white_label', label: 'White Label Branding' },
                                                { key: 'data_export', label: 'Data Export' },
                                                { key: 'basic_reports', label: 'Basic Reports' },
                                                { key: 'dedicated_support', label: 'Dedicated Support' },
                                                { key: 'custom_integrations', label: 'Custom Integrations' },
                                                { key: 'priority_support', label: 'Priority Support' },
                                            ]).map((feat: any, idx: number) => (
                                                <div key={idx} className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-lg">
                                                    <span className="text-sm text-slate-700 flex-1">{feat.label}</span>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            const features = settingsForm.availableFeatures || [];
                                                            setSettingsForm({
                                                                ...settingsForm,
                                                                availableFeatures: features.filter((_: any, i: number) => i !== idx)
                                                            });
                                                        }}
                                                        className="text-red-500 hover:text-red-700 text-xs"
                                                    >
                                                        ×
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                id="newFeatureKey"
                                                placeholder="feature_key"
                                                className="px-3 py-2 border rounded-lg text-sm"
                                            />
                                            <input
                                                type="text"
                                                id="newFeatureLabel"
                                                placeholder="Feature Label"
                                                className="px-3 py-2 border rounded-lg text-sm flex-1"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const keyEl = document.getElementById('newFeatureKey') as HTMLInputElement;
                                                    const labelEl = document.getElementById('newFeatureLabel') as HTMLInputElement;
                                                    if (keyEl.value && labelEl.value) {
                                                        const features = settingsForm.availableFeatures || [];
                                                        setSettingsForm({
                                                            ...settingsForm,
                                                            availableFeatures: [...features, { key: keyEl.value, label: labelEl.value }]
                                                        });
                                                        keyEl.value = '';
                                                        labelEl.value = '';
                                                    }
                                                }}
                                                className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700"
                                            >
                                                Add Feature
                                            </button>
                                        </div>
                                    </div>

                                    {/* Available Tiers */}
                                    <div>
                                        <label className="block text-sm font-semibold text-slate-700 mb-3">Available Tiers</label>
                                        <div className="flex flex-wrap gap-2 mb-3">
                                            {(settingsForm.availableTiers || [
                                                { key: 'FREE', label: 'Free' },
                                                { key: 'STARTER', label: 'Starter' },
                                                { key: 'PROFESSIONAL', label: 'Professional' },
                                                { key: 'ENTERPRISE', label: 'Enterprise' },
                                            ]).map((tier: any, idx: number) => (
                                                <div key={idx} className="flex items-center gap-2 bg-purple-50 px-3 py-2 rounded-lg border border-purple-200">
                                                    <span className="text-sm font-medium text-purple-800">{tier.label}</span>
                                                    <span className="text-xs text-purple-600">({tier.key})</span>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            const tiers = settingsForm.availableTiers || [];
                                                            setSettingsForm({
                                                                ...settingsForm,
                                                                availableTiers: tiers.filter((_: any, i: number) => i !== idx)
                                                            });
                                                        }}
                                                        className="text-red-500 hover:text-red-700 text-xs ml-1"
                                                    >
                                                        ×
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                id="newTierKey"
                                                placeholder="TIER_KEY"
                                                className="px-3 py-2 border rounded-lg text-sm uppercase"
                                            />
                                            <input
                                                type="text"
                                                id="newTierLabel"
                                                placeholder="Tier Label"
                                                className="px-3 py-2 border rounded-lg text-sm flex-1"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const keyEl = document.getElementById('newTierKey') as HTMLInputElement;
                                                    const labelEl = document.getElementById('newTierLabel') as HTMLInputElement;
                                                    if (keyEl.value && labelEl.value) {
                                                        const tiers = settingsForm.availableTiers || [];
                                                        setSettingsForm({
                                                            ...settingsForm,
                                                            availableTiers: [...tiers, { key: keyEl.value.toUpperCase(), label: labelEl.value }]
                                                        });
                                                        keyEl.value = '';
                                                        labelEl.value = '';
                                                    }
                                                }}
                                                className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700"
                                            >
                                                Add Tier
                                            </button>
                                        </div>
                                        <p className="text-xs text-slate-500 mt-2">
                                            Note: Adding new tiers here allows you to use them when creating plans.
                                            Make sure to create a corresponding plan for each tier.
                                        </p>
                                    </div>

                                    <div className="pt-4 border-t">
                                        <button
                                            onClick={savePlatformSettings}
                                            disabled={loading}
                                            className="px-6 py-2 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 transition-colors disabled:opacity-50"
                                        >
                                            {loading ? 'Saving...' : 'Save Configuration'}
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

                            {/* Payment Gateway Configuration */}
                            <div className="bg-white rounded-xl border overflow-hidden">
                                <div className="px-6 py-4 border-b bg-emerald-50">
                                    <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                                        <CreditCard className="w-5 h-5 text-emerald-600" />
                                        Payment Gateway Configuration
                                    </h3>
                                    <p className="text-sm text-slate-500 mt-1">Configure payment gateways for collecting subscription payments</p>
                                </div>
                                <div className="p-6 space-y-6">
                                    {/* Lenco Mobile Money */}
                                    <div className="border rounded-lg p-4">
                                        <div className="flex items-center justify-between mb-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                                                    <span className="text-purple-600 font-bold text-sm">L</span>
                                                </div>
                                                <div>
                                                    <h4 className="font-medium text-slate-900">Lenco Mobile Money</h4>
                                                    <p className="text-xs text-slate-500">MTN & Airtel collections via Lenco</p>
                                                </div>
                                            </div>
                                            <label className="relative inline-flex items-center cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={settingsForm.lencoEnabled}
                                                    onChange={(e) => setSettingsForm({ ...settingsForm, lencoEnabled: e.target.checked })}
                                                    className="sr-only peer"
                                                />
                                                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-emerald-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                                            </label>
                                        </div>
                                        {settingsForm.lencoEnabled && (
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t">
                                                <div>
                                                    <label className="block text-sm font-medium text-slate-700 mb-1">API URL</label>
                                                    <input
                                                        type="url"
                                                        value={settingsForm.lencoApiUrl}
                                                        onChange={(e) => setSettingsForm({ ...settingsForm, lencoApiUrl: e.target.value })}
                                                        className="w-full px-3 py-2 border rounded-lg text-sm"
                                                        placeholder="https://api.lenco.co/access/v2"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-slate-700 mb-1">API Token</label>
                                                    <input
                                                        type="password"
                                                        value={settingsForm.lencoApiToken}
                                                        onChange={(e) => setSettingsForm({ ...settingsForm, lencoApiToken: e.target.value })}
                                                        className="w-full px-3 py-2 border rounded-lg text-sm"
                                                        placeholder="Enter Lenco API token"
                                                    />
                                                </div>
                                                <div className="md:col-span-2">
                                                    <label className="block text-sm font-medium text-slate-700 mb-1">Webhook Secret</label>
                                                    <input
                                                        type="password"
                                                        value={settingsForm.lencoWebhookSecret}
                                                        onChange={(e) => setSettingsForm({ ...settingsForm, lencoWebhookSecret: e.target.value })}
                                                        className="w-full px-3 py-2 border rounded-lg text-sm"
                                                        placeholder="Webhook verification secret"
                                                    />
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* MTN MoMo Direct */}
                                    <div className="border rounded-lg p-4">
                                        <div className="flex items-center justify-between mb-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
                                                    <span className="text-yellow-600 font-bold text-sm">MTN</span>
                                                </div>
                                                <div>
                                                    <h4 className="font-medium text-slate-900">MTN Mobile Money</h4>
                                                    <p className="text-xs text-slate-500">Direct MTN MoMo API integration</p>
                                                </div>
                                            </div>
                                            <label className="relative inline-flex items-center cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={settingsForm.mtnMomoEnabled}
                                                    onChange={(e) => setSettingsForm({ ...settingsForm, mtnMomoEnabled: e.target.checked })}
                                                    className="sr-only peer"
                                                />
                                                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-yellow-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-yellow-500"></div>
                                            </label>
                                        </div>
                                        {settingsForm.mtnMomoEnabled && (
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t">
                                                <div>
                                                    <label className="block text-sm font-medium text-slate-700 mb-1">API URL</label>
                                                    <input
                                                        type="url"
                                                        value={settingsForm.mtnMomoApiUrl}
                                                        onChange={(e) => setSettingsForm({ ...settingsForm, mtnMomoApiUrl: e.target.value })}
                                                        className="w-full px-3 py-2 border rounded-lg text-sm"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-slate-700 mb-1">API User ID</label>
                                                    <input
                                                        type="text"
                                                        value={settingsForm.mtnMomoApiUserId}
                                                        onChange={(e) => setSettingsForm({ ...settingsForm, mtnMomoApiUserId: e.target.value })}
                                                        className="w-full px-3 py-2 border rounded-lg text-sm"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-slate-700 mb-1">API Key</label>
                                                    <input
                                                        type="password"
                                                        value={settingsForm.mtnMomoApiKey}
                                                        onChange={(e) => setSettingsForm({ ...settingsForm, mtnMomoApiKey: e.target.value })}
                                                        className="w-full px-3 py-2 border rounded-lg text-sm"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-slate-700 mb-1">Subscription Key</label>
                                                    <input
                                                        type="password"
                                                        value={settingsForm.mtnMomoSubscriptionKey}
                                                        onChange={(e) => setSettingsForm({ ...settingsForm, mtnMomoSubscriptionKey: e.target.value })}
                                                        className="w-full px-3 py-2 border rounded-lg text-sm"
                                                    />
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Airtel Money */}
                                    <div className="border rounded-lg p-4">
                                        <div className="flex items-center justify-between mb-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                                                    <span className="text-red-600 font-bold text-xs">Airtel</span>
                                                </div>
                                                <div>
                                                    <h4 className="font-medium text-slate-900">Airtel Money</h4>
                                                    <p className="text-xs text-slate-500">Airtel Money direct integration</p>
                                                </div>
                                            </div>
                                            <label className="relative inline-flex items-center cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={settingsForm.airtelMoneyEnabled}
                                                    onChange={(e) => setSettingsForm({ ...settingsForm, airtelMoneyEnabled: e.target.checked })}
                                                    className="sr-only peer"
                                                />
                                                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-red-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-500"></div>
                                            </label>
                                        </div>
                                        {settingsForm.airtelMoneyEnabled && (
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t">
                                                <div>
                                                    <label className="block text-sm font-medium text-slate-700 mb-1">API URL</label>
                                                    <input
                                                        type="url"
                                                        value={settingsForm.airtelMoneyApiUrl}
                                                        onChange={(e) => setSettingsForm({ ...settingsForm, airtelMoneyApiUrl: e.target.value })}
                                                        className="w-full px-3 py-2 border rounded-lg text-sm"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-slate-700 mb-1">Client ID</label>
                                                    <input
                                                        type="text"
                                                        value={settingsForm.airtelMoneyClientId}
                                                        onChange={(e) => setSettingsForm({ ...settingsForm, airtelMoneyClientId: e.target.value })}
                                                        className="w-full px-3 py-2 border rounded-lg text-sm"
                                                    />
                                                </div>
                                                <div className="md:col-span-2">
                                                    <label className="block text-sm font-medium text-slate-700 mb-1">Client Secret</label>
                                                    <input
                                                        type="password"
                                                        value={settingsForm.airtelMoneyClientSecret}
                                                        onChange={(e) => setSettingsForm({ ...settingsForm, airtelMoneyClientSecret: e.target.value })}
                                                        className="w-full px-3 py-2 border rounded-lg text-sm"
                                                    />
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Bank Transfer */}
                                    <div className="border rounded-lg p-4">
                                        <div className="flex items-center justify-between mb-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                                                    <Building2 className="w-5 h-5 text-blue-600" />
                                                </div>
                                                <div>
                                                    <h4 className="font-medium text-slate-900">Bank Transfer</h4>
                                                    <p className="text-xs text-slate-500">Manual bank deposit instructions</p>
                                                </div>
                                            </div>
                                            <label className="relative inline-flex items-center cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={settingsForm.bankTransferEnabled}
                                                    onChange={(e) => setSettingsForm({ ...settingsForm, bankTransferEnabled: e.target.checked })}
                                                    className="sr-only peer"
                                                />
                                                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                                            </label>
                                        </div>
                                        {settingsForm.bankTransferEnabled && (
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t">
                                                <div>
                                                    <label className="block text-sm font-medium text-slate-700 mb-1">Bank Name</label>
                                                    <input
                                                        type="text"
                                                        value={settingsForm.bankName}
                                                        onChange={(e) => setSettingsForm({ ...settingsForm, bankName: e.target.value })}
                                                        className="w-full px-3 py-2 border rounded-lg text-sm"
                                                        placeholder="Zanaco"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-slate-700 mb-1">Account Name</label>
                                                    <input
                                                        type="text"
                                                        value={settingsForm.bankAccountName}
                                                        onChange={(e) => setSettingsForm({ ...settingsForm, bankAccountName: e.target.value })}
                                                        className="w-full px-3 py-2 border rounded-lg text-sm"
                                                        placeholder="Sync Technologies Ltd"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-slate-700 mb-1">Account Number</label>
                                                    <input
                                                        type="text"
                                                        value={settingsForm.bankAccountNumber}
                                                        onChange={(e) => setSettingsForm({ ...settingsForm, bankAccountNumber: e.target.value })}
                                                        className="w-full px-3 py-2 border rounded-lg text-sm"
                                                        placeholder="1234567890"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-slate-700 mb-1">Branch Code</label>
                                                    <input
                                                        type="text"
                                                        value={settingsForm.bankBranchCode}
                                                        onChange={(e) => setSettingsForm({ ...settingsForm, bankBranchCode: e.target.value })}
                                                        className="w-full px-3 py-2 border rounded-lg text-sm"
                                                        placeholder="01001"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-slate-700 mb-1">SWIFT Code</label>
                                                    <input
                                                        type="text"
                                                        value={settingsForm.bankSwiftCode}
                                                        onChange={(e) => setSettingsForm({ ...settingsForm, bankSwiftCode: e.target.value })}
                                                        className="w-full px-3 py-2 border rounded-lg text-sm"
                                                        placeholder="ZNCOZMLU"
                                                    />
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* General Payment Settings */}
                                    <div className="border-t pt-4">
                                        <h4 className="font-medium text-slate-900 mb-4">General Payment Settings</h4>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 mb-1">Currency</label>
                                                <select
                                                    value={settingsForm.paymentCurrency}
                                                    onChange={(e) => setSettingsForm({ ...settingsForm, paymentCurrency: e.target.value })}
                                                    className="w-full px-3 py-2 border rounded-lg text-sm"
                                                >
                                                    <option value="ZMW">ZMW - Zambian Kwacha</option>
                                                    <option value="USD">USD - US Dollar</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 mb-1">Webhook URL</label>
                                                <input
                                                    type="url"
                                                    value={settingsForm.paymentWebhookUrl}
                                                    onChange={(e) => setSettingsForm({ ...settingsForm, paymentWebhookUrl: e.target.value })}
                                                    className="w-full px-3 py-2 border rounded-lg text-sm"
                                                    placeholder="https://yoursite.com/api/webhooks/payment"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 mb-1">Auto-Confirm Threshold</label>
                                                <input
                                                    type="number"
                                                    value={settingsForm.autoConfirmThreshold}
                                                    onChange={(e) => setSettingsForm({ ...settingsForm, autoConfirmThreshold: parseFloat(e.target.value) })}
                                                    className="w-full px-3 py-2 border rounded-lg text-sm"
                                                    placeholder="0"
                                                />
                                                <p className="text-xs text-slate-500 mt-1">Auto-confirm payments below this amount (0 = disabled)</p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Mobile Money Settings */}
                                    <div className="border-t pt-4">
                                        <div className="flex items-center justify-between mb-4">
                                            <h4 className="font-medium text-slate-900">Mobile Money Settings</h4>
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={settingsForm.mobileMoneyEnabled}
                                                    onChange={(e) => setSettingsForm({ ...settingsForm, mobileMoneyEnabled: e.target.checked })}
                                                    className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                                                />
                                                <span className="text-sm text-slate-600">Enable Mobile Money</span>
                                            </label>
                                        </div>
                                        
                                        {settingsForm.mobileMoneyEnabled && (
                                            <div className="space-y-4">
                                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                                    <div>
                                                        <label className="block text-sm font-medium text-slate-700 mb-1">Payment Gateway Provider</label>
                                                        <select
                                                            value={settingsForm.paymentGatewayProvider}
                                                            onChange={(e) => setSettingsForm({ ...settingsForm, paymentGatewayProvider: e.target.value })}
                                                            className="w-full px-3 py-2 border rounded-lg text-sm"
                                                        >
                                                            <option value="lenco">Lenco</option>
                                                            <option value="mtn_momo">MTN MoMo (Direct)</option>
                                                            <option value="airtel_money">Airtel Money (Direct)</option>
                                                        </select>
                                                    </div>
                                                    <div>
                                                        <label className="block text-sm font-medium text-slate-700 mb-1">Transaction Fee (%)</label>
                                                        <input
                                                            type="number"
                                                            step="0.01"
                                                            min="0"
                                                            max="10"
                                                            value={settingsForm.mobileMoneyFeePercent}
                                                            onChange={(e) => setSettingsForm({ ...settingsForm, mobileMoneyFeePercent: parseFloat(e.target.value) || 0 })}
                                                            className="w-full px-3 py-2 border rounded-lg text-sm"
                                                            placeholder="2.5"
                                                        />
                                                        <p className="text-xs text-slate-500 mt-1">Fee charged on mobile money transactions</p>
                                                    </div>
                                                    <div>
                                                        <label className="block text-sm font-medium text-slate-700 mb-1">Fee Cap (Max)</label>
                                                        <input
                                                            type="number"
                                                            step="1"
                                                            min="0"
                                                            value={settingsForm.mobileMoneyFeeCap}
                                                            onChange={(e) => setSettingsForm({ ...settingsForm, mobileMoneyFeeCap: parseFloat(e.target.value) || 0 })}
                                                            className="w-full px-3 py-2 border rounded-lg text-sm"
                                                            placeholder="0"
                                                        />
                                                        <p className="text-xs text-slate-500 mt-1">Maximum fee amount (0 = no cap)</p>
                                                    </div>
                                                </div>
                                                
                                                <div>
                                                    <label className="block text-sm font-medium text-slate-700 mb-2">Allowed Payment Methods</label>
                                                    <div className="flex flex-wrap gap-3">
                                                        {['CASH', 'MOBILE_MONEY', 'BANK_DEPOSIT', 'CHEQUE', 'CARD'].map((method) => (
                                                            <label key={method} className="flex items-center gap-2 cursor-pointer">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={settingsForm.allowedPaymentMethods?.includes(method)}
                                                                    onChange={(e) => {
                                                                        const methods = settingsForm.allowedPaymentMethods || [];
                                                                        if (e.target.checked) {
                                                                            setSettingsForm({ ...settingsForm, allowedPaymentMethods: [...methods, method] });
                                                                        } else {
                                                                            setSettingsForm({ ...settingsForm, allowedPaymentMethods: methods.filter((m: string) => m !== method) });
                                                                        }
                                                                    }}
                                                                    className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                                                                />
                                                                <span className="text-sm text-slate-600">{method.replace('_', ' ')}</span>
                                                            </label>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* API Rate Limiting & Security */}
                                    <div className="border-t pt-4">
                                        <h4 className="font-medium text-slate-900 mb-4">API Rate Limiting & Security</h4>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 mb-1">Public API Rate Limit</label>
                                                <input
                                                    type="number"
                                                    min="1"
                                                    max="1000"
                                                    value={settingsForm.publicApiRateLimitPerMinute}
                                                    onChange={(e) => setSettingsForm({ ...settingsForm, publicApiRateLimitPerMinute: parseInt(e.target.value) || 30 })}
                                                    className="w-full px-3 py-2 border rounded-lg text-sm"
                                                    placeholder="30"
                                                />
                                                <p className="text-xs text-slate-500 mt-1">Requests per minute for public endpoints</p>
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 mb-1">Payment API Rate Limit</label>
                                                <input
                                                    type="number"
                                                    min="1"
                                                    max="100"
                                                    value={settingsForm.paymentApiRateLimitPerMinute}
                                                    onChange={(e) => setSettingsForm({ ...settingsForm, paymentApiRateLimitPerMinute: parseInt(e.target.value) || 10 })}
                                                    className="w-full px-3 py-2 border rounded-lg text-sm"
                                                    placeholder="10"
                                                />
                                                <p className="text-xs text-slate-500 mt-1">Requests per minute for payment endpoints</p>
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 mb-1">Allowed Origins (CORS)</label>
                                                <input
                                                    type="text"
                                                    value={settingsForm.allowedOrigins?.join(', ') || ''}
                                                    onChange={(e) => setSettingsForm({ 
                                                        ...settingsForm, 
                                                        allowedOrigins: e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean)
                                                    })}
                                                    className="w-full px-3 py-2 border rounded-lg text-sm"
                                                    placeholder="https://pay.yourdomain.com, https://app.yourdomain.com"
                                                />
                                                <p className="text-xs text-slate-500 mt-1">Comma-separated list of allowed origins</p>
                                            </div>
                                        </div>
                                        
                                        <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                                            <div className="flex items-start gap-2">
                                                <Shield className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                                                <div>
                                                    <p className="text-sm font-medium text-amber-800">Security Note</p>
                                                    <p className="text-xs text-amber-700 mt-1">
                                                        API tokens and webhook secrets should remain in environment variables for security. 
                                                        Only non-sensitive configuration options are configurable here.
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Save Button */}
                                    <div className="flex gap-3 pt-4 border-t">
                                        <button
                                            onClick={savePlatformSettings}
                                            disabled={loading}
                                            className="px-6 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors flex items-center gap-2 disabled:opacity-50"
                                        >
                                            <Save className="w-4 h-4" />
                                            {loading ? 'Saving...' : 'Save Payment Settings'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Audit Logs Tab */}
                    {activeTab === 'audit' && (
                        <div className="space-y-6">
                            <div className="flex justify-between items-center">
                                <h2 className="text-xl font-bold text-slate-900">System Audit Logs</h2>
                                <button onClick={fetchLogs} className="p-2 hover:bg-slate-100 rounded-lg">
                                    <RefreshCw className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="bg-white rounded-xl border overflow-hidden">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-sm">
                                        <thead className="bg-slate-50 border-b">
                                            <tr>
                                                <th className="px-6 py-3 font-semibold text-slate-600">Action</th>
                                                <th className="px-6 py-3 font-semibold text-slate-600">Description</th>
                                                <th className="px-6 py-3 font-semibold text-slate-600">User</th>
                                                <th className="px-6 py-3 font-semibold text-slate-600">Entity</th>
                                                <th className="px-6 py-3 font-semibold text-slate-600">Time</th>
                                                <th className="px-6 py-3 font-semibold text-slate-600">IP</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y text-slate-600">
                                            {logs.map((log) => (
                                                <tr key={log.id} className="hover:bg-slate-50">
                                                    <td className="px-6 py-3 font-medium text-slate-900 whitespace-nowrap">
                                                        {log.action}
                                                    </td>
                                                    <td className="px-6 py-3">{log.description}</td>
                                                    <td className="px-6 py-3">
                                                        {log.platformUser?.fullName || 'System'}
                                                        <div className="text-xs text-slate-400">{log.platformUser?.email}</div>
                                                    </td>
                                                    <td className="px-6 py-3">
                                                        {log.entityType ? (
                                                            <span className="px-2 py-0.5 rounded text-xs bg-slate-100 text-slate-600 border border-slate-200">
                                                                {log.entityType}
                                                            </span>
                                                        ) : '-'}
                                                    </td>
                                                    <td className="px-6 py-3 whitespace-nowrap">
                                                        {new Date(log.createdAt).toLocaleString()}
                                                    </td>
                                                    <td className="px-6 py-3 font-mono text-xs text-slate-400">
                                                        {log.ipAddress}
                                                    </td>
                                                </tr>
                                            ))}
                                            {logs.length === 0 && (
                                                <tr>
                                                    <td colSpan={6} className="px-6 py-8 text-center text-slate-400">
                                                        No audit logs found
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Security Dashboard Tab */}
                    {activeTab === 'security' && <SecurityDashboard />}

                    {/* Data Management Tab */}
                    {activeTab === 'data' && <DataManagement />}

                    {/* Invoice Management Tab */}
                    {activeTab === 'invoices' && <InvoiceManagement />}

                    {/* Revenue Reconciliation Tab */}
                    {activeTab === 'reconciliation' && <RevenueReconciliation />}

                    {/* Communication Center Tab */}
                    {activeTab === 'communication' && (
                        <div className="space-y-6">
                            {/* Communication Center Header */}
                            <div className="flex items-center justify-between">
                                <div>
                                    <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                                        <Send className="w-7 h-7 text-blue-600" />
                                        Communication Center
                                    </h2>
                                    <p className="text-slate-600 mt-1">Send messages to schools via email, SMS, and notifications</p>
                                </div>
                            </div>

                            {/* Communication Stats */}
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                <div className="bg-white rounded-xl border p-6">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-sm text-slate-600">Total Schools</p>
                                            <p className="text-3xl font-bold text-slate-900 mt-2">{stats?.totals.tenants || 0}</p>
                                        </div>
                                        <div className="w-12 h-12 bg-blue-50 rounded-lg flex items-center justify-center">
                                            <Building2 className="w-6 h-6 text-blue-600" />
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-white rounded-xl border p-6">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-sm text-slate-600">Active Schools</p>
                                            <p className="text-3xl font-bold text-green-600 mt-2">
                                                {stats?.tenantsByStatus?.ACTIVE || 0}
                                            </p>
                                        </div>
                                        <div className="w-12 h-12 bg-green-50 rounded-lg flex items-center justify-center">
                                            <CheckCircle className="w-6 h-6 text-green-600" />
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-white rounded-xl border p-6">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-sm text-slate-600">Trial Schools</p>
                                            <p className="text-3xl font-bold text-orange-600 mt-2">
                                                {stats?.tenantsByStatus?.TRIAL || 0}
                                            </p>
                                        </div>
                                        <div className="w-12 h-12 bg-orange-50 rounded-lg flex items-center justify-center">
                                            <Clock className="w-6 h-6 text-orange-600" />
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-white rounded-xl border p-6">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-sm text-slate-600">Active Announcements</p>
                                            <p className="text-3xl font-bold text-purple-600 mt-2">
                                                {announcements.filter(a => a.isActive).length}
                                            </p>
                                        </div>
                                        <div className="w-12 h-12 bg-purple-50 rounded-lg flex items-center justify-center">
                                            <MessageSquare className="w-6 h-6 text-purple-600" />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Quick Actions */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-6 text-white">
                                    <Mail className="w-8 h-8 mb-3" />
                                    <h3 className="text-lg font-semibold mb-2">Send Bulk Email</h3>
                                    <p className="text-blue-100 text-sm mb-4">Send emails to multiple schools at once</p>
                                    <button 
                                        onClick={() => setShowBulkEmailModal(true)}
                                        className="px-4 py-2 bg-white text-blue-600 rounded-lg hover:bg-blue-50 font-medium text-sm"
                                    >
                                        Compose Email
                                    </button>
                                </div>

                                <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-6 text-white">
                                    <Phone className="w-8 h-8 mb-3" />
                                    <h3 className="text-lg font-semibold mb-2">Send Bulk SMS</h3>
                                    <p className="text-green-100 text-sm mb-4">Send SMS messages to schools</p>
                                    <button 
                                        onClick={() => setShowBulkSMSModal(true)}
                                        className="px-4 py-2 bg-white text-green-600 rounded-lg hover:bg-green-50 font-medium text-sm"
                                    >
                                        Compose SMS
                                    </button>
                                </div>

                                <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl p-6 text-white">
                                    <MessageSquare className="w-8 h-8 mb-3" />
                                    <h3 className="text-lg font-semibold mb-2">Send Notification</h3>
                                    <p className="text-purple-100 text-sm mb-4">Send in-app notifications to schools</p>
                                    <button 
                                        onClick={() => setShowBulkNotificationModal(true)}
                                        className="px-4 py-2 bg-white text-purple-600 rounded-lg hover:bg-purple-50 font-medium text-sm"
                                    >
                                        Create Notification
                                    </button>
                                </div>
                            </div>

                            {/* Message Templates */}
                            <div className="bg-white rounded-xl border overflow-hidden">
                                <div className="px-6 py-4 border-b bg-slate-50">
                                    <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                                        <FileText className="w-5 h-5" />
                                        Message Templates
                                    </h3>
                                </div>
                                <div className="p-6">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {MESSAGE_TEMPLATES.map((template) => (
                                            <div 
                                                key={template.id}
                                                onClick={() => handleTemplatePreview(template)}
                                                className="border rounded-lg p-4 hover:border-blue-500 cursor-pointer transition-colors"
                                            >
                                                <div className="flex items-start justify-between">
                                                    <div>
                                                        <h4 className="font-medium text-slate-900">{template.name}</h4>
                                                        <p className="text-sm text-slate-600 mt-1">{template.description}</p>
                                                    </div>
                                                    <span className={`px-2 py-1 bg-${template.categoryColor}-100 text-${template.categoryColor}-700 text-xs rounded-full`}>
                                                        {template.category}
                                                    </span>
                                                </div>
                                                <button 
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleTemplatePreview(template);
                                                    }}
                                                    className="mt-3 text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
                                                >
                                                    <Eye className="w-4 h-4" />
                                                    Preview Template →
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Recent Communications */}
                            <div className="bg-white rounded-xl border overflow-hidden">
                                <div className="px-6 py-4 border-b bg-slate-50 flex items-center justify-between">
                                    <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                                        <Clock className="w-5 h-5" />
                                        Recent Communications
                                    </h3>
                                    <button className="text-sm text-blue-600 hover:text-blue-700 font-medium">
                                        View All →
                                    </button>
                                </div>
                                <div className="divide-y">
                                    {announcements.slice(0, 5).map((announcement) => (
                                        <div key={announcement.id} className="p-4 hover:bg-slate-50">
                                            <div className="flex items-start justify-between">
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2">
                                                        <h4 className="font-medium text-slate-900">{announcement.title}</h4>
                                                        <span className={`px-2 py-0.5 text-xs rounded-full ${
                                                            announcement.type === 'SUCCESS' ? 'bg-green-100 text-green-700' :
                                                            announcement.type === 'WARNING' ? 'bg-orange-100 text-orange-700' :
                                                            announcement.type === 'ERROR' ? 'bg-red-100 text-red-700' :
                                                            'bg-blue-100 text-blue-700'
                                                        }`}>
                                                            {announcement.type}
                                                        </span>
                                                        {announcement.isActive && (
                                                            <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">
                                                                Active
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="text-sm text-slate-600 mt-1 line-clamp-2">{announcement.message}</p>
                                                    <p className="text-xs text-slate-400 mt-2">
                                                        {new Date(announcement.createdAt).toLocaleString()}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                    {announcements.length === 0 && (
                                        <div className="p-8 text-center text-slate-400">
                                            No communications yet
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Targeting Options Info */}
                            <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
                                <div className="flex items-start gap-3">
                                    <Target className="w-6 h-6 text-blue-600 flex-shrink-0 mt-0.5" />
                                    <div>
                                        <h4 className="font-semibold text-blue-900 mb-2">Smart Targeting</h4>
                                        <p className="text-sm text-blue-800 mb-3">
                                            Target schools by tier, status, or select specific schools for personalized communication.
                                        </p>
                                        <div className="flex flex-wrap gap-2">
                                            <span className="px-3 py-1 bg-white text-blue-700 text-xs rounded-full border border-blue-200">
                                                By Tier: FREE, STARTER, PROFESSIONAL, ENTERPRISE
                                            </span>
                                            <span className="px-3 py-1 bg-white text-blue-700 text-xs rounded-full border border-blue-200">
                                                By Status: ACTIVE, TRIAL, SUSPENDED
                                            </span>
                                            <span className="px-3 py-1 bg-white text-blue-700 text-xs rounded-full border border-blue-200">
                                                By School: Select specific schools
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </main>
            </div>

            {/* Bulk Email Modal */}
            {showBulkEmailModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                        <div className="px-6 py-4 border-b flex items-center justify-between sticky top-0 bg-white">
                            <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                                <Send className="w-5 h-5 text-blue-600" />
                                Send Bulk Email to Schools
                            </h3>
                            <button
                                onClick={() => setShowBulkEmailModal(false)}
                                className="p-2 hover:bg-slate-100 rounded-lg"
                            >
                                <XCircle className="w-5 h-5 text-slate-500" />
                            </button>
                        </div>
                        
                        <div className="p-6 space-y-4">
                            {/* Target Selection */}
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">
                                    Target Schools
                                </label>
                                <div className="space-y-2">
                                    <div>
                                        <label className="text-xs text-slate-600 mb-1 block">By Tier</label>
                                        <div className="flex flex-wrap gap-2">
                                            {['FREE', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE'].map(tier => (
                                                <label key={tier} className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-lg cursor-pointer hover:bg-slate-100">
                                                    <input
                                                        type="checkbox"
                                                        checked={bulkEmailForm.targetTiers.includes(tier)}
                                                        onChange={(e) => {
                                                            if (e.target.checked) {
                                                                setBulkEmailForm({
                                                                    ...bulkEmailForm,
                                                                    targetTiers: [...bulkEmailForm.targetTiers, tier]
                                                                });
                                                            } else {
                                                                setBulkEmailForm({
                                                                    ...bulkEmailForm,
                                                                    targetTiers: bulkEmailForm.targetTiers.filter(t => t !== tier)
                                                                });
                                                            }
                                                        }}
                                                        className="rounded"
                                                    />
                                                    <span className="text-sm">{tier}</span>
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                    
                                    <div>
                                        <label className="text-xs text-slate-600 mb-1 block">By Status</label>
                                        <div className="flex flex-wrap gap-2">
                                            {['TRIAL', 'ACTIVE', 'SUSPENDED', 'EXPIRED'].map(status => (
                                                <label key={status} className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-lg cursor-pointer hover:bg-slate-100">
                                                    <input
                                                        type="checkbox"
                                                        checked={bulkEmailForm.targetStatuses.includes(status)}
                                                        onChange={(e) => {
                                                            if (e.target.checked) {
                                                                setBulkEmailForm({
                                                                    ...bulkEmailForm,
                                                                    targetStatuses: [...bulkEmailForm.targetStatuses, status]
                                                                });
                                                            } else {
                                                                setBulkEmailForm({
                                                                    ...bulkEmailForm,
                                                                    targetStatuses: bulkEmailForm.targetStatuses.filter(s => s !== status)
                                                                });
                                                            }
                                                        }}
                                                        className="rounded"
                                                    />
                                                    <span className="text-sm">{status}</span>
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                                <p className="text-xs text-slate-500 mt-2">
                                    Leave empty to send to all schools
                                </p>
                            </div>

                            {/* Subject */}
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">
                                    Email Subject *
                                </label>
                                <input
                                    type="text"
                                    value={bulkEmailForm.subject}
                                    onChange={(e) => setBulkEmailForm({ ...bulkEmailForm, subject: e.target.value })}
                                    className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder="Important Update: New Features Available"
                                />
                            </div>

                            {/* Message */}
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">
                                    Email Message *
                                </label>
                                <textarea
                                    value={bulkEmailForm.message}
                                    onChange={(e) => setBulkEmailForm({ ...bulkEmailForm, message: e.target.value })}
                                    className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[200px]"
                                    placeholder="Dear School Administrator,&#10;&#10;We're excited to announce..."
                                />
                            </div>

                            {/* Preview */}
                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                                <p className="text-sm text-blue-800 font-medium mb-1">Preview</p>
                                <p className="text-xs text-blue-600">
                                    This email will be sent to schools matching your criteria
                                </p>
                            </div>

                            {/* Actions */}
                            <div className="flex gap-3 pt-4">
                                <button
                                    onClick={() => setShowBulkEmailModal(false)}
                                    className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={sendBulkEmail}
                                    disabled={loading || !bulkEmailForm.subject || !bulkEmailForm.message}
                                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                >
                                    <Send className="w-4 h-4" />
                                    {loading ? 'Sending...' : 'Send Email'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Template Preview Modal */}
            {showTemplatePreview && selectedTemplate && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
                        <div className="px-6 py-4 border-b flex items-center justify-between sticky top-0 bg-white">
                            <div className="flex items-center gap-3">
                                <FileText className="w-5 h-5 text-blue-600" />
                                <div>
                                    <h3 className="text-lg font-semibold text-slate-900">{selectedTemplate.name}</h3>
                                    <p className="text-sm text-slate-600">{selectedTemplate.description}</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setShowTemplatePreview(false)}
                                className="p-2 hover:bg-slate-100 rounded-lg"
                            >
                                <XCircle className="w-5 h-5 text-slate-500" />
                            </button>
                        </div>
                        
                        <div className="p-6 space-y-6">
                            {/* Template Category */}
                            <div className="flex items-center gap-2">
                                <span className="text-sm text-slate-600">Category:</span>
                                <span className={`px-3 py-1 bg-${selectedTemplate.categoryColor}-100 text-${selectedTemplate.categoryColor}-700 text-sm rounded-full font-medium`}>
                                    {selectedTemplate.category}
                                </span>
                            </div>

                            {/* Subject Preview */}
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">
                                    Email Subject
                                </label>
                                <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                                    <p className="text-slate-900 font-medium">{selectedTemplate.subject}</p>
                                </div>
                            </div>

                            {/* Message Preview */}
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">
                                    Email Message
                                </label>
                                <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                                    <pre className="text-slate-900 whitespace-pre-wrap font-sans text-sm leading-relaxed">
                                        {selectedTemplate.message}
                                    </pre>
                                </div>
                            </div>

                            {/* Template Variables Info */}
                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                                <p className="text-sm text-blue-800 font-medium mb-2">📝 Template Variables</p>
                                <p className="text-xs text-blue-700 mb-2">
                                    This template uses variables that will be automatically replaced when sent:
                                </p>
                                <div className="flex flex-wrap gap-2">
                                    {selectedTemplate.message.match(/\{\{[^}]+\}\}/g)?.map((variable: string, index: number) => (
                                        <code key={index} className="px-2 py-1 bg-white text-blue-700 text-xs rounded border border-blue-200">
                                            {variable}
                                        </code>
                                    ))}
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="flex gap-3 pt-4">
                                <button
                                    onClick={() => setShowTemplatePreview(false)}
                                    className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50"
                                >
                                    Close
                                </button>
                                <button
                                    onClick={() => handleUseTemplate(selectedTemplate)}
                                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2"
                                >
                                    <Send className="w-4 h-4" />
                                    Use This Template
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Bulk SMS Modal */}
            {showBulkSMSModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                        <div className="px-6 py-4 border-b flex items-center justify-between sticky top-0 bg-white">
                            <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                                <Phone className="w-5 h-5 text-green-600" />
                                Send Bulk SMS to Schools
                            </h3>
                            <button
                                onClick={() => setShowBulkSMSModal(false)}
                                className="p-2 hover:bg-slate-100 rounded-lg"
                            >
                                <XCircle className="w-5 h-5 text-slate-500" />
                            </button>
                        </div>
                        
                        <div className="p-6 space-y-4">
                            {/* Target Selection */}
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">
                                    Target Schools
                                </label>
                                <div className="space-y-2">
                                    <div>
                                        <label className="text-xs text-slate-600 mb-1 block">By Tier</label>
                                        <div className="flex flex-wrap gap-2">
                                            {['FREE', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE'].map(tier => (
                                                <label key={tier} className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-lg cursor-pointer hover:bg-slate-100">
                                                    <input
                                                        type="checkbox"
                                                        checked={bulkSMSForm.targetTiers.includes(tier)}
                                                        onChange={(e) => {
                                                            if (e.target.checked) {
                                                                setBulkSMSForm({
                                                                    ...bulkSMSForm,
                                                                    targetTiers: [...bulkSMSForm.targetTiers, tier]
                                                                });
                                                            } else {
                                                                setBulkSMSForm({
                                                                    ...bulkSMSForm,
                                                                    targetTiers: bulkSMSForm.targetTiers.filter(t => t !== tier)
                                                                });
                                                            }
                                                        }}
                                                        className="rounded"
                                                    />
                                                    <span className="text-sm">{tier}</span>
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                    
                                    <div>
                                        <label className="text-xs text-slate-600 mb-1 block">By Status</label>
                                        <div className="flex flex-wrap gap-2">
                                            {['TRIAL', 'ACTIVE', 'SUSPENDED', 'EXPIRED'].map(status => (
                                                <label key={status} className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-lg cursor-pointer hover:bg-slate-100">
                                                    <input
                                                        type="checkbox"
                                                        checked={bulkSMSForm.targetStatuses.includes(status)}
                                                        onChange={(e) => {
                                                            if (e.target.checked) {
                                                                setBulkSMSForm({
                                                                    ...bulkSMSForm,
                                                                    targetStatuses: [...bulkSMSForm.targetStatuses, status]
                                                                });
                                                            } else {
                                                                setBulkSMSForm({
                                                                    ...bulkSMSForm,
                                                                    targetStatuses: bulkSMSForm.targetStatuses.filter(s => s !== status)
                                                                });
                                                            }
                                                        }}
                                                        className="rounded"
                                                    />
                                                    <span className="text-sm">{status}</span>
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                                <p className="text-xs text-slate-500 mt-2">
                                    Leave empty to send to all schools with phone numbers
                                </p>
                            </div>

                            {/* Message */}
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">
                                    SMS Message *
                                </label>
                                <textarea
                                    value={bulkSMSForm.message}
                                    onChange={(e) => setBulkSMSForm({ ...bulkSMSForm, message: e.target.value })}
                                    className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 min-h-[150px]"
                                    placeholder="Your SMS message here... (Keep it concise for SMS)"
                                    maxLength={160}
                                />
                                <p className="text-xs text-slate-500 mt-1">
                                    {bulkSMSForm.message.length}/160 characters
                                </p>
                            </div>

                            {/* Preview */}
                            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                                <p className="text-sm text-green-800 font-medium mb-1">📱 SMS Preview</p>
                                <p className="text-xs text-green-600">
                                    This SMS will be sent to schools with phone numbers matching your criteria
                                </p>
                            </div>

                            {/* Actions */}
                            <div className="flex gap-3 pt-4">
                                <button
                                    onClick={() => setShowBulkSMSModal(false)}
                                    className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={sendBulkSMS}
                                    disabled={loading || !bulkSMSForm.message}
                                    className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                >
                                    <Phone className="w-4 h-4" />
                                    {loading ? 'Sending...' : 'Send SMS'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Bulk Notification Modal */}
            {showBulkNotificationModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                        <div className="px-6 py-4 border-b flex items-center justify-between sticky top-0 bg-white">
                            <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                                <MessageSquare className="w-5 h-5 text-purple-600" />
                                Send Bulk Notification to Schools
                            </h3>
                            <button
                                onClick={() => setShowBulkNotificationModal(false)}
                                className="p-2 hover:bg-slate-100 rounded-lg"
                            >
                                <XCircle className="w-5 h-5 text-slate-500" />
                            </button>
                        </div>
                        
                        <div className="p-6 space-y-4">
                            {/* Target Selection */}
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">
                                    Target Schools
                                </label>
                                <div className="space-y-2">
                                    <div>
                                        <label className="text-xs text-slate-600 mb-1 block">By Tier</label>
                                        <div className="flex flex-wrap gap-2">
                                            {['FREE', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE'].map(tier => (
                                                <label key={tier} className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-lg cursor-pointer hover:bg-slate-100">
                                                    <input
                                                        type="checkbox"
                                                        checked={bulkNotificationForm.targetTiers.includes(tier)}
                                                        onChange={(e) => {
                                                            if (e.target.checked) {
                                                                setBulkNotificationForm({
                                                                    ...bulkNotificationForm,
                                                                    targetTiers: [...bulkNotificationForm.targetTiers, tier]
                                                                });
                                                            } else {
                                                                setBulkNotificationForm({
                                                                    ...bulkNotificationForm,
                                                                    targetTiers: bulkNotificationForm.targetTiers.filter(t => t !== tier)
                                                                });
                                                            }
                                                        }}
                                                        className="rounded"
                                                    />
                                                    <span className="text-sm">{tier}</span>
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                    
                                    <div>
                                        <label className="text-xs text-slate-600 mb-1 block">By Status</label>
                                        <div className="flex flex-wrap gap-2">
                                            {['TRIAL', 'ACTIVE', 'SUSPENDED', 'EXPIRED'].map(status => (
                                                <label key={status} className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-lg cursor-pointer hover:bg-slate-100">
                                                    <input
                                                        type="checkbox"
                                                        checked={bulkNotificationForm.targetStatuses.includes(status)}
                                                        onChange={(e) => {
                                                            if (e.target.checked) {
                                                                setBulkNotificationForm({
                                                                    ...bulkNotificationForm,
                                                                    targetStatuses: [...bulkNotificationForm.targetStatuses, status]
                                                                });
                                                            } else {
                                                                setBulkNotificationForm({
                                                                    ...bulkNotificationForm,
                                                                    targetStatuses: bulkNotificationForm.targetStatuses.filter(s => s !== status)
                                                                });
                                                            }
                                                        }}
                                                        className="rounded"
                                                    />
                                                    <span className="text-sm">{status}</span>
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                                <p className="text-xs text-slate-500 mt-2">
                                    Leave empty to send to all schools
                                </p>
                            </div>

                            {/* Notification Type */}
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">
                                    Notification Type *
                                </label>
                                <div className="flex gap-2">
                                    {(['INFO', 'SUCCESS', 'WARNING', 'ERROR'] as const).map(type => (
                                        <button
                                            key={type}
                                            onClick={() => setBulkNotificationForm({ ...bulkNotificationForm, type })}
                                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                                                bulkNotificationForm.type === type
                                                    ? type === 'INFO' ? 'bg-blue-600 text-white' :
                                                      type === 'SUCCESS' ? 'bg-green-600 text-white' :
                                                      type === 'WARNING' ? 'bg-orange-600 text-white' :
                                                      'bg-red-600 text-white'
                                                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                                            }`}
                                        >
                                            {type}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Title */}
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">
                                    Notification Title *
                                </label>
                                <input
                                    type="text"
                                    value={bulkNotificationForm.title}
                                    onChange={(e) => setBulkNotificationForm({ ...bulkNotificationForm, title: e.target.value })}
                                    className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                                    placeholder="Important Update"
                                />
                            </div>

                            {/* Message */}
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">
                                    Notification Message *
                                </label>
                                <textarea
                                    value={bulkNotificationForm.message}
                                    onChange={(e) => setBulkNotificationForm({ ...bulkNotificationForm, message: e.target.value })}
                                    className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 min-h-[150px]"
                                    placeholder="Your notification message here..."
                                />
                            </div>

                            {/* Preview */}
                            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                                <p className="text-sm text-purple-800 font-medium mb-1">🔔 Notification Preview</p>
                                <p className="text-xs text-purple-600">
                                    This notification will appear in the dashboard for school administrators
                                </p>
                            </div>

                            {/* Actions */}
                            <div className="flex gap-3 pt-4">
                                <button
                                    onClick={() => setShowBulkNotificationModal(false)}
                                    className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={sendBulkNotification}
                                    disabled={loading || !bulkNotificationForm.title || !bulkNotificationForm.message}
                                    className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                >
                                    <MessageSquare className="w-4 h-4" />
                                    {loading ? 'Sending...' : 'Send Notification'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PlatformAdmin;
