import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../utils/api';
import { Plus, Search, Filter, Edit2, Trash2, Eye, X, ChevronRight } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface Student {
  id: string;
  firstName: string;
  lastName: string;
  admissionNumber: string;
  dateOfBirth: string;
  gender: string;
  classId: string;
  class: { name: string };
  guardianName: string;
  guardianPhone: string;
  address?: string;
  status: string;
}

interface Class { id: string; name: string; }

const Students = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [classes, setClasses] = useState<Class[]>([]);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  
  // BURSAR can only view students, not create/edit/delete
  const canManageStudents = user?.role !== 'BURSAR';
  
  const [formData, setFormData] = useState({
    firstName: '', lastName: '', admissionNumber: '', dateOfBirth: '',
    gender: 'MALE', guardianName: '', guardianPhone: '', address: '', classId: '', status: 'ACTIVE'
  });

  useEffect(() => { fetchStudents(); fetchClasses(); }, []);

  const fetchStudents = async () => {
    try { const response = await api.get('/students'); setStudents(response.data); }
    catch (error) { console.error('Failed to fetch students', error); }
    finally { setLoading(false); }
  };

  const fetchClasses = async () => {
    try { const response = await api.get('/classes'); setClasses(response.data); }
    catch (error) { console.error('Failed to fetch classes', error); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingStudent) { await api.put(`/students/${editingStudent.id}`, formData); }
      else { await api.post('/students', formData); }
      fetchStudents(); setShowModal(false); resetForm();
    } catch (error) { console.error('Failed to save student', error); alert('Failed to save student'); }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Delete this student?')) {
      try { await api.delete(`/students/${id}`); fetchStudents(); }
      catch (error) { console.error('Failed to delete student', error); }
    }
  };

  const openEditModal = (student: Student) => {
    setEditingStudent(student);
    setFormData({
      firstName: student.firstName, lastName: student.lastName,
      admissionNumber: student.admissionNumber,
      dateOfBirth: new Date(student.dateOfBirth).toISOString().split('T')[0],
      gender: student.gender, guardianName: student.guardianName,
      guardianPhone: student.guardianPhone, address: student.address || '',
      classId: student.classId, status: student.status
    });
    setShowModal(true);
  };

  const resetForm = () => {
    setFormData({
      firstName: '', lastName: '', admissionNumber: '', dateOfBirth: '',
      gender: 'MALE', guardianName: '', guardianPhone: '', address: '', classId: '', status: 'ACTIVE'
    });
    setEditingStudent(null);
  };

  const filteredStudents = students.filter(student => 
    student.firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    student.lastName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    student.admissionNumber.includes(searchTerm)
  );

  return (
    <div className="space-y-4">
      {/* Header - Desktop only */}
      <div className="hidden lg:flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Students</h1>
          <p className="text-gray-500">{canManageStudents ? 'Manage student records and admissions' : 'View student records'}</p>
        </div>
        {canManageStudents && (
          <button onClick={() => { resetForm(); setShowModal(true); }}
            className="flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors">
            <Plus size={20} />
            <span>Add Student</span>
          </button>
        )}
      </div>

      {/* Search Bar */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input type="text" placeholder="Search students..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
          </div>
          <button className="p-2.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">
            <Filter size={18} />
          </button>
        </div>
      </div>

      {/* Student Count */}
      <div className="flex items-center justify-between px-1">
        <p className="text-sm text-gray-500">{filteredStudents.length} students</p>
      </div>

      {/* Mobile List View */}
      <div className="lg:hidden space-y-2">
        {loading ? (
          <div className="bg-white rounded-xl p-8 text-center text-gray-500">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
            Loading...
          </div>
        ) : filteredStudents.length === 0 ? (
          <div className="bg-white rounded-xl p-8 text-center text-gray-500">No students found</div>
        ) : (
          filteredStudents.map((student) => (
            <div key={student.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden touch-card"
              onClick={() => navigate(`/students/${student.id}`)}>
              <div className="p-4 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-semibold">
                    {student.firstName.charAt(0)}{student.lastName.charAt(0)}
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{student.firstName} {student.lastName}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-gray-500 font-mono">{student.admissionNumber}</span>
                      <span className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded">{student.class?.name}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center">
                  <span className={`status-badge mr-2 ${student.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                    {student.status}
                  </span>
                  <ChevronRight size={20} className="text-gray-400" />
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Desktop Table View */}
      <div className="hidden lg:block bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-gray-600">
            <thead className="bg-gray-50 text-gray-700 font-medium">
              <tr>
                <th className="px-6 py-3">Student</th>
                <th className="px-6 py-3">Admission #</th>
                <th className="px-6 py-3">Class</th>
                <th className="px-6 py-3">Guardian</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-500">Loading...</td></tr>
              ) : filteredStudents.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-500">No students found</td></tr>
              ) : (
                filteredStudents.map((student) => (
                  <tr key={student.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-semibold text-sm">
                          {student.firstName.charAt(0)}{student.lastName.charAt(0)}
                        </div>
                        <span className="font-medium text-gray-900">{student.firstName} {student.lastName}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 font-mono text-xs text-gray-500">{student.admissionNumber}</td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-1 bg-gray-100 rounded text-xs font-medium">{student.class?.name || 'Unassigned'}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div>
                        <p className="text-gray-900">{student.guardianName}</p>
                        <p className="text-xs text-gray-400">{student.guardianPhone}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`status-badge ${student.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                        {student.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end space-x-1">
                        <button onClick={() => navigate(`/students/${student.id}`)} className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"><Eye size={18} /></button>
                        {canManageStudents && (
                          <>
                            <button onClick={(e) => { e.stopPropagation(); openEditModal(student); }} className="p-2 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg"><Edit2 size={18} /></button>
                            {user?.role === 'SUPER_ADMIN' && (
                              <button onClick={(e) => { e.stopPropagation(); handleDelete(student.id); }} className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg"><Trash2 size={18} /></button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Floating Action Button - Mobile (only for users who can manage students) */}
      {canManageStudents && (
        <button onClick={() => { resetForm(); setShowModal(true); }} className="fab">
          <Plus size={24} />
        </button>
      )}

      {/* Modal - Full screen on mobile */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 lg:flex lg:items-center lg:justify-center z-50">
          <div className="mobile-modal lg:relative lg:w-full lg:max-w-2xl lg:max-h-[90vh] lg:rounded-xl lg:m-4">
            {/* Modal Header */}
            <div className="mobile-modal-header lg:rounded-t-xl">
              <button onClick={() => setShowModal(false)} className="p-2 -ml-2 text-gray-500 lg:hidden">
                <X size={24} />
              </button>
              <h2 className="text-lg font-semibold flex-1 text-center lg:text-left">{editingStudent ? 'Edit Student' : 'New Student'}</h2>
              <button onClick={() => setShowModal(false)} className="hidden lg:block text-gray-400 hover:text-gray-600">
                <X size={24} />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
                  <input type="text" required value={formData.firstName} onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                    className="w-full px-3 py-3 lg:py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
                  <input type="text" required value={formData.lastName} onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                    className="w-full px-3 py-3 lg:py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Admission Number</label>
                  <input type="text" required value={formData.admissionNumber} onChange={(e) => setFormData({ ...formData, admissionNumber: e.target.value })}
                    className="w-full px-3 py-3 lg:py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date of Birth</label>
                  <input type="date" required value={formData.dateOfBirth} onChange={(e) => setFormData({ ...formData, dateOfBirth: e.target.value })}
                    className="w-full px-3 py-3 lg:py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Gender</label>
                  <select value={formData.gender} onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                    className="w-full px-3 py-3 lg:py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white">
                    <option value="MALE">Male</option>
                    <option value="FEMALE">Female</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Class</label>
                  <select required value={formData.classId} onChange={(e) => setFormData({ ...formData, classId: e.target.value })}
                    className="w-full px-3 py-3 lg:py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white">
                    <option value="">Select class</option>
                    {classes.map(cls => <option key={cls.id} value={cls.id}>{cls.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Guardian Name</label>
                  <input type="text" required value={formData.guardianName} onChange={(e) => setFormData({ ...formData, guardianName: e.target.value })}
                    className="w-full px-3 py-3 lg:py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Guardian Phone</label>
                  <input type="tel" required value={formData.guardianPhone} onChange={(e) => setFormData({ ...formData, guardianPhone: e.target.value })}
                    className="w-full px-3 py-3 lg:py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                  <textarea value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    className="w-full px-3 py-3 lg:py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" rows={2} />
                </div>
                {editingStudent && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                    <select value={formData.status} onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                      className="w-full px-3 py-3 lg:py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white">
                      <option value="ACTIVE">Active</option>
                      <option value="TRANSFERRED">Transferred</option>
                      <option value="GRADUATED">Graduated</option>
                      <option value="DROPPED_OUT">Dropped Out</option>
                    </select>
                  </div>
                )}
              </div>

              {/* Submit Button - Fixed at bottom on mobile */}
              <div className="sticky bottom-0 bg-white pt-4 pb-safe border-t border-gray-100 -mx-4 px-4 mt-6 lg:relative lg:border-0 lg:pt-2 lg:pb-0">
                <button type="submit" className="w-full py-3 lg:py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 touch-btn">
                  {editingStudent ? 'Update Student' : 'Add Student'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Students;
