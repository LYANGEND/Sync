import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../utils/api';
import { useAppDialog } from '../../components/ui/AppDialogProvider';
import { CalendarDays, Edit2, Plus, Trash2 } from 'lucide-react';
import { AcademicFilterButton, AcademicFilterDialog } from '../../components/academics/AcademicFilterDialog';
import { dateInputToIso, formatDateInputValue } from '../../utils/dateInput';
import { useDialogAccessibility } from '../../hooks/useDialogAccessibility';
import InstructionalCalendarDialog from '../../components/academics/InstructionalCalendarDialog';

interface AcademicTerm {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  status?: 'DRAFT' | 'ACTIVE' | 'CLOSING' | 'CLOSED';
}

const Terms = () => {
  const { confirm } = useAppDialog();
  const [terms, setTerms] = useState<AcademicTerm[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [draftSearchTerm, setDraftSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingTerm, setEditingTerm] = useState<AcademicTerm | null>(null);
  const [calendarTerm, setCalendarTerm] = useState<AcademicTerm | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    startDate: '',
    endDate: '',
  });

  useEffect(() => {
    fetchTerms();
  }, []);

  const fetchTerms = async () => {
    try {
      setError(null);
      const response = await api.get('/academic-terms');
      setTerms(response.data);
    } catch (error) {
      console.error('Failed to fetch terms', error);
      setError('Academic terms could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.startDate >= formData.endDate) {
      setError('End date must be after start date.');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      // Format dates to ISO string for backend
      const payload = {
        ...formData,
        startDate: dateInputToIso(formData.startDate),
        endDate: dateInputToIso(formData.endDate),
      };

      if (editingTerm) {
        await api.put(`/academic-terms/${editingTerm.id}`, payload);
      } else {
        await api.post('/academic-terms', payload);
      }
      await fetchTerms();
      setShowModal(false);
      resetForm();
    } catch (error: any) {
      console.error('Failed to save term', error);
      const apiError = error.response?.data?.error;
      setError(typeof apiError === 'string' ? apiError : 'Failed to save academic term.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (await confirm({
      title: 'Delete academic term?',
      message: 'Are you sure you want to delete this term?',
      confirmText: 'Delete term',
    })) {
      try {
        await api.delete(`/academic-terms/${id}`);
        await fetchTerms();
      } catch (error: any) {
        console.error('Failed to delete term', error);
        const apiError = error.response?.data?.error;
        setError(typeof apiError === 'string' ? apiError : 'Failed to delete academic term.');
      }
    }
  };

  const resetForm = () => {
    setFormData({ name: '', startDate: '', endDate: '' });
    setEditingTerm(null);
  };

  const closeTermDialog = () => {
    if (saving) return;
    setShowModal(false);
    resetForm();
  };
  const termDialogRef = useDialogAccessibility(showModal, closeTermDialog);

  const openEditModal = (term: AcademicTerm) => {
    setError(null);
    setEditingTerm(term);
    setFormData({
      name: term.name,
      startDate: formatDateInputValue(term.startDate),
      endDate: formatDateInputValue(term.endDate),
    });
    setShowModal(true);
  };

  const openAddModal = () => {
    setError(null);
    resetForm();
    setShowModal(true);
  };

  const filteredTerms = terms.filter(term => 
    term.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const openFilters = () => {
    setDraftSearchTerm(searchTerm);
    setShowFilters(true);
  };

  const applyFilters = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSearchTerm(draftSearchTerm.trim());
    setShowFilters(false);
  };

  return (
    <div className="p-4 md:p-6 pb-24 md:pb-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-white">Academic Terms</h2>
        <div className="flex items-center gap-2">
          <AcademicFilterButton onClick={openFilters} activeCount={searchTerm ? 1 : 0} />
          <button
            onClick={openAddModal}
            className="flex items-center space-x-2 bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary-hover transition-colors"
          >
            <Plus size={20} />
            <span>Add Term</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300" role="alert">
          <span className="flex-1">{error}</span>
          <button type="button" onClick={() => setError(null)} className="grid size-10 place-items-center rounded-lg hover:bg-red-100 dark:hover:bg-red-900/50" aria-label="Dismiss error">×</button>
        </div>
      )}

      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 overflow-hidden">
        {searchTerm && (
          <div className="border-b border-gray-100 p-4 dark:border-slate-700">
            <span className="inline-flex max-w-full truncate rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">Search: {searchTerm}</span>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-gray-600 dark:text-gray-300">
            <caption className="sr-only">Academic terms, dates, active status, and available actions</caption>
            <thead className="bg-gray-50 dark:bg-slate-700 text-gray-700 dark:text-gray-200 font-medium">
              <tr>
                <th scope="col" className="px-6 py-3">Name</th>
                <th scope="col" className="px-6 py-3">Start Date</th>
                <th scope="col" className="px-6 py-3">End Date</th>
                <th scope="col" className="px-6 py-3">Status</th>
                <th scope="col" className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">Loading terms...</td>
                </tr>
              ) : filteredTerms.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">No terms found</td>
                </tr>
              ) : (
                filteredTerms.map((term) => (
                  <tr key={term.id} className="hover:bg-surface-hover transition-colors">
                    <td className="px-6 py-4 font-medium text-gray-900 dark:text-white">{term.name}</td>
                    <td className="px-6 py-4 text-gray-500 dark:text-gray-400">
                      {new Date(term.startDate).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-gray-500 dark:text-gray-400">
                      {new Date(term.endDate).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 text-xs rounded-full font-medium ${
                        term.status === 'ACTIVE' || term.isActive
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                          : term.status === 'CLOSING'
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200'
                            : term.status === 'CLOSED'
                              ? 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900'
                              : 'bg-gray-100 dark:bg-slate-600 text-gray-600 dark:text-gray-300'
                      }`}>
                        {term.status || (term.isActive ? 'ACTIVE' : 'DRAFT')}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end space-x-2">
                        <button
                          onClick={() => setCalendarTerm(term)}
                          className="grid size-11 place-items-center rounded-lg text-emerald-700 hover:bg-emerald-50 hover:text-emerald-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
                          aria-label={`Manage instructional calendar for ${term.name}`}
                        >
                          <CalendarDays size={18} />
                        </button>
                        <button 
                          onClick={() => openEditModal(term)}
                          disabled={term.status === 'CLOSED'}
                          className="grid size-11 place-items-center rounded-lg text-blue-600 hover:bg-surface-hover-accent hover:text-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                          aria-label={`Edit ${term.name}`}
                        >
                          <Edit2 size={18} />
                        </button>
                        <button 
                          onClick={() => handleDelete(term.id)}
                          disabled={Boolean(term.status && term.status !== 'DRAFT')}
                          className="grid size-11 place-items-center rounded-lg text-red-600 hover:bg-surface-hover-danger hover:text-red-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
                          aria-label={`Delete ${term.name}`}
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AcademicFilterDialog
        open={showFilters}
        title="Filter academic terms"
        description="Search the term list by name."
        onClose={() => setShowFilters(false)}
        onApply={applyFilters}
        onReset={() => setDraftSearchTerm('')}
      >
        <div>
          <label htmlFor="term-name-filter" className="mb-1.5 block text-sm font-bold text-slate-800 dark:text-slate-200">Search terms</label>
          <input
            id="term-name-filter"
            data-filter-autofocus="true"
            type="search"
            value={draftSearchTerm}
            onChange={(event) => setDraftSearchTerm(event.target.value)}
            placeholder="Term name"
            className="h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-[#1E40AF] focus:ring-2 focus:ring-blue-100 dark:border-slate-600 dark:bg-slate-900 dark:text-white dark:focus:border-blue-400 dark:focus:ring-blue-950"
          />
        </div>
      </AcademicFilterDialog>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeTermDialog(); }}>
          <div ref={termDialogRef} className="bg-white dark:bg-slate-800 rounded-xl p-6 w-full max-w-md" role="dialog" aria-modal="true" aria-labelledby="academic-term-dialog-title">
            <h2 id="academic-term-dialog-title" className="text-xl font-bold mb-4 dark:text-white">{editingTerm ? 'Edit Term' : 'Add Term'}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300" role="alert">{error}</div>
              )}
              <div>
                <label htmlFor="academic-term-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Term Name</label>
                <input
                  id="academic-term-name"
                  data-dialog-autofocus="true"
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-slate-700 dark:text-white"
                  placeholder="e.g. Term 1 2025"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="academic-term-start" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Start Date</label>
                  <input
                    id="academic-term-start"
                    type="date"
                    required
                    value={formData.startDate}
                    onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-slate-700 dark:text-white"
                  />
                </div>
                <div>
                  <label htmlFor="academic-term-end" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">End Date</label>
                  <input
                    id="academic-term-end"
                    type="date"
                    required
                    min={formData.startDate || undefined}
                    value={formData.endDate}
                    onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-slate-700 dark:text-white"
                  />
                </div>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                The active term is set in <Link to="/settings?tab=academic" className="font-semibold text-primary underline-offset-2 hover:underline">Settings</Link>.
              </p>

              <div className="flex justify-end space-x-3 mt-6">
                <button 
                  type="button"
                  onClick={closeTermDialog}
                  className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-surface-hover rounded-lg"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? 'Saving…' : editingTerm ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <InstructionalCalendarDialog term={calendarTerm} onClose={() => setCalendarTerm(null)} />
    </div>
  );
};

export default Terms;
