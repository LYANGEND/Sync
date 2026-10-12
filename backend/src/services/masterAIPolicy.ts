// Master AI access rules: which role may use which tool, which steps wait for the user's
// confirmation, and matching typed learner names to a class roster.
// No database imports, so these rules can be unit tested directly.

export type PlannedAction = { tool: string; params: Record<string, any> };

/** Roles that may open Master AI at all. */
export const MASTER_AI_ROLES = ['SUPER_ADMIN', 'TEACHER', 'BURSAR'];

// Teachers get reference tools, content generation and daily class work, all scoped to their own classes.
export const TEACHER_TOOLS = new Set([
  'list_calendar_events',
  'list_academic_terms',
  'list_subjects',
  'list_topics',
  'list_classes',
  'list_lesson_plans',
  'get_lesson_plan_content',
  'generate_lesson_plans',
  'generate_assessments',
  'generate_homework',
  'get_class_insights',
  'generate_report_remarks',
  'save_report_remarks',
  'record_attendance',
  'record_marks',
  'get_homework_status',
  'get_at_risk_learners',
]);

// Bursars get the finance look-ups and fee reminders.
export const BURSAR_TOOLS = new Set([
  'list_academic_terms',
  'list_classes',
  'list_fee_templates',
  'search_payments',
  'get_payment_analytics',
  'get_student_payment_history',
  'get_student_fee_balances',
  'get_invoice_summary',
  'send_fee_reminders',
]);

const ROLE_TOOLS: Record<string, Set<string>> = { TEACHER: TEACHER_TOOLS, BURSAR: BURSAR_TOOLS };

export const isUnrestrictedRole = (role: string) => role === 'SUPER_ADMIN';

export function canUseTool(role: string, toolName: string): boolean {
  return isUnrestrictedRole(role) || !!ROLE_TOOLS[role]?.has(toolName);
}

// Tools that delete data, overwrite records or reach other people run only after the user confirms.
export const CONFIRM_TOOLS = new Set([
  'delete_calendar_events',
  'delete_topics',
  'send_notifications',
  'send_sms',
  'create_announcements',
  'cleanup_class_subjects',
  'cleanup_invalid_syllabi',
  'record_attendance',
  'record_marks',
  'send_fee_reminders',
]);

export function needsConfirmation(action: PlannedAction, role: string): boolean {
  if (!CONFIRM_TOOLS.has(action.tool) || !canUseTool(role, action.tool)) return false;
  // Cleanup tools only preview unless dryRun is explicitly "false" (mirrors the tool's own check).
  return !action.tool.startsWith('cleanup_') || action.params?.dryRun === 'false';
}

export interface RosterLearner {
  id: string;
  firstName: string;
  lastName: string;
  admissionNumber: string;
}

const words = (text: string) => text.toLowerCase().replace(/[^a-z0-9'\- ]/g, ' ').split(/\s+/).filter(Boolean);
const fullName = (l: RosterLearner) => `${l.firstName} ${l.lastName}`;

/**
 * Match typed learner names (or admission numbers) to a class roster.
 * Each name must point to exactly one learner; anything else is reported so nothing is saved against the wrong child.
 */
export function matchLearners(names: string[], roster: RosterLearner[]): { matched: RosterLearner[]; problems: string[] } {
  const matched = new Map<string, RosterLearner>();
  const problems: string[] = [];
  const indexed = roster.map(l => ({ learner: l, words: words(fullName(l)) }));

  for (const raw of names) {
    const name = String(raw).trim();
    if (!name) continue;
    const query = words(name);
    const byAdmission = roster.filter(l => l.admissionNumber.toLowerCase() === name.toLowerCase());
    let candidates = byAdmission.length ? byAdmission : indexed.filter(i => query.every(q => i.words.includes(q))).map(i => i.learner);
    // Allow short forms such as "Chile" for "Chileshe" when nothing matches exactly.
    if (!candidates.length) {
      candidates = indexed
        .filter(i => query.every(q => q.length >= 3 && i.words.some(w => w.startsWith(q))))
        .map(i => i.learner);
    }
    if (candidates.length === 1) matched.set(candidates[0].id, candidates[0]);
    else if (candidates.length === 0) problems.push(`No learner called "${name}" in this class`);
    else problems.push(`"${name}" matches ${candidates.slice(0, 4).map(fullName).join(', ')}. Use the full name`);
  }
  return { matched: [...matched.values()], problems };
}
