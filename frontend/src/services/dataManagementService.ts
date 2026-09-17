import axios from 'axios';
import api from '../utils/api';

export interface DataManagementOverview {
  schoolName: string;
  counts: {
    students: number;
    users: number;
    classes: number;
    subjects: number;
    branches: number;
    payments: number;
    attendance: number;
    assessments: number;
  };
  archive: {
    formatVersion: number;
    transferableModels: number;
    excludedModels: number;
    maxUploadMb: number;
  };
  recentActivity: Array<{
    id: string;
    action: 'SCHOOL_DATA_EXPORT' | 'SCHOOL_DATA_IMPORT' | string;
    createdAt: string;
    userId: string | null;
    details: Record<string, unknown> | null;
  }>;
}

export interface ArchivePreview {
  canImport: boolean;
  integrityVerified: boolean;
  checksum: string;
  sourceSchoolName: string;
  destinationSchoolName: string;
  createdAt: string;
  formatVersion: number;
  schemaMatches: boolean;
  totalRecords: number;
  modelCount: number;
  fileReferenceCount: number;
  recordCounts: Record<string, number>;
  topRecordCounts: Array<{ model: string; count: number }>;
  warnings: string[];
}

export interface ArchiveImportResult {
  message: string;
  checksum: string;
  sourceSchoolName: string;
  totalProcessed: number;
  created: number;
  updated: number;
  linked: number;
  disabledUsers: number;
  fileReferencesNotRestored: number;
  models: Array<{ model: string; created: number; updated: number }>;
  warnings: string[];
}

export interface ArchiveDownload {
  blob: Blob;
  filename: string;
  checksum: string;
  recordCount: number;
  modelCount: number;
}

function filenameFromDisposition(disposition?: string): string {
  if (!disposition) return `sync-school-data-${new Date().toISOString().slice(0, 10)}.sync.json.gz`;

  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encoded) {
    try {
      return decodeURIComponent(encoded.replace(/["']/g, ''));
    } catch {
      // Fall through to the regular filename form.
    }
  }

  return disposition.match(/filename="?([^";]+)"?/i)?.[1]
    || `sync-school-data-${new Date().toISOString().slice(0, 10)}.sync.json.gz`;
}

async function readBlobError(blob: Blob): Promise<string | null> {
  if (!blob.type.includes('json') && blob.size > 64 * 1024) return null;
  try {
    const payload = JSON.parse(await blob.text()) as { error?: string; message?: string };
    return payload.error || payload.message || null;
  } catch {
    return null;
  }
}

const dataManagementService = {
  getOverview: async (): Promise<DataManagementOverview> => {
    const response = await api.get<DataManagementOverview>('/data-management/summary');
    return response.data;
  },

  exportArchive: async (): Promise<ArchiveDownload> => {
    const response = await api.get<Blob>('/data-management/export', { responseType: 'blob' });
    return {
      blob: response.data,
      filename: filenameFromDisposition(response.headers['content-disposition']),
      checksum: String(response.headers['x-archive-checksum'] || ''),
      recordCount: Number(response.headers['x-archive-record-count'] || 0),
      modelCount: Number(response.headers['x-archive-model-count'] || 0),
    };
  },

  previewArchive: async (archive: File): Promise<ArchivePreview> => {
    const formData = new FormData();
    formData.append('archive', archive);
    const response = await api.post<ArchivePreview>('/data-management/import/preview', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  importArchive: async (archive: File, expectedChecksum: string): Promise<ArchiveImportResult> => {
    const formData = new FormData();
    formData.append('archive', archive);
    formData.append('expectedChecksum', expectedChecksum);
    formData.append('confirmation', 'IMPORT');
    const response = await api.post<ArchiveImportResult>('/data-management/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  errorMessage: async (error: unknown, fallback: string): Promise<string> => {
    if (!axios.isAxiosError(error)) return error instanceof Error ? error.message : fallback;
    if (error.response?.data instanceof Blob) {
      return (await readBlobError(error.response.data)) || fallback;
    }
    const payload = error.response?.data as { error?: string; message?: string } | undefined;
    return payload?.error || payload?.message || fallback;
  },
};

export default dataManagementService;
