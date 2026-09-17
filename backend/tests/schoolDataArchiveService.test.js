const assert = require('node:assert/strict');
const { test } = require('node:test');
const { gzipSync } = require('node:zlib');
const {
  CURRENT_SCHEMA_FINGERPRINT,
  MAX_ARCHIVE_RECORDS,
  SCHOOL_ARCHIVE_FORMAT,
  SCHOOL_ARCHIVE_VERSION,
  SchoolArchiveError,
  computeArchiveChecksum,
  inspectSchoolArchive,
  sanitizeRecordForArchive,
} = require('../dist/src/services/schoolDataArchiveService');

function makeArchive(data, links = { classSubjects: [] }, files = { included: false, references: [] }) {
  const recordCounts = Object.fromEntries(Object.entries(data).map(([model, records]) => [model, records.length]));
  const totalRecords = Object.values(recordCounts).reduce((total, count) => total + count, 0);
  return {
    manifest: {
      format: SCHOOL_ARCHIVE_FORMAT,
      formatVersion: SCHOOL_ARCHIVE_VERSION,
      createdAt: '2026-01-01T10:00:00.000Z',
      applicationVersion: '1.0.0',
      schemaFingerprint: CURRENT_SCHEMA_FINGERPRINT,
      school: { name: 'Test School' },
      modelCount: Object.keys(data).length,
      totalRecords,
      recordCounts,
      checksum: computeArchiveChecksum(data, links, files),
      security: {
        credentialsIncluded: false,
        providerSecretsIncluded: false,
        uploadedFilesIncluded: false,
      },
      excludedModels: [],
    },
    data,
    links,
    files,
  };
}

function encodeArchive(archive, compressed = true) {
  const buffer = Buffer.from(JSON.stringify(archive), 'utf8');
  return compressed ? gzipSync(buffer) : buffer;
}

function expectArchiveError(callback, pattern, statusCode) {
  assert.throws(callback, error => {
    assert.ok(error instanceof SchoolArchiveError);
    assert.match(error.message, pattern);
    if (statusCode !== undefined) assert.equal(error.statusCode, statusCode);
    return true;
  });
}

test('sanitizes passwords and provider secrets from exported records', () => {
  const user = sanitizeRecordForArchive('User', {
    id: 'user-1',
    email: 'teacher@example.test',
    passwordHash: 'must-not-leave',
    role: 'TEACHER',
  });
  const settings = sanitizeRecordForArchive('SchoolSettings', {
    id: 'settings-1',
    schoolName: 'Test School',
    smtpPassword: 'smtp-secret',
    smsApiKey: 'sms-secret',
    aiApiKey: 'ai-secret',
  });

  assert.equal(user.passwordHash, undefined);
  assert.equal(user.email, 'teacher@example.test');
  assert.equal(settings.smtpPassword, undefined);
  assert.equal(settings.smsApiKey, undefined);
  assert.equal(settings.aiApiKey, undefined);
  assert.equal(settings.schoolName, 'Test School');
});

test('accepts a valid gzip archive and verifies its integrity', () => {
  const archive = makeArchive({
    User: [{ id: 'user-1', email: 'teacher@example.test', role: 'TEACHER' }],
  });

  const { preview } = inspectSchoolArchive(encodeArchive(archive));

  assert.equal(preview.integrityVerified, true);
  assert.equal(preview.canImport, true);
  assert.equal(preview.totalRecords, 1);
  assert.equal(preview.modelCount, 1);
  assert.equal(preview.sourceSchoolName, 'Test School');
  assert.equal(preview.checksum, archive.manifest.checksum);
});

test('rejects an archive whose data changed after it was sealed', () => {
  const archive = makeArchive({
    User: [{ id: 'user-1', email: 'before@example.test', role: 'TEACHER' }],
  });
  archive.data.User[0].email = 'after@example.test';

  expectArchiveError(
    () => inspectSchoolArchive(encodeArchive(archive)),
    /integrity check failed/i,
    409,
  );
});

test('rejects unsupported archive versions', () => {
  const archive = makeArchive({ User: [] });
  archive.manifest.formatVersion = SCHOOL_ARCHIVE_VERSION + 1;

  expectArchiveError(
    () => inspectSchoolArchive(encodeArchive(archive)),
    /not supported/i,
    409,
  );
});

test('rejects crafted archives containing protected fields', () => {
  const archive = makeArchive({
    User: [{ id: 'user-1', email: 'teacher@example.test', role: 'TEACHER', passwordHash: 'injected' }],
  });

  expectArchiveError(
    () => inspectSchoolArchive(encodeArchive(archive)),
    /protected field User\.passwordHash/i,
    409,
  );
});

test('rejects platform administrator accounts', () => {
  const archive = makeArchive({
    User: [{ id: 'platform-1', email: 'platform@example.test', role: 'PLATFORM_ADMIN' }],
  });

  expectArchiveError(
    () => inspectSchoolArchive(encodeArchive(archive)),
    /platform administrator accounts cannot be imported/i,
    409,
  );
});

test('rejects duplicate source IDs before import', () => {
  const archive = makeArchive({
    Student: [
      { id: 'student-1', admissionNumber: 'A-001' },
      { id: 'student-1', admissionNumber: 'A-002' },
    ],
  });

  expectArchiveError(
    () => inspectSchoolArchive(encodeArchive(archive)),
    /duplicate record ID student-1/i,
    409,
  );
});

test('rejects class-subject links to records missing from the archive', () => {
  const archive = makeArchive(
    { Class: [{ id: 'class-1' }], Subject: [] },
    { classSubjects: [{ classId: 'class-1', subjectId: 'missing-subject' }] },
  );

  expectArchiveError(
    () => inspectSchoolArchive(encodeArchive(archive)),
    /refers to a record that is not in the archive/i,
    409,
  );
});

test('rejects archives above the record safety limit', () => {
  const records = Array(MAX_ARCHIVE_RECORDS + 1).fill({ id: 'same-id' });
  const archive = makeArchive({ Student: records });

  expectArchiveError(
    () => inspectSchoolArchive(encodeArchive(archive, false)),
    /record limit/i,
    413,
  );
});

test('rejects manifest totals that do not match archive contents', () => {
  const archive = makeArchive({ Student: [{ id: 'student-1' }] });
  archive.manifest.totalRecords = 3;

  expectArchiveError(
    () => inspectSchoolArchive(encodeArchive(archive)),
    /archive total does not match/i,
    409,
  );
});
