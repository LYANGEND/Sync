import React, { useState, useEffect } from 'react';
import api from '../../utils/api';
import BulkImportModal from '../../components/BulkImportModal';
import { useAppDialog } from '../../components/ui/AppDialogProvider';
import { Plus, Search, Edit2, Power, Shield, User, Mail, Lock, GitBranch, Upload } from 'lucide-react';

interface UserData {
  id: string;
  fullName: string;
  email: string;
  role: string;
  isActive: boolean;
  createdAt: string;
  branchId?: string;
  branch?: {
    id: string;
    name: string;
    code: string;
  };
}

interface Branch {
  id: string;
  name: string;
  code: string;
}

const ROLES = ['SUPER_ADMIN', 'BRANCH_MANAGER', 'BURSAR', 'TEACHER', 'SECRETARY', 'PARENT', 'STUDENT'];
const KEEP_BRANCH = '__KEEP_BRANCH__';
const CLEAR_BRANCH = '__CLEAR_BRANCH__';

const Users = () => {
  const { confirm } = useAppDialog();
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [editingUser, setEditingUser] = useState<UserData | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkRole, setBulkRole] = useState('');
  const [bulkBranchId, setBulkBranchId] = useState(KEEP_BRANCH);
  const [bulkSaving, setBulkSaving] = useState(false);

  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    role: 'TEACHER',
    password: '',
    branchId: '',
  });

  const [branches, setBranches] = useState<Branch[]>([]);

  useEffect(() => {
    fetchUsers();
    fetchBranches();
  }, [roleFilter]);

  const fetchBranches = async () => {
    try {
      const response = await api.get('/branches');
      setBranches(response.data);
    } catch (error) {
      console.error('Failed to fetch branches', error);
    }
  };

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (roleFilter) params.role = roleFilter;

      const response = await api.get('/users', { params });
      setUsers(response.data);
    } catch (error) {
      console.error('Failed to fetch users', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingUser) {
        const payload: any = {
          fullName: formData.fullName,
          email: formData.email,
          role: formData.role,
        };
        if (formData.password) {
          payload.password = formData.password;
        }
        if (formData.branchId) {
          payload.branchId = formData.branchId;
        } else {
          payload.branchId = null; // Explicitly clear branch if not selected
        }
        await api.put(`/users/${editingUser.id}`, payload);
      } else {
        const payload: any = {
          fullName: formData.fullName,
          email: formData.email,
          role: formData.role,
          password: formData.password,
        };
        if (formData.branchId) {
          payload.branchId = formData.branchId;
        }
        await api.post('/users', payload);
      }
      fetchUsers();
      setShowModal(false);
      resetForm();
    } catch (error: any) {
      console.error('Failed to save user', error);
      alert(getErrorMessage(error, 'Failed to save user'));
    }
  };

  const handleToggleStatus = async (id: string) => {
    if (!(await confirm({
      title: 'Change user status?',
      message: 'Are you sure you want to change this user\'s status?',
      confirmText: 'Change status',
    }))) return;

    try {
      await api.patch(`/users/${id}/status`);
      fetchUsers();
    } catch (error) {
      console.error('Failed to toggle status', error);
    }
  };

  const toggleSelection = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(selectedId => selectedId !== id) : [...prev, id]
    );
  };

  const toggleAll = () => {
    if (allFilteredSelected) {
      setSelectedIds(prev => prev.filter(id => !filteredUserIds.includes(id)));
    } else {
      setSelectedIds(prev => [...new Set([...prev, ...filteredUserIds])]);
    }
  };

  const getErrorMessage = (error: any, fallback: string) => {
    const apiError = error.response?.data?.error;
    if (Array.isArray(apiError)) {
      return apiError.map((item: any) => item.message || item.path?.join('.') || 'Invalid value').join('\n');
    }
    return apiError || error.response?.data?.details || fallback;
  };

  const handleBulkUpdate = async (updates: { role?: string; branchId?: string | null; isActive?: boolean }, actionLabel: string) => {
    if (selectedIds.length === 0) return;
    if (!(await confirm({
      title: 'Apply bulk update?',
      message: `Apply ${actionLabel} to ${selectedIds.length} selected users?`,
      confirmText: 'Apply changes',
    }))) return;

    setBulkSaving(true);
    try {
      await api.patch('/users/bulk', { ids: selectedIds, ...updates });
      setSelectedIds([]);
      setBulkRole('');
      setBulkBranchId(KEEP_BRANCH);
      fetchUsers();
    } catch (error: any) {
      console.error('Failed to update selected users', error);
      alert(getErrorMessage(error, 'Failed to update selected users'));
    } finally {
      setBulkSaving(false);
    }
  };

  const handleApplyBulkAccess = () => {
    const updates: { role?: string; branchId?: string | null } = {};
    if (bulkRole) updates.role = bulkRole;
    if (bulkBranchId !== KEEP_BRANCH) {
      updates.branchId = bulkBranchId === CLEAR_BRANCH ? null : bulkBranchId;
    }

    if (Object.keys(updates).length === 0) {
      alert('Choose a role or branch change first.');
      return;
    }

    handleBulkUpdate(updates, 'bulk access changes');
  };

  const resetForm = () => {
    setFormData({
      fullName: '',
      email: '',
      role: 'TEACHER',
      password: '',
      branchId: '',
    });
    setEditingUser(null);
  };

  const openEditModal = (user: UserData) => {
    setEditingUser(user);
    setFormData({
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      password: '', // Don't populate password
      branchId: user.branchId || '',
    });
    setShowModal(true);
  };

  const openAddModal = () => {
    resetForm();
    setShowModal(true);
  };

  const filteredUsers = users.filter(user =>
    user.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredUserIds = filteredUsers.map(user => user.id);
  const filteredSelectedCount = filteredUserIds.filter(id => selectedIds.includes(id)).length;
  const allFilteredSelected = filteredUsers.length > 0 && filteredSelectedCount === filteredUsers.length;

  return (
    <div className="p-4 md:p-6 pb-24 md:pb-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white">User Management</h1>
          <p className="text-gray-500 dark:text-gray-400">Manage system access and roles</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
          <button
            onClick={() => setShowImportModal(true)}
            className="flex items-center justify-center space-x-2 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-700 text-gray-700 dark:text-gray-200 px-4 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors"
          >
            <Upload size={20} />
            <span>Import Users</span>
          </button>
          <button
            onClick={openAddModal}
            className="flex items-center justify-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus size={20} />
            <span>Add User</span>
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 overflow-hidden">
        <div className="p-4 border-b border-gray-100 dark:border-slate-700 flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search size={20} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search users..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-900 text-gray-900 dark:text-white"
            />
          </div>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="px-4 py-2 border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-900 text-gray-900 dark:text-white"
          >
            <option value="">All Roles</option>
            {ROLES.map(role => (
              <option key={role} value={role}>{role.replace('_', ' ')}</option>
            ))}
          </select>
        </div>

        {selectedIds.length > 0 && (
          <div className="px-4 py-3 border-b border-gray-100 dark:border-slate-700 bg-blue-50 dark:bg-blue-900/20 flex flex-col lg:flex-row lg:items-center gap-3">
            <div className="text-sm font-medium text-blue-900 dark:text-blue-100">
              {selectedIds.length} selected
            </div>
            <div className="flex flex-col sm:flex-row gap-2 flex-1">
              <select
                value={bulkRole}
                onChange={(e) => setBulkRole(e.target.value)}
                className="px-3 py-2 border border-blue-200 dark:border-blue-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-900 text-gray-900 dark:text-white text-sm"
                disabled={bulkSaving}
              >
                <option value="">Keep role</option>
                {ROLES.map(role => (
                  <option key={role} value={role}>{role.replace('_', ' ')}</option>
                ))}
              </select>
              <select
                value={bulkBranchId}
                onChange={(e) => setBulkBranchId(e.target.value)}
                className="px-3 py-2 border border-blue-200 dark:border-blue-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-900 text-gray-900 dark:text-white text-sm"
                disabled={bulkSaving}
              >
                <option value={KEEP_BRANCH}>Keep branch</option>
                <option value={CLEAR_BRANCH}>Global access</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>{branch.name} ({branch.code})</option>
                ))}
              </select>
              <button
                onClick={handleApplyBulkAccess}
                disabled={bulkSaving}
                className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-300 transition-colors text-sm"
              >
                Apply
              </button>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handleBulkUpdate({ isActive: true }, 'activation')}
                disabled={bulkSaving}
                className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-green-300 transition-colors text-sm"
              >
                Activate
              </button>
              <button
                onClick={() => handleBulkUpdate({ isActive: false }, 'deactivation')}
                disabled={bulkSaving}
                className="px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-red-300 transition-colors text-sm"
              >
                Deactivate
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">Loading users...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-gray-50 dark:bg-slate-700 border-b border-gray-100 dark:border-slate-600">
                <tr>
                  <th className="px-6 py-3 w-12">
                    <input
                      type="checkbox"
                      checked={allFilteredSelected}
                      onChange={toggleAll}
                      aria-label="Select all users"
                      className="rounded text-blue-600 focus:ring-blue-500"
                    />
                  </th>
                  <th className="px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-300 uppercase">User</th>
                  <th className="px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-300 uppercase">Role</th>
                  <th className="px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-300 uppercase">Status</th>
                  <th className="px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-300 uppercase">Created</th>
                  <th className="px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-300 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                {filteredUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/50">
                    <td className="px-6 py-4">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(user.id)}
                        onChange={() => toggleSelection(user.id)}
                        aria-label={`Select ${user.fullName}`}
                        className="rounded text-blue-600 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center">
                        <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold mr-3">
                          {user.fullName.charAt(0)}
                        </div>
                        <div>
                          <div className="font-medium text-gray-900 dark:text-white">{user.fullName}</div>
                          <div className="text-sm text-gray-500 dark:text-gray-400">{user.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1">
                        <span className="px-2 py-1 text-xs font-medium rounded-full bg-gray-100 dark:bg-slate-700 text-gray-800 dark:text-gray-200 w-fit">
                          {user.role.replace('_', ' ')}
                        </span>
                        {user.branch && (
                          <span className="flex items-center text-xs text-gray-500 dark:text-gray-400">
                            <GitBranch size={12} className="mr-1" />
                            {user.branch.name}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${user.isActive
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400'
                        : 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400'
                        }`}>
                        {user.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                      {new Date(user.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center space-x-3">
                        <button
                          onClick={() => openEditModal(user)}
                          className="text-gray-400 hover:text-blue-600 transition-colors"
                          title="Edit User"
                        >
                          <Edit2 size={18} />
                        </button>
                        <button
                          onClick={() => handleToggleStatus(user.id)}
                          className={`${user.isActive ? 'text-green-600 hover:text-red-600' : 'text-red-600 hover:text-green-600'} transition-colors`}
                          title={user.isActive ? 'Deactivate User' : 'Activate User'}
                        >
                          <Power size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 pb-safe">
          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto pb-safe">
            <h2 className="text-xl font-bold mb-4 dark:text-white">{editingUser ? 'Edit User' : 'Add New User'}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Full Name</label>
                <div className="relative">
                  <User size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    required
                    value={formData.fullName}
                    onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-slate-700 dark:text-white"
                    placeholder="John Doe"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Email Address</label>
                <div className="relative">
                  <Mail size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-slate-700 dark:text-white"
                    placeholder="john@example.com"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Role</label>
                <div className="relative">
                  <Shield size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-slate-700 dark:text-white"
                  >
                    {ROLES.map(role => (
                      <option key={role} value={role}>{role.replace('_', ' ')}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Branch (Optional)</label>
                <div className="relative">
                  <GitBranch size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                  <select
                    value={formData.branchId}
                    onChange={(e) => setFormData({ ...formData, branchId: e.target.value })}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-slate-700 dark:text-white"
                  >
                    <option value="">No Branch (Global Access)</option>
                    {branches.map((branch) => (
                      <option key={branch.id} value={branch.id}>{branch.name} ({branch.code})</option>
                    ))}
                  </select>
                </div>
                <p className="text-xs text-gray-500 mt-1">Leave empty for SUPER_ADMIN or global users.</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                  {editingUser ? 'New Password (leave blank to keep current)' : 'Password'}
                </label>
                <div className="relative">
                  <Lock size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                  <input
                    type="password"
                    required={!editingUser}
                    minLength={6}
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-slate-700 dark:text-white"
                    placeholder={editingUser ? '••••••••' : 'Enter password'}
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  {editingUser ? 'Update User' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <BulkImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        entityName="Users"
        apiEndpoint="/users/bulk"
        templateFields={['fullName', 'email', 'role', 'password', 'branchCode', 'isActive']}
        onSuccess={fetchUsers}
        instructions={[
          'Upload a CSV file with user access details.',
          'Required columns: fullName, email, role, password.',
          `Roles: ${ROLES.join(', ')}.`,
          'Optional columns: branchCode, branchId, branchName, isActive.',
          'Use branchCode from Branches to limit access; leave branch fields blank for global access.',
          'isActive accepts true/false, yes/no, active/inactive, or 1/0 and defaults to true.',
        ]}
      />
    </div>
  );
};

export default Users;
