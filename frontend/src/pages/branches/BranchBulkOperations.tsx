import { useState, useEffect } from 'react';
import { ArrowLeft, Users, GraduationCap, CheckSquare, Square, AlertCircle, BarChart3, GitCompare, Layers } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../../utils/api';

interface Branch {
    id: string;
    name: string;
    code: string;
    status: string;
}

interface Student {
    id: string;
    firstName: string;
    lastName: string;
    admissionNumber: string;
    branchId: string;
}

interface User {
    id: string;
    fullName: string;
    email: string;
    role: string;
}

type OperationType = 'transfer-students' | 'assign-users' | 'update-status';

interface BranchBulkOperationsProps {
    embedded?: boolean;
}

const BranchBulkOperations = ({ embedded = false }: BranchBulkOperationsProps) => {
    const navigate = useNavigate();
    const [operationType, setOperationType] = useState<OperationType>('transfer-students');
    const [branches, setBranches] = useState<Branch[]>([]);
    const [students, setStudents] = useState<Student[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [selectedItems, setSelectedItems] = useState<string[]>([]);
    const [targetBranch, setTargetBranch] = useState('');
    const [targetStatus, setTargetStatus] = useState<'ACTIVE' | 'INACTIVE' | 'MAINTENANCE'>('ACTIVE');
    const [reason, setReason] = useState('');
    const [loading, setLoading] = useState(false);
    const [processing, setProcessing] = useState(false);
    const [result, setResult] = useState<any>(null);

    useEffect(() => {
        fetchBranches();
    }, []);

    useEffect(() => {
        if (operationType === 'transfer-students') {
            fetchStudents();
        } else if (operationType === 'assign-users') {
            fetchUsers();
        }
        setSelectedItems([]);
        setResult(null);
    }, [operationType]);

    const fetchBranches = async () => {
        try {
            const response = await api.get('/branches');
            setBranches(response.data);
        } catch (error) {
            console.error('Failed to fetch branches:', error);
        }
    };

    const fetchStudents = async () => {
        try {
            setLoading(true);
            const response = await api.get('/students');
            // Ensure we always set an array, even if API returns unexpected format
            setStudents(Array.isArray(response.data) ? response.data : []);
        } catch (error) {
            console.error('Failed to fetch students:', error);
            setStudents([]); // Set empty array on error
        } finally {
            setLoading(false);
        }
    };

    const fetchUsers = async () => {
        try {
            setLoading(true);
            const response = await api.get('/users');
            // Ensure we always set an array, even if API returns unexpected format
            setUsers(Array.isArray(response.data) ? response.data : []);
        } catch (error) {
            console.error('Failed to fetch users:', error);
            setUsers([]); // Set empty array on error
        } finally {
            setLoading(false);
        }
    };

    const toggleItem = (id: string) => {
        setSelectedItems(prev =>
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    const toggleAll = () => {
        if (operationType === 'transfer-students') {
            setSelectedItems(selectedItems.length === students.length ? [] : (students || []).map(s => s.id));
        } else if (operationType === 'assign-users') {
            setSelectedItems(selectedItems.length === users.length ? [] : (users || []).map(u => u.id));
        } else if (operationType === 'update-status') {
            setSelectedItems(selectedItems.length === branches.length ? [] : (branches || []).map(b => b.id));
        }
    };

    const handleExecute = async () => {
        if (selectedItems.length === 0) {
            alert('Please select items to process');
            return;
        }

        try {
            setProcessing(true);
            setResult(null);

            let response;
            if (operationType === 'transfer-students') {
                if (!targetBranch) {
                    alert('Please select a target branch');
                    return;
                }
                response = await api.post('/branches/bulk/transfer-students', {
                    studentIds: selectedItems,
                    toBranchId: targetBranch,
                    reason
                });
            } else if (operationType === 'assign-users') {
                if (!targetBranch) {
                    alert('Please select a target branch');
                    return;
                }
                response = await api.post('/branches/bulk/assign-users', {
                    userIds: selectedItems,
                    branchId: targetBranch
                });
            } else if (operationType === 'update-status') {
                response = await api.post('/branches/bulk/update-status', {
                    branchIds: selectedItems,
                    status: targetStatus
                });
            }

            setResult(response?.data);
            setSelectedItems([]);
            
            // Refresh data
            if (operationType === 'transfer-students') {
                await fetchStudents();
            } else if (operationType === 'update-status') {
                await fetchBranches();
            }
        } catch (error: any) {
            alert(error.response?.data?.message || 'Operation failed');
        } finally {
            setProcessing(false);
        }
    };

    return (
        <div className={`${embedded ? '' : 'p-6'} space-y-6`}>
            {!embedded && (
                <>
                    {/* Header */}
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => navigate('/branches')}
                            className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg"
                        >
                            <ArrowLeft size={20} />
                        </button>
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Bulk Operations</h1>
                            <p className="text-gray-500 dark:text-gray-400">Perform operations on multiple items at once</p>
                        </div>
                    </div>

                    {/* Navigation Tabs */}
                    <div className="flex space-x-1 bg-gray-100 dark:bg-slate-800 p-1 rounded-lg w-fit">
                        <button
                            onClick={() => navigate('/branches')}
                            className="px-4 py-2 rounded-md text-sm font-medium transition-colors text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                        >
                            All Branches
                        </button>
                        <button
                            onClick={() => navigate('/branches/dashboard')}
                            className="px-4 py-2 rounded-md text-sm font-medium transition-colors text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                        >
                            Dashboard
                        </button>
                        <button
                            onClick={() => navigate('/branches/analytics')}
                            className="px-4 py-2 rounded-md text-sm font-medium transition-colors text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 flex items-center gap-2"
                        >
                            <BarChart3 size={16} />
                            Analytics
                        </button>
                        <button
                            onClick={() => navigate('/branches/comparison')}
                            className="px-4 py-2 rounded-md text-sm font-medium transition-colors text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 flex items-center gap-2"
                        >
                            <GitCompare size={16} />
                            Compare
                        </button>
                        <button
                            onClick={() => navigate('/branches/bulk-operations')}
                            className="px-4 py-2 rounded-md text-sm font-medium transition-colors bg-white dark:bg-slate-700 text-gray-800 dark:text-white shadow-sm flex items-center gap-2"
                        >
                            <Layers size={16} />
                            Bulk Ops
                        </button>
                    </div>
                </>
            )}

            {/* Operation Type Selector */}
            <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-gray-200 dark:border-slate-700">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Select Operation Type
                </label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <button
                        onClick={() => setOperationType('transfer-students')}
                        className={`p-4 rounded-lg border-2 transition-all ${
                            operationType === 'transfer-students'
                                ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                                : 'border-gray-200 dark:border-slate-700 hover:border-gray-300'
                        }`}
                    >
                        <GraduationCap size={24} className="mx-auto mb-2" />
                        <p className="font-medium">Transfer Students</p>
                        <p className="text-xs text-gray-500 mt-1">Move students between branches</p>
                    </button>
                    <button
                        onClick={() => setOperationType('assign-users')}
                        className={`p-4 rounded-lg border-2 transition-all ${
                            operationType === 'assign-users'
                                ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                                : 'border-gray-200 dark:border-slate-700 hover:border-gray-300'
                        }`}
                    >
                        <Users size={24} className="mx-auto mb-2" />
                        <p className="font-medium">Assign Staff</p>
                        <p className="text-xs text-gray-500 mt-1">Assign users to branches</p>
                    </button>
                    <button
                        onClick={() => setOperationType('update-status')}
                        className={`p-4 rounded-lg border-2 transition-all ${
                            operationType === 'update-status'
                                ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                                : 'border-gray-200 dark:border-slate-700 hover:border-gray-300'
                        }`}
                    >
                        <AlertCircle size={24} className="mx-auto mb-2" />
                        <p className="font-medium">Update Status</p>
                        <p className="text-xs text-gray-500 mt-1">Change branch status</p>
                    </button>
                </div>
            </div>

            {/* Configuration */}
            <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-gray-200 dark:border-slate-700">
                <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Configuration</h3>
                <div className="space-y-4">
                    {(operationType === 'transfer-students' || operationType === 'assign-users') && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Target Branch *
                            </label>
                            <select
                                value={targetBranch}
                                onChange={(e) => setTargetBranch(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                            >
                                <option value="">Select a branch...</option>
                                {branches.map(branch => (
                                    <option key={branch.id} value={branch.id}>
                                        {branch.name} ({branch.code})
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}
                    
                    {operationType === 'transfer-students' && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Reason (Optional)
                            </label>
                            <textarea
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                                rows={2}
                                placeholder="Enter reason for transfer..."
                            />
                        </div>
                    )}

                    {operationType === 'update-status' && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                New Status *
                            </label>
                            <select
                                value={targetStatus}
                                onChange={(e) => setTargetStatus(e.target.value as any)}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                            >
                                <option value="ACTIVE">Active</option>
                                <option value="INACTIVE">Inactive</option>
                                <option value="MAINTENANCE">Maintenance</option>
                            </select>
                        </div>
                    )}
                </div>
            </div>

            {/* Selection */}
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700">
                <div className="p-4 border-b border-gray-200 dark:border-slate-700 flex items-center justify-between">
                    <div>
                        <h3 className="font-semibold text-gray-900 dark:text-white">
                            Select Items ({selectedItems.length} selected)
                        </h3>
                    </div>
                    <button
                        onClick={toggleAll}
                        className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                    >
                        {selectedItems.length > 0 ? 'Deselect All' : 'Select All'}
                    </button>
                </div>

                {loading ? (
                    <div className="p-8 text-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                    </div>
                ) : (
                    <div className="max-h-96 overflow-y-auto">
                        {operationType === 'transfer-students' && (students || []).map(student => (
                            <div
                                key={student.id}
                                onClick={() => toggleItem(student.id)}
                                className="p-4 border-b border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700/50 cursor-pointer flex items-center gap-3"
                            >
                                {selectedItems.includes(student.id) ? (
                                    <CheckSquare size={20} className="text-blue-600" />
                                ) : (
                                    <Square size={20} className="text-gray-400" />
                                )}
                                <div className="flex-1">
                                    <p className="font-medium text-gray-900 dark:text-white">
                                        {student.firstName} {student.lastName}
                                    </p>
                                    <p className="text-sm text-gray-500">{student.admissionNumber}</p>
                                </div>
                            </div>
                        ))}

                        {operationType === 'assign-users' && (users || []).map(user => (
                            <div
                                key={user.id}
                                onClick={() => toggleItem(user.id)}
                                className="p-4 border-b border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700/50 cursor-pointer flex items-center gap-3"
                            >
                                {selectedItems.includes(user.id) ? (
                                    <CheckSquare size={20} className="text-blue-600" />
                                ) : (
                                    <Square size={20} className="text-gray-400" />
                                )}
                                <div className="flex-1">
                                    <p className="font-medium text-gray-900 dark:text-white">{user.fullName}</p>
                                    <p className="text-sm text-gray-500">{user.email} • {user.role}</p>
                                </div>
                            </div>
                        ))}

                        {operationType === 'update-status' && (branches || []).map(branch => (
                            <div
                                key={branch.id}
                                onClick={() => toggleItem(branch.id)}
                                className="p-4 border-b border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700/50 cursor-pointer flex items-center gap-3"
                            >
                                {selectedItems.includes(branch.id) ? (
                                    <CheckSquare size={20} className="text-blue-600" />
                                ) : (
                                    <Square size={20} className="text-gray-400" />
                                )}
                                <div className="flex-1">
                                    <p className="font-medium text-gray-900 dark:text-white">{branch.name}</p>
                                    <p className="text-sm text-gray-500">{branch.code} • {branch.status}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Result */}
            {result && (
                <div className={`rounded-xl p-4 border ${
                    result.failed === 0
                        ? 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800'
                        : 'bg-yellow-50 border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-800'
                }`}>
                    <h3 className="font-semibold mb-2">Operation Result</h3>
                    <p className="text-sm">
                        Successful: {result.successful} | Failed: {result.failed}
                    </p>
                    {result.errors && result.errors.length > 0 && (
                        <div className="mt-2 text-sm">
                            <p className="font-medium">Errors:</p>
                            <ul className="list-disc list-inside">
                                {result.errors.map((err: any, idx: number) => (
                                    <li key={idx}>{err.error}</li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            )}

            {/* Actions */}
            {!embedded && (
                <div className="flex justify-end gap-3">
                    <button
                        onClick={() => navigate('/branches')}
                        className="px-6 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleExecute}
                        disabled={selectedItems.length === 0 || processing}
                        className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {processing ? 'Processing...' : `Execute (${selectedItems.length} items)`}
                    </button>
                </div>
            )}
            {embedded && (
                <div className="flex justify-end gap-3">
                    <button
                        onClick={handleExecute}
                        disabled={selectedItems.length === 0 || processing}
                        className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {processing ? 'Processing...' : `Execute (${selectedItems.length} items)`}
                    </button>
                </div>
            )}
        </div>
    );
};

export default BranchBulkOperations;
