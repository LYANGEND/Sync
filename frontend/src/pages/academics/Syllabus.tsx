import React, { useState, useEffect } from 'react';
import { BookOpen, Plus, Trash2, CheckCircle, Circle, Clock, GraduationCap, Layout } from 'lucide-react';
import api from '../../utils/api';
import ClassSyllabus from '../../components/academics/ClassSyllabus';

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
}

interface Class {
  id: string;
  name: string;
  gradeLevel: number;
}

const Syllabus = () => {
  const [activeTab, setActiveTab] = useState<'definition' | 'class-view'>('definition');
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  
  // Definition Mode State
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('');
  const [selectedGrade, setSelectedGrade] = useState<number>(1);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);

  // Class View Mode State
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [viewSubjectId, setViewSubjectId] = useState<string>('');

  const [newTopic, setNewTopic] = useState({
    title: '',
    description: '',
    orderIndex: 0
  });

  useEffect(() => {
    fetchSubjects();
    fetchClasses();
  }, []);

  useEffect(() => {
    if (activeTab === 'definition' && selectedSubjectId && selectedGrade) {
      fetchTopics();
    } else {
      setTopics([]);
    }
  }, [selectedSubjectId, selectedGrade, activeTab]);

  const fetchSubjects = async () => {
    try {
      const response = await api.get('/subjects');
      setSubjects(response.data);
      if (response.data.length > 0) {
        setSelectedSubjectId(response.data[0].id);
        setViewSubjectId(response.data[0].id);
      }
    } catch (error) {
      console.error('Error fetching subjects:', error);
    }
  };

  const fetchClasses = async () => {
    try {
      const response = await api.get('/classes');
      setClasses(response.data);
      if (response.data.length > 0) {
        setSelectedClassId(response.data[0].id);
      }
    } catch (error) {
      console.error('Error fetching classes:', error);
    }
  };

  const fetchTopics = async () => {
    setLoading(true);
    try {
      const response = await api.get(`/syllabus/topics?subjectId=${selectedSubjectId}&gradeLevel=${selectedGrade}`);
      setTopics(response.data);
    } catch (error) {
      console.error('Error fetching topics:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddTopic = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/syllabus/topics', {
        ...newTopic,
        subjectId: selectedSubjectId,
        gradeLevel: selectedGrade,
        orderIndex: Number(newTopic.orderIndex)
      });
      setShowAddModal(false);
      setNewTopic({ title: '', description: '', orderIndex: topics.length + 1 });
      fetchTopics();
    } catch (error) {
      console.error('Error adding topic:', error);
      alert('Failed to add topic');
    }
  };

  const handleDeleteTopic = async (id: string) => {
    if (!confirm('Are you sure you want to delete this topic?')) return;
    try {
      await api.delete(`/syllabus/topics/${id}`);
      fetchTopics();
    } catch (error) {
      console.error('Error deleting topic:', error);
    }
  };

  return (
    <div className="p-4 md:p-6 pb-24 md:pb-6 max-w-5xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Syllabus & Lesson Plans</h1>
          <p className="text-gray-500 dark:text-gray-400">Manage curriculum, track progress, and plan lessons</p>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 mb-6">
        <div className="flex border-b border-gray-200 dark:border-slate-700">
          <button
            onClick={() => setActiveTab('definition')}
            className={`flex items-center gap-2 px-6 py-4 text-sm font-medium transition-colors ${
              activeTab === 'definition'
                ? 'border-b-2 border-blue-600 text-blue-600 dark:text-blue-400'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <BookOpen size={18} />
            Curriculum Definition
          </button>
          <button
            onClick={() => setActiveTab('class-view')}
            className={`flex items-center gap-2 px-6 py-4 text-sm font-medium transition-colors ${
              activeTab === 'class-view'
                ? 'border-b-2 border-blue-600 text-blue-600 dark:text-blue-400'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <Layout size={18} />
            Class Progress & Plans
          </button>
        </div>

        <div className="p-6">
          {activeTab === 'definition' ? (
            <>
              <div className="flex justify-between items-center mb-6">
                <div className="flex gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Subject</label>
                    <select
                      value={selectedSubjectId}
                      onChange={(e) => setSelectedSubjectId(e.target.value)}
                      className="px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 min-w-[200px] bg-white dark:bg-slate-700 dark:text-white"
                    >
                      {subjects.map(s => (
                        <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Grade Level</label>
                    <select
                      value={selectedGrade}
                      onChange={(e) => setSelectedGrade(Number(e.target.value))}
                      className="px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 min-w-[120px] bg-white dark:bg-slate-700 dark:text-white"
                    >
                      {[...Array(12)].map((_, i) => (
                        <option key={i + 1} value={i + 1}>Grade {i + 1}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <button
                  onClick={() => setShowAddModal(true)}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
                  disabled={!selectedSubjectId}
                >
                  <Plus size={20} />
                  Add Topic
                </button>
              </div>

              <div className="bg-gray-50 dark:bg-slate-700 rounded-lg border border-gray-200 dark:border-slate-600 overflow-hidden">
                <div className="p-4 border-b border-gray-200 dark:border-slate-600 font-medium text-gray-700 dark:text-gray-300">
                  Topics List
                </div>
                {loading ? (
                  <div className="p-8 text-center text-gray-500 dark:text-gray-400">Loading topics...</div>
                ) : topics.length === 0 ? (
                  <div className="p-8 text-center text-gray-500 dark:text-gray-400">No topics defined for this subject and grade.</div>
                ) : (
                  <div className="divide-y divide-gray-200 dark:divide-slate-600">
                    {topics.map((topic) => (
                      <div key={topic.id} className="p-4 hover:bg-white dark:hover:bg-slate-600 transition-colors flex justify-between items-start group">
                        <div>
                          <h3 className="font-medium text-gray-900 dark:text-white">{topic.title}</h3>
                          {topic.description && (
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{topic.description}</p>
                          )}
                        </div>
                        <button
                          onClick={() => handleDeleteTopic(topic.id)}
                          className="text-gray-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="space-y-6">
              <div className="flex gap-4 bg-gray-50 dark:bg-slate-700 p-4 rounded-lg border border-gray-200 dark:border-slate-600">
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Class</label>
                  <select
                    value={selectedClassId}
                    onChange={(e) => setSelectedClassId(e.target.value)}
                    className="px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 min-w-[200px] bg-white dark:bg-slate-700 dark:text-white"
                  >
                    {classes.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Subject</label>
                  <select
                    value={viewSubjectId}
                    onChange={(e) => setViewSubjectId(e.target.value)}
                    className="px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 min-w-[200px] bg-white dark:bg-slate-700 dark:text-white"
                  >
                    {subjects.map(s => (
                      <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                    ))}
                  </select>
                </div>
              </div>

              {selectedClassId && viewSubjectId ? (
                <ClassSyllabus classId={selectedClassId} subjectId={viewSubjectId} />
              ) : (
                <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                  Please select a class and subject to view progress and lesson plans.
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {showAddModal && (
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
                  placeholder="e.g. Introduction to Algebra"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
                <textarea
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-slate-700 dark:text-white"
                  rows={3}
                  value={newTopic.description}
                  onChange={(e) => setNewTopic({ ...newTopic, description: e.target.value })}
                  placeholder="Brief description of what this topic covers..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Order Index</label>
                <input
                  type="number"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-slate-700 dark:text-white"
                  value={newTopic.orderIndex}
                  onChange={(e) => setNewTopic({ ...newTopic, orderIndex: Number(e.target.value) })}
                />
              </div>
              <div className="flex justify-end space-x-3 mt-6">
                <button 
                  type="button"
                  onClick={() => setShowAddModal(false)}
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
    </div>
  );
};

export default Syllabus;
