import React, { useState, useRef, useEffect } from 'react';
import { Download, FileSpreadsheet, FileText, ChevronDown } from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface ExportDropdownProps {
    data: any[];
    columns: { key: string; header: string }[];
    filename: string;
    disabled?: boolean;
}

const ExportDropdown: React.FC<ExportDropdownProps> = ({ data, columns, filename, disabled = false }) => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const getExportData = () => {
        return data.map(item => {
            const row: any = {};
            columns.forEach(col => {
                // Handle nested properties like 'student.firstName'
                const keys = col.key.split('.');
                let value = item;
                for (const key of keys) {
                    value = value?.[key];
                }
                row[col.header] = value ?? '';
            });
            return row;
        });
    };

    const exportToCSV = () => {
        if (data.length === 0) {
            alert('No data to export');
            return;
        }

        const exportData = getExportData();
        const headers = columns.map(col => col.header);
        const csvContent = [
            headers.join(','),
            ...exportData.map(row =>
                headers.map(header => {
                    const value = row[header];
                    // Escape quotes and wrap in quotes if contains comma
                    if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
                        return `"${value.replace(/"/g, '""')}"`;
                    }
                    return value;
                }).join(',')
            )
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        downloadBlob(blob, `${filename}.csv`);
        setIsOpen(false);
    };

    const exportToExcel = () => {
        if (data.length === 0) {
            alert('No data to export');
            return;
        }

        const exportData = getExportData();
        const worksheet = XLSX.utils.json_to_sheet(exportData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Data');

        // Auto-size columns
        const maxWidths = columns.map(col => col.header.length);
        exportData.forEach(row => {
            columns.forEach((col, i) => {
                const value = String(row[col.header] || '');
                maxWidths[i] = Math.max(maxWidths[i], value.length);
            });
        });
        worksheet['!cols'] = maxWidths.map(w => ({ wch: Math.min(w + 2, 50) }));

        XLSX.writeFile(workbook, `${filename}.xlsx`);
        setIsOpen(false);
    };

    const exportToPDF = () => {
        if (data.length === 0) {
            alert('No data to export');
            return;
        }

        const exportData = getExportData();
        const doc = new jsPDF({ orientation: 'landscape' });

        // Title
        doc.setFontSize(16);
        doc.text(filename.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()), 14, 15);
        doc.setFontSize(10);
        doc.text(`Exported on ${new Date().toLocaleDateString()}`, 14, 22);

        // Table
        autoTable(doc, {
            head: [columns.map(col => col.header)],
            body: exportData.map(row => columns.map(col => row[col.header])),
            startY: 28,
            styles: { fontSize: 8, cellPadding: 2 },
            headStyles: { fillColor: [41, 128, 185], textColor: 255 },
            alternateRowStyles: { fillColor: [245, 245, 245] },
        });

        doc.save(`${filename}.pdf`);
        setIsOpen(false);
    };

    const downloadBlob = (blob: Blob, filename: string) => {
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                disabled={disabled || data.length === 0}
                className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors ${disabled || data.length === 0
                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        : 'bg-emerald-600 text-white hover:bg-emerald-700'
                    }`}
            >
                <Download size={18} />
                <span>Export ({data.length})</span>
                <ChevronDown size={16} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 z-50 overflow-hidden">
                    <button
                        onClick={exportToCSV}
                        className="w-full flex items-center space-x-3 px-4 py-3 text-left text-gray-700 hover:bg-surface-hover transition-colors"
                    >
                        <FileText size={18} className="text-green-600" />
                        <div>
                            <div className="font-medium">CSV</div>
                            <div className="text-xs text-gray-500">Comma-separated values</div>
                        </div>
                    </button>
                    <button
                        onClick={exportToExcel}
                        className="w-full flex items-center space-x-3 px-4 py-3 text-left text-gray-700 hover:bg-surface-hover transition-colors border-t border-gray-100"
                    >
                        <FileSpreadsheet size={18} className="text-emerald-600" />
                        <div>
                            <div className="font-medium">Excel</div>
                            <div className="text-xs text-gray-500">Microsoft Excel format</div>
                        </div>
                    </button>
                    <button
                        onClick={exportToPDF}
                        className="w-full flex items-center space-x-3 px-4 py-3 text-left text-gray-700 hover:bg-surface-hover transition-colors border-t border-gray-100"
                    >
                        <FileText size={18} className="text-red-600" />
                        <div>
                            <div className="font-medium">PDF</div>
                            <div className="text-xs text-gray-500">Printable document</div>
                        </div>
                    </button>
                </div>
            )}
        </div>
    );
};

export default ExportDropdown;
