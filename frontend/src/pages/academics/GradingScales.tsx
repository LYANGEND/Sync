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

  if (loading) return <div className="p-4 text-center">Loading...</div>;

  return (
    <div className="p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4 sm:mb-6">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-800">Grading Scales</h2>
        <button
          onClick={() => handleOpenDialog()}
          className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-3 sm:py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors active:scale-98"
        >
          <Plus size={20} />
          Add Grade
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 sm:p-4 bg-red-50 text-red-700 rounded-lg border border-red-200 flex justify-between items-start gap-2">
          <span className="text-sm sm:text-base flex-1">{error}</span>
          <button onClick={() => setError(null)} className="flex-shrink-0"><X size={18} /></button>
        </div>
      )}

      {/* Mobile Card View */}
      <div className="sm:hidden space-y-3">
        {scales.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-500">
            No grading scales defined
          </div>
        ) : (
          scales.map((scale) => (
            <div key={scale.id} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex justify-between items-start mb-3">
                <div className="flex items-center gap-3">
                  <span className="text-2xl font-bold text-blue-600">{scale.grade}</span>
                  <div>
                    <div className="text-sm font-medium text-gray-900">{scale.minScore} - {scale.maxScore}%</div>
                    <div className="text-xs text-gray-500">GPA: {scale.gpaPoint}</div>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button 
                    onClick={() => handleOpenDialog(scale)}
                    className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
                  >
                    <Edit2 size={18} />
                  </button>
                  <button 
                    onClick={() => handleDelete(scale.id)}
                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
              {scale.remark && (
                <p className="text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2">{scale.remark}</p>
              )}
            </div>
          ))
        )}
      </div>

      {/* Desktop Table View */}
      <div className="hidden sm:block bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 sm:px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Grade</th>
              <th className="px-4 sm:px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Range</th>
              <th className="px-4 sm:px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">GPA</th>
              <th className="px-4 sm:px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Remark</th>
              <th className="px-4 sm:px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {scales.map((scale) => (
              <tr key={scale.id} className="hover:bg-gray-50">
                <td className="px-4 sm:px-6 py-4 text-sm font-medium text-gray-900">{scale.grade}</td>
                <td className="px-4 sm:px-6 py-4 text-sm text-gray-600">{scale.minScore} - {scale.maxScore}</td>
                <td className="px-4 sm:px-6 py-4 text-sm text-gray-600">{scale.gpaPoint}</td>
                <td className="px-4 sm:px-6 py-4 text-sm text-gray-600">{scale.remark}</td>
                <td className="px-4 sm:px-6 py-4 text-right">
                  <div className="flex justify-end gap-2">
                    <button 
                      onClick={() => handleOpenDialog(scale)}
                      className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"
                    >
                      <Edit2 size={18} />
                    </button>
                    <button 
                      onClick={() => handleDelete(scale.id)}
                      className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {scales.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                  No grading scales defined
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal - Mobile Optimized */}
      {openDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-xl shadow-xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center p-5 sm:p-6 border-b border-gray-100 sticky top-0 bg-white">
              <h3 className="text-lg font-semibold text-gray-900">
                {editingScale ? 'Edit Grade' : 'Add Grade'}
              </h3>
              <button onClick={handleCloseDialog} className="text-gray-400 hover:text-gray-600 p-1">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Grade Label</label>
                <input
                  type="text"
                  value={formData.grade}
                  onChange={(e) => setFormData({ ...formData, grade: e.target.value })}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-base"
                  placeholder="e.g., A, B+"
                  required
                />
              </div>
              
              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Min Score</label>
                  <input
                    type="number"
                    value={formData.minScore}
                    onChange={(e) => setFormData({ ...formData, minScore: e.target.value })}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-base"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Max Score</label>
                  <input
                    type="number"
                    value={formData.maxScore}
                    onChange={(e) => setFormData({ ...formData, maxScore: e.target.value })}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-base"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">GPA Point</label>
                <input
                  type="number"
                  step="0.1"
                  value={formData.gpaPoint}
                  onChange={(e) => setFormData({ ...formData, gpaPoint: e.target.value })}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-base"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Remark</label>
                <textarea
                  value={formData.remark}
                  onChange={(e) => setFormData({ ...formData, remark: e.target.value })}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-base"
                  rows={2}
                />
              </div>

              <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 mt-6 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={handleCloseDialog}
                  className="w-full sm:w-auto px-4 py-3 sm:py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="w-full sm:w-auto px-4 py-3 sm:py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors active:scale-98"
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
