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
    };
    termResults: TermResult[];
}

const AcademicReports = () => {
    const [children, setChildren] = useState<Student[]>([]);
    const [selectedChildId, setSelectedChildId] = useState<string>('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchChildren();
    }, []);

    const fetchChildren = async () => {
        try {
            const response = await api.get('/students/my-children');
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

    if (loading) return <div className="ds-page ds-empty">Loading academic data...</div>;

    return (
        <div className="ds-page max-w-7xl mx-auto">
            <div className="ds-page-header">
                <div>
                    <p className="ds-page-kicker">Parent portal</p>
                    <h1 className="ds-page-title flex items-center gap-3">
                        <Award className="text-[var(--action-color)]" size={32} />
                        Academic Reports
                    </h1>
                    <p className="ds-page-subtitle">View and download term performance reports for your children.</p>
                </div>
            </div>

            {children.length > 0 ? (
                <>
                    {/* Child Selector Tabs */}
                    <div className="mb-8 flex space-x-2 overflow-x-auto border-b border-[var(--border-color)] pb-2">
                        {children.map(child => (
                            <button
                                key={child.id}
                                onClick={() => setSelectedChildId(child.id)}
                                className={`flex items-center space-x-2 whitespace-nowrap rounded-t-lg border-b-2 px-6 py-3 text-sm font-medium transition-colors ${selectedChildId === child.id
                                        ? 'border-[var(--action-color)] bg-[var(--surface-muted)] text-[var(--text-primary)]'
                                        : 'border-transparent text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]'
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
                                    <div key={termId} className="ds-surface overflow-hidden">
                                        <div className="border-b border-[var(--border-color)] bg-[var(--surface-muted)] px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
                                            <div>
                                                <h3 className="text-lg font-bold text-[var(--text-primary)]">{termData.termName}</h3>
                                                <p className="text-sm text-[var(--text-secondary)]">
                                                    {new Date(termData.startDate).getFullYear()} • Average: <span className="font-bold text-[var(--action-color)]">{average}%</span>
                                                </p>
                                            </div>
                                            <button
                                                onClick={() => generateReportCard(termId)}
                                                className="ds-button-outline"
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
                                                            <tr key={result.id} className="transition-colors hover:bg-[var(--surface-muted)]">
                                                                <td className="py-3 px-4">
                                                                    <div className="flex items-center gap-2">
                                                                        <BookOpen size={14} className="text-[var(--text-tertiary)]" />
                                                                        <span className="font-medium text-[var(--text-primary)]">{result.subject.name}</span>
                                                                    </div>
                                                                </td>
                                                                <td className="py-3 px-4 font-semibold text-[var(--text-primary)]">{Number(result.totalScore)}%</td>
                                                                <td className="py-3 px-4">
                                                                    <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${(result.grade?.startsWith('A') || result.grade === 'D1' || result.grade === 'D2') ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200' :
                                                                            (result.grade?.startsWith('B') || result.grade?.startsWith('C')) ? 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-200' :
                                                                                'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-200'
                                                                        }`}>
                                                                        {result.grade || '-'}
                                                                    </span>
                                                                </td>
                                                                <td className="max-w-xs truncate py-3 px-4 text-sm text-[var(--text-secondary)]">{result.remarks || '-'}</td>
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
                        <div className="ds-empty ds-card">
                            <FileText size={48} className="mx-auto mb-4 text-[var(--text-tertiary)]" />
                            <h3 className="text-lg font-medium text-[var(--text-primary)]">No Academic Records</h3>
                            <p className="mt-1">No term reports found for {selectedChild?.firstName}.</p>
                        </div>
                    )}
                </>
            ) : (
                <div className="ds-empty ds-card">
                    <p>No children linked to your account.</p>
                </div>
            )}
        </div>
    );
};

export default AcademicReports;
