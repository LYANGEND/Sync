import { useState, useEffect } from 'react';
import { Download, FileText, Video, Link as LinkIcon, Image as ImageIcon, Filter } from 'lucide-react';
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
    subject: { name: string };
    teacher: { fullName: string };
  };
  createdAt: string;
}

interface Child {
  id: string;
  firstName: string;
  lastName: string;
}

const ParentResources = () => {
  const [children, setChildren] = useState<Child[]>([]);
  const [selectedChild, setSelectedChild] = useState<Child | null>(null);
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedSubject, setSelectedSubject] = useState<string>('');

  useEffect(() => {
    fetchChildren();
  }, []);

  useEffect(() => {
    if (selectedChild) {
      fetchResources();
    }
  }, [selectedChild, selectedSubject]);

  const fetchChildren = async () => {
    try {
      const response = await api.get('/parent/children');
      setChildren(response.data.children || []);
      if (response.data.children?.length > 0) {
        setSelectedChild(response.data.children[0]);
      }
    } catch (error) {
      console.error('Failed to fetch children:', error);
    }
  };

  const fetchResources = async () => {
    if (!selectedChild) return;

    try {
      setLoading(true);
      const params = new URLSearchParams({ studentId: selectedChild.id });
      if (selectedSubject) {
        params.append('subjectId', selectedSubject);
      }
      const response = await api.get(`/resources/student?${params}`);
      setResources(response.data);
    } catch (error) {
      console.error('Failed to fetch resources:', error);
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

  const subjects = Array.from(new Set(resources.map(r => r.subjectContent.subject.name)));

  return (
    <div className="p-6">
      {/* Child Selection */}
      {children.length > 1 && (
        <div className="mb-6">
          <label className="block text-sm font-medium text-slate-700 mb-2">Select Child</label>
          <div className="flex gap-2">
            {children.map((child) => (
              <button
                key={child.id}
                onClick={() => setSelectedChild(child)}
                className={`px-4 py-2 rounded-lg font-medium ${
                  selectedChild?.id === child.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-white border text-slate-700 hover:bg-slate-50'
                }`}
              >
                {child.firstName} {child.lastName}
              </button>
            ))}
          </div>
        </div>
      )}

      {selectedChild && (
        <>
          {/* Header */}
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-slate-900">
              {selectedChild.firstName}'s Study Resources
            </h1>
            <p className="text-slate-600 mt-1">Access notes, videos, and study materials</p>
          </div>

          {/* Filter */}
          <div className="mb-6 flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Filter className="w-5 h-5 text-slate-500" />
              <select
                value={selectedSubject}
                onChange={(e) => setSelectedSubject(e.target.value)}
                className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Subjects</option>
                {subjects.map((subject) => (
                  <option key={subject} value={subject}>
                    {subject}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Resources Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {loading && resources.length === 0 ? (
              <div className="col-span-full text-center py-12 text-slate-500">Loading resources...</div>
            ) : resources.length === 0 ? (
              <div className="col-span-full text-center py-12 text-slate-500">
                No resources available yet.
              </div>
            ) : (
              resources.map((resource) => (
                <div key={resource.id} className="bg-white rounded-lg border p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-start gap-3 mb-3">
                    <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600">
                      {getResourceIcon(resource.type)}
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-slate-900">{resource.title}</h3>
                      <p className="text-xs text-slate-500">
                        {resource.subjectContent.subject.name}
                      </p>
                    </div>
                  </div>

                  {resource.description && (
                    <p className="text-sm text-slate-600 mb-3">{resource.description}</p>
                  )}

                  <div className="flex items-center justify-between text-xs text-slate-500 mb-3">
                    <span className="px-2 py-1 bg-slate-100 rounded">{resource.type}</span>
                    {resource.fileSize && <span>{formatFileSize(resource.fileSize)}</span>}
                  </div>

                  <a
                    href={resource.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    <Download className="w-4 h-4" />
                    {resource.isDownloadable ? 'Download' : 'View'}
                  </a>

                  <div className="mt-3 pt-3 border-t text-xs text-slate-500">
                    <p>By {resource.subjectContent.teacher.fullName}</p>
                    <p>Uploaded {new Date(resource.createdAt).toLocaleDateString()}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default ParentResources;
