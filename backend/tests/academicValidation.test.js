const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildAverageRankMap,
  hasDuplicateValues,
  hasValidDateRange,
  hasValidTimeRange,
  isDateWithinRangeByDay,
  scoreRangesOverlap,
} = require('../dist/src/utils/academicValidation.js');

test('academic date ranges reject invalid and reversed values', () => {
  assert.equal(hasValidDateRange('2026-01-01', '2026-12-31'), true);
  assert.equal(hasValidDateRange('2026-12-31', '2026-01-01'), false);
  assert.equal(hasValidDateRange('not-a-date', '2026-01-01'), false);
  assert.equal(hasValidDateRange('2026-01-01', '2026-01-01'), false);
  assert.equal(hasValidDateRange('2026-01-01', '2026-01-01', true), true);
});

test('term date checks are inclusive and compare calendar days', () => {
  const start = '2026-01-01T00:00:00.000Z';
  const end = '2026-04-30T00:00:00.000Z';

  assert.equal(isDateWithinRangeByDay('2026-01-01T23:59:59.999Z', start, end), true);
  assert.equal(isDateWithinRangeByDay('2026-04-30T18:30:00.000Z', start, end), true);
  assert.equal(isDateWithinRangeByDay('2025-12-31T23:59:59.999Z', start, end), false);
  assert.equal(isDateWithinRangeByDay('2026-05-01T00:00:00.000Z', start, end), false);
  assert.equal(isDateWithinRangeByDay('not-a-date', start, end), false);
});

test('score range overlap detects enclosing and boundary overlaps', () => {
  assert.equal(scoreRangesOverlap(80, 100, 70, 79), false);
  assert.equal(scoreRangesOverlap(70, 90, 80, 100), true);
  assert.equal(scoreRangesOverlap(0, 100, 50, 59), true);
  assert.equal(scoreRangesOverlap(79, 80, 80, 89), true);
});

test('time ranges compare normalized minutes instead of text', () => {
  assert.equal(hasValidTimeRange('8:00', '10:00'), true);
  assert.equal(hasValidTimeRange('10:00', '8:00'), false);
  assert.equal(hasValidTimeRange('08:00', '08:00'), false);
});

test('duplicate academic identifiers are detected', () => {
  assert.equal(hasDuplicateValues(['one', 'two']), false);
  assert.equal(hasDuplicateValues(['one', 'one']), true);
});

test('class ranks use subject averages and preserve ties', () => {
  const ranks = buildAverageRankMap([
    { studentId: 'a', totalScore: 80 },
    { studentId: 'a', totalScore: 100 },
    { studentId: 'b', totalScore: 90 },
    { studentId: 'c', totalScore: 60 },
    { studentId: 'c', totalScore: 80 },
  ]);

  assert.equal(ranks.get('a'), 1);
  assert.equal(ranks.get('b'), 1);
  assert.equal(ranks.get('c'), 3);
});