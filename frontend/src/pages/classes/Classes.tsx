import React, { useEffect, useState } from 'react';
import api from '../../utils/api';
import { Plus, Search, Trash2, Edit2, BookOpen, Users, FileText } from 'lucide-react';
import ClassSyllabus from '../../components/academics/ClassSyllabus';

interface Subject {
  id: string;
  name: string;
  code: string;
}

interface Class {
  id: string;
  name: string;
  gradeLevel: number;
  teacherId: string;
  academicTermId: string;
  subjects: Subject[];
  teacher: {
    fullName: string;
  };
  _count: {
    students: number;
  };
}

interface Student {
  id: string;
  firstName: string;
  lastName: string;
  admissionNumber: string;
  classId: string;
}

const getGradeLabel = (grade: number) => {
  if (grade === 0) return 'Nursery';
  return `Grade ${grade}`;
};

const Classes = () => {
  const [classes, setClasses] = useState<Class[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingClass, setEditingClass] = useState<Class | null>(null);

  // Student Management
  const [showStudentModal, setShowStudentModal] = useState(false);
  const [managingClass, setManagingClass] = useState<Class | null>(null);
  const [classStudents, setClassStudents] = useState<Student[]>([]);
  const [allStudents, setAllStudents] = useState<Student[]>([]);
  const [studentSearchTerm, setStudentSearchTerm] = useState('');
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);

  // Syllabus Management
  const [showSyllabusModal, setShowSyllabusModal] = useState(false);
  const [syllabusClass, setSyllabusClass] = useState<Class | null>(null);
  const [syllabusSubjectId, setSyllabusSubjectId] = useState<string>('');

  // Form Data
  const [formData, setFormData] = useState({
    name: '',
    gradeLevel: 1,
    teacherId: '',
    academicTermId: '',
    subjectIds: [] as string[],
  });

  const [teachers, setTeachers] = useState<{ id: string, fullName: string }[]>([]);
  const [terms, setTerms] = useState<{ id: string, name: string }[]>([]);

  useEffect(() => {
    fetchClasses();
    fetchSubjects();
    fetchTeachers();
    fetchTerms();
  }, []);

  const fetchClasses = async () => {
    try {
      const response = await api.get('/classes');
      setClasses(response.data);
    } catch (error) {
      console.error('Failed to fetch classes', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchSubjects = async () => {
    try {
      const response = await api.get('/subjects');
      setSubjects(response.data);
    } catch (error) {
      console.error('Failed to fetch subjects', error);
    }
  };

  const fetchTeachers = async () => {
    try {
      const response = await api.get('/users/teachers');
      console.log('Teachers fetched:', response.data);
      setTeachers(response.data);
    } catch (error) {
      console.error('Failed to fetch teachers', error);
    }
  };

  const fetchTerms = async () => {
    try {
      const response = await api.get('/academic-terms');
      console.log('Terms fetched:', response.data);
      setTerms(response.data);
    } catch (error) {
      console.error('Failed to fetch terms', error);
    }
  };

  const fetchClassStudents = async (classId: string) => {
    try {
      const response = await api.get(`/classes/${classId}/students`);
      setClassStudents(response.data);
    } catch (error) {
      console.error('Failed to fetch class students', error);
    }
  };

  const fetchAllStudents = async () => {
    try {
      const response = await api.get('/students');
      setAllStudents(response.data);
    } catch (error) {
      console.error('Failed to fetch all students', error);
    }
  };

  const openStudentModal = async (cls: Class) => {
    setManagingClass(cls);
    await fetchClassStudents(cls.id);
    await fetchAllStudents();
    setSelectedStudentIds([]);
    setShowStudentModal(true);
  };

  const openSyllabusModal = (cls: Class) => {
    setSyllabusClass(cls);
    if (cls.subjects.length > 0) {
      setSyllabusSubjectId(cls.subjects[0].id);
    } else {
      setSyllabusSubjectId('');
    }
    setShowSyllabusModal(true);
  };

  const handleAddStudents = async () => {
    if (!managingClass || selectedStudentIds.length === 0) return;

    try {
      await api.post(`/classes/${managingClass.id}/students`, {
        studentIds: selectedStudentIds
      });
      await fetchClassStudents(managingClass.id);
      await fetchClasses(); // Update counts
      setSelectedStudentIds([]);
      alert('Students added successfully');
    } catch (error) {
      console.error('Failed to add students', error);
      alert('Failed to add students');
    }
  };

  const toggleStudentSelection = (studentId: string) => {
    setSelectedStudentIds(prev =>
      prev.includes(studentId)
        ? prev.filter(id => id !== studentId)
        : [...prev, studentId]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // For demo purposes, we need valid teacherId and academicTermId
      // If the form is empty, we might fail. 
      // In a real scenario, we'd have dropdowns populated from API.

      const payload = {
        ...formData,
        gradeLevel: Number(formData.gradeLevel),
      };

      if (editingClass) {
        await api.put(`/classes/${editingClass.id}`, payload);
      } else {
        await api.post('/classes', payload);
      }
      fetchClasses();
      setShowModal(false);
      resetForm();
    } catch (error) {
      console.error('Failed to save class', error);
      alert('Failed to save class. Ensure Teacher ID and Term ID are valid UUIDs.');
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this class?')) {
      try {
        await api.delete(`/classes/${id}`);
        fetchClasses();
      } catch (error) {
        console.error('Failed to delete class', error);
      }
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      gradeLevel: 1,
      teacherId: '',
      academicTermId: '',
      subjectIds: [],
    });
    setEditingClass(null);
  };

  const openEditModal = (cls: Class) => {
    setEditingClass(cls);
    setFormData({
      name: cls.name,
      gradeLevel: cls.gradeLevel,
      teacherId: cls.teacherId,
      academicTermId: cls.academicTermId,
      subjectIds: cls.subjects.map(s => s.id),
    });
    setShowModal(true);
  };

  const openAddModal = () => {
    resetForm();
    // Pre-fill with some dummy UUIDs if we don't have a UI to select them yet
    // This is a limitation of not having the full UI built out for Teachers/Terms
    setShowModal(true);
  };

  const toggleSubject = (subjectId: string) => {
    setFormData(prev => {
      const currentIds = prev.subjectIds;
      if (currentIds.includes(subjectId)) {
        return { ...prev, subjectIds: currentIds.filter(id => id !== subjectId) };
      } else {
        return { ...prev, subjectIds: [...currentIds, subjectId] };
      }
    });
  };

  const filteredClasses = classes.filter(cls =>
    cls.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const availableStudents = allStudents.filter(s =>
    s.classId !== managingClass?.id &&
    (s.firstName.toLowerCase().includes(studentSearchTerm.toLowerCase()) ||
      s.lastName.toLowerCase().includes(studentSearchTerm.toLowerCase()) ||
      s.admissionNumber.includes(studentSearchTerm))
  );

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-8">
        <h2 className="text-lg font-semibold text-gray-800">Class Sections</h2>
        <button
          onClick={openAddModal}
          className="flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus size={20} />
          <span>Add Class</span>
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <p className="text-gray-500">Loading classes...</p>
        </div>
      ) : filteredClasses.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-gray-400 mb-2">No classes defined. Create one to start adding students.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredClasses.map((cls) => (
            <div key={cls.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-lg font-bold text-gray-900">{cls.name}</h3>
                  <p className="text-sm text-gray-500">{getGradeLabel(cls.gradeLevel)} • {cls._count.students} Students</p>
                </div>
                <div className="flex space-x-2">
                  <button onClick={() => openSyllabusModal(cls)} className="text-gray-400 hover:text-purple-600" title="Syllabus & Plans">
                    <FileText size={18} />
                  </button>
                  <button onClick={() => openStudentModal(cls)} className="text-gray-400 hover:text-green-600" title="Manage Students">
                    <Users size={18} />
                  </button>
                  <button onClick={() => openEditModal(cls)} className="text-gray-400 hover:text-blue-600">
                    <Edit2 size={18} />
                  </button>
                  <button onClick={() => handleDelete(cls.id)} className="text-gray-400 hover:text-red-600">
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>

              <div className="mb-4">
                <p className="text-sm text-gray-600 mb-2 flex items-center">
                  <BookOpen size={16} className="mr-2" />
                  Subjects ({cls.subjects.length})
                </p>
                <div className="flex flex-wrap gap-2">
                  {cls.subjects.map(subject => (
                    <span key={subject.id} className="px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded-md font-medium border border-blue-100">
                      {subject.name}
                    </span>
                  ))}
                  {cls.subjects.length === 0 && (
                    <span className="text-xs text-gray-400 italic">No subjects assigned</span>
                  )}
                </div>
              </div>

              <div className="pt-4 border-t border-gray-100 flex justify-between items-center text-sm">
                <span className="text-gray-500">Teacher:</span>
                <span className="font-medium text-gray-900">{cls.teacher?.fullName || 'Unassigned'}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {showSyllabusModal && syllabusClass && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto">
          <div className="bg-white rounded-xl p-6 w-full max-w-5xl my-8 h-[90vh] flex flex-col">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-xl font-bold">Class Syllabus & Lesson Plans</h2>
                <p className="text-gray-500 text-sm">Class: {syllabusClass.name}</p>
              </div>
              <button onClick={() => setShowSyllabusModal(false)} className="text-gray-400 hover:text-gray-600">
                <span className="text-2xl">&times;</span>
              </button>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">Select Subject</label>
              <select
                value={syllabusSubjectId}
                onChange={(e) => setSyllabusSubjectId(e.target.value)}
                className="w-full md:w-1/3 px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
              >
                {syllabusClass.subjects.length === 0 && <option value="">No subjects assigned</option>}
                {syllabusClass.subjects.map(subject => (
                  <option key={subject.id} value={subject.id}>{subject.name}</option>
                ))}
              </select>
            </div>

            <div className="flex-1 overflow-y-auto pb-safe">
              {syllabusSubjectId ? (
                <ClassSyllabus classId={syllabusClass.id} subjectId={syllabusSubjectId} />
              ) : (
                <div className="text-center py-12 text-gray-500">
                  Please select a subject to view syllabus and lesson plans.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showStudentModal && managingClass && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto">
          <div className="bg-white rounded-xl p-6 w-full max-w-4xl my-8 h-[80vh] flex flex-col">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-xl font-bold">Manage Students</h2>
                <p className="text-gray-500 text-sm">Class: {managingClass.name}</p>
              </div>
              <button onClick={() => setShowStudentModal(false)} className="text-gray-400 hover:text-gray-600">
                <span className="text-2xl">&times;</span>
              </button>
            </div>

            <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-6 overflow-hidden">
              {/* Current Students */}
              <div className="flex flex-col border rounded-lg overflow-hidden">
                <div className="bg-gray-50 p-3 border-b font-medium text-gray-700">
                  Current Students ({classStudents.length})
                </div>
                <div className="flex-1 overflow-y-auto p-3 space-y-2 pb-safe">
                  {classStudents.length === 0 ? (
                    <p className="text-gray-400 text-center py-4">No students in this class</p>
                  ) : (
                    classStudents.map(student => (
                      <div key={student.id} className="flex justify-between items-center p-2 bg-white border rounded hover:bg-gray-50">
                        <div>
                          <p className="font-medium">{student.firstName} {student.lastName}</p>
                          <p className="text-xs text-gray-500">{student.admissionNumber}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Add Students */}
              <div className="flex flex-col border rounded-lg overflow-hidden">
                <div className="bg-gray-50 p-3 border-b font-medium text-gray-700 flex justify-between items-center">
                  <span>Add Students</span>
                  <button
                    onClick={handleAddStudents}
                    disabled={selectedStudentIds.length === 0}
                    className={`text-xs px-3 py-1 rounded ${selectedStudentIds.length > 0
                      ? 'bg-blue-600 text-white hover:bg-blue-700'
                      : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      }`}
                  >
                    Add Selected ({selectedStudentIds.length})
                  </button>
                </div>
                <div className="p-2 border-b">
                  <div className="relative">
                    <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search students..."
                      value={studentSearchTerm}
                      onChange={(e) => setStudentSearchTerm(e.target.value)}
                      className="w-full pl-9 pr-3 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-3 space-y-2 pb-safe">
                  {availableStudents.length === 0 ? (
                    <p className="text-gray-400 text-center py-4">No students found</p>
                  ) : (
                    availableStudents.map(student => (
                      <label key={student.id} className="flex items-center space-x-3 p-2 bg-white border rounded hover:bg-gray-50 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedStudentIds.includes(student.id)}
                          onChange={() => toggleStudentSelection(student.id)}
                          className="rounded text-blue-600 focus:ring-blue-500"
                        />
                        <div>
                          <p className="font-medium">{student.firstName} {student.lastName}</p>
                          <p className="text-xs text-gray-500">
                            {student.admissionNumber} • Current Class: {allStudents.find(s => s.id === student.id)?.classId === student.classId ? 'Other' : 'None'}
                          </p>
                        </div>
                      </label>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto pb-safe">
          <div className="bg-white rounded-xl p-6 w-full max-w-2xl my-8 max-h-[90vh] overflow-y-auto pb-safe">
            <h2 className="text-xl font-bold mb-4">{editingClass ? 'Edit Class' : 'Add Class'}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Class Name</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                    placeholder="e.g. Grade 10A"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Grade Level</label>
                  <select
                    required
                    value={formData.gradeLevel}
                    onChange={(e) => setFormData({ ...formData, gradeLevel: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 bg-white"
                  >
                    <option value="">Select Grade</option>
                    <option value="0">Nursery</option>
                    {[...Array(12)].map((_, i) => (
                      <option key={i + 1} value={i + 1}>Grade {i + 1}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Teacher</label>
                  <select
                    required
                    value={formData.teacherId}
                    onChange={(e) => setFormData({ ...formData, teacherId: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 bg-white"
                  >
                    <option value="">Select a teacher</option>
                    {teachers.map(teacher => (
                      <option key={teacher.id} value={teacher.id}>{teacher.fullName}</option>
                    ))}
                  </select>
                  {teachers.length === 0 && (
                    <p className="text-xs text-amber-600 mt-1">
                      No teachers found. Ensure teachers are added in the system.
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Academic Term</label>
                  <select
                    required
                    value={formData.academicTermId}
                    onChange={(e) => setFormData({ ...formData, academicTermId: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 bg-white"
                  >
                    <option value="">Select a term</option>
                    {terms.map(term => (
                      <option key={term.id} value={term.id}>{term.name}</option>
                    ))}
                  </select>
                  {terms.length === 0 && (
                    <p className="text-xs text-amber-600 mt-1">
                      No academic terms found. Please create a term first.
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">Assign Subjects</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-60 overflow-y-auto p-2 border border-gray-200 rounded-lg">
                  {subjects.map(subject => (
                    <label key={subject.id} className="flex items-center space-x-2 p-2 hover:bg-gray-50 rounded cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.subjectIds.includes(subject.id)}
                        onChange={() => toggleSubject(subject.id)}
                        className="rounded text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700">{subject.name}</span>
                    </label>
                  ))}
                </div>
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
                  {editingClass ? 'Update Class' : 'Create Class'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Classes;
