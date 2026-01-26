import React, { useState, useEffect } from 'react';
import api from '../../utils/api';
import { Plus, Search, Edit2, Power, Shield, User, Mail, Lock, GitBranch } from 'lucide-react';

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

const ROLES = ['SUPER_ADMIN', 'BURSAR', 'TEACHER', 'SECRETARY', 'PARENT', 'STUDENT'];

const Users = () => {
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<UserData | null>(null);

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
        await api.post('/users', formData);
      }
      fetchUsers();
      setShowModal(false);
      resetForm();
    } catch (error: any) {
      console.error('Failed to save user', error);
      alert(error.response?.data?.error || 'Failed to save user');
    }
  };

  const handleToggleStatus = async (id: string) => {
    if (!window.confirm('Are you sure you want to change this user\'s status?')) return;

    try {
      await api.patch(`/users/${id}/status`);
      fetchUsers();
    } catch (error) {
      console.error('Failed to toggle status', error);
    }
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

  return (
    <div className="p-4 md:p-6 pb-24 md:pb-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white">User Management</h1>
          <p className="text-gray-500 dark:text-gray-400">Manage system access and roles</p>
        </div>
        <button
          onClick={openAddModal}
          className="flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus size={20} />
          <span>Add User</span>
        </button>
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

        {loading ? (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">Loading users...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-gray-50 dark:bg-slate-700 border-b border-gray-100 dark:border-slate-600">
                <tr>
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
    </div>
  );
};

export default Users;
