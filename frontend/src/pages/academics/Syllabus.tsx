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
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4 sm:mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-800">Syllabus & Lesson Plans</h1>
          <p className="text-sm sm:text-base text-gray-500">Manage curriculum and track progress</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 mb-4 sm:mb-6">
        {/* Mobile Tab Buttons */}
        <div className="flex border-b border-gray-200 overflow-x-auto">
          <button
            onClick={() => setActiveTab('definition')}
            className={`flex items-center gap-2 px-4 sm:px-6 py-3 sm:py-4 text-sm font-medium transition-colors whitespace-nowrap flex-1 sm:flex-none justify-center sm:justify-start ${
              activeTab === 'definition'
                ? 'border-b-2 border-blue-600 text-blue-600 bg-blue-50/50'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <BookOpen size={18} />
            <span className="hidden sm:inline">Curriculum</span>
            <span className="sm:hidden">Curriculum</span>
          </button>
          <button
            onClick={() => setActiveTab('class-view')}
            className={`flex items-center gap-2 px-4 sm:px-6 py-3 sm:py-4 text-sm font-medium transition-colors whitespace-nowrap flex-1 sm:flex-none justify-center sm:justify-start ${
              activeTab === 'class-view'
                ? 'border-b-2 border-blue-600 text-blue-600 bg-blue-50/50'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Layout size={18} />
            <span className="hidden sm:inline">Class Progress</span>
            <span className="sm:hidden">Progress</span>
          </button>
        </div>

        <div className="p-4 sm:p-6">
          {activeTab === 'definition' ? (
            <>
              {/* Filters and Add Button */}
              <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-end gap-4 mb-4 sm:mb-6">
                <div className="grid grid-cols-2 gap-3 sm:flex sm:gap-4">
                  <div className="col-span-1">
                    <label className="block text-xs font-medium text-gray-500 mb-1">Subject</label>
                    <select
                      value={selectedSubjectId}
                      onChange={(e) => setSelectedSubjectId(e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-base sm:min-w-[180px]"
                    >
                      {subjects.map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-1">
                    <label className="block text-xs font-medium text-gray-500 mb-1">Grade</label>
                    <select
                      value={selectedGrade}
                      onChange={(e) => setSelectedGrade(Number(e.target.value))}
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-base sm:min-w-[100px]"
                    >
                      {[...Array(12)].map((_, i) => (
                        <option key={i + 1} value={i + 1}>Grade {i + 1}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <button
                  onClick={() => setShowAddModal(true)}
                  className="w-full sm:w-auto bg-blue-600 text-white px-4 py-3 sm:py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 active:scale-98"
                  disabled={!selectedSubjectId}
                >
                  <Plus size={20} />
                  Add Topic
                </button>
              </div>

              {/* Topics List */}
              <div className="bg-gray-50 rounded-lg border border-gray-200 overflow-hidden">
                <div className="p-3 sm:p-4 border-b border-gray-200 font-medium text-gray-700 text-sm sm:text-base">
                  Topics List
                </div>
                {loading ? (
                  <div className="p-8 text-center text-gray-500">Loading topics...</div>
                ) : topics.length === 0 ? (
                  <div className="p-8 text-center text-gray-500 text-sm sm:text-base">No topics defined for this subject and grade.</div>
                ) : (
                  <div className="divide-y divide-gray-200">
                    {topics.map((topic) => (
                      <div key={topic.id} className="p-3 sm:p-4 hover:bg-white transition-colors flex justify-between items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-medium text-gray-900 text-sm sm:text-base">{topic.title}</h3>
                          {topic.description && (
                            <p className="text-xs sm:text-sm text-gray-500 mt-1 line-clamp-2">{topic.description}</p>
                          )}
                        </div>
                        <button
                          onClick={() => handleDeleteTopic(topic.id)}
                          className="text-gray-400 hover:text-red-600 p-2 -m-2 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
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
            <div className="space-y-4 sm:space-y-6">
              {/* Class View Filters */}
              <div className="grid grid-cols-2 gap-3 sm:flex sm:gap-4 bg-gray-50 p-3 sm:p-4 rounded-lg border border-gray-200">
                <div className="col-span-1">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Class</label>
                  <select
                    value={selectedClassId}
                    onChange={(e) => setSelectedClassId(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-base sm:min-w-[180px]"
                  >
                    {classes.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div className="col-span-1">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Subject</label>
                  <select
                    value={viewSubjectId}
                    onChange={(e) => setViewSubjectId(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-base sm:min-w-[180px]"
                  >
                    {subjects.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {selectedClassId && viewSubjectId ? (
                <ClassSyllabus classId={selectedClassId} subjectId={viewSubjectId} />
              ) : (
                <div className="text-center py-12 text-gray-500 text-sm sm:text-base">
                  Please select a class and subject to view progress.
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Add Topic Modal - Mobile Optimized */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-xl p-5 sm:p-6 w-full sm:max-w-md max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg sm:text-xl font-bold mb-4">Add New Topic</h2>
            <form onSubmit={handleAddTopic} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Topic Title</label>
                <input
                  type="text"
                  required
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 text-base"
                  value={newTopic.title}
                  onChange={(e) => setNewTopic({ ...newTopic, title: e.target.value })}
                  placeholder="e.g. Introduction to Algebra"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 text-base"
                  rows={3}
                  value={newTopic.description}
                  onChange={(e) => setNewTopic({ ...newTopic, description: e.target.value })}
                  placeholder="Brief description..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Order Index</label>
                <input
                  type="number"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 text-base"
                  value={newTopic.orderIndex}
                  onChange={(e) => setNewTopic({ ...newTopic, orderIndex: Number(e.target.value) })}
                />
              </div>
              <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 mt-6 pt-4 border-t border-gray-100">
                <button 
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="w-full sm:w-auto px-4 py-3 sm:py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="w-full sm:w-auto px-4 py-3 sm:py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 active:scale-98"
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
