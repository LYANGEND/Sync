import { useState, useEffect } from 'react';
import { Calendar, CheckCircle, Clock, AlertCircle, Download, Upload } from 'lucide-react';
import api from '../../services/api';

interface Homework {
  id: string;
  title: string;
  description?: string;
  instructions?: string;
  type: string;
  dueDate?: string;
  maxPoints?: number;
  requiresSubmission: boolean;
  attachments: string[];
  subjectContent: {
    subject: { name: string };
    teacher: { fullName: string };
  };
  submissions: Array<{
    id: string;
    status: string;
    submittedAt: string;
    marks?: number;
    maxMarks?: number;
    feedback?: string;
    isLate: boolean;
  }>;
}

interface Child {
  id: string;
  firstName: string;
  lastName: string;
  classId: string;
}

const ParentHomework = () => {
  const [children, setChildren] = useState<Child[]>([]);
  const [selectedChild, setSelectedChild] = useState<Child | null>(null);
  const [homework, setHomework] = useState<Homework[]>([]);
  const [loading, setLoading] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [selectedHomework, setSelectedHomework] = useState<Homework | null>(null);
  const [submitData, setSubmitData] = useState({
    content: '',
    status: 'SUBMITTED' as 'DRAFT' | 'SUBMITTED',
  });

  useEffect(() => {
    fetchChildren();
  }, []);

  useEffect(() => {
    if (selectedChild) {
      fetchHomework();
    }
  }, [selectedChild]);

  const fetchChildren = async () => {
    try {
      // Get current user's children
      const response = await api.get('/parent/children');
      setChildren(response.data.children || []);
      if (response.data.children?.length > 0) {
        setSelectedChild(response.data.children[0]);
      }
    } catch (error) {
      console.error('Failed to fetch children:', error);
    }
  };

  const fetchHomework = async () => {
    if (!selectedChild) return;

    try {
      setLoading(true);
      const response = await api.get(`/homework/student?studentId=${selectedChild.id}`);
      setHomework(response.data);
    } catch (error) {
      console.error('Failed to fetch homework:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedHomework || !selectedChild) return;

    try {
      setLoading(true);
      await api.post(`/homework/${selectedHomework.id}/submit?studentId=${selectedChild.id}`, submitData);
      setShowSubmitModal(false);
      setSubmitData({ content: '', status: 'SUBMITTED' });
      fetchHomework();
      alert('Homework submitted successfully!');
    } catch (error) {
      console.error('Failed to submit homework:', error);
      alert('Failed to submit homework');
    } finally {
      setLoading(false);
    }
  };

  const openSubmitModal = (hw: Homework) => {
    setSelectedHomework(hw);
    setShowSubmitModal(true);
  };

  const getHomeworkStatus = (hw: Homework) => {
    if (hw.submissions.length === 0) {
      return { text: 'Not started', color: 'text-slate-500', bg: 'bg-slate-100' };
    }
    const submission = hw.submissions[0];
    if (submission.status === 'GRADED') {
      return { text: 'Graded', color: 'text-green-700', bg: 'bg-green-100' };
    }
    if (submission.status === 'SUBMITTED') {
      return { text: 'Submitted', color: 'text-blue-700', bg: 'bg-blue-100' };
    }
    return { text: 'Draft', color: 'text-orange-700', bg: 'bg-orange-100' };
  };

  const isPastDue = (dueDate?: string) => {
    if (!dueDate) return false;
    return new Date(dueDate) < new Date();
  };

  const pendingHomework = homework.filter(hw => hw.submissions.length === 0 || hw.submissions[0].status === 'DRAFT');
  const completedHomework = homework.filter(hw => hw.submissions.length > 0 && hw.submissions[0].status !== 'DRAFT');

  return (
    <div className="p-6">
      {/* Child Selection */}
      {children.length > 1 && (
        <div className="mb-6">
          <label className="block text-sm font-medium text-slate-700 mb-2">Select Child</label>
          <div className="flex gap-2">
            {children.map((child) => (
              <button
                key={child.id}
                onClick={() => setSelectedChild(child)}
                className={`px-4 py-2 rounded-lg font-medium ${
                  selectedChild?.id === child.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-white border text-slate-700 hover:bg-slate-50'
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
            <h1 className="text-2xl font-bold text-slate-900">
              {selectedChild.firstName}'s Homework
            </h1>
            <p className="text-slate-600 mt-1">View and submit homework assignments</p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-white rounded-lg p-4 border">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">Pending</p>
                  <p className="text-2xl font-bold text-slate-900">{pendingHomework.length}</p>
                </div>
                <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
                  <Clock className="w-6 h-6 text-orange-600" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg p-4 border">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">Completed</p>
                  <p className="text-2xl font-bold text-slate-900">{completedHomework.length}</p>
                </div>
                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                  <CheckCircle className="w-6 h-6 text-green-600" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg p-4 border">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">Overdue</p>
                  <p className="text-2xl font-bold text-slate-900">
                    {pendingHomework.filter(hw => isPastDue(hw.dueDate)).length}
                  </p>
                </div>
                <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
                  <AlertCircle className="w-6 h-6 text-red-600" />
                </div>
              </div>
            </div>
          </div>

          {/* Pending Homework */}
          {pendingHomework.length > 0 && (
            <div className="bg-white rounded-lg border mb-6">
              <div className="p-4 border-b">
                <h2 className="font-semibold text-slate-900">Pending Homework</h2>
              </div>
              <div className="divide-y">
                {pendingHomework.map((hw) => {
                  const status = getHomeworkStatus(hw);
                  const overdue = isPastDue(hw.dueDate);
                  return (
                    <div key={hw.id} className="p-4 hover:bg-slate-50">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-semibold text-slate-900">{hw.title}</h3>
                            <span className={`px-2 py-0.5 ${status.bg} ${status.color} text-xs rounded`}>
                              {status.text}
                            </span>
                            {overdue && (
                              <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded">
                                Overdue
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-slate-600 mb-2">
                            {hw.subjectContent.subject.name} • {hw.subjectContent.teacher.fullName}
                          </p>
                          {hw.instructions && (
                            <p className="text-sm text-slate-600 mb-2">{hw.instructions}</p>
                          )}
                          <div className="flex items-center gap-4 text-sm text-slate-500">
                            {hw.dueDate && (
                              <div className="flex items-center gap-1">
                                <Calendar className="w-4 h-4" />
                                Due: {new Date(hw.dueDate).toLocaleDateString()}
                              </div>
                            )}
                            {hw.maxPoints && <span>Max Points: {hw.maxPoints}</span>}
                          </div>
                          {hw.attachments.length > 0 && (
                            <div className="mt-2 flex gap-2">
                              {hw.attachments.map((url, idx) => (
                                <a
                                  key={idx}
                                  href={url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-1 text-sm text-blue-600 hover:underline"
                                >
                                  <Download className="w-4 h-4" />
                                  Attachment {idx + 1}
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="flex gap-2">
                          {hw.requiresSubmission ? (
                            <button
                              onClick={() => openSubmitModal(hw)}
                              className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                            >
                              Submit Work
                            </button>
                          ) : (
                            <button
                              onClick={() => openSubmitModal(hw)}
                              className="px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700"
                            >
                              Mark Complete
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Completed Homework */}
          {completedHomework.length > 0 && (
            <div className="bg-white rounded-lg border">
              <div className="p-4 border-b">
                <h2 className="font-semibold text-slate-900">Completed Homework</h2>
              </div>
              <div className="divide-y">
                {completedHomework.map((hw) => {
                  const submission = hw.submissions[0];
                  return (
                    <div key={hw.id} className="p-4 hover:bg-slate-50">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-semibold text-slate-900">{hw.title}</h3>
                            {submission.status === 'GRADED' && submission.marks !== undefined && (
                              <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded font-medium">
                                {submission.marks}/{submission.maxMarks} ({Math.round((submission.marks / (submission.maxMarks || 1)) * 100)}%)
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-slate-600 mb-2">
                            {hw.subjectContent.subject.name} • Submitted {new Date(submission.submittedAt).toLocaleDateString()}
                          </p>
                          {submission.feedback && (
                            <div className="mt-2 p-3 bg-blue-50 rounded-lg">
                              <p className="text-sm font-medium text-blue-900 mb-1">Teacher Feedback:</p>
                              <p className="text-sm text-blue-800">{submission.feedback}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {loading && homework.length === 0 && (
            <div className="text-center py-12 text-slate-500">Loading homework...</div>
          )}

          {!loading && homework.length === 0 && (
            <div className="text-center py-12 text-slate-500">
              No homework assigned yet.
            </div>
          )}
        </>
      )}

      {/* Submit Modal */}
      {showSubmitModal && selectedHomework && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-lg w-full">
            <div className="p-6 border-b">
              <h2 className="text-xl font-bold text-slate-900">Submit: {selectedHomework.title}</h2>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Submission Note (Optional)
                </label>
                <textarea
                  value={submitData.content}
                  onChange={(e) => setSubmitData({ ...submitData, content: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  rows={4}
                  placeholder="e.g., I completed this in my exercise book"
                />
              </div>

              <div className="bg-blue-50 p-4 rounded-lg">
                <p className="text-sm text-blue-800">
                  {selectedHomework.requiresSubmission
                    ? 'You can upload photos or files after submitting.'
                    : 'This will mark the homework as complete.'}
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowSubmitModal(false)}
                  className="flex-1 px-4 py-2 border rounded-lg hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {loading ? 'Submitting...' : 'Submit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ParentHomework;
