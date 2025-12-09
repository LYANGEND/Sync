import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../utils/api';
import { Plus, Search, Filter, MoreVertical, Edit2, Trash2, Eye, Upload, Download, X, CheckSquare, Square } from 'lucide-react';

interface Student {
  id: string;
  firstName: string;
  lastName: string;
  admissionNumber: string;
  dateOfBirth: string;
  gender: string;
  classId: string;
  class: {
    name: string;
  };
  guardianName: string;
  guardianPhone: string;
  guardianEmail?: string;
  address?: string;
  status: string;
}

interface Class {
  id: string;
  name: string;
}

const Students = () => {
  const navigate = useNavigate();
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [classes, setClasses] = useState<Class[]>([]);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<any[]>([]);
  const [isImporting, setIsImporting] = useState(false);

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    admissionNumber: '',
    dateOfBirth: '',
    gender: 'MALE',
    guardianName: '',
    guardianPhone: '',
    guardianEmail: '',
    address: '',
    classId: '',
    status: 'ACTIVE'
  });

  useEffect(() => {
    fetchStudents();
    fetchClasses();
  }, []);

  const fetchStudents = async () => {
    try {
      const response = await api.get('/students');
      setStudents(response.data);
    } catch (error) {
      console.error('Failed to fetch students', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchClasses = async () => {
    try {
      const response = await api.get('/classes');
      setClasses(response.data);
    } catch (error) {
      console.error('Failed to fetch classes', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingStudent) {
        await api.put(`/students/${editingStudent.id}`, formData);
      } else {
        await api.post('/students', formData);
      }
      fetchStudents();
      setShowModal(false);
      resetForm();
    } catch (error) {
      console.error('Failed to save student', error);
      alert('Failed to save student');
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this student?')) {
      try {
        await api.delete(`/students/${id}`);
        fetchStudents();
      } catch (error) {
        console.error('Failed to delete student', error);
      }
    }
  };

  const openEditModal = (student: Student) => {
    setEditingStudent(student);
    setFormData({
      firstName: student.firstName,
      lastName: student.lastName,
      admissionNumber: student.admissionNumber,
      dateOfBirth: new Date(student.dateOfBirth).toISOString().split('T')[0],
      gender: student.gender,
      guardianName: student.guardianName,
      guardianPhone: student.guardianPhone,
      guardianEmail: student.guardianEmail || '',
      address: student.address || '',
      classId: student.classId,
      status: student.status
    });
    setShowModal(true);
  };

  const openAddModal = () => {
    resetForm();
    setShowModal(true);
  };

  const resetForm = () => {
    setFormData({
      firstName: '',
      lastName: '',
      admissionNumber: '',
      dateOfBirth: '',
      gender: 'MALE',
      guardianName: '',
      guardianPhone: '',
      guardianEmail: '',
      address: '',
      classId: '',
      status: 'ACTIVE'
    });
    setEditingStudent(null);
  };

  const toggleSelection = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const toggleAll = () => {
    if (selectedIds.length === filteredStudents.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredStudents.map(s => s.id));
    }
  };

  const handleBulkDelete = async () => {
    if (!window.confirm(`Are you sure you want to delete ${selectedIds.length} students? This action cannot be undone.`)) return;

    try {
      await api.post('/students/bulk-delete', { ids: selectedIds });
      setSelectedIds([]);
      fetchStudents();
    } catch (error) {
      console.error('Failed to delete students', error);
      alert('Failed to delete selected students');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setImportFile(file);

      // Simple CSV Parse
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        const lines = text.split('\n');
        const headers = lines[0].split(',').map(h => h.trim());

        const data = lines.slice(1).filter(l => l.trim()).map(line => {
          const values = line.split(',');
          const obj: any = {};
          headers.forEach((h, i) => {
            obj[h] = values[i]?.trim();
          });
          return obj;
        });
        setImportPreview(data);
      };
      reader.readAsText(file);
    }
  };

  const handleImport = async () => {
    if (!importPreview.length) return;
    setIsImporting(true);
    try {
      // Transform preview data to match API expectation
      // We need to map class names to IDs or assume IDs are provided
      // For simplicity, let's assume the CSV contains valid data or we map it here
      // In a real app, we'd have a mapping step.
      // Here we'll assume the CSV has: firstName,lastName,admissionNumber,dateOfBirth,gender,guardianName,guardianPhone,classId

      const formattedData = importPreview.map(row => {
        let classId = row.classId;

        // Try to map class name to ID if ID is missing but name is present
        if (!classId && row.className) {
          const matchedClass = classes.find(c => c.name.toLowerCase() === row.className.toLowerCase());
          if (matchedClass) {
            classId = matchedClass.id;
          }
        }

        return {
          ...row,
          classId,
          gender: row.gender?.toUpperCase() || 'MALE',
          // Ensure date is valid ISO string if possible, or let backend handle/fail
        };
      });

      await api.post('/students/bulk', formattedData);
      setShowImportModal(false);
      setImportFile(null);
      setImportPreview([]);
      fetchStudents();
      alert('Students imported successfully');
    } catch (error: any) {
      console.error('Import failed', error);
      alert('Import failed: ' + (error.response?.data?.error?.[0]?.message || 'Check your CSV format'));
    } finally {
      setIsImporting(false);
    }
  };

  const downloadTemplate = () => {
    const headers = ['firstName', 'lastName', 'admissionNumber', 'dateOfBirth', 'gender', 'guardianName', 'guardianPhone', 'className', 'address'];
    const csvContent = "data:text/csv;charset=utf-8," + headers.join(",");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "student_import_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredStudents = students.filter(student =>
    student.firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    student.lastName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    student.admissionNumber.includes(searchTerm) ||
    student.guardianName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-4 md:p-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Students</h1>
          <p className="text-gray-500">Manage student records and admissions</p>
        </div>
        <div className="flex space-x-2 w-full md:w-auto">
          <button
            onClick={() => setShowImportModal(true)}
            className="flex-1 md:flex-none flex items-center justify-center space-x-2 bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Upload size={20} />
            <span>Import</span>
          </button>
          <button
            onClick={openAddModal}
            className="flex-1 md:flex-none flex items-center justify-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus size={20} />
            <span>Add Student</span>
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {/* Toolbar */}
        <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search size={20} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name or admission number..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div className="flex items-center space-x-2">
            {selectedIds.length > 0 && (
              <button
                onClick={handleBulkDelete}
                className="flex items-center space-x-2 px-3 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors"
              >
                <Trash2 size={18} />
                <span className="hidden sm:inline">Delete ({selectedIds.length})</span>
              </button>
            )}
            <button className="flex-1 md:flex-none flex items-center justify-center space-x-2 px-3 py-2 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">
              <Filter size={18} />
              <span>Filter</span>
            </button>
          </div>
        </div>

        {/* Desktop Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-sm text-gray-600">
            <thead className="bg-gray-50 text-gray-700 font-medium">
              <tr>
                <th className="px-6 py-3 w-10">
                  <button onClick={toggleAll} className="text-gray-500 hover:text-gray-700">
                    {selectedIds.length === filteredStudents.length && filteredStudents.length > 0 ? (
                      <CheckSquare size={20} className="text-blue-600" />
                    ) : (
                      <Square size={20} />
                    )}
                  </button>
                </th>
                <th className="px-6 py-3">Admission #</th>
                <th className="px-6 py-3">Name</th>
                <th className="px-6 py-3">Class</th>
                <th className="px-6 py-3">Guardian</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-gray-500">Loading students...</td>
                </tr>
              ) : filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-gray-500">No students found</td>
                </tr>
              ) : (
                filteredStudents.map((student) => (
                  <tr key={student.id} className={`hover:bg-gray-50 transition-colors ${selectedIds.includes(student.id) ? 'bg-blue-50' : ''}`}>
                    <td className="px-6 py-4">
                      <button onClick={() => toggleSelection(student.id)} className="text-gray-500 hover:text-gray-700">
                        {selectedIds.includes(student.id) ? (
                          <CheckSquare size={20} className="text-blue-600" />
                        ) : (
                          <Square size={20} />
                        )}
                      </button>
                    </td>
                    <td className="px-6 py-4 font-mono text-xs text-gray-500">{student.admissionNumber}</td>
                    <td className="px-6 py-4 font-medium text-gray-900">
                      {student.lastName}, {student.firstName}
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-1 bg-gray-100 rounded text-xs font-medium text-gray-600">
                        {student.class?.name || 'Unassigned'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span>{student.guardianName}</span>
                        <span className="text-xs text-gray-400">{student.guardianPhone}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${student.status === 'ACTIVE'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-yellow-100 text-yellow-700'
                        }`}>
                        {student.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end space-x-2">
                        <button
                          onClick={() => navigate(`/students/${student.id}`)}
                          className="text-gray-600 hover:text-gray-800 p-1"
                          title="View Profile"
                        >
                          <Eye size={18} />
                        </button>
                        <button
                          onClick={() => openEditModal(student)}
                          className="text-blue-600 hover:text-blue-800 p-1"
                          title="Edit"
                        >
                          <Edit2 size={18} />
                        </button>
                        <button
                          onClick={() => handleDelete(student.id)}
                          className="text-red-600 hover:text-red-800 p-1"
                          title="Delete"
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

        {/* Mobile List View */}
        <div className="md:hidden">
          {loading ? (
            <div className="p-6 text-center text-gray-500">Loading students...</div>
          ) : filteredStudents.length === 0 ? (
            <div className="p-6 text-center text-gray-500">No students found</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {filteredStudents.map((student) => (
                <div key={student.id} className="p-4 space-y-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-medium text-gray-900">{student.lastName}, {student.firstName}</h3>
                      <p className="text-xs text-gray-500 font-mono">{student.admissionNumber}</p>
                    </div>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${student.status === 'ACTIVE'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-yellow-100 text-yellow-700'
                      }`}>
                      {student.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-sm text-gray-600">
                    <div>
                      <span className="text-xs text-gray-400 block">Class</span>
                      {student.class?.name || 'Unassigned'}
                    </div>
                    <div>
                      <span className="text-xs text-gray-400 block">Guardian</span>
                      {student.guardianName}
                    </div>
                  </div>

                  <div className="flex justify-end space-x-3 pt-2 border-t border-gray-50">
                    <button
                      onClick={() => navigate(`/students/${student.id}`)}
                      className="flex items-center space-x-1 text-gray-600 hover:text-gray-800 text-sm"
                    >
                      <Eye size={16} />
                      <span>View</span>
                    </button>
                    <button
                      onClick={() => openEditModal(student)}
                      className="flex items-center space-x-1 text-blue-600 hover:text-blue-800 text-sm"
                    >
                      <Edit2 size={16} />
                      <span>Edit</span>
                    </button>
                    <button
                      onClick={() => handleDelete(student.id)}
                      className="flex items-center space-x-1 text-red-600 hover:text-red-800 text-sm"
                    >
                      <Trash2 size={16} />
                      <span>Delete</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pagination (Static for now) */}
        <div className="p-4 border-t border-gray-100 flex items-center justify-between text-sm text-gray-500">
          <span>Showing {filteredStudents.length} of {students.length} students</span>
          <div className="flex space-x-2">
            <button className="px-3 py-1 border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-50" disabled>Previous</button>
            <button className="px-3 py-1 border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-50" disabled>Next</button>
          </div>
        </div>
      </div>

      {showImportModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 pb-safe">
          <div className="bg-white rounded-xl p-6 w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto pb-safe">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold">Import Students</h2>
              <button onClick={() => setShowImportModal(false)} className="text-gray-500 hover:text-gray-700">
                <X size={24} />
              </button>
            </div>

            <div className="space-y-6">
              <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
                <h3 className="font-medium text-blue-800 mb-2">Instructions</h3>
                <ul className="list-disc list-inside text-sm text-blue-700 space-y-1">
                  <li>Upload a CSV file with student details.</li>
                  <li>Required columns: firstName, lastName, dateOfBirth, gender, className (or classId).</li>
                  <li>Dates should be in YYYY-MM-DD format.</li>
                  <li>
                    <button onClick={downloadTemplate} className="underline font-medium hover:text-blue-900">
                      Download Template CSV
                    </button>
                  </li>
                </ul>
                <div className="mt-3 pt-3 border-t border-blue-200">
                  <p className="text-xs font-semibold text-blue-800 mb-1">Available Classes:</p>
                  <div className="flex flex-wrap gap-2">
                    {classes.map(c => (
                      <span key={c.id} className="text-xs bg-white px-2 py-1 rounded border border-blue-200 text-blue-600">
                        {c.name}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-blue-500 transition-colors">
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleFileChange}
                  className="hidden"
                  id="csv-upload"
                />
                <label htmlFor="csv-upload" className="cursor-pointer flex flex-col items-center">
                  <Upload size={48} className="text-gray-400 mb-4" />
                  <span className="text-lg font-medium text-gray-700">Click to upload CSV</span>
                  <span className="text-sm text-gray-500 mt-1">or drag and drop here</span>
                </label>
                {importFile && (
                  <div className="mt-4 p-2 bg-gray-100 rounded text-sm font-medium text-gray-700">
                    Selected: {importFile.name}
                  </div>
                )}
              </div>

              {importPreview.length > 0 && (
                <div>
                  <h3 className="font-medium text-gray-800 mb-2">Preview ({importPreview.length} students)</h3>
                  <div className="border border-gray-200 rounded-lg overflow-hidden max-h-60 overflow-y-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-gray-50 font-medium text-gray-600">
                        <tr>
                          {Object.keys(importPreview[0]).slice(0, 5).map(key => (
                            <th key={key} className="px-3 py-2">{key}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {importPreview.slice(0, 5).map((row, i) => (
                          <tr key={i}>
                            {Object.values(row).slice(0, 5).map((val: any, j) => (
                              <td key={j} className="px-3 py-2">{val}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {importPreview.length > 5 && (
                      <div className="p-2 text-center text-xs text-gray-500 bg-gray-50 border-t border-gray-100">
                        ...and {importPreview.length - 5} more rows
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="flex justify-end space-x-3 pt-4 border-t border-gray-100">
                <button
                  onClick={() => setShowImportModal(false)}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={handleImport}
                  disabled={!importFile || isImporting}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center space-x-2"
                >
                  {isImporting ? (
                    <><span>Importing...</span></>
                  ) : (
                    <>
                      <Upload size={18} />
                      <span>Import Students</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end md:items-center justify-center z-50 overflow-y-auto pb-safe">
          <div className="bg-white rounded-t-xl md:rounded-xl p-6 w-full max-w-2xl md:my-8 h-[90vh] md:h-auto overflow-y-auto pb-safe">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">{editingStudent ? 'Edit Student' : 'Add New Student'}</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-500 hover:text-gray-700 md:hidden">
                Close
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
                  <input
                    type="text"
                    required
                    value={formData.firstName}
                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
                  <input
                    type="text"
                    required
                    value={formData.lastName}
                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                {editingStudent && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Admission Number</label>
                    <input
                      type="text"
                      value={formData.admissionNumber}
                      readOnly
                      disabled
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-500"
                    />
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date of Birth</label>
                  <input
                    type="date"
                    required
                    value={formData.dateOfBirth}
                    onChange={(e) => setFormData({ ...formData, dateOfBirth: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Gender</label>
                  <select
                    value={formData.gender}
                    onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 bg-white"
                  >
                    <option value="MALE">Male</option>
                    <option value="FEMALE">Female</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Class</label>
                  <select
                    required
                    value={formData.classId}
                    onChange={(e) => setFormData({ ...formData, classId: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 bg-white"
                  >
                    <option value="">Select a class</option>
                    {classes.map(cls => (
                      <option key={cls.id} value={cls.id}>{cls.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Guardian Name</label>
                  <input
                    type="text"
                    value={formData.guardianName}
                    onChange={(e) => setFormData({ ...formData, guardianName: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Guardian Phone</label>
                  <input
                    type="tel"
                    value={formData.guardianPhone}
                    onChange={(e) => setFormData({ ...formData, guardianPhone: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Guardian Email</label>
                  <input
                    type="email"
                    value={formData.guardianEmail}
                    onChange={(e) => setFormData({ ...formData, guardianEmail: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Optional - creates parent account"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                  <textarea
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                    rows={3}
                  />
                </div>
                {editingStudent && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                    <select
                      value={formData.status}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 bg-white"
                    >
                      <option value="ACTIVE">Active</option>
                      <option value="TRANSFERRED">Transferred</option>
                      <option value="GRADUATED">Graduated</option>
                      <option value="DROPPED_OUT">Dropped Out</option>
                    </select>
                  </div>
                )}
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
                  {editingStudent ? 'Update Student' : 'Create Student'}
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
