import { useState, useEffect } from 'react';
import { Plus, Calendar, Users, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
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
  subjectContent: {
    class: { name: string };
    subject: { name: string };
  };
  submissions: any[];
  _count: {
    submissions: number;
  };
}

const TeacherHomework = () => {
  const navigate = useNavigate();
  const [homework, setHomework] = useState<Homework[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [classes, setClasses] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);

  const [formData, setFormData] = useState({
    classId: '',
    subjectId: '',
    title: '',
    description: '',
    instructions: '',
    type: 'HOMEWORK',
    dueDate: '',
    maxPoints: 10,
    requiresSubmission: false,
    allowLateSubmission: true,
  });

  useEffect(() => {
    fetchHomework();
    fetchClasses();
    fetchSubjects();
  }, []);

  const fetchHomework = async () => {
    try {
      setLoading(true);
      const response = await api.get('/homework/teacher');
      setHomework(response.data);
    } catch (error) {
      console.error('Failed to fetch homework:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchClasses = async () => {
    try {
      const response = await api.get('/classes');
      setClasses(response.data);
    } catch (error) {
      console.error('Failed to fetch classes:', error);
    }
  };

  const fetchSubjects = async () => {
    try {
      const response = await api.get('/subjects');
      setSubjects(response.data);
    } catch (error) {
      console.error('Failed to fetch subjects:', error);
    }
  };

  const handleCreateHomework = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      await api.post('/homework', formData);
      setShowCreateModal(false);
      setFormData({
        classId: '',
        subjectId: '',
        title: '',
        description: '',
        instructions: '',
        type: 'HOMEWORK',
        dueDate: '',
        maxPoints: 10,
        requiresSubmission: false,
        allowLateSubmission: true,
      });
      fetchHomework();
    } catch (error) {
      console.error('Failed to create homework:', error);
      alert('Failed to create homework');
    } finally {
      setLoading(false);
    }
  };

  const getSubmissionStats = (hw: Homework) => {
    const total = hw._count?.submissions || 0;
    return {
      total,
      percentage: total > 0 ? Math.round((total / 40) * 100) : 0,
    };
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Homework Management</h1>
          <p className="text-slate-600 mt-1">Create and manage homework assignments</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Plus className="w-5 h-5" />
          Post Homework
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg p-4 border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Total Homework</p>
              <p className="text-2xl font-bold text-slate-900">{homework.length}</p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <Calendar className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg p-4 border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Pending Grading</p>
              <p className="text-2xl font-bold text-slate-900">
                {homework.filter(hw => hw.submissions.some(s => !s.gradedAt)).length}
              </p>
            </div>
            <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
              <Clock className="w-6 h-6 text-orange-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg p-4 border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Due This Week</p>
              <p className="text-2xl font-bold text-slate-900">
                {homework.filter(hw => {
                  if (!hw.dueDate) return false;
                  const due = new Date(hw.dueDate);
                  const weekFromNow = new Date();
                  weekFromNow.setDate(weekFromNow.getDate() + 7);
                  return due <= weekFromNow;
                }).length}
              </p>
            </div>
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
              <AlertCircle className="w-6 h-6 text-purple-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg p-4 border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Avg Submission</p>
              <p className="text-2xl font-bold text-slate-900">
                {homework.length > 0
                  ? Math.round(
                      homework.reduce((acc, hw) => acc + getSubmissionStats(hw).percentage, 0) /
                        homework.length
                    )
                  : 0}
                %
              </p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <CheckCircle className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Homework List */}
      <div className="bg-white rounded-lg border">
        <div className="p-4 border-b">
          <h2 className="font-semibold text-slate-900">Recent Homework</h2>
        </div>
        <div className="divide-y">
          {loading ? (
            <div className="p-8 text-center text-slate-500">Loading...</div>
          ) : homework.length === 0 ? (
            <div className="p-8 text-center text-slate-500">
              No homework posted yet. Click "Post Homework" to get started.
            </div>
          ) : (
            homework.map((hw) => {
              const stats = getSubmissionStats(hw);
              return (
                <div key={hw.id} className="p-4 hover:bg-slate-50">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-slate-900">{hw.title}</h3>
                        <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded">
                          {hw.type}
                        </span>
                      </div>
                      <p className="text-sm text-slate-600 mb-2">
                        {hw.subjectContent.class.name} • {hw.subjectContent.subject.name}
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
                        {hw.maxPoints && (
                          <div className="flex items-center gap-1">
                            <span>Max Points: {hw.maxPoints}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-1">
                          <Users className="w-4 h-4" />
                          {stats.total} submissions ({stats.percentage}%)
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => navigate(`/teacher/homework/${hw.id}/submissions`)}
                        className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                      >
                        View Submissions
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Create Homework Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b">
              <h2 className="text-xl font-bold text-slate-900">Post New Homework</h2>
            </div>
            <form onSubmit={handleCreateHomework} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Class *
                  </label>
                  <select
                    value={formData.classId}
                    onChange={(e) => setFormData({ ...formData, classId: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    required
                  >
                    <option value="">Select class</option>
                    {classes.map((cls) => (
                      <option key={cls.id} value={cls.id}>
                        {cls.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Subject *
                  </label>
                  <select
                    value={formData.subjectId}
                    onChange={(e) => setFormData({ ...formData, subjectId: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    required
                  >
                    <option value="">Select subject</option>
                    {subjects.map((subj) => (
                      <option key={subj.id} value={subj.id}>
                        {subj.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Title *
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., Exercise 5.1"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Instructions
                </label>
                <textarea
                  value={formData.instructions}
                  onChange={(e) => setFormData({ ...formData, instructions: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  rows={3}
                  placeholder="e.g., Questions 1-5 from textbook page 45"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Type
                  </label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="HOMEWORK">Homework</option>
                    <option value="CLASSWORK">Classwork</option>
                    <option value="PROJECT">Project</option>
                    <option value="RESEARCH">Research</option>
                    <option value="PRACTICE">Practice</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Due Date
                  </label>
                  <input
                    type="datetime-local"
                    value={formData.dueDate}
                    onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Max Points
                </label>
                <input
                  type="number"
                  value={formData.maxPoints}
                  onChange={(e) => setFormData({ ...formData, maxPoints: Number(e.target.value) })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  min="0"
                />
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.requiresSubmission}
                    onChange={(e) =>
                      setFormData({ ...formData, requiresSubmission: e.target.checked })
                    }
                    className="rounded"
                  />
                  <span className="text-sm text-slate-700">Requires submission</span>
                </label>

                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.allowLateSubmission}
                    onChange={(e) =>
                      setFormData({ ...formData, allowLateSubmission: e.target.checked })
                    }
                    className="rounded"
                  />
                  <span className="text-sm text-slate-700">Allow late submission</span>
                </label>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 px-4 py-2 border rounded-lg hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {loading ? 'Posting...' : 'Post Homework'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default TeacherHomework;
