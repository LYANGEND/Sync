import { useState, useEffect } from 'react';
import { Award, TrendingUp, BookOpen, Download, ChevronDown, ChevronUp, FileText } from 'lucide-react';
import api from '../../services/api';

interface Child {
  id: string;
  firstName: string;
  lastName: string;
  classId: string;
  className?: string;
}

interface Term {
  id: string;
  name: string;
  isActive: boolean;
}

interface SubjectResult {
  id: string;
  subjectName: string;
  totalScore: number;
  grade?: string;
  remarks?: string;
}

interface ReportCard {
  id: string;
  studentId: string;
  termId: string;
  classPosition?: number;
  totalStudents?: number;
  overallAverage?: number;
  teacherRemarks?: string;
  principalRemarks?: string;
  results: SubjectResult[];
  totalScore: number;
  averageScore: number;
  term: { name: string };
  class: { name: string };
  student: { firstName: string; lastName: string };
}

interface Assessment {
  id: string;
  title: string;
  type: string;
  date: string;
  subject: { name: string };
  submission?: {
    score?: number;
  };
}

const getGradeColor = (score: number) => {
  if (score >= 80) return 'text-green-600 dark:text-green-400';
  if (score >= 60) return 'text-blue-600 dark:text-blue-400';
  if (score >= 50) return 'text-yellow-600 dark:text-yellow-400';
  return 'text-red-600 dark:text-red-400';
};

const getGradeBadge = (score: number) => {
  if (score >= 80) return { grade: 'A', bg: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' };
  if (score >= 70) return { grade: 'B', bg: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' };
  if (score >= 60) return { grade: 'C', bg: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300' };
  if (score >= 50) return { grade: 'D', bg: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300' };
  return { grade: 'F', bg: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' };
};

const ParentGrades = () => {
  const [children, setChildren] = useState<Child[]>([]);
  const [selectedChild, setSelectedChild] = useState<Child | null>(null);
  const [terms, setTerms] = useState<Term[]>([]);
  const [selectedTerm, setSelectedTerm] = useState<Term | null>(null);
  const [reportCard, setReportCard] = useState<ReportCard | null>(null);
  const [recentAssessments, setRecentAssessments] = useState<Assessment[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAllSubjects, setShowAllSubjects] = useState(false);

  useEffect(() => {
    fetchChildren();
    fetchTerms();
  }, []);

  useEffect(() => {
    if (selectedChild && selectedTerm) {
      fetchReportCard();
      fetchAssessments();
    }
  }, [selectedChild, selectedTerm]);

  const fetchChildren = async () => {
    try {
      const response = await api.get('/parent/children');
      setChildren(response.data.children || []);
      if (response.data.children?.length > 0) {
        setSelectedChild(response.data.children[0]);
      }
    } catch (error) {
      console.error('Failed to fetch children:', error);
    }
  };

  const fetchTerms = async () => {
    try {
      const response = await api.get('/academic-terms');
      setTerms(response.data || []);
      const active = response.data.find((t: Term) => t.isActive);
      if (active) {
        setSelectedTerm(active);
      } else if (response.data.length > 0) {
        setSelectedTerm(response.data[0]);
      }
    } catch (error) {
      console.error('Failed to fetch terms:', error);
    }
  };

  const fetchReportCard = async () => {
    if (!selectedChild || !selectedTerm) return;

    try {
      setLoading(true);
      const response = await api.get(
        `/report-cards?studentId=${selectedChild.id}&termId=${selectedTerm.id}`
      );
      setReportCard(response.data);
    } catch (error) {
      console.error('Failed to fetch report card:', error);
      setReportCard(null);
    } finally {
      setLoading(false);
    }
  };

  const fetchAssessments = async () => {
    if (!selectedChild) return;

    try {
      const response = await api.get(`/online-assessment/student?studentId=${selectedChild.id}`);
      setRecentAssessments(
        response.data
          .filter((a: Assessment) => a.submission?.score !== undefined)
          .slice(0, 5)
      );
    } catch (error) {
      console.error('Failed to fetch assessments:', error);
    }
  };

  const downloadReportCard = () => {
    // In production, this would call an API to generate PDF
    alert('Report card download will be available soon.');
  };

  const displayedSubjects = showAllSubjects
    ? reportCard?.results || []
    : (reportCard?.results || []).slice(0, 5);

  return (
    <div className="p-6">
      {/* Child Selection */}
      {children.length > 1 && (
        <div className="mb-6">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            Select Child
          </label>
          <div className="flex gap-2">
            {children.map((child) => (
              <button
                key={child.id}
                onClick={() => setSelectedChild(child)}
                className={`px-4 py-2 rounded-lg font-medium ${
                  selectedChild?.id === child.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-white dark:bg-slate-800 border text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
                }`}
              >
                {child.firstName} {child.lastName}
              </button>
            ))}
          </div>
        </div>
      )}

      {selectedChild && (
        <>
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                {selectedChild.firstName}'s Grades
              </h1>
              <p className="text-slate-600 dark:text-slate-400 mt-1">
                View academic performance and report cards
              </p>
            </div>
            
            {/* Term Selector */}
            <div className="flex items-center gap-3">
              <select
                value={selectedTerm?.id || ''}
                onChange={(e) => {
                  const term = terms.find((t) => t.id === e.target.value);
                  setSelectedTerm(term || null);
                }}
                className="px-3 py-2 border rounded-lg bg-white dark:bg-slate-800 dark:border-slate-600 dark:text-white"
              >
                {terms.map((term) => (
                  <option key={term.id} value={term.id}>
                    {term.name} {term.isActive && '(Current)'}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {loading ? (
            <div className="text-center py-12 text-slate-500 dark:text-slate-400">
              Loading grades...
            </div>
          ) : reportCard ? (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border dark:border-slate-700">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-500 dark:text-slate-400">Average</p>
                      <p className={`text-2xl font-bold ${getGradeColor(reportCard.averageScore)}`}>
                        {reportCard.averageScore.toFixed(1)}%
                      </p>
                    </div>
                    <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                      <TrendingUp className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                    </div>
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border dark:border-slate-700">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-500 dark:text-slate-400">Total Score</p>
                      <p className="text-2xl font-bold text-slate-900 dark:text-white">
                        {reportCard.totalScore}
                      </p>
                    </div>
                    <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
                      <Award className="w-6 h-6 text-green-600 dark:text-green-400" />
                    </div>
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border dark:border-slate-700">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-500 dark:text-slate-400">Class Position</p>
                      <p className="text-2xl font-bold text-slate-900 dark:text-white">
                        {reportCard.classPosition || '-'}/{reportCard.totalStudents || '-'}
                      </p>
                    </div>
                    <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center">
                      <Award className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                    </div>
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border dark:border-slate-700">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-500 dark:text-slate-400">Subjects</p>
                      <p className="text-2xl font-bold text-slate-900 dark:text-white">
                        {reportCard.results.length}
                      </p>
                    </div>
                    <div className="w-12 h-12 bg-orange-100 dark:bg-orange-900/30 rounded-lg flex items-center justify-center">
                      <BookOpen className="w-6 h-6 text-orange-600 dark:text-orange-400" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Subject Results */}
              <div className="bg-white dark:bg-slate-800 rounded-lg border dark:border-slate-700 mb-6">
                <div className="p-4 border-b dark:border-slate-700 flex items-center justify-between">
                  <h2 className="font-semibold text-slate-900 dark:text-white">Subject Results</h2>
                  <button
                    onClick={downloadReportCard}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    <Download className="w-4 h-4" />
                    Download Report
                  </button>
                </div>

                <div className="divide-y dark:divide-slate-700">
                  {displayedSubjects.map((result) => {
                    const gradeInfo = getGradeBadge(result.totalScore);
                    return (
                      <div key={result.id} className="p-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-slate-100 dark:bg-slate-700 rounded-lg flex items-center justify-center">
                            <BookOpen className="w-5 h-5 text-slate-600 dark:text-slate-400" />
                          </div>
                          <div>
                            <h3 className="font-medium text-slate-900 dark:text-white">
                              {result.subjectName}
                            </h3>
                            {result.remarks && (
                              <p className="text-xs text-slate-500 dark:text-slate-400">
                                {result.remarks}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className={`text-lg font-bold ${getGradeColor(result.totalScore)}`}>
                              {result.totalScore}%
                            </p>
                          </div>
                          <span className={`px-3 py-1 rounded-full text-sm font-medium ${gradeInfo.bg}`}>
                            {gradeInfo.grade}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {reportCard.results.length > 5 && (
                  <div className="p-3 border-t dark:border-slate-700">
                    <button
                      onClick={() => setShowAllSubjects(!showAllSubjects)}
                      className="w-full flex items-center justify-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      {showAllSubjects ? (
                        <>
                          <ChevronUp className="w-4 h-4" />
                          Show Less
                        </>
                      ) : (
                        <>
                          <ChevronDown className="w-4 h-4" />
                          Show All {reportCard.results.length} Subjects
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>

              {/* Teacher Remarks */}
              {(reportCard.teacherRemarks || reportCard.principalRemarks) && (
                <div className="bg-white dark:bg-slate-800 rounded-lg border dark:border-slate-700 mb-6">
                  <div className="p-4 border-b dark:border-slate-700">
                    <h2 className="font-semibold text-slate-900 dark:text-white">Teacher Remarks</h2>
                  </div>
                  <div className="p-4 space-y-4">
                    {reportCard.teacherRemarks && (
                      <div>
                        <p className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-1">
                          Class Teacher
                        </p>
                        <p className="text-slate-900 dark:text-white">{reportCard.teacherRemarks}</p>
                      </div>
                    )}
                    {reportCard.principalRemarks && (
                      <div>
                        <p className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-1">
                          Head Teacher
                        </p>
                        <p className="text-slate-900 dark:text-white">{reportCard.principalRemarks}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Recent Test Scores */}
              {recentAssessments.length > 0 && (
                <div className="bg-white dark:bg-slate-800 rounded-lg border dark:border-slate-700">
                  <div className="p-4 border-b dark:border-slate-700">
                    <h2 className="font-semibold text-slate-900 dark:text-white">Recent Test Scores</h2>
                  </div>
                  <div className="divide-y dark:divide-slate-700">
                    {recentAssessments.map((assessment) => (
                      <div key={assessment.id} className="p-4 flex items-center justify-between">
                        <div>
                          <h3 className="font-medium text-slate-900 dark:text-white">
                            {assessment.title}
                          </h3>
                          <p className="text-sm text-slate-500 dark:text-slate-400">
                            {assessment.subject.name} • {new Date(assessment.date).toLocaleDateString()}
                          </p>
                        </div>
                        <p className="text-lg font-bold text-green-600 dark:text-green-400">
                          {assessment.submission?.score} pts
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="bg-white dark:bg-slate-800 rounded-lg border dark:border-slate-700 p-12 text-center">
              <FileText className="w-16 h-16 text-slate-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
                No Report Card Available
              </h3>
              <p className="text-slate-600 dark:text-slate-400">
                The report card for {selectedTerm?.name} hasn't been generated yet.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default ParentGrades;
