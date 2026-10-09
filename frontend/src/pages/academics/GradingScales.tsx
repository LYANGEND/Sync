import { useAppDialog } from '../../components/ui/AppDialogProvider';
import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, X } from 'lucide-react';
import { reportCardService, GradingScale } from '../../services/reportCardService';
import { useDialogAccessibility } from '../../hooks/useDialogAccessibility';

const GradingScales: React.FC = () => {
    const { confirm } = useAppDialog();
  const [scales, setScales] = useState<GradingScale[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openDialog, setOpenDialog] = useState(false);
  const [editingScale, setEditingScale] = useState<GradingScale | null>(null);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    grade: '',
    minScore: '',
    maxScore: '',
    remark: ''
  });
  const gradingDialogRef = useDialogAccessibility(openDialog, () => handleCloseDialog());

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
    setError(null);
    if (scale) {
      setEditingScale(scale);
      setFormData({
        grade: scale.grade,
        minScore: scale.minScore.toString(),
        maxScore: scale.maxScore.toString(),
        remark: scale.remark || ''
      });
    } else {
      setEditingScale(null);
      setFormData({
        grade: '',
        minScore: '',
        maxScore: '',
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
    const minScore = Number(formData.minScore);
    const maxScore = Number(formData.maxScore);

    if (!Number.isInteger(minScore) || !Number.isInteger(maxScore) || minScore < 0 || maxScore > 100) {
      setError('Scores must be whole numbers between 0 and 100');
      return;
    }
    if (minScore > maxScore) {
      setError('Maximum score must be greater than or equal to minimum score');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      const data = {
        grade: formData.grade.trim(),
        minScore,
        maxScore,
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
      const apiError = err.response?.data?.error || err.response?.data?.message;
      setError(typeof apiError === 'string' ? apiError : 'Failed to save grading scale');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (await confirm({
      title: 'Delete grading scale?',
      message: 'Are you sure you want to delete this grading scale?',
      confirmText: 'Delete scale',
    })) {
      try {
        await reportCardService.deleteGradingScale(id);
        fetchScales();
      } catch (err) {
        setError('Failed to delete grading scale');
      }
    }
  };

  if (loading) return <div className="p-6 text-center text-gray-500 dark:text-gray-400" role="status">Loading grading scales…</div>;

  return (
    <div className="p-4 md:p-6 pb-24 md:pb-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-white">Grading Scales</h2>
        <button
          onClick={() => handleOpenDialog()}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors"
        >
          <Plus size={20} />
          Add Grade
        </button>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-lg border border-red-200 dark:border-red-800 flex justify-between items-center">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="grid size-11 place-items-center rounded-lg hover:bg-red-100 dark:hover:bg-red-900/50" aria-label="Dismiss error"><X size={18} aria-hidden="true" /></button>
        </div>
      )}

      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <caption className="sr-only">Configured score ranges and their grade labels</caption>
            <thead className="bg-gray-50 dark:bg-slate-700 border-b border-gray-200 dark:border-slate-600">
              <tr>
                <th scope="col" className="px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Grade</th>
                <th scope="col" className="px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Range</th>
                <th scope="col" className="px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Remark</th>
                <th scope="col" className="px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
              {scales.map((scale) => (
                <tr key={scale.id} className="hover:bg-surface-hover">
                  <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">{scale.grade}</td>
                  <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">{scale.minScore} - {scale.maxScore}</td>
                  <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">{scale.remark}</td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      <button 
                        onClick={() => handleOpenDialog(scale)}
                        className="grid size-11 place-items-center rounded-lg text-blue-600 hover:bg-surface-hover-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                        aria-label={`Edit ${scale.grade} grading scale`}
                      >
                        <Edit2 size={18} />
                      </button>
                      <button 
                        onClick={() => handleDelete(scale.id)}
                        className="grid size-11 place-items-center rounded-lg text-red-600 hover:bg-surface-hover-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
                        aria-label={`Delete ${scale.grade} grading scale`}
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {scales.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) handleCloseDialog(); }}>
          <div ref={gradingDialogRef} className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-md" role="dialog" aria-modal="true" aria-labelledby="grading-scale-dialog-title">
            <div className="flex justify-between items-center p-6 border-b border-gray-100 dark:border-slate-700">
              <h3 id="grading-scale-dialog-title" className="text-lg font-semibold text-gray-900 dark:text-white">
                {editingScale ? 'Edit Grade' : 'Add Grade'}
              </h3>
              <button onClick={handleCloseDialog} className="grid size-11 place-items-center rounded-lg text-gray-400 hover:bg-surface-hover hover:text-gray-600 dark:hover:text-gray-200" aria-label="Close grading scale dialog">
                <X size={20} aria-hidden="true" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300" role="alert">{error}</div>
              )}
              <div>
                <label htmlFor="grading-scale-label" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Grade Label</label>
                <input
                  id="grading-scale-label"
                  data-dialog-autofocus="true"
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
                  <label htmlFor="grading-scale-min" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Min Score</label>
                  <input
                    id="grading-scale-min"
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    value={formData.minScore}
                    onChange={(e) => setFormData({ ...formData, minScore: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-slate-700 dark:text-white"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="grading-scale-max" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Max Score</label>
                  <input
                    id="grading-scale-max"
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    value={formData.maxScore}
                    onChange={(e) => setFormData({ ...formData, maxScore: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white dark:bg-slate-700 dark:text-white"
                    required
                  />
                </div>
              </div>

              <div>
                <label htmlFor="grading-scale-remark" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Remark</label>
                <textarea
                  id="grading-scale-remark"
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
                  className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-slate-700 rounded-lg hover:bg-surface-hover-strong transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-white bg-primary rounded-lg hover:bg-primary-hover transition-colors"
                >
                  {saving ? 'Saving…' : 'Save'}
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
