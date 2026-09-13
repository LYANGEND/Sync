import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Clock, CheckCircle, PlayCircle, User } from 'lucide-react';
import api from '../../utils/api';
import { useAuth } from '../../context/AuthContext';

interface Assessment {
  id: string;
  title: string;
  type: string;
  date: string;
  subject: { name: string };
  durationMinutes?: number;
  isOnline: boolean;
  submission?: {
    status: 'SUBMITTED' | 'GRADED';
    score: number;
  };
}

interface Child {
  id: string;
  firstName: string;
  lastName: string;
}

const StudentAssessments = () => {
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [children, setChildren] = useState<Child[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { user } = useAuth();
  const isParent = user?.role === 'PARENT';

  useEffect(() => {
    if (isParent) {
      fetchMyChildren();
    } else {
      fetchAssessments();
    }
  }, [user]);

  useEffect(() => {
    if (isParent && selectedChildId) {
      fetchAssessments(selectedChildId);
    }
  }, [selectedChildId]);

  const fetchMyChildren = async () => {
    try {
      const res = await api.get('/students/my-children');
      setChildren(res.data);
      if (res.data.length > 0) {
        setSelectedChildId(res.data[0].id); // Auto-select first
      } else {
        setLoading(false); // No children
      }
    } catch (err) {
      console.error('Failed to fetch children', err);
      setLoading(false);
    }
  };

  const fetchAssessments = async (studentId?: string) => {
    try {
      setLoading(true);
      // If Parent, append studentId
      const url = studentId
        ? `/online-assessments/student/my-assessments?studentId=${studentId}`
        : '/online-assessments/student/my-assessments';

      const response = await api.get(url);
      setAssessments(response.data);
    } catch (error) {
      console.error('Failed to fetch assessments', error);
    } finally {
      setLoading(false);
    }
  };

  const handleTakeQuiz = (id: string) => {
    // Parents cannot take quizzes
    if (isParent) return;
    navigate(`/student/quiz/${id}`);
  };

  if (loading) return <div className="p-6 dark:text-gray-400">Loading...</div>;

  return (
    <div className="p-4 md:p-6 pb-24 md:pb-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-white">
          {isParent ? 'Student Assignments' : 'My Assessments'}
        </h2>
      </div>

      {isParent && children.length > 0 && (
        <div className="flex space-x-2 mb-8 overflow-x-auto pb-2">
          {children.map(child => (
            <button
              key={child.id}
              onClick={() => setSelectedChildId(child.id)}
              className={`flex items-center space-x-2 px-4 py-2 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${selectedChildId === child.id
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-white dark:bg-slate-700 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-600'
                }`}
            >
              <User size={16} />
              <span>{child.firstName}</span>
            </button>
          ))}
        </div>
      )}

      {assessments.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {assessments.map(assessment => (
            <div key={assessment.id} className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6 hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start mb-4">
                <div className={`px-3 py-1 rounded-full text-xs font-medium ${assessment.type === 'EXAM' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' :
                    assessment.type === 'QUIZ' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' :
                      'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                  }`}>
                  {assessment.type}
                </div>
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {new Date(assessment.date).toLocaleDateString()}
                </span>
              </div>

              <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-2 line-clamp-2">{assessment.title}</h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm mb-4">{assessment.subject.name}</p>

              <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400 mb-6">
                {assessment.durationMinutes && (
                  <span className="flex items-center gap-1">
                    <Clock size={16} /> {assessment.durationMinutes}m
                  </span>
                )}
              </div>

              {assessment.submission ? (
                <div className="flex items-center justify-between bg-gray-50 dark:bg-slate-700 p-3 rounded-lg">
                  <div className="flex items-center gap-2 text-green-700 dark:text-green-400 font-medium text-sm">
                    <CheckCircle size={16} />
                    Submitted
                  </div>
                  {assessment.submission.score !== null && (
                    <span className="font-bold text-gray-900 dark:text-white text-sm">{assessment.submission.score} pts</span>
                  )}
                </div>
              ) : assessment.isOnline ? (
                <button
                  onClick={() => handleTakeQuiz(assessment.id)}
                  disabled={isParent}
                  className={`w-full flex items-center justify-center gap-2 py-2 rounded-lg transition-colors font-medium ${isParent
                      ? 'bg-gray-100 dark:bg-slate-700 text-gray-400 cursor-not-allowed'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                    }`}
                >
                  <PlayCircle size={18} />
                  {isParent ? 'Online Quiz' : 'Take Quiz'}
                </button>
              ) : (
                <div className="text-center text-gray-500 dark:text-gray-400 text-sm py-2 bg-gray-50 dark:bg-slate-700 rounded-lg">
                  In-class assessment
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 bg-white dark:bg-slate-800 rounded-xl border border-dashed border-gray-300 dark:border-slate-600">
          <FileText size={48} className="mx-auto text-gray-300 dark:text-gray-600 mb-4" />
          <p className="text-gray-500 dark:text-gray-400 font-medium">No assessments found</p>
          {isParent && <p className="text-sm text-gray-400 mt-1">Select a student to view their tasks</p>}
        </div>
      )}
    </div>
  );
};

export default StudentAssessments;
