import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, GraduationCap, Upload } from 'lucide-react';
import api from '../../utils/api';
import BulkImportModal from '../../components/BulkImportModal';
import { useAppDialog } from '../../components/ui/AppDialogProvider';

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
  const { confirm } = useAppDialog();
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
    if (!(await confirm({
      title: 'Delete scholarship?',
      message: 'Are you sure you want to delete this scholarship?',
      confirmText: 'Delete scholarship',
    }))) return;
    try {
      await api.delete(`/scholarships/${id}`);
      fetchScholarships();
    } catch (error) {
      console.error('Error deleting scholarship:', error);
      alert('Failed to delete scholarship');
    }
  };

  return (
    <div className="ds-page">
      <div className="ds-page-header">
        <h2 className="ds-page-title">Scholarship Programs</h2>
        <div className="ds-actions">
          <button
            onClick={() => setShowImportModal(true)}
            className="ds-button-outline"
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
            className="ds-button-primary"
          >
            <Plus size={20} />
            <span>Add Scholarship</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {scholarships.map((scholarship) => (
          <div key={scholarship.id} className="ds-card">
            <div className="flex justify-between items-start mb-4">
              <div className="p-3 text-[var(--text-secondary)]">
                <GraduationCap size={24} />
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={() => handleEdit(scholarship)}
                  className="ds-button-ghost"
                  aria-label={`Edit ${scholarship.name}`}
                >
                  <Edit2 size={16} />
                </button>
                <button
                  onClick={() => handleDelete(scholarship.id)}
                  className="ds-button-destructive"
                  aria-label={`Delete ${scholarship.name}`}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>

            <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-1">{scholarship.name}</h3>
            <div className="flex items-baseline mb-4">
              <span className="text-2xl font-bold text-purple-600 dark:text-purple-400">{scholarship.percentage}%</span>
              <span className="text-sm text-slate-500 dark:text-gray-400 ml-2">Discount</span>
            </div>

            <p className="text-sm text-slate-500 dark:text-gray-400 mb-4 min-h-[40px]">
              {scholarship.description || 'No description provided'}
            </p>

            <div className="pt-4 border-t border-slate-100 dark:border-slate-700 flex justify-between items-center text-sm">
              <span className="text-slate-500 dark:text-gray-400">Beneficiaries</span>
              <span className="font-medium text-slate-800 dark:text-white">{scholarship._count?.students || 0} Students</span>
            </div>
          </div>
        ))}

        {scholarships.length === 0 && !loading && (
          <div className="ds-surface ds-empty col-span-full">
            <div className="mx-auto w-12 h-12 flex items-center justify-center mb-4">
              <GraduationCap className="text-slate-400" size={24} />
            </div>
            <h3 className="text-lg font-medium text-slate-900 dark:text-white">No scholarships found</h3>
            <p className="text-slate-500 dark:text-gray-400 mt-1">Create a scholarship program to get started</p>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] p-4">
          <div className="ds-card w-full max-w-md max-h-[90vh] overflow-y-auto" role="dialog" aria-labelledby="scholarship-dialog-title">
            <h2 id="scholarship-dialog-title" className="text-xl font-bold mb-4 text-[var(--text-primary)]">
              {editingId ? 'Edit Scholarship' : 'New Scholarship'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="scholarship-name" className="ds-label mb-1">Program Name</label>
                <input
                  id="scholarship-name"
                  type="text"
                  required
                  className="ds-input"
                  placeholder="e.g. Presidential Scholarship"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div>
                <label htmlFor="scholarship-percentage" className="ds-label mb-1">Discount Percentage (%)</label>
                <input
                  id="scholarship-percentage"
                  type="number"
                  required
                  min="0"
                  max="100"
                  step="0.01"
                  className="ds-input"
                  placeholder="0-100"
                  value={formData.percentage}
                  onChange={(e) => setFormData({ ...formData, percentage: e.target.value })}
                />
              </div>
              <div>
                <label htmlFor="scholarship-description" className="ds-label mb-1">Description</label>
                <textarea
                  id="scholarship-description"
                  className="ds-textarea"
                  rows={3}
                  placeholder="Optional description..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                />
              </div>
              <div className="ds-form-actions">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="ds-button-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="ds-button-primary"
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
