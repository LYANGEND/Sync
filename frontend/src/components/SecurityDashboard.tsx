import { useState, useEffect } from 'react';
import {
    Shield,
    AlertTriangle,
    Lock,
    Unlock,
    Activity,
    TrendingUp,
    Eye,
    RefreshCw,
    Download,
    Search,
    Filter,
} from 'lucide-react';

interface SecurityStats {
    failedLogins: number;
    successfulLogins: number;
    lockedAccounts: number;
    suspiciousActivities: number;
    twoFactorAdoptionRate: number;
}

interface SecurityEvent {
    id: string;
    userEmail: string;
    eventType: string;
    status: string;
    ipAddress: string;
    location: string;
    riskScore: number;
    createdAt: string;
}

interface LockedAccount {
    id: string;
    userEmail: string;
    lockReason: string;
    failedAttempts: number;
    lockedAt: string;
    lockedUntil: string;
    tenant?: { name: string; slug: string };
}

const API_URL = 'http://localhost:3000';

const SecurityDashboard = () => {
    const [stats, setStats] = useState<SecurityStats | null>(null);
    const [events, setEvents] = useState<SecurityEvent[]>([]);
    const [lockedAccounts, setLockedAccounts] = useState<LockedAccount[]>([]);
    const [loading, setLoading] = useState(false);
    const [days, setDays] = useState(7);
    const [eventFilter, setEventFilter] = useState('');
    const [searchTerm, setSearchTerm] = useState('');

    const token = localStorage.getItem('platform_token');

    useEffect(() => {
        fetchSecurityDashboard();
        fetchSecurityEvents();
        fetchLockedAccounts();
    }, [days]);

    const fetchSecurityDashboard = async () => {
        setLoading(true);
        try {
            const response = await fetch(`${API_URL}/api/platform/security/dashboard?days=${days}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (response.ok) {
                const data = await response.json();
                setStats(data.stats);
            }
        } catch (error) {
            console.error('Failed to fetch security dashboard:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchSecurityEvents = async () => {
        try {
            const params = new URLSearchParams();
            if (eventFilter) params.append('eventType', eventFilter);
            if (searchTerm) params.append('search', searchTerm);

            const response = await fetch(`${API_URL}/api/platform/security/events?${params}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (response.ok) {
                const data = await response.json();
                setEvents(data.events);
            }
        } catch (error) {
            console.error('Failed to fetch security events:', error);
        }
    };

    const fetchLockedAccounts = async () => {
        try {
            const response = await fetch(`${API_URL}/api/platform/security/locked-accounts`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (response.ok) {
                const data = await response.json();
                setLockedAccounts(data);
            }
        } catch (error) {
            console.error('Failed to fetch locked accounts:', error);
        }
    };

    const unlockAccount = async (lockId: string) => {
        if (!confirm('Are you sure you want to unlock this account?')) return;

        try {
            const response = await fetch(`${API_URL}/api/platform/security/locked-accounts/${lockId}/unlock`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
            });
            if (response.ok) {
                alert('Account unlocked successfully');
                fetchLockedAccounts();
                fetchSecurityDashboard();
            }
        } catch (error) {
            console.error('Failed to unlock account:', error);
        }
    };

    const getRiskColor = (score: number) => {
        if (score >= 70) return 'text-red-600 bg-red-50';
        if (score >= 40) return 'text-orange-600 bg-orange-50';
        return 'text-green-600 bg-green-50';
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                        <Shield className="w-7 h-7 text-blue-600" />
                        Security Dashboard
                    </h2>
                    <p className="text-slate-600 mt-1">Monitor security events and manage account locks</p>
                </div>
                <div className="flex items-center gap-3">
                    <select
                        value={days}
                        onChange={(e) => setDays(Number(e.target.value))}
                        className="px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                        <option value={1}>Last 24 hours</option>
                        <option value={7}>Last 7 days</option>
                        <option value={30}>Last 30 days</option>
                        <option value={90}>Last 90 days</option>
                    </select>
                    <button
                        onClick={() => {
                            fetchSecurityDashboard();
                            fetchSecurityEvents();
                            fetchLockedAccounts();
                        }}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
                    >
                        <RefreshCw className="w-4 h-4" />
                        Refresh
                    </button>
                </div>
            </div>

            {/* Stats Cards */}
            {stats && (
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                    <div className="bg-white rounded-xl border p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-slate-600">Failed Logins</p>
                                <p className="text-3xl font-bold text-red-600 mt-2">{stats.failedLogins}</p>
                            </div>
                            <div className="w-12 h-12 bg-red-50 rounded-lg flex items-center justify-center">
                                <AlertTriangle className="w-6 h-6 text-red-600" />
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-xl border p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-slate-600">Successful Logins</p>
                                <p className="text-3xl font-bold text-green-600 mt-2">{stats.successfulLogins}</p>
                            </div>
                            <div className="w-12 h-12 bg-green-50 rounded-lg flex items-center justify-center">
                                <Activity className="w-6 h-6 text-green-600" />
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-xl border p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-slate-600">Locked Accounts</p>
                                <p className="text-3xl font-bold text-orange-600 mt-2">{stats.lockedAccounts}</p>
                            </div>
                            <div className="w-12 h-12 bg-orange-50 rounded-lg flex items-center justify-center">
                                <Lock className="w-6 h-6 text-orange-600" />
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-xl border p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-slate-600">Suspicious Activity</p>
                                <p className="text-3xl font-bold text-purple-600 mt-2">{stats.suspiciousActivities}</p>
                            </div>
                            <div className="w-12 h-12 bg-purple-50 rounded-lg flex items-center justify-between">
                                <Eye className="w-6 h-6 text-purple-600" />
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-xl border p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-slate-600">2FA Adoption</p>
                                <p className="text-3xl font-bold text-blue-600 mt-2">{stats.twoFactorAdoptionRate}%</p>
                            </div>
                            <div className="w-12 h-12 bg-blue-50 rounded-lg flex items-center justify-center">
                                <Shield className="w-6 h-6 text-blue-600" />
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Locked Accounts */}
            {lockedAccounts.length > 0 && (
                <div className="bg-white rounded-xl border overflow-hidden">
                    <div className="px-6 py-4 border-b bg-orange-50">
                        <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                            <Lock className="w-5 h-5 text-orange-600" />
                            Locked Accounts ({lockedAccounts.length})
                        </h3>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-slate-50 border-b">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">Email</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">School</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">Reason</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">Failed Attempts</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">Locked At</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">Unlocks At</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {lockedAccounts.map((account) => (
                                    <tr key={account.id} className="hover:bg-slate-50">
                                        <td className="px-6 py-4 text-sm text-slate-900">{account.userEmail}</td>
                                        <td className="px-6 py-4 text-sm text-slate-600">{account.tenant?.name || 'Platform'}</td>
                                        <td className="px-6 py-4 text-sm text-slate-600">{account.lockReason}</td>
                                        <td className="px-6 py-4 text-sm">
                                            <span className="px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs font-medium">
                                                {account.failedAttempts}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-sm text-slate-600">
                                            {new Date(account.lockedAt).toLocaleString()}
                                        </td>
                                        <td className="px-6 py-4 text-sm text-slate-600">
                                            {new Date(account.lockedUntil).toLocaleString()}
                                        </td>
                                        <td className="px-6 py-4">
                                            <button
                                                onClick={() => unlockAccount(account.id)}
                                                className="px-3 py-1 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-1 text-sm"
                                            >
                                                <Unlock className="w-4 h-4" />
                                                Unlock
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Security Events */}
            <div className="bg-white rounded-xl border overflow-hidden">
                <div className="px-6 py-4 border-b bg-slate-50">
                    <div className="flex items-center justify-between">
                        <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                            <Activity className="w-5 h-5" />
                            Recent Security Events
                        </h3>
                        <div className="flex items-center gap-3">
                            <div className="relative">
                                <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
                                <input
                                    type="text"
                                    placeholder="Search email or IP..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="pl-10 pr-4 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                            <select
                                value={eventFilter}
                                onChange={(e) => setEventFilter(e.target.value)}
                                className="px-4 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                            >
                                <option value="">All Events</option>
                                <option value="FAILED_LOGIN">Failed Logins</option>
                                <option value="SUCCESSFUL_LOGIN">Successful Logins</option>
                                <option value="ACCOUNT_LOCKED">Account Locked</option>
                                <option value="SUSPICIOUS_ACTIVITY">Suspicious Activity</option>
                            </select>
                            <button
                                onClick={fetchSecurityEvents}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                            >
                                Apply
                            </button>
                        </div>
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-slate-50 border-b">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">Time</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">Email</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">Event</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">Status</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">IP Address</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">Risk Score</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {events.map((event) => (
                                <tr key={event.id} className="hover:bg-slate-50">
                                    <td className="px-6 py-4 text-sm text-slate-600">
                                        {new Date(event.createdAt).toLocaleString()}
                                    </td>
                                    <td className="px-6 py-4 text-sm text-slate-900">{event.userEmail}</td>
                                    <td className="px-6 py-4 text-sm">
                                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                            event.eventType === 'FAILED_LOGIN' ? 'bg-red-100 text-red-700' :
                                            event.eventType === 'SUCCESSFUL_LOGIN' ? 'bg-green-100 text-green-700' :
                                            event.eventType === 'ACCOUNT_LOCKED' ? 'bg-orange-100 text-orange-700' :
                                            'bg-purple-100 text-purple-700'
                                        }`}>
                                            {event.eventType.replace('_', ' ')}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-slate-600">{event.status || '-'}</td>
                                    <td className="px-6 py-4 text-sm text-slate-600 font-mono">{event.ipAddress || '-'}</td>
                                    <td className="px-6 py-4 text-sm">
                                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getRiskColor(event.riskScore)}`}>
                                            {event.riskScore}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default SecurityDashboard;
