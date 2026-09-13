export interface GradebookAssessment {
  id: string;
  title: string;
  type: string;
  totalMarks: number;
  weight: number;
  date: string;
}

export interface GradebookResult {
  assessmentId: string;
  studentId: string;
  score: number | string;
}

export interface ScoreEdit {
  assessmentId: string;
  studentId: string;
  value: string;
}

export const scoreKey = (studentId: string, assessmentId: string) => JSON.stringify([studentId, assessmentId]);

export function validateScore(value: string, totalMarks: number): string | undefined {
  if (!Number.isFinite(Number(totalMarks)) || Number(totalMarks) <= 0) return 'This assessment needs a valid maximum mark.';
  if (!value.trim()) return 'Enter a score, or undo this change. Blank does not erase a saved score.';
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim()) || !Number.isFinite(Number(value))) return 'Enter a valid, non-negative number.';
  if (Number(value) > Number(totalMarks)) return `Enter a score from 0 to ${totalMarks}.`;
  return undefined;
}

export function updateScoreEdit(edits: Record<string, ScoreEdit>, studentId: string, assessmentId: string, value: string, saved: string) {
  const next = { ...edits };
  const key = scoreKey(studentId, assessmentId);
  // Preserve intermediate decimal input such as "12." and "12.0" while typing.
  // Only an exact return to the saved value clears the draft.
  if (value === saved) delete next[key];
  else next[key] = { studentId, assessmentId, value };
  return next;
}

export function studentProgress(assessments: GradebookAssessment[], scoreFor: (assessmentId: string) => string) {
  let recorded = 0;
  let weightedScore = 0;
  let enteredWeight = 0;
  for (const assessment of assessments) {
    const value = scoreFor(assessment.id);
    if (validateScore(value, assessment.totalMarks)) continue;
    recorded += 1;
    const weight = Number(assessment.weight);
    if (Number.isFinite(weight) && weight > 0) {
      weightedScore += Number(value) / Number(assessment.totalMarks) * weight;
      enteredWeight += weight;
    }
  }
  return { recorded, average: enteredWeight > 0 ? weightedScore / enteredWeight * 100 : null };
}

/** A failed assessment retains its draft; successful assessments are committed locally. */
export async function saveScoreEdits(
  edits: Record<string, ScoreEdit>,
  assessments: GradebookAssessment[],
  save: (assessmentId: string, results: Array<{ studentId: string; score: number }>) => Promise<unknown>,
) {
  const groups = new Map<string, Array<{ key: string; edit: ScoreEdit }>>();
  for (const [key, edit] of Object.entries(edits)) {
    const assessment = assessments.find(item => item.id === edit.assessmentId);
    if (!assessment || validateScore(edit.value, assessment.totalMarks)) throw new Error('Correct the highlighted scores before saving.');
    const group = groups.get(edit.assessmentId) ?? [];
    group.push({ key, edit });
    groups.set(edit.assessmentId, group);
  }
  const batches = [...groups.entries()];
  const outcomes = await Promise.allSettled(batches.map(async ([assessmentId, entries]) =>
    save(assessmentId, entries.map(({ edit }) => ({ studentId: edit.studentId, score: Number(edit.value) }))),
  ));
  const savedKeys: string[] = [];
  let failedAssessments = 0;
  outcomes.forEach((outcome, index) => {
    if (outcome.status === 'fulfilled') savedKeys.push(...batches[index][1].map(entry => entry.key));
    else failedAssessments += 1;
  });
  return { savedKeys, failedAssessments };
}
