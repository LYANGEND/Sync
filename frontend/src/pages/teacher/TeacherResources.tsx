import { useState, useEffect } from 'react';
import { Plus, Download, Trash2, FileText, Video, Link as LinkIcon, Image as ImageIcon } from 'lucide-react';
import api from '../../services/api';

interface Resource {
  id: string;
  title: string;
  description?: string;
  type: string;
  fileUrl: string;
  fileSize?: number;
  isDownloadable: boolean;
  subjectContent: {
    class: { name: string };
    subject: { name: string };
  };
  createdAt: string;
}

const TeacherResources = () => {
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [classes, setClasses] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);

  const [formData, setFormData] = useState({
    classId: '',
    subjectId: '',
    title: '',
    description: '',
    type: 'PDF',
    fileUrl: '',
    isDownloadable: true,
  });

  useEffect(() => {
    fetchResources();
    fetchClasses();
    fetchSubjects();
  }, []);

  const fetchResources = async () => {
    try {
      setLoading(true);
      const response = await api.get('/resources/teacher');
      setResources(response.data);
    } catch (error) {
      console.error('Failed to fetch resources:', error);
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

  const handleCreateResource = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      await api.post('/resources', formData);
      setShowCreateModal(false);
      setFormData({
        classId: '',
        subjectId: '',
        title: '',
        description: '',
        type: 'PDF',
        fileUrl: '',
        isDownloadable: true,
      });
      fetchResources();
      alert('Resource uploaded successfully!');
    } catch (error) {
      console.error('Failed to create resource:', error);
      alert('Failed to upload resource');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteResource = async (resourceId: string) => {
    if (!confirm('Are you sure you want to delete this resource?')) return;

    try {
      setLoading(true);
      await api.delete(`/resources/${resourceId}`);
      fetchResources();
      alert('Resource deleted successfully!');
    } catch (error) {
      console.error('Failed to delete resource:', error);
      alert('Failed to delete resource');
    } finally {
      setLoading(false);
    }
  };

  const getResourceIcon = (type: string) => {
    switch (type) {
      case 'PDF':
      case 'DOCUMENT':
      case 'NOTES':
        return <FileText className="w-5 h-5" />;
      case 'VIDEO':
        return <Video className="w-5 h-5" />;
      case 'LINK':
        return <LinkIcon className="w-5 h-5" />;
      case 'IMAGE':
        return <ImageIcon className="w-5 h-5" />;
      default:
        return <FileText className="w-5 h-5" />;
    }
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(2)} MB`;
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Learning Resources</h1>
          <p className="text-slate-600 mt-1">Upload and manage study materials</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Plus className="w-5 h-5" />
          Upload Resource
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg p-4 border">
          <p className="text-sm text-slate-500">Total Resources</p>
          <p className="text-2xl font-bold text-slate-900">{resources.length}</p>
        </div>
        <div className="bg-white rounded-lg p-4 border">
          <p className="text-sm text-slate-500">PDFs</p>
          <p className="text-2xl font-bold text-slate-900">
            {resources.filter(r => r.type === 'PDF').length}
          </p>
        </div>
        <div className="bg-white rounded-lg p-4 border">
          <p className="text-sm text-slate-500">Videos</p>
          <p className="text-2xl font-bold text-slate-900">
            {resources.filter(r => r.type === 'VIDEO').length}
          </p>
        </div>
        <div className="bg-white rounded-lg p-4 border">
          <p className="text-sm text-slate-500">Documents</p>
          <p className="text-2xl font-bold text-slate-900">
            {resources.filter(r => r.type === 'DOCUMENT' || r.type === 'NOTES').length}
          </p>
        </div>
      </div>

      {/* Resources Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading && resources.length === 0 ? (
          <div className="col-span-full text-center py-12 text-slate-500">Loading resources...</div>
        ) : resources.length === 0 ? (
          <div className="col-span-full text-center py-12 text-slate-500">
            No resources uploaded yet. Click "Upload Resource" to get started.
          </div>
        ) : (
          resources.map((resource) => (
            <div key={resource.id} className="bg-white rounded-lg border p-4 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600">
                    {getResourceIcon(resource.type)}
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900">{resource.title}</h3>
                    <p className="text-xs text-slate-500">
                      {resource.subjectContent.class.name} • {resource.subjectContent.subject.name}
                    </p>
                  </div>
                </div>
              </div>

              {resource.description && (
                <p className="text-sm text-slate-600 mb-3">{resource.description}</p>
              )}

              <div className="flex items-center justify-between text-xs text-slate-500 mb-3">
                <span className="px-2 py-1 bg-slate-100 rounded">{resource.type}</span>
                {resource.fileSize && <span>{formatFileSize(resource.fileSize)}</span>}
              </div>

              <div className="flex gap-2">
                <a
                  href={resource.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-1 px-3 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  <Download className="w-4 h-4" />
                  {resource.isDownloadable ? 'Download' : 'View'}
                </a>
                <button
                  onClick={() => handleDeleteResource(resource.id)}
                  className="px-3 py-2 text-sm bg-red-50 text-red-600 rounded hover:bg-red-100"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <p className="text-xs text-slate-400 mt-2">
                Uploaded {new Date(resource.createdAt).toLocaleDateString()}
              </p>
            </div>
          ))
        )}
      </div>

      {/* Create Resource Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b">
              <h2 className="text-xl font-bold text-slate-900">Upload New Resource</h2>
            </div>
            <form onSubmit={handleCreateResource} className="p-6 space-y-4">
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
                  placeholder="e.g., Quadratic Equations Notes"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  rows={3}
                  placeholder="Brief description of the resource"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Type *
                </label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="PDF">PDF</option>
                  <option value="VIDEO">Video</option>
                  <option value="DOCUMENT">Document</option>
                  <option value="LINK">Link</option>
                  <option value="IMAGE">Image</option>
                  <option value="NOTES">Notes</option>
                  <option value="PAST_PAPER">Past Paper</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  File URL *
                </label>
                <input
                  type="url"
                  value={formData.fileUrl}
                  onChange={(e) => setFormData({ ...formData, fileUrl: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="https://example.com/file.pdf"
                  required
                />
                <p className="text-xs text-slate-500 mt-1">
                  For now, provide a direct URL. File upload coming soon.
                </p>
              </div>

              <div>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.isDownloadable}
                    onChange={(e) => setFormData({ ...formData, isDownloadable: e.target.checked })}
                    className="rounded"
                  />
                  <span className="text-sm text-slate-700">Allow students to download</span>
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
                  {loading ? 'Uploading...' : 'Upload Resource'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default TeacherResources;
