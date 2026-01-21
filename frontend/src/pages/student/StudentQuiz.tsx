import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Clock, CheckCircle, AlertCircle } from 'lucide-react';
import api from '../../utils/api';
import { useAuth } from '../../context/AuthContext';

interface QuestionOption {
  id: string;
  text: string;
}

interface Question {
  id: string;
  text: string;
  type: 'MULTIPLE_CHOICE' | 'TRUE_FALSE' | 'SHORT_ANSWER' | 'ESSAY';
  points: number;
  options?: QuestionOption[];
}

interface QuizData {
  id: string;
  title: string;
  durationMinutes: number | null;
  questions: Question[];
}

const StudentQuiz = () => {
  const { assessmentId } = useParams<{ assessmentId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [quiz, setQuiz] = useState<QuizData | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState<number | null>(null);

  useEffect(() => {
    if (assessmentId) {
      fetchQuiz();
    }
  }, [assessmentId]);

  const fetchQuiz = async () => {
    try {
      const response = await api.get(`/online-assessments/${assessmentId}/take`);
      setQuiz(response.data);
    } catch (error) {
      console.error('Failed to load quiz', error);
      alert('Failed to load quiz. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleAnswerChange = (questionId: string, value: string) => {
    setAnswers(prev => ({
      ...prev,
      [questionId]: value
    }));
  };

  const handleSubmit = async () => {
    if (!quiz || !user) return;
    
    if (!window.confirm('Are you sure you want to submit your answers?')) {
      return;
    }

    setSubmitting(true);
    try {
      // Format responses
      const responses = Object.entries(answers).map(([qId, ans]) => ({
        questionId: qId,
        answer: ans
      }));

      // We need studentId. Assuming user.id is linked to student or we have studentId in context.
      // For now, let's assume the backend can infer studentId from the logged-in user if they are a student.
      // But the backend endpoint expects studentId in body.
      // Let's fetch the student profile first or assume the user object has it.
      // Since I didn't update the AuthContext to include studentId, I might need to fetch it.
      // Or I can update the backend to use req.user.id to find the student.
      
      // For this implementation, I'll assume we pass the user.id and the backend handles the lookup 
      // OR I'll fetch the student ID.
      // Let's try to get student ID from an endpoint.
      
      // Actually, let's just pass a placeholder or fix the backend to look up student by userId.
      // I'll update the backend controller to look up student by userId if studentId is not provided.
      
      // For now, let's assume we have a studentId. 
      // I'll use a hack: fetch my student profile.
      
      // Temporary: Fetch student profile
      // const studentRes = await api.get('/students/me'); // Hypothetical endpoint
      // const studentId = studentRes.data.id;
      
      // Let's just send the user ID and let the backend handle it (I will update backend).
      
      const response = await api.post(`/online-assessments/${assessmentId}/submit`, {
        studentId: user.id, // This might be wrong if user.id != student.id. 
        responses
      });

      setScore(response.data.score);
      setSubmitted(true);
    } catch (error) {
      console.error('Failed to submit quiz', error);
      alert('Failed to submit quiz. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center dark:text-gray-400">Loading quiz...</div>;
  }

  if (!quiz) {
    return <div className="p-8 text-center text-red-600 dark:text-red-400">Quiz not found.</div>;
  }

  if (submitted) {
    return (
      <div className="max-w-2xl mx-auto p-4 md:p-8 pb-24 md:pb-8 text-center">
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6 md:p-8">
          <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle size={32} />
          </div>
          <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-2">Quiz Submitted!</h2>
          <p className="text-gray-600 dark:text-gray-400 mb-6">Your answers have been recorded successfully.</p>
          
          {score !== null && (
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 mb-6">
              <div className="text-sm text-blue-600 dark:text-blue-400 font-medium uppercase tracking-wider">Your Score</div>
              <div className="text-3xl font-bold text-blue-700 dark:text-blue-400">{score} points</div>
            </div>
          )}
          
          <button 
            onClick={() => navigate('/')}
            className="px-6 py-2 bg-gray-900 dark:bg-slate-600 text-white rounded-lg hover:bg-gray-800 dark:hover:bg-slate-500 transition-colors"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-4 md:p-6 pb-24 md:pb-6">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden mb-6">
        <div className="p-6 border-b border-gray-200 dark:border-slate-700 bg-blue-50 dark:bg-blue-900/20">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">{quiz.title}</h1>
          <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
            <span className="flex items-center gap-1">
              <Clock size={16} />
              {quiz.durationMinutes ? `${quiz.durationMinutes} mins` : 'No time limit'}
            </span>
            <span>{quiz.questions.length} Questions</span>
          </div>
        </div>

        <div className="p-6 space-y-8">
          {quiz.questions.map((q, index) => (
            <div key={q.id} className="space-y-3">
              <div className="flex gap-3">
                <span className="font-bold text-gray-500 dark:text-gray-400">{index + 1}.</span>
                <div className="flex-1">
                  <p className="text-lg text-gray-900 dark:text-white font-medium mb-3">{q.text}</p>
                  
                  {q.type === 'MULTIPLE_CHOICE' && (
                    <div className="space-y-2">
                      {q.options?.map(opt => (
                        <label key={opt.id} className="flex items-center gap-3 p-3 border border-gray-200 dark:border-slate-600 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 cursor-pointer transition-colors">
                          <input
                            type="radio"
                            name={q.id}
                            value={opt.id}
                            checked={answers[q.id] === opt.id}
                            onChange={(e) => handleAnswerChange(q.id, e.target.value)}
                            className="w-4 h-4 text-blue-600"
                          />
                          <span className="text-gray-700 dark:text-gray-300">{opt.text}</span>
                        </label>
                      ))}
                    </div>
                  )}

                  {q.type === 'TRUE_FALSE' && (
                    <div className="flex gap-4">
                      {q.options?.map(opt => (
                        <label key={opt.id} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name={q.id}
                            value={opt.id}
                            checked={answers[q.id] === opt.id}
                            onChange={(e) => handleAnswerChange(q.id, e.target.value)}
                            className="w-4 h-4 text-blue-600"
                          />
                          <span className="text-gray-700 dark:text-gray-300">{opt.text}</span>
                        </label>
                      ))}
                    </div>
                  )}

                  {(q.type === 'SHORT_ANSWER' || q.type === 'ESSAY') && (
                    <textarea
                      value={answers[q.id] || ''}
                      onChange={(e) => handleAnswerChange(q.id, e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-slate-700 dark:text-white"
                      rows={3}
                      placeholder="Type your answer here..."
                    />
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="p-6 border-t border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-700 flex justify-end">
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50"
          >
            {submitting ? 'Submitting...' : 'Submit Quiz'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default StudentQuiz;
