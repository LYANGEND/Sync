import { useState, useEffect } from 'react';
import { Building, Plus, Trash2, Star, X } from 'lucide-react';
import api from '../../utils/api';

interface Branch {
    id: string;
    name: string;
    code: string;
    isMain: boolean;
    status: string;
}

interface BranchAssignment {
    id: string;
    branchId: string;
    isPrimary: boolean;
    role?: string;
    startDate: string;
    endDate?: string;
    branch: Branch;
}

interface Props {
    entityType: 'user' | 'student';
    entityId: string;
    entityName: string;
    onClose: () => void;
}

const BranchAssignmentModal = ({ entityType, entityId, entityName, onClose }: Props) => {
    const [assignments, setAssignments] = useState<BranchAssignment[]>([]);
    const [branches, setBranches] = useState<Branch[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAddForm, setShowAddForm] = useState(false);
    const [selectedBranchId, setSelectedBranchId] = useState('');
    const [isPrimary, setIsPrimary] = useState(false);
    const [roleOrType, setRoleOrType] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        fetchData();
    }, [entityId]);

    const fetchData = async () => {
        try {
            setLoading(true);
            const endpoint = entityType === 'user'
                ? `/branch-assignments/users/${entityId}/branches`
                : `/branch-assignments/students/${entityId}/branches`;

            const [assignmentsRes, branchesRes] = await Promise.all([
                api.get(endpoint),
                api.get('/branches')
            ]);

            setAssignments(assignmentsRes.data);
            setBranches(branchesRes.data);
        } catch (error) {
            console.error('Failed to fetch data', error);
        } finally {
            setLoading(false);
        }
    };

    const handleAdd = async () => {
        if (!selectedBranchId) return;

        try {
            setSaving(true);
            const endpoint = entityType === 'user'
                ? `/branch-assignments/users/${entityId}/branches`
                : `/branch-assignments/students/${entityId}/branches`;

            const payload = entityType === 'user'
                ? { branchId: selectedBranchId, isPrimary, role: roleOrType || undefined }
                : { branchId: selectedBranchId, isPrimary, enrollType: roleOrType || undefined };

            await api.post(endpoint, payload);
            await fetchData();
            setShowAddForm(false);
            setSelectedBranchId('');
            setIsPrimary(false);
            setRoleOrType('');
        } catch (error: any) {
            alert(error.response?.data?.message || 'Failed to add assignment');
        } finally {
            setSaving(false);
        }
    };

    const handleRemove = async (branchId: string) => {
        if (!window.confirm('Remove this branch assignment?')) return;

        try {
            const endpoint = entityType === 'user'
                ? `/branch-assignments/users/${entityId}/branches/${branchId}`
                : `/branch-assignments/students/${entityId}/branches/${branchId}`;

            await api.delete(endpoint);
            await fetchData();
        } catch (error: any) {
            alert(error.response?.data?.message || 'Failed to remove assignment');
        }
    };

    const handleSetPrimary = async (branchId: string) => {
        try {
            const endpoint = entityType === 'user'
                ? `/branch-assignments/users/${entityId}/branches`
                : `/branch-assignments/students/${entityId}/branches`;

            const payload = entityType === 'user'
                ? { branchId, isPrimary: true }
                : { branchId, isPrimary: true };

            await api.post(endpoint, payload);
            await fetchData();
        } catch (error: any) {
            alert(error.response?.data?.message || 'Failed to set primary');
        }
    };

    // Get branches not yet assigned
    const availableBranches = branches.filter(
        b => !assignments.some(a => a.branchId === b.id)
    );

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-slate-800 rounded-xl max-w-lg w-full max-h-[80vh] overflow-hidden shadow-2xl">
                {/* Header */}
                <div className="p-4 border-b border-gray-200 dark:border-slate-700 flex justify-between items-center">
                    <div>
                        <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                            Branch Assignments
                        </h2>
                        <p className="text-sm text-gray-500">{entityName}</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg">
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-4 overflow-y-auto max-h-[calc(80vh-140px)]">
                    {loading ? (
                        <div className="text-center py-8 text-gray-500">Loading...</div>
                    ) : (
                        <>
                            {/* Current Assignments */}
                            <div className="space-y-2 mb-4">
                                {assignments.length === 0 ? (
                                    <p className="text-center text-gray-500 py-4">No branch assignments</p>
                                ) : (
                                    assignments.map((assignment) => (
                                        <div
                                            key={assignment.id}
                                            className="flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-700/50 rounded-lg"
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${assignment.isPrimary
                                                        ? 'bg-blue-100 text-blue-600'
                                                        : 'bg-gray-100 text-gray-500'
                                                    }`}>
                                                    <Building size={20} />
                                                </div>
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-medium text-gray-900 dark:text-white">
                                                            {assignment.branch.name}
                                                        </span>
                                                        {assignment.isPrimary && (
                                                            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                                                                Primary
                                                            </span>
                                                        )}
                                                    </div>
                                                    <span className="text-xs text-gray-500">
                                                        {assignment.branch.code}
                                                        {(assignment as any).role && ` • ${(assignment as any).role}`}
                                                        {(assignment as any).enrollType && ` • ${(assignment as any).enrollType}`}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                {!assignment.isPrimary && (
                                                    <>
                                                        <button
                                                            onClick={() => handleSetPrimary(assignment.branchId)}
                                                            className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                                            title="Set as primary"
                                                        >
                                                            <Star size={16} />
                                                        </button>
                                                        <button
                                                            onClick={() => handleRemove(assignment.branchId)}
                                                            className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                                            title="Remove"
                                                        >
                                                            <Trash2 size={16} />
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>

                            {/* Add Form */}
                            {showAddForm ? (
                                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 space-y-3">
                                    <select
                                        value={selectedBranchId}
                                        onChange={(e) => setSelectedBranchId(e.target.value)}
                                        className="w-full px-3 py-2 border rounded-lg dark:bg-slate-700 dark:border-slate-600"
                                    >
                                        <option value="">Select Branch...</option>
                                        {availableBranches.map((branch) => (
                                            <option key={branch.id} value={branch.id}>
                                                {branch.name} ({branch.code})
                                            </option>
                                        ))}
                                    </select>
                                    <input
                                        type="text"
                                        value={roleOrType}
                                        onChange={(e) => setRoleOrType(e.target.value)}
                                        placeholder={entityType === 'user' ? 'Role (optional)' : 'Enrollment Type (optional)'}
                                        className="w-full px-3 py-2 border rounded-lg dark:bg-slate-700 dark:border-slate-600"
                                    />
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="checkbox"
                                            id="isPrimary"
                                            checked={isPrimary}
                                            onChange={(e) => setIsPrimary(e.target.checked)}
                                            className="rounded"
                                        />
                                        <label htmlFor="isPrimary" className="text-sm text-gray-700 dark:text-gray-300">
                                            Set as primary branch
                                        </label>
                                    </div>
                                    <div className="flex justify-end gap-2">
                                        <button
                                            onClick={() => setShowAddForm(false)}
                                            className="px-3 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            onClick={handleAdd}
                                            disabled={!selectedBranchId || saving}
                                            className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                                        >
                                            {saving ? 'Adding...' : 'Add Assignment'}
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                availableBranches.length > 0 && (
                                    <button
                                        onClick={() => setShowAddForm(true)}
                                        className="w-full flex items-center justify-center gap-2 p-3 border-2 border-dashed border-gray-300 dark:border-slate-600 rounded-lg text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors"
                                    >
                                        <Plus size={20} />
                                        <span>Add Branch Assignment</span>
                                    </button>
                                )
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default BranchAssignmentModal;
