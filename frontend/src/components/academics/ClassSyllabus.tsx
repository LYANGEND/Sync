import React, { useState, useEffect } from 'react';
import { CheckCircle, Circle, Clock, FileText, Plus, Calendar } from 'lucide-react';
import api from '../../utils/api';

interface Topic {
  id: string;
  title: string;
  description: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';
  completedAt: string | null;
}

interface LessonPlan {
  id: string;
  weekStartDate: string;
  title: string;
  content: string;
  teacher: {
    fullName: string;
  };
}

interface ClassSyllabusProps {
  classId: string;
  subjectId: string;
}

const ClassSyllabus: React.FC<ClassSyllabusProps> = ({ classId, subjectId }) => {
  const [activeTab, setActiveTab] = useState<'progress' | 'plans'>('progress');
  const [topics, setTopics] = useState<Topic[]>([]);
  const [plans, setPlans] = useState<LessonPlan[]>([]);
  const [loading, setLoading] = useState(false);
  const [showPlanModal, setShowPlanModal] = useState(false);
  
  // New Plan Form
  const [newPlan, setNewPlan] = useState({
    weekStartDate: '',
    title: '',
    content: '',
    termId: '' // This needs to be fetched or passed
  });
  const [terms, setTerms] = useState<{id: string, name: string}[]>([]);

  useEffect(() => {
    if (classId && subjectId) {
      if (activeTab === 'progress') fetchProgress();
      else fetchPlans();
    }
  }, [classId, subjectId, activeTab]);

  useEffect(() => {
    fetchTerms();
  }, []);

  const fetchTerms = async () => {
    try {
      const response = await api.get('/academic-terms');
      setTerms(response.data);
      const activeTerm = response.data.find((t: any) => t.isActive);
      if (activeTerm) {
        setNewPlan(prev => ({ ...prev, termId: activeTerm.id }));
      }
    } catch (error) {
      console.error('Error fetching terms:', error);
    }
  };

  const fetchProgress = async () => {
    setLoading(true);
    try {
      const response = await api.get(`/syllabus/progress?classId=${classId}&subjectId=${subjectId}`);
      setTopics(response.data);
    } catch (error) {
      console.error('Error fetching progress:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchPlans = async () => {
    setLoading(true);
    try {
      const response = await api.get(`/syllabus/lesson-plans?classId=${classId}&subjectId=${subjectId}`);
      setPlans(response.data);
    } catch (error) {
      console.error('Error fetching plans:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusUpdate = async (topicId: string, newStatus: string) => {
    try {
      await api.put(`/syllabus/progress/${topicId}/${classId}`, { status: newStatus });
      fetchProgress();
    } catch (error) {
      console.error('Error updating status:', error);
    }
  };

  const handleCreatePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/syllabus/lesson-plans', {
        ...newPlan,
        classId,
        subjectId,
        weekStartDate: new Date(newPlan.weekStartDate).toISOString()
      });
      setShowPlanModal(false);
      setNewPlan(prev => ({ ...prev, title: '', content: '' }));
      fetchPlans();
    } catch (error) {
      console.error('Error creating plan:', error);
      alert('Failed to create lesson plan');
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      {/* Tabs */}
      <div className="border-b border-gray-200 flex">
        <button
          onClick={() => setActiveTab('progress')}
          className={`flex-1 sm:flex-none px-4 sm:px-6 py-3 text-sm font-medium transition-colors text-center ${
            activeTab === 'progress' 
              ? 'border-b-2 border-blue-600 text-blue-600 bg-blue-50/50' 
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Progress
        </button>
        <button
          onClick={() => setActiveTab('plans')}
          className={`flex-1 sm:flex-none px-4 sm:px-6 py-3 text-sm font-medium transition-colors text-center ${
            activeTab === 'plans' 
              ? 'border-b-2 border-blue-600 text-blue-600 bg-blue-50/50' 
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Lesson Plans
        </button>
      </div>

      <div className="p-4 sm:p-6">
        {activeTab === 'progress' ? (
          <div className="space-y-3 sm:space-y-4">
            {loading ? (
              <div className="text-center text-gray-500 py-8">Loading progress...</div>
            ) : topics.length === 0 ? (
              <div className="text-center text-gray-500 py-8">No topics defined for this subject.</div>
            ) : (
              topics.map((topic) => (
                <div key={topic.id} className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 p-3 sm:p-4 bg-gray-50 rounded-lg border border-gray-100">
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-gray-900 text-sm sm:text-base">{topic.title}</h4>
                    {topic.description && (
                      <p className="text-xs sm:text-sm text-gray-500 mt-1 line-clamp-2">{topic.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 sm:gap-2 self-end sm:self-auto">
                    <button
                      onClick={() => handleStatusUpdate(topic.id, 'PENDING')}
                      className={`p-2 sm:p-1.5 rounded-full transition-colors ${
                        topic.status === 'PENDING' ? 'bg-gray-200 text-gray-600' : 'text-gray-300 hover:bg-gray-100'
                      }`}
                      title="Pending"
                    >
                      <Circle size={18} />
                    </button>
                    <button
                      onClick={() => handleStatusUpdate(topic.id, 'IN_PROGRESS')}
                      className={`p-2 sm:p-1.5 rounded-full transition-colors ${
                        topic.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-600' : 'text-gray-300 hover:bg-gray-100'
                      }`}
                      title="In Progress"
                    >
                      <Clock size={18} />
                    </button>
                    <button
                      onClick={() => handleStatusUpdate(topic.id, 'COMPLETED')}
                      className={`p-2 sm:p-1.5 rounded-full transition-colors ${
                        topic.status === 'COMPLETED' ? 'bg-green-100 text-green-600' : 'text-gray-300 hover:bg-gray-100'
                      }`}
                      title="Completed"
                    >
                      <CheckCircle size={18} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          <div>
            <div className="flex justify-end mb-4">
              <button
                onClick={() => setShowPlanModal(true)}
                className="w-full sm:w-auto bg-blue-600 text-white px-4 py-3 sm:py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 active:scale-98"
              >
                <Plus size={18} />
                Add Lesson Plan
              </button>
            </div>

            <div className="space-y-3 sm:space-y-4">
              {loading ? (
                <div className="text-center text-gray-500 py-8">Loading plans...</div>
              ) : plans.length === 0 ? (
                <div className="text-center text-gray-500 py-8">No lesson plans found.</div>
              ) : (
                plans.map((plan) => (
                  <div key={plan.id} className="p-3 sm:p-4 bg-white border border-gray-200 rounded-lg hover:shadow-sm transition-shadow">
                    <div className="flex flex-col sm:flex-row justify-between items-start gap-2 mb-2">
                      <div className="flex-1 min-w-0">
                        <h4 className="font-bold text-gray-900 text-sm sm:text-base">{plan.title}</h4>
                        <p className="text-xs text-gray-500 flex items-center gap-1 mt-1">
                          <Calendar size={12} />
                          Week of {new Date(plan.weekStartDate).toLocaleDateString()}
                        </p>
                      </div>
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
                        {plan.teacher.fullName}
                      </span>
                    </div>
                    <p className="text-xs sm:text-sm text-gray-600 whitespace-pre-wrap">{plan.content}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Add Plan Modal - Mobile Optimized */}
      {showPlanModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-xl p-5 sm:p-6 w-full sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg sm:text-xl font-bold mb-4">Add Lesson Plan</h2>
            <form onSubmit={handleCreatePlan} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Week Start Date</label>
                <input
                  type="date"
                  required
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 text-base"
                  value={newPlan.weekStartDate}
                  onChange={(e) => setNewPlan({ ...newPlan, weekStartDate: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                <input
                  type="text"
                  required
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 text-base"
                  value={newPlan.title}
                  onChange={(e) => setNewPlan({ ...newPlan, title: e.target.value })}
                  placeholder="e.g. Week 3: Quadratic Equations"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Content</label>
                <textarea
                  required
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 text-base"
                  rows={5}
                  value={newPlan.content}
                  onChange={(e) => setNewPlan({ ...newPlan, content: e.target.value })}
                  placeholder="Detail your lesson plan here..."
                />
              </div>
              <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 mt-6 pt-4 border-t border-gray-100">
                <button 
                  type="button"
                  onClick={() => setShowPlanModal(false)}
                  className="w-full sm:w-auto px-4 py-3 sm:py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="w-full sm:w-auto px-4 py-3 sm:py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 active:scale-98"
                >
                  Save Plan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClassSyllabus;
