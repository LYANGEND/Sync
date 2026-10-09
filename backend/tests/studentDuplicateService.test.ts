import assert from 'node:assert/strict';
import test from 'node:test';
import {
  candidateToRecord,
  hasLikelySameStudent,
  StudentMatchPool,
  StudentMatchRecord,
} from '../src/services/studentDuplicateService';

const existing = (overrides: Partial<StudentMatchRecord>): StudentMatchRecord => ({
  id: 'student-1',
  firstName: 'John',
  lastName: 'Banda',
  admissionNumber: 'STU001',
  dateOfBirth: '2015-06-15T00:00:00.000Z',
  status: 'ACTIVE',
  className: 'Grade Three',
  branchName: 'Main',
  guardianName: 'Mary Banda',
  guardianPhone: '0977123456',
  guardianEmail: 'mary@example.com',
  ...overrides,
});

const poolWith = (...records: StudentMatchRecord[]): StudentMatchPool => {
  const pool = new StudentMatchPool();
  records.forEach(record => pool.add(record));
  return pool;
};

test('same name and date of birth is a likely duplicate', () => {
  const matches = poolWith(existing({})).match({ firstName: 'john', lastName: ' BANDA ', dateOfBirth: '2015-06-15' });
  assert.equal(matches[0]?.strength, 'LIKELY_SAME');
  assert.deepEqual(matches[0]?.reasons, ['Same name', 'Same date of birth']);
  assert.equal(hasLikelySameStudent(matches), true);
});

test('swapped names and a one-letter typo still match with the guardian phone in another format', () => {
  const matches = poolWith(existing({ firstName: 'Chileshe', lastName: 'Mwansa' })).match({
    firstName: 'Mwansa',
    lastName: 'Chilesh',
    guardianPhone: '+260 977 123 456',
  });
  assert.equal(matches[0]?.strength, 'LIKELY_SAME');
  assert.deepEqual(matches[0]?.reasons, ['Similar name', 'Same guardian phone']);
});

test('same guardian email with a different child is a sibling, not a duplicate', () => {
  const matches = poolWith(existing({})).match({
    firstName: 'Grace',
    lastName: 'Banda',
    guardianEmail: 'MARY@example.com ',
  });
  assert.equal(matches[0]?.strength, 'LIKELY_SIBLING');
  assert.equal(hasLikelySameStudent(matches), false);
});

test('same guardian name in a different word order and the same surname is a sibling', () => {
  const matches = poolWith(existing({ guardianPhone: null, guardianEmail: null })).match({
    firstName: 'Grace',
    lastName: 'Banda',
    guardianName: 'banda mary',
  });
  assert.equal(matches[0]?.strength, 'LIKELY_SIBLING');
});

test('guardian name alone or child name alone is only a possible match', () => {
  const pool = poolWith(existing({ guardianPhone: null, guardianEmail: null }));
  assert.equal(pool.match({ firstName: 'Peter', lastName: 'Phiri', guardianName: 'Mary Banda' })[0]?.strength, 'POSSIBLE');
  assert.equal(pool.match({ firstName: 'John', lastName: 'Banda', dateOfBirth: '2016-01-01' })[0]?.strength, 'POSSIBLE');
});

test('short names do not fuzzy match and unrelated students are ignored', () => {
  const pool = poolWith(existing({ firstName: 'Ana', lastName: 'Zulu' }));
  assert.deepEqual(pool.match({ firstName: 'Ann', lastName: 'Zulu', dateOfBirth: '2015-06-15' }), []);
  assert.deepEqual(pool.match({ firstName: 'Peter', lastName: 'Phiri', guardianPhone: '0966000000' }), []);
});

test('rows added to the pool are matched by later rows in the same import', () => {
  const pool = new StudentMatchPool();
  const row = { firstName: 'Ruth', lastName: 'Tembo', dateOfBirth: '2014-02-02' };
  assert.deepEqual(pool.match(row), []);
  pool.add(candidateToRecord(row, 'Import row 1'));
  const matches = pool.match(row);
  assert.equal(matches[0]?.strength, 'LIKELY_SAME');
  assert.equal(matches[0]?.student.admissionNumber, 'Import row 1');
});
