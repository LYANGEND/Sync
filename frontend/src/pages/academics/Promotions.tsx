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
    <div className="space-y-4 sm:space-y-6 p-4 sm:p-0">
      {/* Selection Card */}
      <div className="bg-white p-4 sm:p-6 rounded-xl shadow-sm border border-gray-100">
        <h2 className="text-base sm:text-lg font-semibold text-gray-800 mb-4">Promotion Criteria</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Current Class</label>
            <select
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 text-base"
            >
              <option value="">Select Class</option>
              {classes.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Academic Term</label>
            <select
              value={selectedTermId}
              onChange={(e) => setSelectedTermId(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 text-base"
            >
              <option value="">Select Term</option>
              {terms.map(t => (
                <option key={t.id} value={t.id}>{t.name} {t.isCurrent ? '(Current)' : ''}</option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2 lg:col-span-1 flex items-end">
            <button
              onClick={fetchCandidates}
              disabled={!selectedClassId || !selectedTermId || loading}
              className="w-full px-4 py-3 sm:py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-300 active:scale-98"
            >
              {loading ? 'Loading...' : 'Fetch Candidates'}
            </button>
          </div>
        </div>
      </div>

      {candidates.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          {/* Header with Actions */}
          <div className="p-4 sm:p-6 border-b border-gray-100 space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <h3 className="text-base sm:text-lg font-semibold text-gray-800">Promotion Candidates</h3>
              <div className="w-full sm:w-auto flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Promote To:</label>
                  <select
                    value={nextClassId}
                    onChange={(e) => setNextClassId(e.target.value)}
                    className="flex-1 sm:flex-none px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  >
                    <option value="">Select Class</option>
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
                  className="flex items-center justify-center gap-2 px-4 py-3 sm:py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-green-300 active:scale-98"
                >
                  <Save size={18} />
                  {processing ? 'Processing...' : 'Save'}
                </button>
              </div>
            </div>
          </div>

          {/* Mobile Card View */}
          <div className="sm:hidden divide-y divide-gray-100">
            {candidates.map((candidate) => (
              <div key={candidate.studentId} className="p-4 space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-medium text-gray-900">{candidate.studentName}</div>
                    <div className="text-xs text-gray-500">{candidate.admissionNumber}</div>
                  </div>
                  <span className={`text-lg font-bold ${candidate.averageScore >= 50 ? 'text-green-600' : 'text-red-600'}`}>
                    {candidate.averageScore.toFixed(1)}%
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {candidate.recommendedAction === 'PROMOTE' ? (
                    <span className="flex items-center gap-1 text-green-600 text-xs font-medium bg-green-50 px-2 py-1 rounded">
                      <CheckCircle size={12} /> Recommend: Promote
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-red-600 text-xs font-medium bg-red-50 px-2 py-1 rounded">
                      <XCircle size={12} /> Recommend: Retain
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleDecisionChange(candidate.studentId, 'PROMOTE')}
                    className={`flex-1 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                      decisions[candidate.studentId]?.action === 'PROMOTE'
                        ? 'bg-green-600 text-white'
                        : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    Promote
                  </button>
                  <button
                    onClick={() => handleDecisionChange(candidate.studentId, 'RETAIN')}
                    className={`flex-1 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                      decisions[candidate.studentId]?.action === 'RETAIN'
                        ? 'bg-red-600 text-white'
                        : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    Retain
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop Table View */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-4 sm:px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Student</th>
                  <th className="px-4 sm:px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Avg Score</th>
                  <th className="px-4 sm:px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Recommendation</th>
                  <th className="px-4 sm:px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {candidates.map((candidate) => (
                  <tr key={candidate.studentId} className="hover:bg-gray-50">
                    <td className="px-4 sm:px-6 py-4">
                      <div className="font-medium text-gray-900 text-sm">{candidate.studentName}</div>
                      <div className="text-xs text-gray-500">{candidate.admissionNumber}</div>
                    </td>
                    <td className="px-4 sm:px-6 py-4">
                      <span className={`font-medium ${candidate.averageScore >= 50 ? 'text-green-600' : 'text-red-600'}`}>
                        {candidate.averageScore.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-4 sm:px-6 py-4">
                      <div className="flex items-center gap-2">
                        {candidate.recommendedAction === 'PROMOTE' ? (
                          <span className="flex items-center gap-1 text-green-600 text-xs font-medium bg-green-50 px-2 py-1 rounded">
                            <CheckCircle size={14} /> Promote
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-red-600 text-xs font-medium bg-red-50 px-2 py-1 rounded">
                            <XCircle size={14} /> Retain
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 sm:px-6 py-4">
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleDecisionChange(candidate.studentId, 'PROMOTE')}
                          className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                            decisions[candidate.studentId]?.action === 'PROMOTE'
                              ? 'bg-green-600 text-white'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          Promote
                        </button>
                        <button
                          onClick={() => handleDecisionChange(candidate.studentId, 'RETAIN')}
                          className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                            decisions[candidate.studentId]?.action === 'RETAIN'
                              ? 'bg-red-600 text-white'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
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
