import assert from 'node:assert/strict';
import test from 'node:test';
import { canUseTool, matchLearners, needsConfirmation, RosterLearner } from '../src/services/masterAIPolicy';

const roster: RosterLearner[] = [
  { id: 'a', firstName: 'Chileshe', lastName: 'Banda', admissionNumber: 'ADM001' },
  { id: 'b', firstName: 'Chileshe', lastName: 'Mwale', admissionNumber: 'ADM002' },
  { id: 'c', firstName: 'Mutale', lastName: 'Phiri', admissionNumber: 'ADM003' },
];

test('canUseTool keeps each role to its own tools', () => {
  assert.equal(canUseTool('TEACHER', 'record_attendance'), true);
  assert.equal(canUseTool('TEACHER', 'send_fee_reminders'), false);
  assert.equal(canUseTool('BURSAR', 'send_fee_reminders'), true);
  assert.equal(canUseTool('BURSAR', 'record_attendance'), false);
  assert.equal(canUseTool('SUPER_ADMIN', 'delete_topics'), true);
  assert.equal(canUseTool('PARENT', 'list_classes'), false);
});

test('needsConfirmation holds writes and messages, not reads', () => {
  assert.equal(needsConfirmation({ tool: 'record_marks', params: {} }, 'TEACHER'), true);
  assert.equal(needsConfirmation({ tool: 'record_attendance', params: {} }, 'TEACHER'), true);
  assert.equal(needsConfirmation({ tool: 'send_fee_reminders', params: {} }, 'BURSAR'), true);
  assert.equal(needsConfirmation({ tool: 'get_homework_status', params: {} }, 'TEACHER'), false);
  // No access means the step is refused at execution, so there is nothing to confirm.
  assert.equal(needsConfirmation({ tool: 'send_fee_reminders', params: {} }, 'TEACHER'), false);
});

test('needsConfirmation only holds cleanup tools when they will really change data', () => {
  assert.equal(needsConfirmation({ tool: 'cleanup_class_subjects', params: {} }, 'SUPER_ADMIN'), false);
  assert.equal(needsConfirmation({ tool: 'cleanup_class_subjects', params: { dryRun: 'true' } }, 'SUPER_ADMIN'), false);
  assert.equal(needsConfirmation({ tool: 'cleanup_class_subjects', params: { dryRun: 'false' } }, 'SUPER_ADMIN'), true);
});

test('matchLearners matches full names and admission numbers', () => {
  const { matched, problems } = matchLearners(['chileshe banda', 'ADM003'], roster);
  assert.deepEqual(matched.map(l => l.id), ['a', 'c']);
  assert.deepEqual(problems, []);
});

test('matchLearners refuses a first name shared by two learners', () => {
  const { matched, problems } = matchLearners(['Chileshe'], roster);
  assert.equal(matched.length, 0);
  assert.match(problems[0], /matches Chileshe Banda, Chileshe Mwale/);
});

test('matchLearners accepts an unambiguous short form', () => {
  assert.deepEqual(matchLearners(['Mut'], roster).matched.map(l => l.id), ['c']);
  // Two letters is too short to guess from.
  assert.equal(matchLearners(['Mu'], roster).matched.length, 0);
});

test('matchLearners reports unknown names and ignores repeats', () => {
  const { matched, problems } = matchLearners(['Mutale', 'Mutale Phiri', 'Bwalya'], roster);
  assert.deepEqual(matched.map(l => l.id), ['c']);
  assert.deepEqual(problems, ['No learner called "Bwalya" in this class']);
});
