import { useState, useEffect } from 'react';
import { FileText, Download, User, Award, BookOpen } from 'lucide-react';
import api from '../../utils/api';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface TermResult {
    id: string;
    totalScore: number; // This is actually a string/decimal in DB but number here
    grade?: string;
    remarks?: string;
    subject: {
        name: string;
        code: string;
    };
    term: {
        id: string;
        name: string;
        startDate: string;
        endDate: string;
    };
}

interface Student {
    id: string;
    firstName: string;
    lastName: string;
    admissionNumber: string;
    class: {
        name: string;
    } | null;
    termResults: TermResult[];
}

interface AcademicTermOption {
    id: string;
    name: string;
    isActive?: boolean;
}

const AcademicReports = () => {
    const [children, setChildren] = useState<Student[]>([]);
    const [selectedChildId, setSelectedChildId] = useState<string>('');
    const [academicTerms, setAcademicTerms] = useState<AcademicTermOption[]>([]);
    const [selectedAcademicTermId, setSelectedAcademicTermId] = useState('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.get('/academic-terms').then(response => {
            const terms = Array.isArray(response.data) ? response.data : [];
            const defaultTerm = terms.find((term: AcademicTermOption) => term.isActive) || terms[0];
            setAcademicTerms(terms);
            setSelectedAcademicTermId(defaultTerm?.id || '');
            if (!defaultTerm) setLoading(false);
        }).catch(error => {
            console.error('Error fetching academic terms:', error);
            setLoading(false);
        });
    }, []);

    useEffect(() => {
        if (selectedAcademicTermId) fetchChildren(selectedAcademicTermId);
    }, [selectedAcademicTermId]);

    const fetchChildren = async (academicTermId: string) => {
        setLoading(true);
        try {
            const response = await api.get('/students/my-children', { params: { academicTermId } });
            setChildren(response.data);
            if (response.data.length > 0) {
                setSelectedChildId(response.data[0].id);
            }
        } catch (error) {
            console.error('Error fetching children:', error);
        } finally {
            setLoading(false);
        }
    };

    const selectedChild = children.find(c => c.id === selectedChildId);

    // Group results by Term
    const resultsByTerm = selectedChild?.termResults?.reduce((acc, result) => {
        const termId = result.term.id;
        if (!acc[termId]) {
            acc[termId] = {
                termName: result.term.name,
                startDate: result.term.startDate,
                endDate: result.term.endDate,
                results: []
            };
        }
        acc[termId].results.push(result);
        return acc;
    }, {} as Record<string, { termName: string; startDate: string; endDate: string; results: TermResult[] }>) || {};

    const generateReportCard = (termId: string) => {
        if (!selectedChild) return;
        const termData = resultsByTerm[termId];
        if (!termData) return;

        const doc = new jsPDF();

        // -- Header --
        doc.setFillColor(30, 41, 59); // Slate 900
        doc.rect(0, 0, 210, 40, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(22);
        doc.setFont('helvetica', 'bold');
        doc.text('ACADEMIC REPORT CARD', 105, 20, { align: 'center' });
        doc.setFontSize(12);
        doc.setFont('helvetica', 'normal');
        doc.text(termData.termName, 105, 30, { align: 'center' });

        // -- Student Details --
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text(`Student Name:`, 15, 55);
        doc.setFont('helvetica', 'normal');
        doc.text(`${selectedChild.firstName} ${selectedChild.lastName}`, 50, 55);

        doc.setFont('helvetica', 'bold');
        doc.text(`Admission No:`, 15, 62);
        doc.setFont('helvetica', 'normal');
        doc.text(selectedChild.admissionNumber, 50, 62);

        doc.setFont('helvetica', 'bold');
        doc.text(`Class:`, 140, 55);
        doc.setFont('helvetica', 'normal');
        doc.text(selectedChild.class?.name || 'N/A', 160, 55);

        // -- Table --
        const tableBody = termData.results.map(r => [
            r.subject.name,
            r.subject.code,
            Number(r.totalScore), // Assuming score out of 100
            r.grade || '-',
            r.remarks || '-'
        ]);

        autoTable(doc, {
            startY: 75,
            head: [['Subject', 'Code', 'Score (%)', 'Grade', 'Remarks']],
            body: tableBody,
            theme: 'grid',
            headStyles: { fillColor: [37, 99, 235] }, // Blue 600
        });

        // -- Footer --
        const finalY = (doc as any).lastAutoTable.finalY + 20;

        // Summary Box
        const totalScore = termData.results.reduce((sum, r) => sum + Number(r.totalScore), 0);
        const average = Math.round(totalScore / termData.results.length);

        doc.setDrawColor(200, 200, 200);
        doc.setFillColor(248, 250, 252);
        doc.roundedRect(15, finalY, 180, 25, 2, 2, 'FD');

        doc.setFontSize(10);
        doc.text('Overall Average:', 25, finalY + 10);
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text(`${average}%`, 25, finalY + 18);

        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text('Performance Summary:', 80, finalY + 10);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        const performance = average >= 75 ? 'Excellent' : average >= 60 ? 'Good' : average >= 50 ? 'Satisfactory' : 'Needs Improvement';
        doc.text(performance, 80, finalY + 18);

        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text('This is a computer-generated report.', 105, 280, { align: 'center' });

        doc.save(`${selectedChild.firstName}_${termData.termName}_Report.pdf`);
    };

    if (loading) return <div className="p-8 text-center text-gray-500 dark:text-gray-400">Loading academic data...</div>;

    return (
        <div className="p-4 md:p-6 pb-24 md:pb-6 max-w-7xl mx-auto">
            <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800 dark:text-white flex items-center gap-3">
                        <Award className="text-blue-600" size={32} />
                        Academic Reports
                    </h1>
                    <p className="text-gray-500 dark:text-gray-400 mt-2">View and download one term's performance reports for your children.</p>
                </div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Reporting term
                    <select
                        value={selectedAcademicTermId}
                        onChange={(event) => setSelectedAcademicTermId(event.target.value)}
                        className="mt-1 block min-w-56 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-gray-800 outline-none focus:border-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                    >
                        {academicTerms.map(term => <option key={term.id} value={term.id}>{term.name}</option>)}
                    </select>
                </label>
            </div>

            {children.length > 0 ? (
                <>
                    {/* Child Selector Tabs */}
                    <div className="flex space-x-2 mb-8 overflow-x-auto pb-2 border-b border-gray-200 dark:border-slate-700">
                        {children.map(child => (
                            <button
                                key={child.id}
                                onClick={() => setSelectedChildId(child.id)}
                                className={`flex items-center space-x-2 px-6 py-3 rounded-t-lg text-sm font-medium transition-colors whitespace-nowrap border-b-2 ${selectedChildId === child.id
                                        ? 'border-blue-600 text-blue-600 bg-blue-50/50 dark:bg-blue-900/30'
                                        : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-surface-hover'
                                    }`}
                            >
                                <User size={18} />
                                <span>{child.firstName}</span>
                            </button>
                        ))}
                    </div>

                    {Object.keys(resultsByTerm).length > 0 ? (
                        <div className="space-y-8">
                            {Object.keys(resultsByTerm).sort((a, b) => b.localeCompare(a)).map(termId => { // Sort descending roughly
                                const termData = resultsByTerm[termId];
                                const totalScore = termData.results.reduce((sum, r) => sum + Number(r.totalScore), 0);
                                const average = Math.round(totalScore / termData.results.length);

                                return (
                                    <div key={termId} className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden">
                                        <div className="bg-gray-50 dark:bg-slate-700 px-6 py-4 border-b border-gray-200 dark:border-slate-600 flex justify-between items-center flex-wrap gap-4">
                                            <div>
                                                <h3 className="text-lg font-bold text-gray-800 dark:text-white">{termData.termName}</h3>
                                                <p className="text-sm text-gray-500 dark:text-gray-400">
                                                    {new Date(termData.startDate).getFullYear()} • Average: <span className="font-bold text-blue-600">{average}%</span>
                                                </p>
                                            </div>
                                            <button
                                                onClick={() => generateReportCard(termId)}
                                                className="flex items-center gap-2 bg-white dark:bg-slate-600 border border-gray-300 dark:border-slate-500 hover:bg-surface-hover text-gray-700 dark:text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm"
                                            >
                                                <Download size={16} />
                                                Download Report PDF
                                            </button>
                                        </div>

                                        <div className="p-6">
                                            <div className="overflow-x-auto">
                                                <table className="w-full text-left">
                                                    <thead>
                                                        <tr className="border-b border-gray-100 dark:border-slate-700">
                                                            <th className="pb-3 px-4 font-semibold text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider">Subject</th>
                                                            <th className="pb-3 px-4 font-semibold text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider">Score</th>
                                                            <th className="pb-3 px-4 font-semibold text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider">Grade</th>
                                                            <th className="pb-3 px-4 font-semibold text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider">Remarks</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-gray-50 dark:divide-slate-700">
                                                        {termData.results.map((result) => (
                                                            <tr key={result.id} className="hover:bg-surface-hover transition-colors">
                                                                <td className="py-3 px-4">
                                                                    <div className="flex items-center gap-2">
                                                                        <BookOpen size={14} className="text-gray-400" />
                                                                        <span className="font-medium text-gray-800 dark:text-white">{result.subject.name}</span>
                                                                    </div>
                                                                </td>
                                                                <td className="py-3 px-4 font-semibold text-gray-900 dark:text-white">{Number(result.totalScore)}%</td>
                                                                <td className="py-3 px-4">
                                                                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${(result.grade?.startsWith('A') || result.grade === 'D1' || result.grade === 'D2') ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' :
                                                                            (result.grade?.startsWith('B') || result.grade?.startsWith('C')) ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' :
                                                                                'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400'
                                                                        }`}>
                                                                        {result.grade || '-'}
                                                                    </span>
                                                                </td>
                                                                <td className="py-3 px-4 text-sm text-gray-500 dark:text-gray-400 truncate max-w-xs">{result.remarks || '-'}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="text-center py-16 bg-white dark:bg-slate-800 rounded-xl border-2 border-dashed border-gray-200 dark:border-slate-600">
                            <FileText size={48} className="mx-auto text-gray-300 dark:text-gray-600 mb-4" />
                            <h3 className="text-lg font-medium text-gray-900 dark:text-white">No Academic Records</h3>
                            <p className="text-gray-500 dark:text-gray-400 mt-1">No term reports found for {selectedChild?.firstName}.</p>
                        </div>
                    )}
                </>
            ) : (
                <div className="text-center py-20">
                    <p className="text-gray-500 dark:text-gray-400">No children linked to your account.</p>
                </div>
            )}
        </div>
    );
};

export default AcademicReports;
