import { useState, useEffect } from 'react';
import { ClipboardList, Clock, CheckCircle, PlayCircle, AlertCircle, Trophy } from 'lucide-react';
import api from '../../services/api';

interface Assessment {
  id: string;
  title: string;
  type: string;
  date: string;
  durationMinutes?: number;
  isOnline: boolean;
  subject: { name: string };
  submission?: {
    status: string;
    score?: number;
  };
}

interface Question {
  id: string;
  text: string;
  type: 'MULTIPLE_CHOICE' | 'TRUE_FALSE' | 'SHORT_ANSWER' | 'ESSAY';
  points: number;
  options: Array<{ id: string; text: string }>;
}

interface QuizData {
  id: string;
  title: string;
  durationMinutes?: number;
  questions: Question[];
}

interface Child {
  id: string;
  firstName: string;
  lastName: string;
}

const ParentQuizzes = () => {
  const [children, setChildren] = useState<Child[]>([]);
  const [selectedChild, setSelectedChild] = useState<Child | null>(null);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeQuiz, setActiveQuiz] = useState<QuizData | null>(null);
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [quizResult, setQuizResult] = useState<{ score: number } | null>(null);

  useEffect(() => {
    fetchChildren();
  }, []);

  useEffect(() => {
    if (selectedChild) {
      fetchAssessments();
    }
  }, [selectedChild]);

  // Timer effect
  useEffect(() => {
    if (timeLeft === null || timeLeft <= 0) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(timer);
          if (prev === 1) handleSubmitQuiz();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft]);

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

  const fetchAssessments = async () => {
    if (!selectedChild) return;

    try {
      setLoading(true);
      const response = await api.get(`/online-assessment/student?studentId=${selectedChild.id}`);
      setAssessments(response.data);
    } catch (error) {
      console.error('Failed to fetch assessments:', error);
    } finally {
      setLoading(false);
    }
  };

  const startQuiz = async (assessmentId: string) => {
    try {
      setLoading(true);
      const response = await api.get(`/online-assessment/${assessmentId}/quiz`);
      setActiveQuiz(response.data);
      setResponses({});
      setQuizResult(null);
      if (response.data.durationMinutes) {
        setTimeLeft(response.data.durationMinutes * 60);
      }
    } catch (error) {
      console.error('Failed to load quiz:', error);
      alert('Failed to load quiz. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitQuiz = async () => {
    if (!activeQuiz || !selectedChild) return;

    try {
      setSubmitting(true);
      const responseArray = Object.entries(responses).map(([questionId, answer]) => ({
        questionId,
        answer,
      }));

      const result = await api.post(`/online-assessment/${activeQuiz.id}/submit`, {
        studentId: selectedChild.id,
        responses: responseArray,
      });

      setQuizResult(result.data);
      setActiveQuiz(null);
      setTimeLeft(null);
      fetchAssessments();
    } catch (error) {
      console.error('Failed to submit quiz:', error);
      alert('Failed to submit quiz. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getAssessmentStatus = (assessment: Assessment) => {
    if (assessment.submission) {
      if (assessment.submission.status === 'GRADED' || assessment.submission.status === 'SUBMITTED') {
        return { text: 'Completed', color: 'text-green-700', bg: 'bg-green-100', icon: CheckCircle };
      }
    }
    if (!assessment.isOnline) {
      return { text: 'In-Class', color: 'text-slate-700', bg: 'bg-slate-100', icon: ClipboardList };
    }
    return { text: 'Available', color: 'text-blue-700', bg: 'bg-blue-100', icon: PlayCircle };
  };

  const pendingQuizzes = assessments.filter(
    (a) => a.isOnline && (!a.submission || a.submission.status === 'PENDING')
  );
  const completedQuizzes = assessments.filter(
    (a) => a.submission && a.submission.status !== 'PENDING'
  );

  // Quiz Result Modal
  if (quizResult) {
    return (
      <div className="p-6">
        <div className="max-w-md mx-auto bg-white rounded-lg border p-8 text-center">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Trophy className="w-10 h-10 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Quiz Completed!</h2>
          <p className="text-lg text-slate-600 mb-4">Your score:</p>
          <p className="text-4xl font-bold text-blue-600 mb-6">{quizResult.score} points</p>
          <button
            onClick={() => setQuizResult(null)}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Back to Quizzes
          </button>
        </div>
      </div>
    );
  }

  // Active Quiz View
  if (activeQuiz) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        {/* Quiz Header */}
        <div className="bg-white rounded-lg border p-4 mb-6 sticky top-0 z-10">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-slate-900">{activeQuiz.title}</h2>
            {timeLeft !== null && (
              <div
                className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
                  timeLeft < 60 ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
                }`}
              >
                <Clock className="w-5 h-5" />
                <span className="font-mono font-bold text-lg">{formatTime(timeLeft)}</span>
              </div>
            )}
          </div>
          <div className="mt-2 flex items-center gap-4 text-sm text-slate-600">
            <span>{activeQuiz.questions.length} questions</span>
            <span>
              {Object.keys(responses).length}/{activeQuiz.questions.length} answered
            </span>
          </div>
        </div>

        {/* Questions */}
        <div className="space-y-6">
          {activeQuiz.questions.map((question, index) => (
            <div key={question.id} className="bg-white rounded-lg border p-6">
              <div className="flex items-start gap-3 mb-4">
                <span className="flex-shrink-0 w-8 h-8 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center font-medium">
                  {index + 1}
                </span>
                <div className="flex-1">
                  <p className="text-slate-900 font-medium">{question.text}</p>
                  <p className="text-sm text-slate-500 mt-1">{question.points} points</p>
                </div>
              </div>

              {/* Multiple Choice / True-False */}
              {(question.type === 'MULTIPLE_CHOICE' || question.type === 'TRUE_FALSE') && (
                <div className="space-y-2 ml-11">
                  {question.options.map((option) => (
                    <label
                      key={option.id}
                      className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        responses[question.id] === option.id
                          ? 'bg-blue-50 border-blue-300'
                          : 'hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name={question.id}
                        checked={responses[question.id] === option.id}
                        onChange={() => setResponses({ ...responses, [question.id]: option.id })}
                        className="w-4 h-4 text-blue-600"
                      />
                      <span className="text-slate-700">{option.text}</span>
                    </label>
                  ))}
                </div>
              )}

              {/* Short Answer */}
              {question.type === 'SHORT_ANSWER' && (
                <div className="ml-11">
                  <input
                    type="text"
                    value={responses[question.id] || ''}
                    onChange={(e) => setResponses({ ...responses, [question.id]: e.target.value })}
                    placeholder="Type your answer..."
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              )}

              {/* Essay */}
              {question.type === 'ESSAY' && (
                <div className="ml-11">
                  <textarea
                    value={responses[question.id] || ''}
                    onChange={(e) => setResponses({ ...responses, [question.id]: e.target.value })}
                    placeholder="Write your answer..."
                    rows={4}
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Submit Button */}
        <div className="mt-6 bg-white rounded-lg border p-4 sticky bottom-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-600">
              {Object.keys(responses).length === activeQuiz.questions.length
                ? 'All questions answered!'
                : `${activeQuiz.questions.length - Object.keys(responses).length} questions remaining`}
            </p>
            <button
              onClick={handleSubmitQuiz}
              disabled={submitting}
              className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              {submitting ? 'Submitting...' : 'Submit Quiz'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Main View
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
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
              {selectedChild.firstName}'s Quizzes & Tests
            </h1>
            <p className="text-slate-600 dark:text-slate-400 mt-1">
              View and take online assessments
            </p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border dark:border-slate-700">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Available</p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">
                    {pendingQuizzes.length}
                  </p>
                </div>
                <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                  <PlayCircle className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border dark:border-slate-700">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Completed</p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">
                    {completedQuizzes.length}
                  </p>
                </div>
                <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
                  <CheckCircle className="w-6 h-6 text-green-600 dark:text-green-400" />
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border dark:border-slate-700">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Total Tests</p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">
                    {assessments.length}
                  </p>
                </div>
                <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center">
                  <ClipboardList className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                </div>
              </div>
            </div>
          </div>

          {/* Available Quizzes */}
          {pendingQuizzes.length > 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-lg border dark:border-slate-700 mb-6">
              <div className="p-4 border-b dark:border-slate-700">
                <h2 className="font-semibold text-slate-900 dark:text-white">Available Quizzes</h2>
              </div>
              <div className="divide-y dark:divide-slate-700">
                {pendingQuizzes.map((assessment) => {
                  const status = getAssessmentStatus(assessment);
                  return (
                    <div key={assessment.id} className="p-4 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-semibold text-slate-900 dark:text-white">
                              {assessment.title}
                            </h3>
                            <span
                              className={`px-2 py-0.5 ${status.bg} ${status.color} text-xs rounded`}
                            >
                              {status.text}
                            </span>
                          </div>
                          <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">
                            {assessment.subject.name} • {assessment.type}
                          </p>
                          <div className="flex items-center gap-4 text-sm text-slate-500 dark:text-slate-400">
                            <span>{new Date(assessment.date).toLocaleDateString()}</span>
                            {assessment.durationMinutes && (
                              <span className="flex items-center gap-1">
                                <Clock className="w-4 h-4" />
                                {assessment.durationMinutes} mins
                              </span>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => startQuiz(assessment.id)}
                          disabled={loading}
                          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                        >
                          <PlayCircle className="w-4 h-4" />
                          Start Quiz
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Completed Quizzes */}
          {completedQuizzes.length > 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-lg border dark:border-slate-700">
              <div className="p-4 border-b dark:border-slate-700">
                <h2 className="font-semibold text-slate-900 dark:text-white">Completed Tests</h2>
              </div>
              <div className="divide-y dark:divide-slate-700">
                {completedQuizzes.map((assessment) => (
                  <div key={assessment.id} className="p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-semibold text-slate-900 dark:text-white">
                          {assessment.title}
                        </h3>
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                          {assessment.subject.name} • {new Date(assessment.date).toLocaleDateString()}
                        </p>
                      </div>
                      {assessment.submission?.score !== undefined && (
                        <div className="text-right">
                          <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                            {assessment.submission.score}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">points</p>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {loading && assessments.length === 0 && (
            <div className="text-center py-12 text-slate-500 dark:text-slate-400">
              Loading quizzes...
            </div>
          )}

          {!loading && assessments.length === 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-lg border dark:border-slate-700 p-12 text-center">
              <AlertCircle className="w-16 h-16 text-slate-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
                No Tests Available
              </h3>
              <p className="text-slate-600 dark:text-slate-400">
                There are no online quizzes or tests assigned yet.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default ParentQuizzes;
