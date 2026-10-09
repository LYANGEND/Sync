import { AlertTriangle, Users, Info } from 'lucide-react';

export type StudentMatchStrength = 'LIKELY_SAME' | 'LIKELY_SIBLING' | 'POSSIBLE';

export interface StudentMatch {
  strength: StudentMatchStrength;
  reasons: string[];
  student: {
    id: string | null;
    firstName: string;
    lastName: string;
    admissionNumber: string | null;
    status: string;
    className: string | null;
    branchName: string | null;
    guardianName: string | null;
    guardianPhone: string | null;
    guardianEmail: string | null;
  };
}

interface GuardianDetails {
  guardianName: string;
  guardianPhone: string;
  guardianEmail: string;
}

interface StudentMatchPanelProps {
  matches: StudentMatch[];
  confirmed: boolean;
  onConfirmedChange: (confirmed: boolean) => void;
  onViewStudent: (studentId: string) => void;
  onUseGuardian: (guardian: GuardianDetails) => void;
  showBranch?: boolean;
}

const PANEL_COPY: Record<StudentMatchStrength, { title: string; body: string; icon: typeof Info; shell: string; iconColor: string }> = {
  LIKELY_SAME: {
    title: 'This student may already exist',
    body: 'Open the existing record instead of creating a duplicate. Returning students keep their history and balances.',
    icon: AlertTriangle,
    shell: 'border-amber-300 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-500/10',
    iconColor: 'text-amber-600 dark:text-amber-400',
  },
  LIKELY_SIBLING: {
    title: 'This guardian already has children here',
    body: 'If this is a sibling, reuse the guardian details so the family stays linked to one parent account.',
    icon: Users,
    shell: 'border-blue-200 bg-blue-50 dark:border-blue-500/40 dark:bg-blue-500/10',
    iconColor: 'text-blue-600 dark:text-blue-400',
  },
  POSSIBLE: {
    title: 'Similar records found',
    body: 'These share a name with the new student. Check they are different people.',
    icon: Info,
    shell: 'border-slate-200 bg-slate-50 dark:border-slate-600 dark:bg-slate-700/40',
    iconColor: 'text-slate-500 dark:text-slate-400',
  },
};

const STRENGTH_LABEL: Record<StudentMatchStrength, string> = {
  LIKELY_SAME: 'Likely same student',
  LIKELY_SIBLING: 'Likely sibling',
  POSSIBLE: 'Possible match',
};

const formatStatus = (status: string) => status.charAt(0) + status.slice(1).toLowerCase().replace(/_/g, ' ');

const StudentMatchPanel = ({
  matches,
  confirmed,
  onConfirmedChange,
  onViewStudent,
  onUseGuardian,
  showBranch = false,
}: StudentMatchPanelProps) => {
  if (matches.length === 0) return null;

  const topStrength = matches[0].strength;
  const copy = PANEL_COPY[topStrength];
  const Icon = copy.icon;

  return (
    <div className={`rounded-lg border p-4 ${copy.shell}`} role="status" aria-live="polite">
      <div className="flex items-start gap-3">
        <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${copy.iconColor}`} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900 dark:text-white">{copy.title}</p>
          <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">{copy.body}</p>

          <ul className="mt-3 space-y-2">
            {matches.map(({ student, strength, reasons }) => {
              const hasGuardian = Boolean(student.guardianName || student.guardianPhone || student.guardianEmail);
              return (
                <li
                  key={student.id ?? `${student.firstName}-${student.lastName}`}
                  className="rounded-md border border-slate-200 bg-white p-3 dark:border-slate-600 dark:bg-slate-800"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900 dark:text-white">
                        {student.firstName} {student.lastName}
                        {student.admissionNumber && (
                          <span className="ml-2 font-normal text-slate-500 dark:text-slate-400">{student.admissionNumber}</span>
                        )}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {[
                          STRENGTH_LABEL[strength],
                          student.className,
                          showBranch ? student.branchName : null,
                          student.status !== 'ACTIVE' ? formatStatus(student.status) : null,
                        ].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      {hasGuardian && strength !== 'LIKELY_SAME' && (
                        <button
                          type="button"
                          onClick={() => onUseGuardian({
                            guardianName: student.guardianName ?? '',
                            guardianPhone: student.guardianPhone ?? '',
                            guardianEmail: student.guardianEmail ?? '',
                          })}
                          className="rounded-md px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-surface-hover dark:text-slate-200"
                        >
                          Use guardian details
                        </button>
                      )}
                      {student.id && (
                        <button
                          type="button"
                          onClick={() => onViewStudent(student.id!)}
                          className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-white hover:bg-primary-hover"
                        >
                          Open record
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {reasons.map(reason => (
                      <span
                        key={reason}
                        className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-700 dark:text-slate-300"
                      >
                        {reason}
                      </span>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>

          {topStrength === 'LIKELY_SAME' && (
            <label className="mt-3 flex items-start gap-2 text-sm text-slate-700 dark:text-slate-200">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => onConfirmedChange(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300"
              />
              I have checked these records and this is a different child.
            </label>
          )}
        </div>
      </div>
    </div>
  );
};

export default StudentMatchPanel;
