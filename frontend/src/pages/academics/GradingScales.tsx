import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, X } from 'lucide-react';
import { reportCardService, GradingScale } from '../../services/reportCardService';

const GradingScales: React.FC = () => {
  const [scales, setScales] = useState<GradingScale[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openDialog, setOpenDialog] = useState(false);
  const [editingScale, setEditingScale] = useState<GradingScale | null>(null);
  const [formData, setFormData] = useState({
    grade: '',
    minScore: '',
    maxScore: '',
    gpaPoint: '',
    remark: ''
  });

  useEffect(() => {
    fetchScales();
  }, []);

  const fetchScales = async () => {
    try {
      setLoading(true);
      const data = await reportCardService.getGradingScales();
      setScales(data.sort((a, b) => b.minScore - a.minScore));
    } catch (err) {
      setError('Failed to fetch grading scales');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (scale?: GradingScale) => {
    if (scale) {
      setEditingScale(scale);
      setFormData({
        grade: scale.grade,
        minScore: scale.minScore.toString(),
        maxScore: scale.maxScore.toString(),
        gpaPoint: scale.gpaPoint.toString(),
        remark: scale.remark || ''
      });
    } else {
      setEditingScale(null);
      setFormData({
        grade: '',
        minScore: '',
        maxScore: '',
        gpaPoint: '',
        remark: ''
      });
    }
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setEditingScale(null);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const data = {
        grade: formData.grade,
        minScore: parseFloat(formData.minScore),
        maxScore: parseFloat(formData.maxScore),
        gpaPoint: parseFloat(formData.gpaPoint),
        remark: formData.remark
      };

      if (editingScale) {
        await reportCardService.updateGradingScale(editingScale.id, data);
      } else {
        await reportCardService.createGradingScale(data);
      }

      handleCloseDialog();
      fetchScales();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to save grading scale');
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this grading scale?')) {
      try {
        await reportCardService.deleteGradingScale(id);
        fetchScales();
      } catch (err) {
        setError('Failed to delete grading scale');
      }
    }
  };

  if (loading) return <div className="p-4 text-center dark:text-gray-400">Loading...</div>;

  return (
    <div className="p-4 md:p-6 pb-24 md:pb-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-white">Grading Scales</h2>
        <button
          onClick={() => handleOpenDialog()}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus size={20} />
          Add Grade
        </button>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-lg border border-red-200 dark:border-red-800 flex justify-between items-center">
          <span>{error}</span>
          <button onClick={() => setError(null)}><X size={18} /></button>
        </div>
      )}

      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50 dark:bg-slate-700 border-b border-gray-200 dark:border-slate-600">
              <tr>
                <th className="px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Grade</th>
                <th className="px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Range</th>
                <th className="px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">GPA Point</th>
                <th className="px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Remark</th>
                <th className="px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
              {scales.map((scale) => (
                <tr key={scale.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/50">
                  <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">{scale.grade}</td>
                  <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">{scale.minScore} - {scale.maxScore}</td>
                  <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">{scale.gpaPoint}</td>
                  <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">{scale.remark}</td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      <button 
                        onClick={() => handleOpenDialog(scale)}
                        className="p-1 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded"
                      >
                        <Edit2 size={18} />
                      </button>
                      <button 
                        onClick={() => handleDelete(scale.id)}
                        className="p-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {scales.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">
                    No grading scales defined
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {openDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-md mx-4">
            <div className="flex justify-between items-center p-6 border-b border-gray-100 dark:border-slate-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                {editingScale ? 'Edit Grade' : 'Add Grade'}
              </h3>
              <button onClick={handleCloseDialog} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Grade Label</label>
                <input
                  type="text"
                  value={formData.grade}
                  onChange={(e) => setFormData({ ...formData, grade: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-slate-700 dark:text-white"
                  placeholder="e.g., A, B+"
                  required
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Min Score</label>
                  <input
                    type="number"
                    value={formData.minScore}
                    onChange={(e) => setFormData({ ...formData, minScore: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-slate-700 dark:text-white"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Max Score</label>
                  <input
                    type="number"
                    value={formData.maxScore}
                    onChange={(e) => setFormData({ ...formData, maxScore: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-slate-700 dark:text-white"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">GPA Point</label>
                <input
                  type="number"
                  step="0.1"
                  value={formData.gpaPoint}
                  onChange={(e) => setFormData({ ...formData, gpaPoint: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-slate-700 dark:text-white"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Remark</label>
                <textarea
                  value={formData.remark}
                  onChange={(e) => setFormData({ ...formData, remark: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-slate-700 dark:text-white"
                  rows={2}
                />
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={handleCloseDialog}
                  className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-slate-700 rounded-lg hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default GradingScales;
