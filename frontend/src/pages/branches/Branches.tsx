
import React, { useEffect, useState } from 'react';
import { Plus, Edit2, Trash2, MapPin, Phone, Mail, Building } from 'lucide-react';
import api from '../../utils/api';
import { useAuth } from '../../context/AuthContext';

interface Branch {
    id: string;
    name: string;
    code: string;
    address?: string;
    phone?: string;
    email?: string;
    isMain: boolean;
    _count?: {
        students: number;
        users: number;
        classes: number;
    };
}

const Branches = () => {
    const { user } = useAuth();
    const canManage = ['SUPER_ADMIN', 'ADMIN'].includes(user?.role || '');

    const [branches, setBranches] = useState<Branch[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingBranch, setEditingBranch] = useState<Branch | null>(null);

    const [formData, setFormData] = useState({
        name: '',
        code: '',
        address: '',
        phone: '',
        email: '',
        isMain: false
    });

    useEffect(() => {
        fetchBranches();
    }, []);

    const fetchBranches = async () => {
        try {
            const response = await api.get('/branches');
            setBranches(response.data);
        } catch (error) {
            console.error('Failed to fetch branches', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (editingBranch) {
                await api.put(`/branches/${editingBranch.id}`, formData);
            } else {
                await api.post('/branches', formData);
            }
            fetchBranches();
            setShowModal(false);
            resetForm();
        } catch (error: any) {
            console.error('Failed to save branch', error);
            alert(error.response?.data?.message || 'Failed to save branch');
        }
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm('Are you sure you want to delete this branch?')) return;

        try {
            await api.delete(`/branches/${id}`);
            fetchBranches();
        } catch (error: any) {
            console.error('Failed to delete branch', error);
            alert(error.response?.data?.message || 'Failed to delete branch');
        }
    };

    const openEditModal = (branch: Branch) => {
        setEditingBranch(branch);
        setFormData({
            name: branch.name,
            code: branch.code,
            address: branch.address || '',
            phone: branch.phone || '',
            email: branch.email || '',
            isMain: branch.isMain
        });
        setShowModal(true);
    };

    const openAddModal = () => {
        resetForm();
        setShowModal(true);
    };

    const resetForm = () => {
        setFormData({
            name: '',
            code: '',
            address: '',
            phone: '',
            email: '',
            isMain: false
        });
        setEditingBranch(null);
    };

    return (
        <div className="p-4 md:p-6 pb-24 md:pb-6">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Branches</h1>
                    <p className="text-gray-500 dark:text-gray-400">Manage school campuses</p>
                </div>
                {canManage && (
                    <button
                        onClick={openAddModal}
                        className="flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                    >
                        <Plus size={20} />
                        <span>Add Branch</span>
                    </button>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {loading ? (
                    <div className="col-span-full text-center py-10 text-gray-500">Loading branches...</div>
                ) : branches.map((branch) => (
                    <div key={branch.id} className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden hover:shadow-md transition-shadow">
                        <div className="p-5">
                            <div className="flex justify-between items-start mb-4">
                                <div className="flex items-center space-x-3">
                                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${branch.isMain ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600'
                                        }`}>
                                        <Building size={20} />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-gray-900 dark:text-white">{branch.name}</h3>
                                        <div className="flex items-center space-x-2">
                                            <span className="text-xs font-mono bg-gray-100 dark:bg-slate-700 px-1.5 py-0.5 rounded text-gray-600 dark:text-gray-300">
                                                {branch.code}
                                            </span>
                                            {branch.isMain && (
                                                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">Main</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                {canManage && (
                                    <div className="flex space-x-1">
                                        <button onClick={() => openEditModal(branch)} className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors">
                                            <Edit2 size={16} />
                                        </button>
                                        {!branch.isMain && (
                                            <button onClick={() => handleDelete(branch.id)} className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded transition-colors">
                                                <Trash2 size={16} />
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                                {branch.address && (
                                    <div className="flex items-start space-x-2">
                                        <MapPin size={16} className="mt-0.5 shrink-0" />
                                        <span>{branch.address}</span>
                                    </div>
                                )}
                                {branch.phone && (
                                    <div className="flex items-center space-x-2">
                                        <Phone size={16} />
                                        <span>{branch.phone}</span>
                                    </div>
                                )}
                                {branch.email && (
                                    <div className="flex items-center space-x-2">
                                        <Mail size={16} />
                                        <span>{branch.email}</span>
                                    </div>
                                )}
                            </div>

                            <div className="mt-4 pt-4 border-t border-gray-100 dark:border-slate-700 grid grid-cols-3 gap-2 text-center">
                                <div>
                                    <div className="text-xs text-gray-500 uppercase">Students</div>
                                    <div className="font-bold text-gray-900 dark:text-white">{branch._count?.students || 0}</div>
                                </div>
                                <div>
                                    <div className="text-xs text-gray-500 uppercase">Classes</div>
                                    <div className="font-bold text-gray-900 dark:text-white">{branch._count?.classes || 0}</div>
                                </div>
                                <div>
                                    <div className="text-xs text-gray-500 uppercase">Users</div>
                                    <div className="font-bold text-gray-900 dark:text-white">{branch._count?.users || 0}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {showModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-slate-800 rounded-xl max-w-md w-full p-6">
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
                            {editingBranch ? 'Edit Branch' : 'Add New Branch'}
                        </h2>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Branch Name</label>
                                <input
                                    type="text"
                                    required
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full px-3 py-2 border rounded-lg dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                                    placeholder="e.g. North Campus"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Branch Code</label>
                                    <input
                                        type="text"
                                        required
                                        value={formData.code}
                                        onChange={e => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                                        className="w-full px-3 py-2 border rounded-lg dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                                        placeholder="e.g. NTH"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Phone</label>
                                    <input
                                        type="tel"
                                        value={formData.phone}
                                        onChange={e => setFormData({ ...formData, phone: e.target.value })}
                                        className="w-full px-3 py-2 border rounded-lg dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                                        placeholder="Optional"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
                                <input
                                    type="email"
                                    value={formData.email}
                                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                                    className="w-full px-3 py-2 border rounded-lg dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                                    placeholder="Optional"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Address</label>
                                <textarea
                                    value={formData.address}
                                    onChange={e => setFormData({ ...formData, address: e.target.value })}
                                    className="w-full px-3 py-2 border rounded-lg dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                                    placeholder="Optional"
                                    rows={2}
                                />
                            </div>
                            <div className="flex items-center space-x-2">
                                <input
                                    type="checkbox"
                                    id="isMain"
                                    checked={formData.isMain}
                                    onChange={e => setFormData({ ...formData, isMain: e.target.checked })}
                                    className="rounded text-blue-600"
                                />
                                <label htmlFor="isMain" className="text-sm text-gray-700 dark:text-gray-300">
                                    Set as Main Campus
                                </label>
                            </div>

                            <div className="flex justify-end space-x-3 pt-4">
                                <button
                                    type="button"
                                    onClick={() => setShowModal(false)}
                                    className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                                >
                                    {editingBranch ? 'Save Changes' : 'Create Branch'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Branches;
