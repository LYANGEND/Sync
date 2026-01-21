import React, { useState, useEffect } from 'react';
import api from '../../utils/api';
import { ArrowRight, CheckCircle, XCircle, AlertTriangle, Save } from 'lucide-react';

interface Class {
  id: string;
  name: string;
}

interface AcademicTerm {
  id: string;
  name: string;
  isCurrent: boolean;
}

interface PromotionCandidate {
  studentId: string;
  studentName: string;
  admissionNumber: string;
  averageScore: number;
  recommendedAction: 'PROMOTE' | 'RETAIN';
  reason: string;
}

interface PromotionDecision {
  studentId: string;
  action: 'PROMOTE' | 'RETAIN';
  nextClassId?: string;
  reason?: string;
}

const Promotions = () => {
  const [classes, setClasses] = useState<Class[]>([]);
  const [terms, setTerms] = useState<AcademicTerm[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [selectedTermId, setSelectedTermId] = useState<string>('');
  const [candidates, setCandidates] = useState<PromotionCandidate[]>([]);
  const [decisions, setDecisions] = useState<Record<string, PromotionDecision>>({});
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [nextClassId, setNextClassId] = useState<string>('');

  useEffect(() => {
    fetchClasses();
    fetchTerms();
  }, []);

  const fetchClasses = async () => {
    try {
      const response = await api.get('/classes');
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
      const currentTerm = response.data.find((t: AcademicTerm) => t.isCurrent);
      if (currentTerm) {
        setSelectedTermId(currentTerm.id);
      }
    } catch (error) {
      console.error('Failed to fetch terms', error);
    }
  };

  const fetchCandidates = async () => {
    if (!selectedClassId || !selectedTermId) return;

    setLoading(true);
    try {
      const response = await api.get('/promotions/candidates', {
        params: {
          classId: selectedClassId,
          academicTermId: selectedTermId
        }
      });
      setCandidates(response.data);
      
      // Initialize decisions based on recommendations
      const initialDecisions: Record<string, PromotionDecision> = {};
      response.data.forEach((c: PromotionCandidate) => {
        initialDecisions[c.studentId] = {
          studentId: c.studentId,
          action: c.recommendedAction,
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
    if (!nextClassId) {
      alert('Please select the next class for promoted students');
      return;
    }

    if (!window.confirm('Are you sure you want to process these promotions? This action will update student records.')) {
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
        currentTermId: selectedTermId
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
      <div className="bg-white dark:bg-slate-800 p-4 md:p-6 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">Promotion Criteria Selection</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Current Class</label>
            <select
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-slate-700 dark:text-white"
            >
              <option value="">Select Class</option>
              {classes.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Academic Term</label>
            <select
              value={selectedTermId}
              onChange={(e) => setSelectedTermId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-slate-700 dark:text-white"
            >
              <option value="">Select Term</option>
              {terms.map(t => (
                <option key={t.id} value={t.id}>{t.name} {t.isCurrent ? '(Current)' : ''}</option>
              ))}
            </select>
          </div>
          <button
            onClick={fetchCandidates}
            disabled={!selectedClassId || !selectedTermId || loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-300"
          >
            {loading ? 'Loading...' : 'Fetch Candidates'}
          </button>
        </div>
      </div>

      {candidates.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 overflow-hidden">
          <div className="p-6 border-b border-gray-100 dark:border-slate-700 flex justify-between items-center">
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
                  {classes
                    .filter(c => c.id !== selectedClassId)
                    .map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                </select>
              </div>
              <button
                onClick={handleProcessPromotions}
                disabled={processing || !nextClassId}
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
                  <tr key={candidate.studentId} className="hover:bg-gray-50 dark:hover:bg-slate-700/50">
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
                          className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                            decisions[candidate.studentId]?.action === 'PROMOTE'
                              ? 'bg-green-600 text-white'
                              : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-600'
                          }`}
                        >
                          Promote
                        </button>
                        <button
                          onClick={() => handleDecisionChange(candidate.studentId, 'RETAIN')}
                          className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                            decisions[candidate.studentId]?.action === 'RETAIN'
                              ? 'bg-red-600 text-white'
                              : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-600'
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
