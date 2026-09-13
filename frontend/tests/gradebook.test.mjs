import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

// Use the project's compiler so these dependency-free helpers also run on Node 20.
async function loadHelper(path) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}
const { scoreKey, validateScore, updateScoreEdit, studentProgress, saveScoreEdits } = await loadHelper('../src/utils/gradebook.ts');
const { ACADEMICS_ROLES, academicTabsForRole } = await loadHelper('../src/utils/academicNavigation.ts');

const assessments = [
  { id: 'quiz_one', title: 'Quiz', type: 'QUIZ', totalMarks: 20, weight: 40, date: '' },
  { id: 'exam_two', title: 'Exam', type: 'EXAM', totalMarks: 100, weight: 60, date: '' },
];

test('valid marks include zero, decimals, and the assessment maximum', () => {
  for (const value of ['0', '10.5', '.5', '20']) assert.equal(validateScore(value, 20), undefined);
  for (const value of ['', ' ', '-1', '21', 'NaN', 'Infinity', '1e2', 'abc']) assert.ok(validateScore(value, 20), value);
  assert.ok(validateScore('0', 0));
});

test('clearing a saved score remains invalid and never becomes a zero', () => {
  const key = scoreKey('student_one', 'quiz_one');
  const draft = updateScoreEdit({}, 'student_one', 'quiz_one', '', '12');
  assert.equal(draft[key].value, '');
  assert.ok(validateScore(draft[key].value, 20));
  assert.deepEqual(updateScoreEdit({}, 'student_one', 'quiz_one', '', ''), {});
});

test('reverting a score removes its draft without losing a recorded zero', () => {
  const key = scoreKey('student_one', 'quiz_one');
  const draft = updateScoreEdit({}, 'student_one', 'quiz_one', '0', '');
  assert.equal(draft[key].value, '0');
  assert.deepEqual(updateScoreEdit(draft, 'student_one', 'quiz_one', '12', '12'), {});
});

test('editing an existing integer into a decimal preserves intermediate keystrokes', () => {
  const key = scoreKey('student_one', 'quiz_one');
  let draft = {};
  for (const value of ['12.', '12.0', '12.05']) {
    draft = updateScoreEdit(draft, 'student_one', 'quiz_one', value, '12');
    assert.equal(draft[key].value, value);
  }
});

test('progress distinguishes missing marks from zero and normalizes entered weights', () => {
  assert.deepEqual(studentProgress(assessments, () => ''), { recorded: 0, average: null });
  assert.deepEqual(studentProgress(assessments, id => id === 'quiz_one' ? '10' : ''), { recorded: 1, average: 50 });
  assert.deepEqual(studentProgress(assessments, id => id === 'quiz_one' ? '0' : '100'), { recorded: 2, average: 60 });
  assert.deepEqual(studentProgress(assessments, id => id === 'quiz_one' ? '10' : '80'), { recorded: 2, average: 68 });
});

test('invalid marks are excluded and zero-weight assessments have no average', () => {
  assert.deepEqual(studentProgress(assessments, () => '-1'), { recorded: 0, average: null });
  assert.deepEqual(studentProgress(assessments.map(item => ({ ...item, weight: 0 })), () => '10'), { recorded: 2, average: null });
});

test('saving validates every edit before sending any requests', async () => {
  let calls = 0;
  const edits = {
    [scoreKey('student_one', 'quiz_one')]: { studentId: 'student_one', assessmentId: 'quiz_one', value: '10' },
    [scoreKey('student_two', 'exam_two')]: { studentId: 'student_two', assessmentId: 'exam_two', value: '' },
  };
  await assert.rejects(saveScoreEdits(edits, assessments, async () => { calls += 1; }));
  assert.equal(calls, 0);
});

test('partial saves return only successful keys and preserve IDs containing underscores', async () => {
  const successfulKey = scoreKey('student_one', 'quiz_one');
  const failedKey = scoreKey('student_two', 'exam_two');
  const edits = {
    [successfulKey]: { studentId: 'student_one', assessmentId: 'quiz_one', value: '0' },
    [failedKey]: { studentId: 'student_two', assessmentId: 'exam_two', value: '55.5' },
  };
  const calls = [];
  const result = await saveScoreEdits(edits, assessments, async (id, results) => {
    calls.push({ id, results });
    if (id === 'exam_two') throw new Error('Network unavailable');
  });
  assert.deepEqual(result, { savedKeys: [successfulKey], failedAssessments: 1 });
  assert.deepEqual(calls[0], { id: 'quiz_one', results: [{ studentId: 'student_one', score: 0 }] });
  assert.equal(edits[failedKey].value, '55.5');
  const retry = await saveScoreEdits({ [failedKey]: edits[failedKey] }, assessments, async () => {});
  assert.deepEqual(retry, { savedKeys: [failedKey], failedAssessments: 0 });
});

test('all failures leave all changes pending; successful batches include every student', async () => {
  const edits = Object.fromEntries(['student_one', 'student_two'].map(studentId => [scoreKey(studentId, 'quiz_one'), { studentId, assessmentId: 'quiz_one', value: '15' }]));
  const failed = await saveScoreEdits(edits, assessments, async () => { throw new Error('Offline'); });
  assert.deepEqual(failed, { savedKeys: [], failedAssessments: 1 });
  let batches = 0;
  const success = await saveScoreEdits(edits, assessments, async (_id, results) => { batches += 1; assert.equal(results.length, 2); });
  assert.equal(batches, 1);
  assert.equal(success.savedKeys.length, 2);
});

test('every role using the Academics entry has accessible modules', () => {
  for (const role of ACADEMICS_ROLES) assert.ok(academicTabsForRole(role).length > 0, role);
  assert.ok(academicTabsForRole('BURSAR').some(tab => tab.id === 'gradebook'));
  assert.ok(academicTabsForRole('SECRETARY').some(tab => tab.id === 'attendance'));
  assert.deepEqual(academicTabsForRole('PARENT').map(tab => tab.id), ['timetable', 'calendar']);
  assert.deepEqual(academicTabsForRole('BRANCH_MANAGER').map(tab => tab.id), ['calendar']);
  assert.deepEqual(academicTabsForRole('STUDENT'), []);
});
