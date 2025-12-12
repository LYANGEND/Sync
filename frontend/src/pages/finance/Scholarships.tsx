import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, GraduationCap, Upload } from 'lucide-react';
import api from '../../utils/api';
import BulkImportModal from '../../components/BulkImportModal';

interface Scholarship {
  id: string;
  name: string;
  percentage: number;
  description?: string;
  _count?: {
    students: number;
  };
}

const Scholarships = () => {
  const [scholarships, setScholarships] = useState<Scholarship[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    percentage: '',
    description: ''
  });
  const [showImportModal, setShowImportModal] = useState(false);

  useEffect(() => {
    fetchScholarships();
  }, []);

  const fetchScholarships = async () => {
    try {
      const response = await api.get('/scholarships');
      setScholarships(response.data);
    } catch (error) {
      console.error('Error fetching scholarships:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        ...formData,
        percentage: Number(formData.percentage)
      };

      if (editingId) {
        await api.put(`/scholarships/${editingId}`, payload);
      } else {
        await api.post('/scholarships', payload);
      }

      setShowModal(false);
      setEditingId(null);
      setFormData({ name: '', percentage: '', description: '' });
      fetchScholarships();
    } catch (error) {
      console.error('Error saving scholarship:', error);
      alert('Failed to save scholarship');
    }
  };

  const handleEdit = (scholarship: Scholarship) => {
    setEditingId(scholarship.id);
    setFormData({
      name: scholarship.name,
      percentage: scholarship.percentage.toString(),
      description: scholarship.description || ''
    });
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this scholarship?')) return;
    try {
      await api.delete(`/scholarships/${id}`);
      fetchScholarships();
    } catch (error) {
      console.error('Error deleting scholarship:', error);
      alert('Failed to delete scholarship');
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold text-slate-800">Scholarship Programs</h2>
        <div className="flex space-x-3">
          <button
            onClick={() => setShowImportModal(true)}
            className="bg-green-600 text-white px-4 py-2 rounded-lg flex items-center space-x-2 hover:bg-green-700 transition-colors"
          >
            <Upload size={20} />
            <span>Import Scholarships</span>
          </button>
          <button
            onClick={() => {
              setEditingId(null);
              setFormData({ name: '', percentage: '', description: '' });
              setShowModal(true);
            }}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center space-x-2 hover:bg-blue-700 transition-colors"
          >
            <Plus size={20} />
            <span>Add Scholarship</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {scholarships.map((scholarship) => (
          <div key={scholarship.id} className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
            <div className="flex justify-between items-start mb-4">
              <div className="p-3 bg-purple-100 text-purple-600 rounded-lg">
                <GraduationCap size={24} />
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={() => handleEdit(scholarship)}
                  className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                >
                  <Edit2 size={16} />
                </button>
                <button
                  onClick={() => handleDelete(scholarship.id)}
                  className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>

            <h3 className="text-lg font-bold text-slate-800 mb-1">{scholarship.name}</h3>
            <div className="flex items-baseline mb-4">
              <span className="text-2xl font-bold text-purple-600">{scholarship.percentage}%</span>
              <span className="text-sm text-slate-500 ml-2">Discount</span>
            </div>

            <p className="text-sm text-slate-500 mb-4 min-h-[40px]">
              {scholarship.description || 'No description provided'}
            </p>

            <div className="pt-4 border-t border-slate-100 flex justify-between items-center text-sm">
              <span className="text-slate-500">Beneficiaries</span>
              <span className="font-medium text-slate-800">{scholarship._count?.students || 0} Students</span>
            </div>
          </div>
        ))}

        {scholarships.length === 0 && !loading && (
          <div className="col-span-full text-center py-12 bg-white rounded-xl border border-dashed border-slate-300">
            <div className="mx-auto w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mb-4">
              <GraduationCap className="text-slate-400" size={24} />
            </div>
            <h3 className="text-lg font-medium text-slate-900">No scholarships found</h3>
            <p className="text-slate-500 mt-1">Create a scholarship program to get started</p>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">
              {editingId ? 'Edit Scholarship' : 'New Scholarship'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Program Name</label>
                <input
                  type="text"
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. Presidential Scholarship"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Discount Percentage (%)</label>
                <input
                  type="number"
                  required
                  min="0"
                  max="100"
                  step="0.01"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="0-100"
                  value={formData.percentage}
                  onChange={(e) => setFormData({ ...formData, percentage: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                <textarea
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={3}
                  placeholder="Optional description..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                />
              </div>
              <div className="flex justify-end space-x-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  {editingId ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <BulkImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        entityName="Scholarships"
        apiEndpoint="/api/v1/scholarships/bulk"
        templateFields={['name', 'percentage', 'description']}
        onSuccess={fetchScholarships}
        instructions={[
          'Upload a CSV file with scholarship details.',
          'Required columns: name, percentage.',
          'Optional column: description.',
          'Percentage should be a number between 0 and 100.',
        ]}
      />
    </div>
  );
};

export default Scholarships;
