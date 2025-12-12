import React, { useState } from 'react';
import { X, Upload, Download, AlertCircle, CheckCircle } from 'lucide-react';
import api from '../utils/api';

interface BulkImportModalProps {
    isOpen: boolean;
    onClose: () => void;
    entityName: string;
    apiEndpoint: string;
    templateFields: string[];
    onSuccess: () => void;
    instructions?: string[];
}

const BulkImportModal: React.FC<BulkImportModalProps> = ({
    isOpen,
    onClose,
    entityName,
    apiEndpoint,
    templateFields,
    onSuccess,
    instructions = [],
}) => {
    const [file, setFile] = useState<File | null>(null);
    const [importing, setImporting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    if (!isOpen) return null;

    const downloadTemplate = () => {
        const csvContent = "data:text/csv;charset=utf-8," + templateFields.join(",");
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `${entityName.toLowerCase()}_import_template.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
            setError(null);
            setSuccess(null);
        }
    };

    const parseCSV = (text: string): any[] => {
        const lines = text.trim().split('\n');
        const headers = lines[0].split(',').map(h => h.trim());

        return lines.slice(1).map(line => {
            const values = line.split(',').map(v => v.trim());
            const obj: any = {};

            headers.forEach((header, index) => {
                let value: any = values[index];

                // Convert numeric fields
                if (header === 'gradeLevel' || header === 'percentage' || header === 'amount' || header === 'applicableGrade') {
                    value = parseFloat(value);
                }

                obj[header] = value;
            });

            return obj;
        });
    };

    const handleImport = async () => {
        if (!file) {
            setError('Please select a file');
            return;
        }

        setImporting(true);
        setError(null);
        setSuccess(null);

        try {
            const text = await file.text();
            const data = parseCSV(text);

            const response = await api.post(apiEndpoint, data);

            setSuccess(response.data.message || `Successfully imported ${response.data.count} ${entityName.toLowerCase()}`);
            setFile(null);

            setTimeout(() => {
                onSuccess();
                onClose();
            }, 2000);
        } catch (err: any) {
            setError(err.response?.data?.error || `Failed to import ${entityName.toLowerCase()}`);
        } finally {
            setImporting(false);
        }
    };

    const defaultInstructions = [
        `Upload a CSV file with ${entityName.toLowerCase()} details.`,
        `Required columns: ${templateFields.join(', ')}.`,
        'Download the template CSV for the correct format.',
    ];

    const displayInstructions = instructions.length > 0 ? instructions : defaultInstructions;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
                <div className="p-6">
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-2xl font-bold">Import {entityName}</h2>
                        <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
                            <X size={24} />
                        </button>
                    </div>

                    <div className="space-y-6">
                        {/* Instructions */}
                        <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
                            <h3 className="font-medium text-blue-800 mb-2">Instructions</h3>
                            <ul className="list-disc list-inside text-sm text-blue-700 space-y-1">
                                {displayInstructions.map((instruction, index) => (
                                    <li key={index}>{instruction}</li>
                                ))}
                                <li>
                                    <button onClick={downloadTemplate} className="underline font-medium hover:text-blue-900">
                                        Download Template CSV
                                    </button>
                                </li>
                            </ul>
                        </div>

                        {/* File Upload */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Select CSV File
                            </label>
                            <div className="flex items-center space-x-4">
                                <label className="flex-1 flex items-center justify-center px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-500 transition-colors">
                                    <Upload size={20} className="mr-2 text-gray-400" />
                                    <span className="text-sm text-gray-600">
                                        {file ? file.name : 'Choose file...'}
                                    </span>
                                    <input
                                        type="file"
                                        accept=".csv"
                                        onChange={handleFileChange}
                                        className="hidden"
                                    />
                                </label>
                            </div>
                        </div>

                        {/* Error Message */}
                        {error && (
                            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start">
                                <AlertCircle className="text-red-600 mr-3 flex-shrink-0" size={20} />
                                <div className="text-sm text-red-800">{error}</div>
                            </div>
                        )}

                        {/* Success Message */}
                        {success && (
                            <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start">
                                <CheckCircle className="text-green-600 mr-3 flex-shrink-0" size={20} />
                                <div className="text-sm text-green-800">{success}</div>
                            </div>
                        )}

                        {/* Action Buttons */}
                        <div className="flex justify-end space-x-3 pt-4 border-t">
                            <button
                                onClick={onClose}
                                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                                disabled={importing}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleImport}
                                disabled={!file || importing}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center"
                            >
                                {importing ? (
                                    <>
                                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                                        Importing...
                                    </>
                                ) : (
                                    <>
                                        <Upload size={18} className="mr-2" />
                                        Import
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default BulkImportModal;
