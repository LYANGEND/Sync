import React, { useState, useEffect } from 'react';
import { useAppDialog } from '../../components/ui/AppDialogProvider';
import { AcademicFilterButton, AcademicFilterDialog } from '../../components/academics/AcademicFilterDialog';
import api from '../../utils/api';
import { CheckCircle, XCircle, AlertTriangle, Save } from 'lucide-react';

interface Class {
  id: string;
  name: string;
  gradeLevel?: number;
}

interface AcademicTerm {
  id: string;
  name: string;
  isActive: boolean;
}

interface PromotionCandidate {
  studentId: string;
  studentName: string;
  admissionNumber: string;
  averageScore: number;
  recommendedAction: 'PROMOTE' | 'RETAIN' | 'REVIEW';
  reason: string;
}

interface PromotionDecision {
  studentId: string;
  action?: 'PROMOTE' | 'RETAIN';
  nextClassId?: string;
  reason?: string;
}

const Promotions = () => {
    const { confirm } = useAppDialog();
  const [classes, setClasses] = useState<Class[]>([]);
  const [terms, setTerms] = useState<AcademicTerm[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [selectedTermId, setSelectedTermId] = useState<string>('');
  const [showFilters, setShowFilters] = useState(false);
  const [draftClassId, setDraftClassId] = useState<string>('');
  const [draftTermId, setDraftTermId] = useState<string>('');
  const [candidates, setCandidates] = useState<PromotionCandidate[]>([]);
  const [decisions, setDecisions] = useState<Record<string, PromotionDecision>>({});
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [nextClassId, setNextClassId] = useState<string>('');
  const unresolvedDecisionCount = Object.values(decisions).filter(decision => !decision.action).length;
  const hasPromotions = Object.values(decisions).some(decision => decision.action === 'PROMOTE');
  const selectedClass = classes.find(c => c.id === selectedClassId);
  const eligibleNextClasses = classes.filter(c => {
    if (!selectedClass || c.id === selectedClassId) {
      return false;
    }

    if (selectedClass.gradeLevel === undefined || c.gradeLevel === undefined) {
      return true;
    }

    return c.gradeLevel === selectedClass.gradeLevel + 1;
  });
  const activeFilterCount = [selectedClassId, selectedTermId].filter(Boolean).length;

  useEffect(() => {
    fetchTerms();
  }, []);

  const fetchClasses = async (academicTermId: string) => {
    if (!academicTermId) {
      setClasses([]);
      return;
    }
    try {
      const response = await api.get('/classes', { params: { academicTermId } });
      setClasses(response.data);
    } catch (error) {
      console.error('Failed to fetch classes', error);
    }
  };

  const fetchTerms = async () => {
    try {
      const response = await api.get('/academic-terms');
      setTerms(response.data);
      // Auto-select current term
      const currentTerm = response.data.find((t: AcademicTerm) => t.isActive) || response.data[0];
      if (currentTerm) {
        setSelectedTermId(currentTerm.id);
        setDraftTermId(currentTerm.id);
        await fetchClasses(currentTerm.id);
      }
    } catch (error) {
      console.error('Failed to fetch terms', error);
    }
  };

  const fetchCandidates = async (classId = selectedClassId, termId = selectedTermId) => {
    if (!classId || !termId) return;

    setLoading(true);
    try {
      const response = await api.get('/promotions/candidates', {
        params: {
          classId,
          termId
        }
      });
      setCandidates(response.data);
      
      // Initialize decisions based on recommendations
      const initialDecisions: Record<string, PromotionDecision> = {};
      response.data.forEach((c: PromotionCandidate) => {
        initialDecisions[c.studentId] = {
          studentId: c.studentId,
          action: c.recommendedAction === 'REVIEW' ? undefined : c.recommendedAction,
          reason: c.reason
        };
      });
      setDecisions(initialDecisions);
    } catch (error) {
      console.error('Failed to fetch candidates', error);
      alert('Failed to fetch promotion candidates');
    } finally {
      setLoading(false);
    }
  };

  const openFilters = () => {
    setDraftClassId(selectedClassId);
    setDraftTermId(selectedTermId);
    setShowFilters(true);
  };

  const resetDraftFilters = () => {
    setDraftClassId('');
    setDraftTermId(terms.find(term => term.isActive)?.id || '');
  };

  const applyFilters = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draftClassId || !draftTermId) return;

    setSelectedClassId(draftClassId);
    setSelectedTermId(draftTermId);
    setCandidates([]);
    setDecisions({});
    setNextClassId('');
    await fetchCandidates(draftClassId, draftTermId);
    setShowFilters(false);
  };

  const handleDecisionChange = (studentId: string, action: 'PROMOTE' | 'RETAIN') => {
    setDecisions(prev => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        action
      }
    }));
  };

  const handleProcessPromotions = async () => {
    if (unresolvedDecisionCount > 0) {
      alert(`Choose Promote or Retain for ${unresolvedDecisionCount} student${unresolvedDecisionCount === 1 ? '' : 's'} marked for review`);
      return;
    }

    if (hasPromotions && !nextClassId) {
      alert('Please select the next class for promoted students');
      return;
    }

    if (!(await confirm({
      title: 'Process promotions?',
      message: 'Are you sure you want to process these promotions? This action will update student records.',
      confirmText: 'Process promotions',
    }))) {
      return;
    }

    setProcessing(true);
    try {
      const promotionsList = Object.values(decisions).map(d => ({
        studentId: d.studentId,
        targetClassId: d.action === 'PROMOTE' ? nextClassId : selectedClassId,
        reason: d.reason || (d.action === 'PROMOTE' ? 'Promoted' : 'Retained')
      }));

      await api.post('/promotions/process', {
        promotions: promotionsList,
        academicTermId: selectedTermId,
      });

      alert('Promotions processed successfully');
      setCandidates([]);
      setDecisions({});
      setSelectedClassId('');
    } catch (error) {
      console.error('Failed to process promotions', error);
      alert('Failed to process promotions');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="p-4 md:p-6 pb-24 md:pb-6 space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-800 dark:text-white">Promotion Candidates</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Select a class and term to review promotion recommendations.</p>
        </div>
        <AcademicFilterButton onClick={openFilters} activeCount={activeFilterCount} />
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-100 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <span className="text-xs font-bold uppercase tracking-wide text-gray-400 dark:text-gray-500">Current selection</span>
        <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">
          {classes.find(classOption => classOption.id === selectedClassId)?.name || 'No class selected'}
        </span>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-200">
          {terms.find(term => term.id === selectedTermId)?.name || 'No term selected'}
        </span>
        {loading && <span className="ml-auto text-sm font-medium text-blue-600 dark:text-blue-300">Loading candidates…</span>}
      </div>

      <AcademicFilterDialog
        open={showFilters}
        title="Filter promotion candidates"
        description="Choose the class completing a term. Applying filters loads its promotion recommendations."
        onClose={() => setShowFilters(false)}
        onApply={applyFilters}
        onReset={resetDraftFilters}
        applying={loading}
        applyDisabled={!draftClassId || !draftTermId}
      >
        <div>
          <label htmlFor="promotion-class-filter" className="mb-1.5 block text-sm font-bold text-slate-800 dark:text-slate-200">Current class</label>
          <select
            id="promotion-class-filter"
            data-filter-autofocus="true"
            value={draftClassId}
            onChange={(event) => setDraftClassId(event.target.value)}
            className="h-12 w-full cursor-pointer rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-slate-900 outline-none focus:border-[#1E40AF] focus:ring-2 focus:ring-blue-100 dark:border-slate-600 dark:bg-slate-900 dark:text-white dark:focus:border-blue-400 dark:focus:ring-blue-950"
          >
            <option value="">Select class</option>
            {classes.map(classOption => <option key={classOption.id} value={classOption.id}>{classOption.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="promotion-term-filter" className="mb-1.5 block text-sm font-bold text-slate-800 dark:text-slate-200">Academic term</label>
          <select
            id="promotion-term-filter"
            value={draftTermId}
            onChange={(event) => {
              const termId = event.target.value;
              setDraftTermId(termId);
              setDraftClassId('');
              void fetchClasses(termId);
            }}
            className="h-12 w-full cursor-pointer rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-slate-900 outline-none focus:border-[#1E40AF] focus:ring-2 focus:ring-blue-100 dark:border-slate-600 dark:bg-slate-900 dark:text-white dark:focus:border-blue-400 dark:focus:ring-blue-950"
          >
            <option value="">Select term</option>
            {terms.map(term => <option key={term.id} value={term.id}>{term.name}</option>)}
          </select>
        </div>
      </AcademicFilterDialog>

      {candidates.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 overflow-hidden">
            <div className="flex flex-col gap-4 border-b border-gray-100 p-6 dark:border-slate-700 lg:flex-row lg:items-center lg:justify-between">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white">Promotion Candidates</h3>
            <div className="flex items-center gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mr-2">Promote To:</label>
                <select
                  value={nextClassId}
                  onChange={(e) => setNextClassId(e.target.value)}
                  className="px-3 py-1.5 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 dark:text-white"
                >
                  <option value="">Select Next Class</option>
                  {eligibleNextClasses.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <button
                onClick={handleProcessPromotions}
                disabled={processing || unresolvedDecisionCount > 0 || (hasPromotions && !nextClassId)}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-green-300"
              >
                <Save size={18} />
                {processing ? 'Processing...' : 'Save Changes'}
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-gray-50 dark:bg-slate-700 border-b border-gray-100 dark:border-slate-600">
                <tr>
                  <th className="px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Student</th>
                  <th className="px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Average Score</th>
                  <th className="px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Recommendation</th>
                  <th className="px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                {candidates.map((candidate) => (
                  <tr key={candidate.studentId} className="hover:bg-surface-hover">
                    <td className="px-6 py-4">
                      <div className="font-medium text-gray-900 dark:text-white">{candidate.studentName}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">{candidate.admissionNumber}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`font-medium ${candidate.averageScore >= 50 ? 'text-green-600' : 'text-red-600'}`}>
                        {candidate.averageScore.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        {candidate.recommendedAction === 'PROMOTE' ? (
                          <span className="flex items-center gap-1 text-green-600 text-sm font-medium bg-green-50 px-2 py-1 rounded">
                            <CheckCircle size={14} /> Promote
                          </span>
                        ) : candidate.recommendedAction === 'REVIEW' ? (
                          <span className="flex items-center gap-1 rounded bg-amber-50 px-2 py-1 text-sm font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                            <AlertTriangle size={14} /> Review
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-red-600 text-sm font-medium bg-red-50 px-2 py-1 rounded">
                            <XCircle size={14} /> Retain
                          </span>
                        )}
                        <span className="text-xs text-gray-400">({candidate.reason})</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleDecisionChange(candidate.studentId, 'PROMOTE')}
                          aria-pressed={decisions[candidate.studentId]?.action === 'PROMOTE'}
                          className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                            decisions[candidate.studentId]?.action === 'PROMOTE'
                              ? 'bg-green-600 text-white'
                              : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300 hover:bg-surface-hover-strong'
                          }`}
                        >
                          Promote
                        </button>
                        <button
                          onClick={() => handleDecisionChange(candidate.studentId, 'RETAIN')}
                          aria-pressed={decisions[candidate.studentId]?.action === 'RETAIN'}
                          className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                            decisions[candidate.studentId]?.action === 'RETAIN'
                              ? 'bg-red-600 text-white'
                              : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300 hover:bg-surface-hover-strong'
                          }`}
                        >
                          Retain
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default Promotions;
