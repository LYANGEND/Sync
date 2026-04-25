import React, { useEffect, useState } from 'react';
import api from '../../utils/api';
import { Plus, Search, Trash2, Edit2, BookOpen, Users, FileText, Upload } from 'lucide-react';
import ClassSyllabus from '../../components/academics/ClassSyllabus';
import BulkImportModal from '../../components/BulkImportModal';
import { useAppDialog } from '../../components/ui/AppDialogProvider';

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
  if (grade === -2) return 'Baby Class';
  if (grade === -1) return 'Middle Class';
  if (grade === 0) return 'Reception';
  if (grade >= 1 && grade <= 7) return `Grade ${grade}`;
  if (grade === 8) return 'Form 1';
  if (grade === 9) return 'Form 2';
  if (grade === 10) return 'Form 3';
  if (grade === 11) return 'Form 4';
  return `Grade ${grade}`;
};

// Subject codes appropriate for each grade level (Zambian curriculum)
const ECE_CODES = ['ECE-LIT','ECE-NUM','ECE-ENV','ECE-CA','ECE-PHY','ECE-LANG','ECE-LA','ECE-LL','ECE-MA','ECE-MATH','ECE-RE','ECE-REL','ECE-PCA','ECE-ART','ECE-EA'];
const PRIMARY_LOWER_CODES = ['ENG','MATH','SCI','SST','CA','PE','RE','COMP','ZAM_LANG'];
const PRIMARY_UPPER_CODES = ['ENG','MATH','SCI','SST','CA','PE','RE','COMP','ZAM_LANG','HOME_ECO','CTS','TECH_ST'];
const FORM_1_2_CODES = ['ENG','MATH','INT_SCI','SOC_ST','COMP','PE','RE','CIVIC','ZAM_LANG','BIO','CHEM','PHYS','GEOG','HIST','HOME_ECO','AGRI_SCI','ART_DES','MUSIC','FRENCH','LIT_ENG','ICT','CTS','FASH_FAB','FOOD_NUT'];
const FORM_3_4_CODES = ['ENG','MATH','COMP','PE','RE','CIVIC','BIO','CHEM','PHYS','ADD_MATH','GEOG','HIST','HOME_ECO','AGRI_SCI','ART_DES','MUSIC','FRENCH','LIT_ENG','ICT','INT_SCI','SOC_ST','COMM','DES_TECH','TRAV_TOUR','FASH_FAB','FOOD_NUT','HOSP_MGT','ZAM_LANG','EXP_ARTS'];

function getSubjectCodesForGrade(gradeLevel: number): string[] {
  if (gradeLevel <= 0) return ECE_CODES;
  if (gradeLevel <= 4) return PRIMARY_LOWER_CODES;
  if (gradeLevel <= 7) return PRIMARY_UPPER_CODES;
  if (gradeLevel <= 9) return FORM_1_2_CODES;
  return FORM_3_4_CODES;
}

// All available grade level options
const GRADE_OPTIONS = [
  { value: -2, label: 'Baby Class' },
  { value: -1, label: 'Middle Class' },
  { value: 0, label: 'Reception' },
  { value: 1, label: 'Grade 1' },
  { value: 2, label: 'Grade 2' },
  { value: 3, label: 'Grade 3' },
  { value: 4, label: 'Grade 4' },
  { value: 5, label: 'Grade 5' },
  { value: 6, label: 'Grade 6' },
  { value: 7, label: 'Grade 7' },
  { value: 8, label: 'Form 1' },
  { value: 9, label: 'Form 2' },
  { value: 10, label: 'Form 3' },
  { value: 11, label: 'Form 4' },
];

const Classes = () => {
  const { confirm } = useAppDialog();
  const [classes, setClasses] = useState<Class[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingClass, setEditingClass] = useState<Class | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);

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
    if (await confirm({
      title: 'Delete class?',
      message: 'Are you sure you want to delete this class?',
      confirmText: 'Delete class',
    })) {
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
    <div className="p-4 md:p-6 pb-24 md:pb-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-white">Class Sections</h2>
        <div className="flex space-x-3">
          <button
            onClick={() => setShowImportModal(true)}
            className="flex items-center space-x-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors"
          >
            <Upload size={20} />
            <span>Import Classes</span>
          </button>
          <button
            onClick={openAddModal}
            className="flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus size={20} />
            <span>Add Class</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <p className="text-gray-500 dark:text-gray-400">Loading classes...</p>
        </div>
      ) : filteredClasses.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-gray-400 dark:text-gray-500 mb-2">No classes defined. Create one to start adding students.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredClasses.map((cls) => (
            <div key={cls.id} className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 p-6 hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">{cls.name}</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{getGradeLabel(cls.gradeLevel)} • {cls._count.students} Students</p>
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
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-2 flex items-center">
                  <BookOpen size={16} className="mr-2" />
                  Subjects ({cls.subjects.length})
                </p>
                <div className="flex flex-wrap gap-2">
                  {cls.subjects.map(subject => (
                    <span key={subject.id} className="px-2 py-1 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs rounded-md font-medium border border-blue-100 dark:border-blue-800">
                      {subject.name}
                    </span>
                  ))}
                  {cls.subjects.length === 0 && (
                    <span className="text-xs text-gray-400 dark:text-gray-500 italic">No subjects assigned</span>
                  )}
                </div>
              </div>

              <div className="pt-4 border-t border-gray-100 dark:border-slate-700 flex justify-between items-center text-sm">
                <span className="text-gray-500 dark:text-gray-400">Teacher:</span>
                <span className="font-medium text-gray-900 dark:text-white">{cls.teacher?.fullName || 'Unassigned'}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {showSyllabusModal && syllabusClass && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto">
          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 w-full max-w-5xl my-8 h-[90vh] flex flex-col">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-xl font-bold dark:text-white">Class Syllabus & Lesson Plans</h2>
                <p className="text-gray-500 dark:text-gray-400 text-sm">Class: {syllabusClass.name}</p>
              </div>
              <button onClick={() => setShowSyllabusModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <span className="text-2xl">&times;</span>
              </button>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Select Subject</label>
              <select
                value={syllabusSubjectId}
                onChange={(e) => setSyllabusSubjectId(e.target.value)}
                className="w-full md:w-1/3 px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-slate-700 dark:text-white"
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
                <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                  Please select a subject to view syllabus and lesson plans.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showStudentModal && managingClass && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto">
          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 w-full max-w-4xl my-8 h-[80vh] flex flex-col">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-xl font-bold dark:text-white">Manage Students</h2>
                <p className="text-gray-500 dark:text-gray-400 text-sm">Class: {managingClass.name}</p>
              </div>
              <button onClick={() => setShowStudentModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <span className="text-2xl">&times;</span>
              </button>
            </div>

            <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-6 overflow-hidden">
              {/* Current Students */}
              <div className="flex flex-col border dark:border-slate-700 rounded-lg overflow-hidden">
                <div className="bg-gray-50 dark:bg-slate-700 p-3 border-b dark:border-slate-600 font-medium text-gray-700 dark:text-gray-200">
                  Current Students ({classStudents.length})
                </div>
                <div className="flex-1 overflow-y-auto p-3 space-y-2 pb-safe">
                  {classStudents.length === 0 ? (
                    <p className="text-gray-400 dark:text-gray-500 text-center py-4">No students in this class</p>
                  ) : (
                    classStudents.map(student => (
                      <div key={student.id} className="flex justify-between items-center p-2 bg-white dark:bg-slate-800 border dark:border-slate-700 rounded hover:bg-gray-50 dark:hover:bg-slate-700">
                        <div>
                          <p className="font-medium dark:text-white">{student.firstName} {student.lastName}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{student.admissionNumber}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Add Students */}
              <div className="flex flex-col border dark:border-slate-700 rounded-lg overflow-hidden">
                <div className="bg-gray-50 dark:bg-slate-700 p-3 border-b dark:border-slate-600 font-medium text-gray-700 dark:text-gray-200 flex justify-between items-center">
                  <span>Add Students</span>
                  <button
                    onClick={handleAddStudents}
                    disabled={selectedStudentIds.length === 0}
                    className={`text-xs px-3 py-1 rounded ${selectedStudentIds.length > 0
                      ? 'bg-blue-600 text-white hover:bg-blue-700'
                      : 'bg-gray-200 dark:bg-slate-600 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                      }`}
                  >
                    Add Selected ({selectedStudentIds.length})
                  </button>
                </div>
                <div className="p-2 border-b dark:border-slate-600">
                  <div className="relative">
                    <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search students..."
                      value={studentSearchTerm}
                      onChange={(e) => setStudentSearchTerm(e.target.value)}
                      className="w-full pl-9 pr-3 py-1.5 text-sm border border-gray-200 dark:border-slate-600 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white dark:bg-slate-700 dark:text-white"
                    />
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-3 space-y-2 pb-safe">
                  {availableStudents.length === 0 ? (
                    <p className="text-gray-400 dark:text-gray-500 text-center py-4">No students found</p>
                  ) : (
                    availableStudents.map(student => (
                      <label key={student.id} className="flex items-center space-x-3 p-2 bg-white dark:bg-slate-800 border dark:border-slate-700 rounded hover:bg-gray-50 dark:hover:bg-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedStudentIds.includes(student.id)}
                          onChange={() => toggleStudentSelection(student.id)}
                          className="rounded text-blue-600 focus:ring-blue-500"
                        />
                        <div>
                          <p className="font-medium dark:text-white">{student.firstName} {student.lastName}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
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
          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 w-full max-w-2xl my-8 max-h-[90vh] overflow-y-auto pb-safe">
            <h2 className="text-xl font-bold mb-4 dark:text-white">{editingClass ? 'Edit Class' : 'Add Class'}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Class Name</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-slate-700 dark:text-white"
                    placeholder="e.g. Grade 10A"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Grade Level</label>
                  <select
                    required
                    value={formData.gradeLevel}
                    onChange={(e) => {
                      const gl = parseInt(e.target.value);
                      // Auto-select recommended subjects for this grade level
                      const codes = getSubjectCodesForGrade(gl);
                      const recommended = subjects.filter(s => codes.includes(s.code)).map(s => s.id);
                      setFormData({ ...formData, gradeLevel: gl, subjectIds: recommended });
                    }}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-slate-700 dark:text-white"
                  >
                    <option value="">Select Grade</option>
                    {GRADE_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Teacher</label>
                  <select
                    required
                    value={formData.teacherId}
                    onChange={(e) => setFormData({ ...formData, teacherId: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-slate-700 dark:text-white"
                  >
                    <option value="">Select a teacher</option>
                    {teachers.map(teacher => (
                      <option key={teacher.id} value={teacher.id}>{teacher.fullName}</option>
                    ))}
                  </select>
                  {teachers.length === 0 && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                      No teachers found. Ensure teachers are added in the system.
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Academic Term</label>
                  <select
                    required
                    value={formData.academicTermId}
                    onChange={(e) => setFormData({ ...formData, academicTermId: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-slate-700 dark:text-white"
                  >
                    <option value="">Select a term</option>
                    {terms.map(term => (
                      <option key={term.id} value={term.id}>{term.name}</option>
                    ))}
                  </select>
                  {terms.length === 0 && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                      No academic terms found. Please create a term first.
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-6">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Assign Subjects
                  <span className="ml-2 text-xs font-normal text-gray-400 dark:text-gray-500">
                    ({formData.subjectIds.length} selected — showing subjects for {getGradeLabel(formData.gradeLevel)})
                  </span>
                </label>
                {(() => {
                  const codes = getSubjectCodesForGrade(formData.gradeLevel);
                  const recommended = subjects.filter(s => codes.includes(s.code));
                  const others = subjects.filter(s => !codes.includes(s.code));
                  return (
                    <>
                      {/* Recommended subjects for this grade */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-48 overflow-y-auto p-2 border border-gray-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700">
                        {recommended.length === 0 && (
                          <p className="col-span-full text-sm text-gray-400 italic py-2">Select a grade level first</p>
                        )}
                        {recommended.map(subject => (
                          <label key={subject.id} className="flex items-center space-x-2 p-2 hover:bg-gray-50 dark:hover:bg-slate-600 rounded cursor-pointer">
                            <input
                              type="checkbox"
                              checked={formData.subjectIds.includes(subject.id)}
                              onChange={() => toggleSubject(subject.id)}
                              className="rounded text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-sm text-gray-700 dark:text-gray-200">{subject.name}</span>
                          </label>
                        ))}
                      </div>

                      {/* Other subjects (collapsed by default) */}
                      {others.length > 0 && (
                        <details className="mt-2">
                          <summary className="text-xs text-gray-400 dark:text-gray-500 cursor-pointer hover:text-gray-600 dark:hover:text-gray-300">
                            Show other subjects ({others.length})
                          </summary>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-40 overflow-y-auto p-2 mt-1 border border-dashed border-gray-200 dark:border-slate-600 rounded-lg bg-gray-50 dark:bg-slate-800">
                            {others.map(subject => (
                              <label key={subject.id} className="flex items-center space-x-2 p-2 hover:bg-white dark:hover:bg-slate-700 rounded cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={formData.subjectIds.includes(subject.id)}
                                  onChange={() => toggleSubject(subject.id)}
                                  className="rounded text-gray-400 focus:ring-gray-400"
                                />
                                <span className="text-sm text-gray-500 dark:text-gray-400">{subject.name}</span>
                              </label>
                            ))}
                          </div>
                        </details>
                      )}
                    </>
                  );
                })()}
              </div>

              <div className="flex justify-end space-x-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg"
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

      <BulkImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        entityName="Classes"
        apiEndpoint="/api/v1/classes/bulk"
        templateFields={['name', 'gradeLevel']}
        onSuccess={fetchClasses}
        instructions={[
          'Upload a CSV file with class details.',
          'Required columns: name, gradeLevel.',
          'Grade level should be a number (-2 for Baby Class, -1 for Middle, 0 for Nursery, 1-12 for grades).',
        ]}
      />
    </div>
  );
};

export default Classes;
