/**
 * File System Access API Utilities
 * Provides native file save/open dialogs for receipts and reports
 */

export interface FileSaveOptions {
    suggestedName?: string;
    types?: FilePickerAcceptType[];
}

export interface FilePickerAcceptType {
    description: string;
    accept: Record<string, string[]>;
}

/**
 * Check if File System Access API is supported
 */
export const isFileSystemSupported = (): boolean => {
    return 'showSaveFilePicker' in window;
};

/**
 * Save a file using the native file picker
 * Falls back to traditional download if not supported
 */
export const saveFile = async (
    content: Blob | string,
    filename: string,
    mimeType: string = 'application/octet-stream'
): Promise<boolean> => {
    // Convert string to Blob if needed
    const blob = typeof content === 'string'
        ? new Blob([content], { type: mimeType })
        : content;

    // Try native File System Access API
    if (isFileSystemSupported()) {
        try {
            const extension = filename.split('.').pop() || '';

            const options: SaveFilePickerOptions = {
                suggestedName: filename,
                types: [
                    {
                        description: getFileDescription(extension),
                        accept: { [mimeType]: [`.${extension}`] }
                    }
                ]
            };

            const handle = await (window as any).showSaveFilePicker(options);
            const writable = await handle.createWritable();
            await writable.write(blob);
            await writable.close();

            return true;
        } catch (error) {
            if ((error as Error).name === 'AbortError') {
                // User cancelled - not an error
                return false;
            }
            console.error('File System Access failed, falling back:', error);
        }
    }

    // Fallback: Traditional download
    return downloadFile(blob, filename);
};

/**
 * Save a PDF receipt
 */
export const saveReceipt = async (
    pdfBlob: Blob,
    transactionId: string
): Promise<boolean> => {
    const filename = `Receipt_${transactionId}_${formatDate(new Date())}.pdf`;
    return saveFile(pdfBlob, filename, 'application/pdf');
};

/**
 * Save a report/spreadsheet
 */
export const saveReport = async (
    data: Blob | string,
    reportName: string,
    format: 'csv' | 'xlsx' | 'pdf' = 'csv'
): Promise<boolean> => {
    const mimeTypes: Record<string, string> = {
        csv: 'text/csv',
        xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        pdf: 'application/pdf'
    };

    const filename = `${reportName}_${formatDate(new Date())}.${format}`;
    return saveFile(data, filename, mimeTypes[format]);
};

/**
 * Traditional download fallback
 */
const downloadFile = (blob: Blob, filename: string): boolean => {
    try {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        return true;
    } catch (error) {
        console.error('Download failed:', error);
        return false;
    }
};

/**
 * Open a file using native file picker
 */
export const openFile = async (
    acceptTypes?: FilePickerAcceptType[]
): Promise<File | null> => {
    if (!('showOpenFilePicker' in window)) {
        // Fallback: Use input element
        return new Promise((resolve) => {
            const input = document.createElement('input');
            input.type = 'file';
            if (acceptTypes) {
                const accepts = acceptTypes.flatMap(t =>
                    Object.values(t.accept).flat()
                ).join(',');
                input.accept = accepts;
            }
            input.onchange = () => {
                resolve(input.files?.[0] || null);
            };
            input.click();
        });
    }

    try {
        const [handle] = await (window as any).showOpenFilePicker({
            types: acceptTypes,
            multiple: false
        });
        return await handle.getFile();
    } catch (error) {
        if ((error as Error).name === 'AbortError') {
            return null;
        }
        console.error('Open file failed:', error);
        return null;
    }
};

/**
 * Read file as text
 */
export const readFileAsText = async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsText(file);
    });
};

/**
 * Read file as data URL (for images)
 */
export const readFileAsDataURL = async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
    });
};

// Helper functions
const formatDate = (date: Date): string => {
    return date.toISOString().split('T')[0].replace(/-/g, '');
};

const getFileDescription = (extension: string): string => {
    const descriptions: Record<string, string> = {
        pdf: 'PDF Document',
        csv: 'CSV Spreadsheet',
        xlsx: 'Excel Spreadsheet',
        png: 'PNG Image',
        jpg: 'JPEG Image',
        jpeg: 'JPEG Image',
        txt: 'Text File'
    };
    return descriptions[extension.toLowerCase()] || 'File';
};

// TypeScript types
interface SaveFilePickerOptions {
    suggestedName?: string;
    types?: Array<{
        description: string;
        accept: Record<string, string[]>;
    }>;
}

export default { saveFile, saveReceipt, saveReport, openFile, isFileSystemSupported };
