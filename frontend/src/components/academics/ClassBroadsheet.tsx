import React, { useMemo } from 'react';
import { Download, FileSpreadsheet, Trophy, TrendingUp, Printer } from 'lucide-react';
import * as XLSX from 'xlsx';
import { StudentReport } from '../../services/reportCardService';

interface ClassBroadsheetProps {
    reports: StudentReport[];
    className?: string;
    onClose?: () => void;
}

const ClassBroadsheet: React.FC<ClassBroadsheetProps> = ({ reports, className = '', onClose }) => {
    // 1. Extract all unique subjects across the class
    const subjects = useMemo(() => {
        const subs = new Set<string>();
        reports.forEach(r => {
            r.results.forEach(res => subs.add(res.subjectName));
        });
        return Array.from(subs).sort();
    }, [reports]);

    // 2. Prepare Rows
    const rows = useMemo(() => {
        return reports.map(report => {
            const subjectScores: Record<string, number> = {};
            report.results.forEach(r => {
                subjectScores[r.subjectName] = r.totalScore;
            });
            return {
                ...report,
                subjectScores
            };
        }).sort((a, b) => (a.rank || 0) - (b.rank || 0)); // Sort by Rank
    }, [reports]);

    // 3. Stats
    const stats = useMemo(() => {
        const classAvg = reports.reduce((acc, r) => acc + r.averageScore, 0) / (reports.length || 1);
        const passRate = reports.filter(r => r.averageScore >= 50).length / (reports.length || 1) * 100; // Assuming 50 is pass
        const topStudent = reports.reduce((prev, current) => (prev.averageScore > current.averageScore) ? prev : current, reports[0]);
        return { classAvg, passRate, topStudent };
    }, [reports]);

    const handleExportExcel = () => {
        const wsData: any[][] = [
            ['Sync International School - Class Broadsheet'],
            [`Class: ${reports[0]?.class?.name || 'Unknown'}`, `Term: ${reports[0]?.term?.name || 'Unknown'}`],
            [''],
            ['Rank', 'Student Name', 'Admission No', ...subjects, 'Total', 'Avg %', 'Attendance']
        ];

        rows.forEach(r => {
            const scores = subjects.map(s => r.subjectScores[s] || '-');
            wsData.push([
                r.rank?.toString() || '-',
                `${r.student?.firstName} ${r.student?.lastName}`,
                r.student?.admissionNumber || '',
                ...scores,
                r.totalScore.toFixed(1),
                r.averageScore.toFixed(1),
                `${r.totalAttendance || 0}/${r.totalDays || 60}`
            ]);
        });

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(wsData);

        // Style adjustments would go here if using Pro version, but basic sheet is fine
        XLSX.utils.book_append_sheet(wb, ws, "Broadsheet");
        XLSX.writeFile(wb, `Class_Broadsheet_${reports[0]?.class?.name}.xlsx`);
    };

    return (
        <div className={`min-w-0 max-w-full bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 flex flex-col h-full print:h-auto print:bg-white printable-content ${className}`}>
            {/* Header & Stats */}
            <div className="p-4 md:p-6 border-b border-gray-200 dark:border-slate-700">
                <div className="flex flex-col xl:flex-row justify-between items-start gap-4 mb-6">
                    <div className="min-w-0">
                        <h2 className="text-xl md:text-2xl font-bold text-gray-800 dark:text-slate-100 flex items-start gap-2">
                            <FileSpreadsheet className="text-blue-600" />
                            Class Results Sheet
                        </h2>
                        <p className="text-gray-600 dark:text-slate-300 mt-1 break-words">
                            {reports[0]?.class?.name} • {reports[0]?.term?.name} • {reports.length} Students
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2 print:hidden">
                        <button
                            onClick={() => window.print()}
                            className="min-h-11 cursor-pointer flex items-center gap-2 px-4 py-2 border border-blue-200 text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-primary"
                        >
                            <Printer size={18} />
                            Print
                        </button>
                        <button
                            onClick={handleExportExcel}
                            className="min-h-11 cursor-pointer flex items-center gap-2 px-4 py-2 bg-green-700 text-white rounded-lg hover:bg-green-800 transition-colors motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-primary"
                        >
                            <Download size={18} />
                            Export Excel
                        </button>
                        {onClose && (
                            <button
                                onClick={onClose}
                                className="min-h-11 cursor-pointer px-4 py-2 text-gray-600 dark:text-slate-200 hover:bg-surface-hover rounded-lg focus-visible:ring-2 focus-visible:ring-primary"
                            >
                                Close
                            </button>
                        )}
                    </div>
                </div>

                {/* Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-2 print:hidden">
                    <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
                        <div className="flex items-center gap-2 text-blue-700 font-medium mb-1">
                            <TrendingUp size={18} /> Class Average
                        </div>
                        <div className="text-2xl font-bold text-blue-900">{stats.classAvg.toFixed(1)}%</div>
                    </div>
                    <div className="bg-green-50 p-4 rounded-lg border border-green-100">
                        <div className="flex items-center gap-2 text-green-700 font-medium mb-1">
                            <Trophy size={18} /> Pass Rate
                        </div>
                        <div className="text-2xl font-bold text-green-900">{stats.passRate.toFixed(1)}%</div>
                    </div>
                    <div className="bg-purple-50 p-4 rounded-lg border border-purple-100">
                        <div className="flex items-center gap-2 text-purple-700 font-medium mb-1">
                            <AwardIcon /> Top Student
                        </div>
                        <div className="text-lg font-bold text-purple-900 truncate">
                            {stats.topStudent ? `${stats.topStudent.student?.firstName} ${stats.topStudent.student?.lastName}` : '-'}
                        </div>
                        <div className="text-xs text-purple-600">Avg: {stats.topStudent?.averageScore.toFixed(1)}%</div>
                    </div>
                </div>
            </div>

            {/* The Table */}
            <div role="region" aria-label="Class results table" tabIndex={0} className="min-w-0 max-w-full flex-1 overflow-auto p-0 md:p-6 focus-visible:ring-2 focus-visible:ring-primary print:p-0 print:overflow-visible print:h-auto">
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <table className="w-full text-sm text-left border-collapse">
                        <thead className="bg-gray-100 text-gray-700 font-bold border-b border-gray-200">
                            <tr>
                                <th className="px-4 py-3 border-r border-gray-200 whitespace-nowrap w-16 text-center">Pos</th>
                                <th className="px-4 py-3 border-r border-gray-200 whitespace-nowrap min-w-[200px] sticky left-0 bg-gray-100 z-10">Student Name</th>
                                {subjects.map(sub => (
                                    <th key={sub} className="px-2 py-3 border-r border-gray-200 text-center w-24 whitespace-normal text-xs uppercase bg-gray-50">
                                        <div className="-rotate-45 h-12 flex items-end justify-center pb-1">{sub.substring(0, 10)}</div>
                                    </th>
                                ))}
                                <th className="px-4 py-3 border-r border-gray-200 text-center bg-gray-100">Total</th>
                                <th className="px-4 py-3 border-r border-gray-200 text-center bg-gray-100">Avg %</th>
                                <th className="px-4 py-3 text-center bg-gray-100 whitespace-nowrap">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 text-gray-800">
                            {rows.map((row, idx) => (
                                <tr key={row.id} className="hover:bg-surface-hover transition-colors">
                                    <td className="px-4 py-2 border-r border-gray-100 text-center font-bold text-gray-500">{row.rank || idx + 1}</td>
                                    <td className="px-4 py-2 border-r border-gray-100 font-medium whitespace-nowrap sticky left-0 bg-white group-hover:bg-surface-hover z-10">
                                        {row.student?.firstName} {row.student?.lastName}
                                        {/* <div className="text-[10px] text-gray-400 font-mono">{row.student?.admissionNumber}</div> */}
                                    </td>
                                    {subjects.map(sub => {
                                        const score = row.subjectScores[sub];
                                        let colorClass = 'text-gray-800';
                                        if (score >= 75) colorClass = 'text-green-600 font-bold';
                                        else if (score < 50) colorClass = 'text-red-500 font-medium';

                                        return (
                                            <td key={sub} className={`px-2 py-2 border-r border-gray-100 text-center ${colorClass}`}>
                                                {score !== undefined ? Math.round(score) : '-'}
                                            </td>
                                        );
                                    })}
                                    <td className="px-4 py-2 border-r border-gray-100 text-center font-bold">{Math.round(row.totalScore)}</td>
                                    <td className="px-4 py-2 border-r border-gray-100 text-center font-bold text-blue-700">{row.averageScore.toFixed(1)}</td>
                                    <td className="px-4 py-2 text-center text-xs">
                                        {row.averageScore >= 50 ?
                                            <span className="bg-green-100 text-green-700 px-2 py-1 rounded-full">Pass</span> :
                                            <span className="bg-red-100 text-red-700 px-2 py-1 rounded-full">Fail</span>
                                        }
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

const AwardIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="7" /><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88" /></svg>
);

export default ClassBroadsheet;
