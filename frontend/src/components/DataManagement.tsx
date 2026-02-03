import { useState, useEffect } from 'react';
import {
    Database,
    Download,
    Trash2,
    Clock,
    CheckCircle,
    XCircle,
    AlertCircle,
    RefreshCw,
    Plus,
    Save,
    HardDrive,
} from 'lucide-react';

interface DataExportRequest {
    id: string;
    tenant: { name: string; slug: string };
    requestedByEmail: string;
    status: string;
    exportType: string;
    fileUrl: string | null;
    fileSize: number | null;
    expiresAt: string | null;
    createdAt: string;
    completedAt: string | null;
}

interface DataDeletionRequest {
    id: string;
    tenant: { name: string; slug: string };
    requestedByEmail: string;
    entityType: string;
    entityId: string;
    status: string;
    reason: string | null;
    createdAt: string;
    approvedAt: string | null;
}

interface RetentionPolicy {
    id: string;
    tenant: { name: string; slug: string } | null;
    entityType: string;
    retentionDays: number;
    isActive: boolean;
    autoDelete: boolean;
    lastRunAt: string | null;
}

interface BackupLog {
    id: string;
    backupType: string;
    status: string;
    fileSize: number | null;
    fileLocation: string | null;
    recordCount: number | null;
    duration: number | null;
    startedAt: string;
    completedAt: string | null;
}

const API_URL = import.meta.env.VITE_API_URL || '/api';

const DataManagement = () => {
    const [activeSection, setActiveSection] = useState<'exports' | 'deletions' | 'retention' | 'backups'>('exports');
    const [exportRequests, setExportRequests] = useState<DataExportRequest[]>([]);
    const [deletionRequests, setDeletionRequests] = useState<DataDeletionRequest[]>([]);
    const [retentionPolicies, setRetentionPolicies] = useState<RetentionPolicy[]>([]);
    const [backupLogs, setBackupLogs] = useState<BackupLog[]>([]);
    const [loading, setLoading] = useState(false);
    const [showNewPolicyModal, setShowNewPolicyModal] = useState(false);
    const [newPolicy, setNewPolicy] = useState({
        entityType: 'AUDIT_LOGS',
        retentionDays: 90,
        autoDelete: false,
    });

    const token = localStorage.getItem('platform_token');

    useEffect(() => {
        fetchData();
    }, [activeSection]);

    const fetchData = () => {
        switch (activeSection) {
            case 'exports':
                fetchExportRequests();
                break;
            case 'deletions':
                fetchDeletionRequests();
                break;
            case 'retention':
                fetchRetentionPolicies();
                break;
            case 'backups':
                fetchBackupLogs();
                break;
        }
    };

    const fetchExportRequests = async () => {
        setLoading(true);
        try {
            const response = await fetch(`${API_URL}/api/platform/security/data-exports`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (response.ok) {
                const data = await response.json();
                setExportRequests(data.requests);
            }
        } catch (error) {
            console.error('Failed to fetch export requests:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchDeletionRequests = async () => {
        setLoading(true);
        try {
            const response = await fetch(`${API_URL}/api/platform/security/data-deletions`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (response.ok) {
                const data = await response.json();
                setDeletionRequests(data.requests);
            }
        } catch (error) {
            console.error('Failed to fetch deletion requests:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchRetentionPolicies = async () => {
        setLoading(true);
        try {
            const response = await fetch(`${API_URL}/api/platform/security/retention-policies`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (response.ok) {
                const data = await response.json();
                setRetentionPolicies(data);
            }
        } catch (error) {
            console.error('Failed to fetch retention policies:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchBackupLogs = async () => {
        setLoading(true);
        try {
            const response = await fetch(`${API_URL}/api/platform/security/backups`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (response.ok) {
                const data = await response.json();
                setBackupLogs(data.logs);
            }
        } catch (error) {
            console.error('Failed to fetch backup logs:', error);
        } finally {
            setLoading(false);
        }
    };

    const processExport = async (requestId: string) => {
        if (!confirm('Process this export request?')) return;

        try {
            const response = await fetch(`${API_URL}/api/platform/security/data-exports/${requestId}/process`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
            });
            if (response.ok) {
                alert('Export processing started');
                fetchExportRequests();
            }
        } catch (error) {
            console.error('Failed to process export:', error);
        }
    };

    const updateDeletionRequest = async (requestId: string, status: 'APPROVED' | 'REJECTED') => {
        if (!confirm(`${status} this deletion request?`)) return;

        try {
            const response = await fetch(`${API_URL}/api/platform/security/data-deletions/${requestId}`, {
                method: 'PATCH',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ status }),
            });
            if (response.ok) {
                alert(`Request ${status.toLowerCase()}`);
                fetchDeletionRequests();
            }
        } catch (error) {
            console.error('Failed to update deletion request:', error);
        }
    };

    const saveRetentionPolicy = async () => {
        try {
            const response = await fetch(`${API_URL}/api/platform/security/retention-policies`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(newPolicy),
            });
            if (response.ok) {
                alert('Retention policy saved');
                setShowNewPolicyModal(false);
                fetchRetentionPolicies();
            }
        } catch (error) {
            console.error('Failed to save retention policy:', error);
        }
    };

    const triggerBackup = async () => {
        if (!confirm('Trigger a full platform backup?')) return;

        try {
            const response = await fetch(`${API_URL}/api/platform/security/backups/trigger`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ backupType: 'FULL' }),
            });
            if (response.ok) {
                alert('Backup started');
                fetchBackupLogs();
            }
        } catch (error) {
            console.error('Failed to trigger backup:', error);
        }
    };

    const getStatusBadge = (status: string) => {
        const styles = {
            PENDING: 'bg-yellow-100 text-yellow-700',
            PROCESSING: 'bg-blue-100 text-blue-700',
            COMPLETED: 'bg-green-100 text-green-700',
            FAILED: 'bg-red-100 text-red-700',
            APPROVED: 'bg-green-100 text-green-700',
            REJECTED: 'bg-red-100 text-red-700',
            STARTED: 'bg-blue-100 text-blue-700',
            IN_PROGRESS: 'bg-blue-100 text-blue-700',
        };
        return styles[status as keyof typeof styles] || 'bg-gray-100 text-gray-700';
    };

    const formatFileSize = (bytes: number | null) => {
        if (!bytes) return '-';
        const mb = bytes / (1024 * 1024);
        return `${mb.toFixed(2)} MB`;
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                        <Database className="w-7 h-7 text-blue-600" />
                        Data Management & GDPR Compliance
                    </h2>
                    <p className="text-slate-600 mt-1">Manage data exports, deletions, retention policies, and backups</p>
                </div>
                <button
                    onClick={fetchData}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
                >
                    <RefreshCw className="w-4 h-4" />
                    Refresh
                </button>
            </div>

            {/* Tabs */}
            <div className="border-b">
                <div className="flex gap-4">
                    <button
                        onClick={() => setActiveSection('exports')}
                        className={`px-4 py-3 font-medium border-b-2 transition-colors ${
                            activeSection === 'exports'
                                ? 'border-blue-600 text-blue-600'
                                : 'border-transparent text-slate-600 hover:text-slate-900'
                        }`}
                    >
                        <Download className="w-4 h-4 inline mr-2" />
                        Data Exports
                    </button>
                    <button
                        onClick={() => setActiveSection('deletions')}
                        className={`px-4 py-3 font-medium border-b-2 transition-colors ${
                            activeSection === 'deletions'
                                ? 'border-blue-600 text-blue-600'
                                : 'border-transparent text-slate-600 hover:text-slate-900'
                        }`}
                    >
                        <Trash2 className="w-4 h-4 inline mr-2" />
                        Data Deletions
                    </button>
                    <button
                        onClick={() => setActiveSection('retention')}
                        className={`px-4 py-3 font-medium border-b-2 transition-colors ${
                            activeSection === 'retention'
                                ? 'border-blue-600 text-blue-600'
                                : 'border-transparent text-slate-600 hover:text-slate-900'
                        }`}
                    >
                        <Clock className="w-4 h-4 inline mr-2" />
                        Retention Policies
                    </button>
                    <button
                        onClick={() => setActiveSection('backups')}
                        className={`px-4 py-3 font-medium border-b-2 transition-colors ${
                            activeSection === 'backups'
                                ? 'border-blue-600 text-blue-600'
                                : 'border-transparent text-slate-600 hover:text-slate-900'
                        }`}
                    >
                        <HardDrive className="w-4 h-4 inline mr-2" />
                        Backups
                    </button>
                </div>
            </div>

            {/* Data Exports */}
            {activeSection === 'exports' && (
                <div className="bg-white rounded-xl border overflow-hidden">
                    <div className="px-6 py-4 border-b bg-slate-50">
                        <h3 className="font-semibold text-slate-900">Data Export Requests (GDPR)</h3>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-slate-50 border-b">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">School</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">Requested By</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">Export Type</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">Status</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">File Size</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">Created</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {exportRequests.map((request) => (
                                    <tr key={request.id} className="hover:bg-slate-50">
                                        <td className="px-6 py-4 text-sm text-slate-900">{request.tenant.name}</td>
                                        <td className="px-6 py-4 text-sm text-slate-600">{request.requestedByEmail}</td>
                                        <td className="px-6 py-4 text-sm text-slate-600">{request.exportType}</td>
                                        <td className="px-6 py-4 text-sm">
                                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusBadge(request.status)}`}>
                                                {request.status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-sm text-slate-600">{formatFileSize(request.fileSize)}</td>
                                        <td className="px-6 py-4 text-sm text-slate-600">
                                            {new Date(request.createdAt).toLocaleDateString()}
                                        </td>
                                        <td className="px-6 py-4">
                                            {request.status === 'PENDING' && (
                                                <button
                                                    onClick={() => processExport(request.id)}
                                                    className="px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                                                >
                                                    Process
                                                </button>
                                            )}
                                            {request.status === 'COMPLETED' && request.fileUrl && (
                                                <a
                                                    href={request.fileUrl}
                                                    className="px-3 py-1 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm inline-block"
                                                >
                                                    Download
                                                </a>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Data Deletions */}
            {activeSection === 'deletions' && (
                <div className="bg-white rounded-xl border overflow-hidden">
                    <div className="px-6 py-4 border-b bg-slate-50">
                        <h3 className="font-semibold text-slate-900">Data Deletion Requests (Right to be Forgotten)</h3>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-slate-50 border-b">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">School</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">Requested By</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">Entity Type</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">Status</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">Reason</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">Created</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {deletionRequests.map((request) => (
                                    <tr key={request.id} className="hover:bg-slate-50">
                                        <td className="px-6 py-4 text-sm text-slate-900">{request.tenant.name}</td>
                                        <td className="px-6 py-4 text-sm text-slate-600">{request.requestedByEmail}</td>
                                        <td className="px-6 py-4 text-sm text-slate-600">{request.entityType}</td>
                                        <td className="px-6 py-4 text-sm">
                                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusBadge(request.status)}`}>
                                                {request.status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-sm text-slate-600">{request.reason || '-'}</td>
                                        <td className="px-6 py-4 text-sm text-slate-600">
                                            {new Date(request.createdAt).toLocaleDateString()}
                                        </td>
                                        <td className="px-6 py-4">
                                            {request.status === 'PENDING' && (
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => updateDeletionRequest(request.id, 'APPROVED')}
                                                        className="px-3 py-1 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
                                                    >
                                                        Approve
                                                    </button>
                                                    <button
                                                        onClick={() => updateDeletionRequest(request.id, 'REJECTED')}
                                                        className="px-3 py-1 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm"
                                                    >
                                                        Reject
                                                    </button>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Retention Policies */}
            {activeSection === 'retention' && (
                <div className="space-y-4">
                    <div className="flex justify-end">
                        <button
                            onClick={() => setShowNewPolicyModal(true)}
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
                        >
                            <Plus className="w-4 h-4" />
                            New Policy
                        </button>
                    </div>

                    <div className="bg-white rounded-xl border overflow-hidden">
                        <div className="px-6 py-4 border-b bg-slate-50">
                            <h3 className="font-semibold text-slate-900">Data Retention Policies</h3>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-slate-50 border-b">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">Scope</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">Entity Type</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">Retention Days</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">Auto Delete</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">Status</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">Last Run</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {retentionPolicies.map((policy) => (
                                        <tr key={policy.id} className="hover:bg-slate-50">
                                            <td className="px-6 py-4 text-sm text-slate-900">
                                                {policy.tenant ? policy.tenant.name : 'Platform-wide'}
                                            </td>
                                            <td className="px-6 py-4 text-sm text-slate-600">{policy.entityType}</td>
                                            <td className="px-6 py-4 text-sm text-slate-600">{policy.retentionDays} days</td>
                                            <td className="px-6 py-4 text-sm">
                                                {policy.autoDelete ? (
                                                    <CheckCircle className="w-5 h-5 text-green-600" />
                                                ) : (
                                                    <XCircle className="w-5 h-5 text-slate-400" />
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-sm">
                                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                                    policy.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
                                                }`}>
                                                    {policy.isActive ? 'Active' : 'Inactive'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-sm text-slate-600">
                                                {policy.lastRunAt ? new Date(policy.lastRunAt).toLocaleDateString() : 'Never'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* Backups */}
            {activeSection === 'backups' && (
                <div className="space-y-4">
                    <div className="flex justify-end">
                        <button
                            onClick={triggerBackup}
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
                        >
                            <HardDrive className="w-4 h-4" />
                            Trigger Backup
                        </button>
                    </div>

                    <div className="bg-white rounded-xl border overflow-hidden">
                        <div className="px-6 py-4 border-b bg-slate-50">
                            <h3 className="font-semibold text-slate-900">Backup Logs</h3>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-slate-50 border-b">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">Type</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">Status</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">File Size</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">Records</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">Duration</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">Started</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">Completed</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {backupLogs.map((log) => (
                                        <tr key={log.id} className="hover:bg-slate-50">
                                            <td className="px-6 py-4 text-sm text-slate-900">{log.backupType}</td>
                                            <td className="px-6 py-4 text-sm">
                                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusBadge(log.status)}`}>
                                                    {log.status}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-sm text-slate-600">{formatFileSize(log.fileSize)}</td>
                                            <td className="px-6 py-4 text-sm text-slate-600">{log.recordCount?.toLocaleString() || '-'}</td>
                                            <td className="px-6 py-4 text-sm text-slate-600">{log.duration ? `${log.duration}s` : '-'}</td>
                                            <td className="px-6 py-4 text-sm text-slate-600">
                                                {new Date(log.startedAt).toLocaleString()}
                                            </td>
                                            <td className="px-6 py-4 text-sm text-slate-600">
                                                {log.completedAt ? new Date(log.completedAt).toLocaleString() : '-'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* New Policy Modal */}
            {showNewPolicyModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl p-6 max-w-md w-full">
                        <h3 className="text-lg font-semibold mb-4">Create Retention Policy</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">Entity Type</label>
                                <select
                                    value={newPolicy.entityType}
                                    onChange={(e) => setNewPolicy({ ...newPolicy, entityType: e.target.value })}
                                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                                >
                                    <option value="AUDIT_LOGS">Audit Logs</option>
                                    <option value="SECURITY_EVENTS">Security Events</option>
                                    <option value="PAYMENTS">Payments</option>
                                    <option value="STUDENTS">Students</option>
                                    <option value="BACKUPS">Backups</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">Retention Days</label>
                                <input
                                    type="number"
                                    value={newPolicy.retentionDays}
                                    onChange={(e) => setNewPolicy({ ...newPolicy, retentionDays: parseInt(e.target.value) })}
                                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                            <div className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    checked={newPolicy.autoDelete}
                                    onChange={(e) => setNewPolicy({ ...newPolicy, autoDelete: e.target.checked })}
                                    className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                                />
                                <label className="text-sm text-slate-700">Auto-delete after retention period</label>
                            </div>
                        </div>
                        <div className="flex gap-3 mt-6">
                            <button
                                onClick={saveRetentionPolicy}
                                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                            >
                                Save Policy
                            </button>
                            <button
                                onClick={() => setShowNewPolicyModal(false)}
                                className="flex-1 px-4 py-2 border rounded-lg hover:bg-slate-50"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DataManagement;
