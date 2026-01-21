import React, { useState, useEffect } from 'react';
import { BookOpen, CheckCircle, Circle, Plus, FileText, Calendar, ChevronRight, ChevronDown } from 'lucide-react';
import api from '../../utils/api';
import { useAuth } from '../../context/AuthContext';

interface Class {
  id: string;
  name: string;
  gradeLevel: number;
}

interface Subject {
  id: string;
  name: string;
  code: string;
}

interface Topic {
  id: string;
  title: string;
  description: string;
  gradeLevel: number;
  orderIndex: number;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';
  completedAt: string | null;
}

interface LessonPlan {
  id: string;
  weekStartDate: string;
  title: string;
  content: string;
  fileUrl: string | null;
  teacher: {
    fullName: string;
  };
}

interface AcademicTerm {
  id: string;
  name: string;
}

const LessonPlanner = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'SYLLABUS' | 'PLANS'>('SYLLABUS');
  
  // Selection State
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('');
  
  // Data State
  const [classes, setClasses] = useState<Class[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [lessonPlans, setLessonPlans] = useState<LessonPlan[]>([]);
  const [currentTerm, setCurrentTerm] = useState<AcademicTerm | null>(null);
  
  const [loading, setLoading] = useState(false);
  const [showAddPlanModal, setShowAddPlanModal] = useState(false);
  const [showAddTopicModal, setShowAddTopicModal] = useState(false);

  // Form State
  const [newPlan, setNewPlan] = useState({
    weekStartDate: new Date().toISOString().split('T')[0],
    title: '',
    content: '',
    fileUrl: ''
  });

  const [newTopic, setNewTopic] = useState({
    title: '',
    description: '',
    orderIndex: 0
  });

  useEffect(() => {
    fetchInitialData();
  }, []);

  useEffect(() => {
    if (selectedClassId && selectedSubjectId) {
      if (activeTab === 'SYLLABUS') {
        fetchSyllabusProgress();
      } else {
        fetchLessonPlans();
      }
    }
  }, [selectedClassId, selectedSubjectId, activeTab]);

  const fetchInitialData = async () => {
    try {
      const [classesRes, subjectsRes, termsRes] = await Promise.all([
        api.get('/classes'),
        api.get('/subjects'),
        api.get('/academic-terms')
      ]);
      
      setClasses(classesRes.data);
      setSubjects(subjectsRes.data);
      
      const activeTerm = termsRes.data.find((t: any) => t.isActive) || termsRes.data[0];
      setCurrentTerm(activeTerm);

      if (classesRes.data.length > 0) setSelectedClassId(classesRes.data[0].id);
      if (subjectsRes.data.length > 0) setSelectedSubjectId(subjectsRes.data[0].id);
    } catch (error) {
      console.error('Error fetching initial data:', error);
    }
  };

  const fetchSyllabusProgress = async () => {
    setLoading(true);
    try {
      const response = await api.get(`/syllabus/progress?classId=${selectedClassId}&subjectId=${selectedSubjectId}`);
      setTopics(response.data);
    } catch (error) {
      console.error('Error fetching syllabus:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchLessonPlans = async () => {
    setLoading(true);
    try {
      const response = await api.get(`/syllabus/lesson-plans?classId=${selectedClassId}&subjectId=${selectedSubjectId}`);
      setLessonPlans(response.data);
    } catch (error) {
      console.error('Error fetching lesson plans:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (topicId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'COMPLETED' ? 'PENDING' : 'COMPLETED';
    try {
      await api.put(`/syllabus/progress/${topicId}/${selectedClassId}`, { status: newStatus });
      
      // Optimistic update
      setTopics(topics.map(t => 
        t.id === topicId ? { ...t, status: newStatus as any, completedAt: newStatus === 'COMPLETED' ? new Date().toISOString() : null } : t
      ));
    } catch (error) {
      console.error('Error updating status:', error);
      fetchSyllabusProgress(); // Revert on error
    }
  };

  const handleAddPlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentTerm) return;

    try {
      await api.post('/syllabus/lesson-plans', {
        ...newPlan,
        classId: selectedClassId,
        subjectId: selectedSubjectId,
        termId: currentTerm.id
      });
      
      setShowAddPlanModal(false);
      setNewPlan({
        weekStartDate: new Date().toISOString().split('T')[0],
        title: '',
        content: '',
        fileUrl: ''
      });
      fetchLessonPlans();
    } catch (error) {
      console.error('Error adding lesson plan:', error);
    }
  };

  const handleAddTopic = async (e: React.FormEvent) => {
    e.preventDefault();
    const selectedClass = classes.find(c => c.id === selectedClassId);
    if (!selectedClass) return;

    try {
      await api.post('/syllabus/topics', {
        ...newTopic,
        subjectId: selectedSubjectId,
        gradeLevel: selectedClass.gradeLevel
      });
      
      setShowAddTopicModal(false);
      setNewTopic({ title: '', description: '', orderIndex: 0 });
      fetchSyllabusProgress();
    } catch (error) {
      console.error('Error adding topic:', error);
    }
  };

  return (
    <div className="p-4 md:p-6 pb-24 md:pb-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white flex items-center gap-2">
            <BookOpen className="text-blue-600" />
            Lesson Planner
          </h1>
          <p className="text-gray-500 dark:text-gray-400">Manage syllabus coverage and lesson plans</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <select
            value={selectedClassId}
            onChange={(e) => setSelectedClassId(e.target.value)}
            className="px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-slate-700 dark:text-white"
          >
            {classes.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

          <select
            value={selectedSubjectId}
            onChange={(e) => setSelectedSubjectId(e.target.value)}
            className="px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-slate-700 dark:text-white"
          >
            {subjects.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 dark:border-slate-700 mb-6">
        <button
          onClick={() => setActiveTab('SYLLABUS')}
          className={`px-6 py-3 font-medium text-sm transition-colors relative ${
            activeTab === 'SYLLABUS' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          Syllabus Tracker
          {activeTab === 'SYLLABUS' && (
            <div className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600" />
          )}
        </button>
        <button
          onClick={() => setActiveTab('PLANS')}
          className={`px-6 py-3 font-medium text-sm transition-colors relative ${
            activeTab === 'PLANS' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          Lesson Plans
          {activeTab === 'PLANS' && (
            <div className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600" />
          )}
        </button>
      </div>

      {/* Content */}
      {activeTab === 'SYLLABUS' ? (
        <div className="space-y-4">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-white">Topics & Progress</h2>
            <button
              onClick={() => setShowAddTopicModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus size={18} />
              Add Topic
            </button>
          </div>

          {loading ? (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">Loading syllabus...</div>
          ) : topics.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 dark:bg-slate-800 rounded-xl border border-dashed border-gray-300 dark:border-slate-600">
              <p className="text-gray-500 dark:text-gray-400">No topics found for this subject/grade.</p>
              <button 
                onClick={() => setShowAddTopicModal(true)}
                className="mt-2 text-blue-600 font-medium hover:underline"
              >
                Add your first topic
              </button>
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 divide-y divide-gray-100 dark:divide-slate-700">
              {topics.map((topic) => (
                <div key={topic.id} className="p-4 flex items-start gap-4 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors">
                  <button
                    onClick={() => handleStatusChange(topic.id, topic.status)}
                    className={`mt-1 flex-shrink-0 transition-colors ${
                      topic.status === 'COMPLETED' ? 'text-green-500' : 'text-gray-300 hover:text-gray-400'
                    }`}
                  >
                    {topic.status === 'COMPLETED' ? <CheckCircle size={24} /> : <Circle size={24} />}
                  </button>
                  <div className="flex-1">
                    <div className="flex justify-between items-start">
                      <h3 className={`font-medium ${topic.status === 'COMPLETED' ? 'text-gray-500 dark:text-gray-400 line-through' : 'text-gray-900 dark:text-white'}`}>
                        {topic.title}
                      </h3>
                      {topic.completedAt && (
                        <span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded-full">
                          Completed {new Date(topic.completedAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                    {topic.description && (
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{topic.description}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-white">Weekly Lesson Plans</h2>
            <button
              onClick={() => setShowAddPlanModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus size={18} />
              Create Plan
            </button>
          </div>

          {loading ? (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">Loading plans...</div>
          ) : lessonPlans.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 dark:bg-slate-800 rounded-xl border border-dashed border-gray-300 dark:border-slate-600">
              <p className="text-gray-500 dark:text-gray-400">No lesson plans found.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {lessonPlans.map((plan) => (
                <div key={plan.id} className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 hover:shadow-md transition-shadow">
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-2 text-blue-600 bg-blue-50 px-3 py-1 rounded-full text-sm font-medium">
                      <Calendar size={16} />
                      Week of {new Date(plan.weekStartDate).toLocaleDateString()}
                    </div>
                  </div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">{plan.title}</h3>
                  <p className="text-gray-600 dark:text-gray-400 text-sm mb-4 line-clamp-3">{plan.content}</p>
                  <div className="flex justify-between items-center pt-4 border-t border-gray-100 dark:border-slate-700">
                    <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                      <FileText size={16} />
                      {plan.teacher.fullName}
                    </div>
                    <button className="text-blue-600 hover:text-blue-700 text-sm font-medium">
                      View Details
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Add Topic Modal */}
      {showAddTopicModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4 dark:text-white">Add New Topic</h2>
            <form onSubmit={handleAddTopic} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Topic Title</label>
                <input
                  type="text"
                  required
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-slate-700 dark:text-white"
                  value={newTopic.title}
                  onChange={(e) => setNewTopic({ ...newTopic, title: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
                <textarea
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-slate-700 dark:text-white"
                  rows={3}
                  value={newTopic.description}
                  onChange={(e) => setNewTopic({ ...newTopic, description: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Order Index</label>
                <input
                  type="number"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-slate-700 dark:text-white"
                  value={newTopic.orderIndex}
                  onChange={(e) => setNewTopic({ ...newTopic, orderIndex: parseInt(e.target.value) })}
                />
              </div>
              <div className="flex justify-end space-x-3 mt-6">
                <button 
                  type="button"
                  onClick={() => setShowAddTopicModal(false)}
                  className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Add Topic
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Plan Modal */}
      {showAddPlanModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 w-full max-w-lg">
            <h2 className="text-xl font-bold mb-4 dark:text-white">Create Lesson Plan</h2>
            <form onSubmit={handleAddPlan} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Week Start Date</label>
                <input
                  type="date"
                  required
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-slate-700 dark:text-white"
                  value={newPlan.weekStartDate}
                  onChange={(e) => setNewPlan({ ...newPlan, weekStartDate: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Introduction to Algebra"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-slate-700 dark:text-white"
                  value={newPlan.title}
                  onChange={(e) => setNewPlan({ ...newPlan, title: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Content / Objectives</label>
                <textarea
                  required
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-slate-700 dark:text-white"
                  rows={6}
                  placeholder="Outline the lesson objectives and activities..."
                  value={newPlan.content}
                  onChange={(e) => setNewPlan({ ...newPlan, content: e.target.value })}
                />
              </div>
              <div className="flex justify-end space-x-3 mt-6">
                <button 
                  type="button"
                  onClick={() => setShowAddPlanModal(false)}
                  className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Create Plan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default LessonPlanner;
