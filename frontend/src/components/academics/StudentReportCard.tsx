import React, { useRef } from 'react';
import { Printer } from 'lucide-react';
import { StudentReport } from '../../services/reportCardService';

interface StudentReportCardProps {
    report: StudentReport;
    editable?: boolean;
    teacherRemark?: string;
    principalRemark?: string;
    onTeacherRemarkChange?: (value: string) => void;
    onPrincipalRemarkChange?: (value: string) => void;
    onSaveRemarks?: () => void;
    saving?: boolean;
    className?: string; // For adding page-break logic
}

const StudentReportCard: React.FC<StudentReportCardProps> = ({
    report,
    editable = false,
    teacherRemark = '',
    principalRemark = '',
    onTeacherRemarkChange,
    onPrincipalRemarkChange,
    onSaveRemarks,
    saving = false,
    className = ''
}) => {
    return (
        <div className={`bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden ${className}`}>
            <div className="p-8 border-b border-gray-200">
                <div className="flex justify-between items-start mb-8">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900 mb-2">Sync School</h1>
                        <p className="text-gray-500">Official Term Report</p>
                    </div>
                    <div className="text-right">
                        <div className="text-sm text-gray-500 mb-1">Generated on</div>
                        <div className="font-medium text-gray-900">{new Date().toLocaleDateString()}</div>
                    </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-6 p-6 bg-gray-50 rounded-xl border border-gray-100">
                    <div>
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Student Name</div>
                        <div className="font-medium text-gray-900">{report.student?.firstName} {report.student?.lastName}</div>
                    </div>
                    <div>
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Admission No.</div>
                        <div className="font-medium text-gray-900">{report.student?.admissionNumber || '-'}</div>
                    </div>
                    <div>
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Class</div>
                        <div className="font-medium text-gray-900">{report.class?.name} (Grade {report.class?.gradeLevel})</div>
                    </div>
                    <div>
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Term</div>
                        <div className="font-medium text-gray-900">{report.term?.name} ({new Date(report.term?.startDate || '').getFullYear()})</div>
                    </div>
                </div>
            </div>

            <div className="p-6 border-b border-gray-200 flex justify-between items-center bg-white">
                <h3 className="text-xl font-semibold text-gray-900">Academic Performance</h3>
                <div className="flex items-center gap-4">
                    {editable && (
                        <button
                            onClick={() => window.print()}
                            className="print:hidden flex items-center gap-2 px-3 py-1.5 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        >
                            <Printer size={20} />
                            <span className="text-sm font-medium">Print / Download PDF</span>
                        </button>
                    )}
                    <div className="px-4 py-2 bg-blue-50 rounded-lg border border-blue-100">
                        <span className="text-sm text-blue-600 font-medium mr-2">Average Score:</span>
                        <span className="text-xl font-bold text-blue-700">
                            {report.averageScore ? Number(report.averageScore).toFixed(2) : '0.00'}%
                        </span>
                    </div>
                </div>
            </div>

            <div className="overflow-x-auto">
                {report.results && report.results.length > 0 ? (
                    <table className="w-full text-left">
                        <thead className="bg-gray-50 border-b border-gray-200">
                            <tr>
                                <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Subject</th>
                                <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Score</th>
                                <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-center">Grade</th>
                                <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Remarks</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {report.results.map((result) => (
                                <tr key={result.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 text-sm font-medium text-gray-900">{result.subjectName}</td>
                                    <td className="px-6 py-4 text-sm text-gray-600 text-right">{Number(result.totalScore).toFixed(1)}</td>
                                    <td className="px-6 py-4 text-sm text-gray-600 text-center">
                                        <span className="px-2 py-1 bg-gray-100 rounded text-xs font-semibold">
                                            {result.grade}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-600">{result.remarks || '-'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ) : (
                    <div className="p-8 text-center text-gray-500">
                        No results found for this term. Please ensure assessments have been recorded.
                    </div>
                )}
            </div>

            <div className="p-6 border-t border-gray-200 bg-gray-50">
                <h4 className="text-lg font-semibold text-gray-800 mb-4">Remarks</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Class Teacher's Remarks</label>
                        {editable ? (
                            <>
                                <textarea
                                    value={teacherRemark}
                                    onChange={(e) => onTeacherRemarkChange?.(e.target.value)}
                                    className="print:hidden w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none h-32 resize-none"
                                    placeholder="Enter remarks..."
                                />
                                <div className="hidden print:block p-3 border border-gray-200 rounded-lg min-h-[8rem] whitespace-pre-wrap">
                                    {teacherRemark}
                                </div>
                            </>
                        ) : (
                            <div className="p-3 border border-gray-200 rounded-lg min-h-[8rem] whitespace-pre-wrap">
                                {report.classTeacherRemark || teacherRemark}
                            </div>
                        )}
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Principal's Remarks</label>
                        {editable ? (
                            <>
                                <textarea
                                    value={principalRemark}
                                    onChange={(e) => onPrincipalRemarkChange?.(e.target.value)}
                                    className="print:hidden w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none h-32 resize-none"
                                    placeholder="Enter remarks..."
                                />
                                <div className="hidden print:block p-3 border border-gray-200 rounded-lg min-h-[8rem] whitespace-pre-wrap">
                                    {principalRemark}
                                </div>
                            </>
                        ) : (
                            <div className="p-3 border border-gray-200 rounded-lg min-h-[8rem] whitespace-pre-wrap">
                                {report.principalRemark || principalRemark}
                            </div>
                        )}
                    </div>
                </div>
                {editable && (
                    <div className="mt-4 flex justify-end">
                        <button
                            onClick={onSaveRemarks}
                            disabled={saving}
                            className="print:hidden px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-blue-300"
                        >
                            {saving ? 'Saving...' : 'Save Remarks'}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default StudentReportCard;
