import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle, Clock, Download, Save } from 'lucide-react';
import api from '../../services/api';

interface Submission {
  id: string;
  content?: string;
  attachments: string[];
  submittedAt: string;
  isLate: boolean;
  status: string;
  marks?: number;
  maxMarks?: number;
  feedback?: string;
  student: {
    id: string;
    firstName: string;
    lastName: string;
    admissionNumber: string;
  };
}

interface Homework {
  id: string;
  title: string;
  maxPoints?: number;
  subjectContent: {
    class: { name: string };
    subject: { name: string };
  };
}

const HomeworkGrading = () => {
  const { homeworkId } = useParams();
  const navigate = useNavigate();
  const [homework, setHomework] = useState<Homework | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(false);
  const [grades, setGrades] = useState<Record<string, { marks: number; feedback: string }>>({});

  useEffect(() => {
    fetchHomework();
    fetchSubmissions();
  }, [homeworkId]);

  const fetchHomework = async () => {
    try {
      const response = await api.get(`/homework/teacher`);
      const hw = response.data.find((h: any) => h.id === homeworkId);
      setHomework(hw);
    } catch (error) {
      console.error('Failed to fetch homework:', error);
    }
  };

  const fetchSubmissions = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/homework/${homeworkId}/submissions`);
      setSubmissions(response.data);
      
      // Initialize grades
      const initialGrades: Record<string, { marks: number; feedback: string }> = {};
      response.data.forEach((sub: Submission) => {
        initialGrades[sub.id] = {
          marks: sub.marks || 0,
          feedback: sub.feedback || '',
        };
      });
      setGrades(initialGrades);
    } catch (error) {
      console.error('Failed to fetch submissions:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleGradeChange = (submissionId: string, field: 'marks' | 'feedback', value: string | number) => {
    setGrades(prev => ({
      ...prev,
      [submissionId]: {
        ...prev[submissionId],
        [field]: value,
      }
    }));
  };

  const handleGradeSubmission = async (submissionId: string) => {
    try {
      setLoading(true);
      const grade = grades[submissionId];
      await api.post(`/homework/grade/${submissionId}`, {
        marks: grade.marks,
        maxMarks: homework?.maxPoints || 10,
        feedback: grade.feedback,
      });
      alert('Graded successfully!');
      fetchSubmissions();
    } catch (error) {
      console.error('Failed to grade:', error);
      alert('Failed to grade submission');
    } finally {
      setLoading(false);
    }
  };

  const handleBulkGrade = async () => {
    try {
      setLoading(true);
      const gradeData = submissions
        .filter(sub => sub.status === 'SUBMITTED')
        .map(sub => ({
          submissionId: sub.id,
          marks: grades[sub.id]?.marks || 0,
          maxMarks: homework?.maxPoints || 10,
          feedback: grades[sub.id]?.feedback || '',
        }));

      await api.post('/homework/grade/bulk', { grades: gradeData });
      alert(`Graded ${gradeData.length} submissions successfully!`);
      fetchSubmissions();
    } catch (error) {
      console.error('Failed to bulk grade:', error);
      alert('Failed to grade submissions');
    } finally {
      setLoading(false);
    }
  };

  const submittedCount = submissions.filter(s => s.status !== 'DRAFT').length;
  const gradedCount = submissions.filter(s => s.status === 'GRADED').length;

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-4"
        >
          <ArrowLeft className="w-5 h-5" />
          Back to Homework
        </button>
        
        {homework && (
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{homework.title}</h1>
            <p className="text-slate-600 mt-1">
              {homework.subjectContent.class.name} • {homework.subjectContent.subject.name}
            </p>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg p-4 border">
          <p className="text-sm text-slate-500">Total Submissions</p>
          <p className="text-2xl font-bold text-slate-900">{submittedCount}</p>
        </div>
        <div className="bg-white rounded-lg p-4 border">
          <p className="text-sm text-slate-500">Graded</p>
          <p className="text-2xl font-bold text-green-600">{gradedCount}</p>
        </div>
        <div className="bg-white rounded-lg p-4 border">
          <p className="text-sm text-slate-500">Pending</p>
          <p className="text-2xl font-bold text-orange-600">{submittedCount - gradedCount}</p>
        </div>
        <div className="bg-white rounded-lg p-4 border">
          <p className="text-sm text-slate-500">Max Points</p>
          <p className="text-2xl font-bold text-slate-900">{homework?.maxPoints || 10}</p>
        </div>
      </div>

      {/* Bulk Grade Button */}
      {submittedCount > gradedCount && (
        <div className="mb-4">
          <button
            onClick={handleBulkGrade}
            disabled={loading}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
          >
            <Save className="w-5 h-5 inline mr-2" />
            Grade All Pending ({submittedCount - gradedCount})
          </button>
        </div>
      )}

      {/* Submissions List */}
      <div className="bg-white rounded-lg border">
        <div className="p-4 border-b">
          <h2 className="font-semibold text-slate-900">Submissions</h2>
        </div>
        <div className="divide-y">
          {loading && submissions.length === 0 ? (
            <div className="p-8 text-center text-slate-500">Loading submissions...</div>
          ) : submissions.length === 0 ? (
            <div className="p-8 text-center text-slate-500">No submissions yet</div>
          ) : (
            submissions.map((submission) => (
              <div key={submission.id} className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-slate-900">
                      {submission.student.firstName} {submission.student.lastName}
                    </h3>
                    <p className="text-sm text-slate-600">
                      {submission.student.admissionNumber} • 
                      Submitted {new Date(submission.submittedAt).toLocaleString()}
                      {submission.isLate && (
                        <span className="ml-2 px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded">
                          Late
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {submission.status === 'GRADED' ? (
                      <span className="flex items-center gap-1 px-3 py-1 bg-green-100 text-green-700 text-sm rounded">
                        <CheckCircle className="w-4 h-4" />
                        Graded
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 px-3 py-1 bg-orange-100 text-orange-700 text-sm rounded">
                        <Clock className="w-4 h-4" />
                        Pending
                      </span>
                    )}
                  </div>
                </div>

                {/* Submission Content */}
                {submission.content && (
                  <div className="mb-3 p-3 bg-slate-50 rounded">
                    <p className="text-sm text-slate-700">{submission.content}</p>
                  </div>
                )}

                {/* Attachments */}
                {submission.attachments.length > 0 && (
                  <div className="mb-3 flex gap-2">
                    {submission.attachments.map((url, idx) => (
                      <a
                        key={idx}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-50 text-blue-600 rounded hover:bg-blue-100"
                      >
                        <Download className="w-4 h-4" />
                        Attachment {idx + 1}
                      </a>
                    ))}
                  </div>
                )}

                {/* Grading Form */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Marks
                    </label>
                    <input
                      type="number"
                      value={grades[submission.id]?.marks || 0}
                      onChange={(e) => handleGradeChange(submission.id, 'marks', Number(e.target.value))}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                      min="0"
                      max={homework?.maxPoints || 10}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Feedback
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={grades[submission.id]?.feedback || ''}
                        onChange={(e) => handleGradeChange(submission.id, 'feedback', e.target.value)}
                        className="flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                        placeholder="e.g., Good work! Check question 3."
                      />
                      <button
                        onClick={() => handleGradeSubmission(submission.id)}
                        disabled={loading}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default HomeworkGrading;
