import React, { useState, useEffect } from 'react';
import { Printer, School, Phone, Mail, MapPin } from 'lucide-react';
import QRCode from 'qrcode';
import { StudentReport } from '../../services/reportCardService';

const QUICK_COMMENTS = [
    "Excellent performance, keep it up!",
    "Good progress shown this term.",
    "Satisfactory but allows room for improvement.",
    "Needs to pay more attention in class.",
    "Outstanding academic achievement.",
    "Required to work harder next term.",
    "Participates well in class activities.",
    "A pleasure to have in class."
];

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
    const [qrCodeUrl, setQrCodeUrl] = useState('');

    useEffect(() => {
        if (report) {
            // Updated to link to verification page
            const verifyUrl = `${window.location.origin}/verify/report/${report.id}`;
            QRCode.toDataURL(verifyUrl, { margin: 1, width: 100 })
                .then(url => setQrCodeUrl(url))
                .catch(err => console.error(err));
        }
    }, [report]);

    return (
        <div className={`bg-white mx-auto print:w-full max-w-4xl p-8 print:p-0 print:m-0 ${className}`}>

            {/* Print Wrapper to force A4-like constraints if needed, mostly handled by @media print */}
            <div className="relative border-4 border-double border-slate-800 p-8 print:border-4 print:border-double print:border-slate-800 h-full">

                {/* Watermark */}
                <div className="absolute inset-0 flex items-center justify-center opacity-[0.03] pointer-events-none overflow-hidden">
                    <School size={500} />
                </div>

                {/* Header Section */}
                <div className="relative z-10 border-b-2 border-slate-800 pb-6 mb-6">
                    <div className="flex justify-between items-center gap-6">
                        <div className="w-24 h-24 flex items-center justify-center bg-slate-900 text-white rounded-full print:bg-slate-900 print:text-white shrink-0">
                            <School size={48} />
                        </div>
                        <div className="text-center flex-1">
                            <h1 className="text-3xl font-serif font-bold text-slate-900 uppercase tracking-widest mb-2">
                                {report.school?.schoolName || 'Sync International School'}
                            </h1>
                            <div className="text-sm font-medium text-slate-600 flex flex-wrap justify-center gap-4">
                                <span className="flex items-center gap-1"><MapPin size={12} /> {report.school?.schoolAddress || 'P.O Box 3000, Lusaka, Zambia'}</span>
                                <span className="flex items-center gap-1"><Phone size={12} /> {report.school?.schoolPhone || '+260 977 123 456'}</span>
                                <span className="flex items-center gap-1"><Mail size={12} /> {report.school?.schoolEmail || 'info@syncschool.edu.zm'}</span>
                            </div>
                        </div>
                        <div className="w-24 shrink-0 text-right hidden sm:block">
                            {/* Placeholder for Photo or Motto */}
                            <div className="text-xs font-serif italic text-slate-500">"Excellence in Everything"</div>
                        </div>
                    </div>
                </div>

                {/* Report Title */}
                <div className="text-center mb-8">
                    <h2 className="text-xl font-bold text-slate-800 uppercase inline-block border-b mb-1">End of Term Report</h2>
                    <p className="text-slate-500 font-serif">{report.academicYear || `Academic Year ${new Date().getFullYear()}`}</p>
                </div>

                {/* Student Details Grid */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-y-4 gap-x-8 text-sm mb-8 p-4 bg-slate-50 border border-slate-200 rounded-sm print:bg-slate-50 print:border-slate-200">
                    <div>
                        <span className="block text-xs font-bold text-slate-500 uppercase">Student Name</span>
                        <span className="font-bold text-slate-900 text-base">{report.student?.firstName} {report.student?.lastName}</span>
                    </div>
                    <div>
                        <span className="block text-xs font-bold text-slate-500 uppercase">Admission No.</span>
                        <span className="font-mono text-slate-800">{report.student?.admissionNumber || '-'}</span>
                    </div>
                    <div>
                        <span className="block text-xs font-bold text-slate-500 uppercase">Class</span>
                        <span className="font-bold text-slate-900">
                            {report.class?.name}
                            {/* <span className="text-slate-500 font-normal ml-1">(Grade {report.class?.gradeLevel})</span> */}
                        </span>
                    </div>
                    <div>
                        <span className="block text-xs font-bold text-slate-500 uppercase">Term</span>
                        <span className="font-bold text-slate-900">{report.term?.name}</span>
                    </div>

                    {/* Row 2 */}
                    <div>
                        <span className="block text-xs font-bold text-slate-500 uppercase">Attendance</span>
                        <span className="font-bold text-slate-900">
                            {report.totalAttendance !== undefined ? `${report.totalAttendance} / ${report.totalDays || '-'}` : '-'} Days
                        </span>
                    </div>
                    <div>
                        <span className="block text-xs font-bold text-slate-500 uppercase">Position</span>
                        <span className="font-bold text-slate-900">{report.rank ? `${report.rank}` : '-'}</span>
                    </div>
                    <div className="col-span-2">
                        <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-500 uppercase text-xs">Overall Average:</span>
                            <div className="flex-1 bg-gray-200 h-2 rounded-full overflow-hidden print:bg-gray-200">
                                <div className="bg-slate-800 h-full print:bg-slate-800" style={{ width: `${Math.min(100, Math.max(0, report.averageScore))}%` }}></div>
                            </div>
                            <span className="font-bold text-lg text-slate-900">{Number(report.averageScore || 0).toFixed(1)}%</span>
                        </div>
                    </div>
                </div>

                {/* Results Table */}
                <div className="mb-8 overflow-hidden border border-slate-200 rounded-sm">
                    <table className="w-full text-left text-sm">
                        <thead>
                            <tr className="bg-slate-800 text-white print:bg-slate-800 print:text-white">
                                <th className="px-4 py-2 font-bold uppercase tracking-wider text-xs w-1/3">Subject</th>
                                <th className="px-4 py-2 font-bold uppercase tracking-wider text-xs text-center border-l border-slate-600">Marks</th>
                                <th className="px-4 py-2 font-bold uppercase tracking-wider text-xs text-center border-l border-slate-600">Grade</th>
                                <th className="px-4 py-2 font-bold uppercase tracking-wider text-xs border-l border-slate-600">Remarks</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                            {report.results && report.results.length > 0 ? (
                                report.results.map((result, idx) => (
                                    <tr key={result.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50 print:bg-slate-50'}>
                                        <td className="px-4 py-2 font-medium text-slate-800 border-r border-slate-100">{result.subjectName}</td>
                                        <td className="px-4 py-2 text-center font-mono text-slate-700 border-r border-slate-100">{Number(result.totalScore).toFixed(1)}</td>
                                        <td className="px-4 py-2 text-center font-bold text-slate-900 border-r border-slate-100">{result.grade}</td>
                                        <td className="px-4 py-2 text-slate-600 italic text-xs">{result.remarks || '-'}</td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={4} className="p-8 text-center text-slate-500 italic">No academic results recorded for this term.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Footer Section: Remarks & Signatures */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                    {/* Teacher Remarks */}
                    <div className="border border-slate-200 p-4 rounded-sm bg-slate-50 print:bg-slate-50 relative">
                        <div className="flex justify-between items-center mb-2">
                            <h4 className="font-bold text-slate-800 uppercase text-xs">Class Teacher's Remarks</h4>
                            {editable && (
                                <select
                                    className="text-xs border border-gray-300 rounded px-2 py-1 print:hidden bg-white text-gray-700 focus:border-blue-500 focus:outline-none"
                                    onChange={(e) => {
                                        if (e.target.value) onTeacherRemarkChange?.(teacherRemark + (teacherRemark ? '\n' : '') + e.target.value);
                                    }}
                                    value=""
                                >
                                    <option value="">+ Quick Comment</option>
                                    {QUICK_COMMENTS.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                            )}
                        </div>

                        {editable ? (
                            <>
                                <textarea
                                    value={teacherRemark}
                                    onChange={(e) => onTeacherRemarkChange?.(e.target.value)}
                                    className="print:hidden w-full px-3 py-2 border border-slate-300 bg-white rounded text-sm focus:ring-1 focus:ring-slate-500 outline-none h-24 resize-none"
                                    placeholder="Enter remarks..."
                                />
                                <div className="hidden print:block min-h-[4rem] text-sm text-slate-700 font-serif italic whitespace-pre-wrap">
                                    {teacherRemark || "No remarks provided."}
                                </div>
                            </>
                        ) : (
                            <div className="min-h-[4rem] text-sm text-slate-700 font-serif italic whitespace-pre-wrap">
                                {report.classTeacherRemark || teacherRemark || "No remarks provided."}
                            </div>
                        )}

                        <div className="mt-6 pt-4 border-t border-slate-300">
                            <div className="flex justify-between items-end">
                                <div>
                                    <div className="text-xs text-slate-400 mb-1">Signature</div>
                                    <div className="h-8 border-b border-slate-400 w-32"></div>
                                </div>
                                <div className="text-xs text-slate-400">Date: {new Date().toLocaleDateString()}</div>
                            </div>
                        </div>
                    </div>

                    {/* Principal Remarks */}
                    <div className="border border-slate-200 p-4 rounded-sm bg-slate-50 print:bg-slate-50">
                        <h4 className="font-bold text-slate-800 uppercase text-xs mb-3">Head Teacher's Remarks</h4>
                        {editable ? (
                            <>
                                <textarea
                                    value={principalRemark}
                                    onChange={(e) => onPrincipalRemarkChange?.(e.target.value)}
                                    className="print:hidden w-full px-3 py-2 border border-slate-300 bg-white rounded text-sm focus:ring-1 focus:ring-slate-500 outline-none h-24 resize-none"
                                    placeholder="Enter remarks..."
                                />
                                <div className="hidden print:block min-h-[4rem] text-sm text-slate-700 font-serif italic whitespace-pre-wrap">
                                    {principalRemark || "No remarks provided."}
                                </div>
                            </>
                        ) : (
                            <div className="min-h-[4rem] text-sm text-slate-700 font-serif italic whitespace-pre-wrap">
                                {report.principalRemark || principalRemark || "No remarks provided."}
                            </div>
                        )}

                        <div className="mt-6 pt-4 border-t border-slate-300">
                            <div className="flex justify-between items-end">
                                <div>
                                    <div className="text-xs text-slate-400 mb-1">Signature & Stamp</div>
                                    <div className="h-8 border-b border-slate-400 w-32"></div>
                                </div>
                                <div className="text-xs text-slate-400">Date: {new Date().toLocaleDateString()}</div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Bottom Stats & QR */}
                <div className="flex items-end justify-between border-t-2 border-slate-800 pt-4">
                    {/* Grading Key */}
                    <div className="text-[10px] text-slate-500">
                        <span className="font-bold text-slate-700 mr-2">Grading System:</span>
                        A+ (90-100) | A (80-89) | B (70-79) | C (60-69) | D (50-59) | F (0-49)
                    </div>

                    {/* Verified QR */}
                    <div className="flex items-center gap-2">
                        <div className="text-right">
                            <div className="text-[10px] uppercase font-bold text-slate-400">Scan to Verify</div>
                            <div className="text-[10px] text-slate-400">Sync School System</div>
                        </div>
                        {qrCodeUrl && (
                            <img src={qrCodeUrl} alt="Report QR Code" className="w-16 h-16 border border-slate-200 p-1 bg-white" />
                        )}
                    </div>
                </div>

            </div>

            {/* UI: Print/Save Buttons (Outside the report border) */}
            {editable && (
                <div className="mt-6 flex justify-end gap-3 print:hidden">
                    <button
                        onClick={onSaveRemarks}
                        disabled={saving}
                        className="px-6 py-2 bg-slate-800 text-white rounded hover:bg-slate-900 transition-colors disabled:opacity-50 text-sm font-medium"
                    >
                        {saving ? 'Saving...' : 'Save Remarks'}
                    </button>
                    <button
                        onClick={() => window.print()}
                        className="px-6 py-2 border border-slate-300 text-slate-700 bg-white rounded hover:bg-slate-50 transition-colors text-sm font-medium flex items-center gap-2"
                    >
                        <Printer size={16} />
                        Print Official Report
                    </button>
                </div>
            )}
        </div>
    );
};

export default StudentReportCard;
