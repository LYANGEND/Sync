import assert from 'node:assert/strict';
import { test } from 'node:test';
import { backupLimit, backupSha256, getRolloverBackupStore } from '../src/services/termRolloverBackupStoreService';
import { rolloverDomainFingerprint } from '../src/services/termRolloverReadinessService';

test('readiness fingerprint is deterministic for table/row/key order and excludes only evidence changes', () => {
  const a = [{ table: 'students', rows: ['{"id":"1","status":"ACTIVE"}', '{"id":"2"}'] },
    { table: 'term_rollovers', rows: [JSON.stringify({ id: 'r', status: 'PREPARED', configuration: { copyCategories: [] } })] }];
  const b = [{ table: 'term_rollover_events', rows: ['{"event":"APPROVED"}'] },
    { table: 'term_rollovers', rows: [JSON.stringify({ configuration: { copyCategories: [] }, status: 'READY', id: 'r', preflightHash: 'x', approvedFingerprint: 'x', backupVerifiedAt: 'today', version: 99, updatedAt: 'today' })] },
    { table: 'students', rows: [...a[0].rows].reverse() }];
  assert.equal(rolloverDomainFingerprint(a), rolloverDomainFingerprint(b));
  assert.match(rolloverDomainFingerprint(a), /^[a-f0-9]{64}$/);
  assert.notEqual(rolloverDomainFingerprint(a), rolloverDomainFingerprint([{ ...a[0], rows: ['{"id":"1","status":"WITHDRAWN"}'] }, a[1]]));
  assert.notEqual(rolloverDomainFingerprint(a), rolloverDomainFingerprint([a[0], { table: 'term_rollovers', rows: ['{"id":"r","status":"DRAFT"}'] }]));
});

test('backup hash uses SHA-256 and configured limits reject invalid bounds', () => {
  assert.equal(backupSha256('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(backupSha256('abc'), backupSha256(Buffer.from('abc')));
  const previous = process.env.ROLLOVER_BACKUP_MAX_BYTES;
  try {
    delete process.env.ROLLOVER_BACKUP_MAX_BYTES;
    assert.equal(backupLimit(), 268435456);
    for (const value of ['0', '1023', '1073741825', 'NaN', '1.5']) {
      process.env.ROLLOVER_BACKUP_MAX_BYTES = value;
      assert.throws(backupLimit, /Invalid/);
    }
    process.env.ROLLOVER_BACKUP_MAX_BYTES = '1024';
    assert.equal(backupLimit(), 1024);
  } finally {
    if (previous === undefined) delete process.env.ROLLOVER_BACKUP_MAX_BYTES; else process.env.ROLLOVER_BACKUP_MAX_BYTES = previous;
  }
});

test('filesystem backup rejects production, relative/workspace directories, traversal references and size violations', async () => {
  const keys = ['NODE_ENV', 'ROLLOVER_BACKUP_PROVIDER', 'ROLLOVER_BACKUP_DIRECTORY', 'ROLLOVER_BACKUP_MAX_BYTES'];
  const previous = keys.map(key => process.env[key]);
  try {
    process.env.ROLLOVER_BACKUP_PROVIDER = 'filesystem';
    const store = getRolloverBackupStore();
    process.env.NODE_ENV = 'production';
    await assert.rejects(store.put(Buffer.from('test')), /Production backup requires/);
    process.env.NODE_ENV = 'test';
    process.env.ROLLOVER_BACKUP_DIRECTORY = 'relative';
    await assert.rejects(store.put(Buffer.from('test')), /absolute external/);
    process.env.ROLLOVER_BACKUP_DIRECTORY = process.cwd();
    await assert.rejects(store.put(Buffer.from('test')), /outside the workspace/);
    await assert.rejects(store.read('../../secret'), /Invalid internal/);
    await assert.rejects(store.remove('https://example.invalid/backup'), /Invalid internal/);
    await assert.rejects(store.put(Buffer.alloc(0)), /size limit/);
    process.env.ROLLOVER_BACKUP_MAX_BYTES = '1024';
    await assert.rejects(store.put(Buffer.alloc(1025)), /size limit/);
  } finally {
    keys.forEach((key, index) => { if (previous[index] === undefined) delete process.env[key]; else process.env[key] = previous[index]; });
  }
});