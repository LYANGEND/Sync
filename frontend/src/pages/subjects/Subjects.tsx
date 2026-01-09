import React, { useEffect, useState } from 'react';
import api from '../../utils/api';
import { Plus, Search, Trash2, Edit2, BookOpen, List, Upload } from 'lucide-react';
import SyllabusDefinition from '../../components/academics/SyllabusDefinition';
import BulkImportModal from '../../components/BulkImportModal';

interface Subject {
  id: string;
  name: string;
  code: string;
  teacherId?: string;
  teacher?: {
    id: string;
    fullName: string;
  };
}

interface Teacher {
  id: string;
  fullName: string;
}

const Subjects = () => {
  const [activeTab, setActiveTab] = useState<'list' | 'syllabus'>('list');
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null);
  const [formData, setFormData] = useState({ name: '', code: '', teacherId: '' });
  const [showImportModal, setShowImportModal] = useState(false);

  useEffect(() => {
    fetchSubjects();
    fetchTeachers();
  }, []);

  const fetchSubjects = async () => {
    try {
      const response = await api.get('/subjects');
      setSubjects(response.data);
    } catch (error) {
      console.error('Failed to fetch subjects', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTeachers = async () => {
    try {
      const response = await api.get('/users?role=TEACHER');
      setTeachers(response.data);
    } catch (error) {
      console.error('Failed to fetch teachers', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingSubject) {
        await api.put(`/subjects/${editingSubject.id}`, formData);
      } else {
        await api.post('/subjects', formData);
      }
      fetchSubjects();
      setShowModal(false);
      setFormData({ name: '', code: '', teacherId: '' });
      setEditingSubject(null);
    } catch (error) {
      console.error('Failed to save subject', error);
      alert('Failed to save subject');
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this subject?')) {
      try {
        await api.delete(`/subjects/${id}`);
        fetchSubjects();
      } catch (error) {
        console.error('Failed to delete subject', error);
      }
    }
  };

  const openEditModal = (subject: Subject) => {
    setEditingSubject(subject);
    setFormData({ name: subject.name, code: subject.code, teacherId: subject.teacherId || '' });
    setShowModal(true);
  };

  const openAddModal = () => {
    setEditingSubject(null);
    setFormData({ name: '', code: '', teacherId: '' });
    setShowModal(true);
  };

  const filteredSubjects = subjects.filter(subject =>
    subject.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    subject.code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-lg font-semibold text-gray-800">Subjects Management</h2>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 mb-6">
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setActiveTab('list')}
            className={`flex items-center gap-2 px-6 py-4 text-sm font-medium transition-colors ${activeTab === 'list'
              ? 'border-b-2 border-blue-600 text-blue-600'
              : 'text-gray-500 hover:text-gray-700'
              }`}
          >
            <List size={18} />
            Subject List
          </button>
          <button
            onClick={() => setActiveTab('syllabus')}
            className={`flex items-center gap-2 px-6 py-4 text-sm font-medium transition-colors ${activeTab === 'syllabus'
              ? 'border-b-2 border-blue-600 text-blue-600'
              : 'text-gray-500 hover:text-gray-700'
              }`}
          >
            <BookOpen size={18} />
            Syllabus Definition
          </button>
        </div>

        {activeTab === 'list' ? (
          <div className="p-6">
            <div className="flex justify-between items-center mb-6">
              <div className="relative flex-1 max-w-md">
                <Search size={20} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search subjects..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div className="flex space-x-3">
                <button
                  onClick={() => setShowImportModal(true)}
                  className="flex items-center space-x-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors"
                >
                  <Upload size={20} />
                  <span>Import Subjects</span>
                </button>
                <button
                  onClick={openAddModal}
                  className="flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <Plus size={20} />
                  <span>Add Subject</span>
                </button>
              </div>
            </div>

            <div className="overflow-x-auto border border-gray-100 rounded-lg">
              <table className="w-full text-left text-sm text-gray-600">
                <thead className="bg-gray-50 text-gray-700 font-medium">
                  <tr>
                    <th className="px-6 py-3">Code</th>
                    <th className="px-6 py-3">Name</th>
                    <th className="px-6 py-3">Teacher</th>
                    <th className="px-6 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {loading ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-8 text-center text-gray-500">Loading subjects...</td>
                    </tr>
                  ) : filteredSubjects.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-8 text-center text-gray-500">No subjects found</td>
                    </tr>
                  ) : (
                    filteredSubjects.map((subject) => (
                      <tr key={subject.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 font-mono text-xs text-gray-500">{subject.code}</td>
                        <td className="px-6 py-4 font-medium text-gray-900">{subject.name}</td>
                        <td className="px-6 py-4 text-gray-600">
                          {subject.teacher?.fullName || <span className="text-gray-400 italic">Not assigned</span>}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end space-x-2">
                            <button
                              onClick={() => openEditModal(subject)}
                              className="text-blue-600 hover:text-blue-800 p-1"
                            >
                              <Edit2 size={18} />
                            </button>
                            <button
                              onClick={() => handleDelete(subject.id)}
                              className="text-red-600 hover:text-red-800 p-1"
                            >
                              <Trash2 size={18} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="p-6">
            <SyllabusDefinition />
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">{editingSubject ? 'Edit Subject' : 'Add Subject'}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Subject Name</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                  placeholder="e.g. Mathematics"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Subject Code</label>
                <input
                  type="text"
                  required
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                  placeholder="e.g. MATH101"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Assign Teacher (Optional)</label>
                <select
                  value={formData.teacherId}
                  onChange={(e) => setFormData({ ...formData, teacherId: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">-- Select Teacher --</option>
                  {teachers.map(teacher => (
                    <option key={teacher.id} value={teacher.id}>{teacher.fullName}</option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end space-x-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  {editingSubject ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <BulkImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        entityName="Subjects"
        apiEndpoint="/api/v1/subjects/bulk"
        templateFields={['name', 'code']}
        onSuccess={fetchSubjects}
        instructions={[
          'Upload a CSV file with subject details.',
          'Required columns: name, code.',
          'Code should be a unique identifier (e.g., MATH, ENG, SCI).',
        ]}
      />
    </div>
  );
};

export default Subjects;
