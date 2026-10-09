import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { test, TestContext } from 'node:test';
import { DefaultAzureCredential } from '@azure/identity';
import { BlobClient, BlobServiceClient, BlockBlobClient, ContainerClient } from '@azure/storage-blob';
import { getRolloverBackupStore } from '../src/services/termRolloverBackupStoreService';

// OFFLINE ONLY: SDK construction does not authenticate. Intercept the container
// factory before constructing the adapter; every data operation below is a fake.
// A token request is a test failure, never a request to an identity endpoint.
const reference = 'rollover-backup:12345678-1234-4123-8123-123456789abc';
const blobName = '12345678-1234-4123-8123-123456789abc.json';
const endpoint = 'https://syncbackup.blob.core.windows.net';
const envKeys = [
  'NODE_ENV', 'AZURE_TOKEN_CREDENTIALS', 'ROLLOVER_BACKUP_PROVIDER',
  'ROLLOVER_BACKUP_MAX_BYTES', 'ROLLOVER_BACKUP_AZURE_ACCOUNT_URL',
  'ROLLOVER_BACKUP_AZURE_CONTAINER', 'ROLLOVER_BACKUP_AZURE_TRUSTED_HOST',
  'ROLLOVER_BACKUP_AZURE_MANAGED_IDENTITY_CLIENT_ID',
];

function offlineFixture(t: TestContext) {
  const previous = envKeys.map(key => process.env[key]);
  for (const key of envKeys) delete process.env[key];
  Object.assign(process.env, {
    NODE_ENV: 'production', AZURE_TOKEN_CREDENTIALS: 'ManagedIdentityCredential',
    ROLLOVER_BACKUP_PROVIDER: 'azure-blob', ROLLOVER_BACKUP_MAX_BYTES: '1024',
    ROLLOVER_BACKUP_AZURE_ACCOUNT_URL: endpoint,
    ROLLOVER_BACKUP_AZURE_CONTAINER: 'rollover-backups',
  });
  t.after(() => {
    envKeys.forEach((key, index) => {
      if (previous[index] === undefined) delete process.env[key];
      else process.env[key] = previous[index];
    });
    t.mock.restoreAll();
  });
  const tokenGuard = t.mock.method(DefaultAzureCredential.prototype, 'getToken', async () => {
    throw new Error('OFFLINE test attempted authentication');
  });
  t.after(() => assert.equal(tokenGuard.mock.callCount(), 0, 'no token acquisition'));

  const calls = {
    containers: [] as Array<{ name: string; url: string }>,
    blockNames: [] as string[], blobNames: [] as string[], policies: 0, properties: 0,
    uploads: [] as Array<{ bytes: Buffer; length: number; options: Parameters<BlockBlobClient['upload']>[2] }>,
    downloads: [] as Array<{ offset: number | undefined; count: number | undefined; options: Parameters<BlobClient['download']>[2] }>,
    deletes: [] as Array<Parameters<BlobClient['delete']>[0]>,
  };
  const state = {
    publicAccess: undefined as string | undefined,
    properties: { contentLength: 3 as number | undefined, etag: '"original"' as string | undefined },
    response: { contentLength: 3 as number | undefined, etag: '"original"' as string | undefined,
      readableStreamBody: Readable.from([Buffer.from('abc')]) as Readable | undefined },
    uploadError: undefined as Error | undefined,
    downloadError: undefined as Error | undefined,
    deleteError: undefined as Error | undefined,
  };
  t.after(() => state.response.readableStreamBody?.destroy());
  const blob = {
    async getProperties() { calls.properties++; return state.properties; },
    async download(offset?: number, count?: number, options?: Parameters<BlobClient['download']>[2]) {
      calls.downloads.push({ offset, count, options });
      if (state.downloadError) throw state.downloadError;
      return state.response;
    },
    async delete(options?: Parameters<BlobClient['delete']>[0]) {
      calls.deletes.push(options);
      if (state.deleteError) throw state.deleteError;
    },
    async upload(bytes: Buffer, length: number, options?: Parameters<BlockBlobClient['upload']>[2]) {
      calls.uploads.push({ bytes, length, options });
      if (state.uploadError) throw state.uploadError;
    },
  };
  const container = {
    async getAccessPolicy() { calls.policies++; return { blobPublicAccess: state.publicAccess }; },
    getBlockBlobClient(name: string) { calls.blockNames.push(name); return blob; },
    getBlobClient(name: string) { calls.blobNames.push(name); return blob; },
  };
  t.mock.method(BlobServiceClient.prototype, 'getContainerClient', function (this: BlobServiceClient, name: string) {
    calls.containers.push({ name, url: this.url });
    // Structural cast only at the SDK seam; no live ContainerClient is created.
    return container as unknown as ContainerClient;
  });
  return { calls, state, create: getRolloverBackupStore };
}

// Serial nested cases prevent environment/prototype mocks leaking between cases.
test('OFFLINE Azure Blob rollover backup adapter (no database or network)', { concurrency: false }, async t => {
  await t.test('production requires the exact ManagedIdentity-only chain environment prerequisite', child => {
    const f = offlineFixture(child);
    for (const value of [undefined, '', 'prod', 'dev', 'EnvironmentCredential', 'managedidentitycredential', ' ManagedIdentityCredential']) {
      if (value === undefined) delete process.env.AZURE_TOKEN_CREDENTIALS;
      else process.env.AZURE_TOKEN_CREDENTIALS = value;
      assert.throws(f.create, /AZURE_TOKEN_CREDENTIALS=ManagedIdentityCredential/);
    }
    assert.equal(f.calls.containers.length, 0);
    process.env.AZURE_TOKEN_CREDENTIALS = 'ManagedIdentityCredential';
    assert.ok(f.create());
    assert.deepEqual(f.calls.containers, [{ name: 'rollover-backups', url: `${endpoint}/` }]);
  });

  await t.test('rejects unsafe account URLs before constructing a container client', child => {
    const f = offlineFixture(child);
    for (const value of [undefined, '', ` ${endpoint}`, `${endpoint} `, endpoint.replace('https:', 'http:'),
      'https://user:secret@syncbackup.blob.core.windows.net', `${endpoint}:443`, `${endpoint}/backups`,
      `${endpoint}?sig=secret`, `${endpoint}#fragment`, `${endpoint}/%2e%2e`, `${endpoint}/../`,
      `${endpoint}\\path`, 'https://SYNCBACKUP.blob.core.windows.net',
      'https://syncbackup.blob.core.windows.net.evil.invalid', 'https://ab.blob.core.windows.net',
      `https://${'a'.repeat(25)}.blob.core.windows.net`]) {
      if (value === undefined) delete process.env.ROLLOVER_BACKUP_AZURE_ACCOUNT_URL;
      else process.env.ROLLOVER_BACKUP_AZURE_ACCOUNT_URL = value;
      assert.throws(f.create, /trusted HTTPS|Untrusted/);
    }
    assert.equal(f.calls.containers.length, 0);
    for (const host of ['syncbackup.blob.core.windows.net', 'syncbackup.blob.core.usgovcloudapi.net', 'syncbackup.blob.core.chinacloudapi.cn']) {
      process.env.ROLLOVER_BACKUP_AZURE_ACCOUNT_URL = `https://${host}/`;
      assert.ok(f.create());
      assert.equal(f.calls.containers.at(-1)?.url, `https://${host}/`);
    }
  });

  await t.test('trusted-host override is exact DNS, and container/client ID validation fails closed', child => {
    const f = offlineFixture(child);
    process.env.ROLLOVER_BACKUP_AZURE_ACCOUNT_URL = 'https://backup.example.invalid';
    for (const host of ['*.example.invalid', '.example.invalid', 'https://backup.example.invalid', ' backup.example.invalid', 'BACKUP.example.invalid', 'backup..example.invalid', 'backup.example.invalid:443']) {
      process.env.ROLLOVER_BACKUP_AZURE_TRUSTED_HOST = host;
      assert.throws(f.create, /exact DNS hostname/);
    }
    process.env.ROLLOVER_BACKUP_AZURE_TRUSTED_HOST = 'example.invalid';
    assert.throws(f.create, /Untrusted/);
    process.env.ROLLOVER_BACKUP_AZURE_TRUSTED_HOST = 'backup.example.invalid';
    assert.ok(f.create());
    for (const value of ['', 'ab', 'A-container', '-backups', 'backups-', 'two--hyphens', 'a/b', ' backups', 'a'.repeat(64)]) {
      process.env.ROLLOVER_BACKUP_AZURE_CONTAINER = value;
      assert.throws(f.create, /preprovisioned/);
    }
    process.env.ROLLOVER_BACKUP_AZURE_CONTAINER = 'rollover-backups';
    for (const value of ['', 'not-a-uuid', '12345678-1234-4123-8123-123456789abc ']) {
      process.env.ROLLOVER_BACKUP_AZURE_MANAGED_IDENTITY_CLIENT_ID = value;
      assert.throws(f.create, /client ID/);
    }
    process.env.ROLLOVER_BACKUP_AZURE_MANAGED_IDENTITY_CLIENT_ID = '12345678-1234-4123-8123-123456789abc';
    assert.ok(f.create());
  });

  await t.test('rejects non-private containers for put/read/remove before any data operation', async child => {
    const f = offlineFixture(child);
    const store = f.create();
    for (const access of ['blob', 'container', '']) {
      f.state.publicAccess = access;
      await assert.rejects(store.put(Buffer.from('abc')), /must be private/);
      await assert.rejects(store.read(reference), /must be private/);
      await assert.rejects(store.remove(reference), /must be private/);
    }
    assert.equal(f.calls.policies, 9);
    assert.equal(f.calls.properties, 0);
    assert.equal(f.calls.uploads.length + f.calls.downloads.length + f.calls.deletes.length, 0);
  });

  await t.test('put is one create-only upload with private JSON headers and an opaque UUID reference', async child => {
    const f = offlineFixture(child);
    const store = f.create();
    await assert.rejects(store.put(Buffer.alloc(0)), /size limit/);
    await assert.rejects(store.put(Buffer.alloc(1025)), /size limit/);
    assert.equal(f.calls.policies, 0);
    assert.equal(f.calls.blockNames.length, 0);
    const bytes = Buffer.alloc(1024, 97);
    const result = await store.put(bytes);
    assert.match(result, /^rollover-backup:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.equal(f.calls.blockNames[0], `${result.slice('rollover-backup:'.length)}.json`);
    assert.deepEqual(f.calls.uploads, [{ bytes, length: 1024, options: {
      conditions: { ifNoneMatch: '*' },
      blobHTTPHeaders: { blobContentType: 'application/json', blobCacheControl: 'private, no-store' },
    } }]);
    const conflict = Object.assign(new Error('already exists'), { statusCode: 412 });
    f.state.uploadError = conflict;
    await assert.rejects(store.put(Buffer.from('abc')), error => error === conflict);
    assert.equal(f.calls.uploads.length, 2, 'failed upload is not retried');
    assert.notEqual(f.calls.blockNames[0], f.calls.blockNames[1]);
  });

  await t.test('read binds properties ETag to download, bounds bytes, disables resume retry and cleans up', async child => {
    const f = offlineFixture(child);
    f.state.response.readableStreamBody = Readable.from([Buffer.from('a'), new Uint8Array([98, 99])]);
    assert.deepEqual(await f.create().read(reference), Buffer.from('abc'));
    assert.deepEqual(f.calls.blobNames, [blobName]);
    const [download] = f.calls.downloads;
    assert.equal(download.offset, 0);
    assert.equal(download.count, undefined);
    assert.deepEqual(download.options?.conditions, { ifMatch: '"original"' });
    assert.equal(download.options?.maxRetryRequests, 0);
    assert.equal(download.options?.abortSignal?.aborted, true);
    assert.equal(f.state.response.readableStreamBody.destroyed, true);
  });

  await t.test('unsafe properties reject before download/allocation', async child => {
    const f = offlineFixture(child);
    const store = f.create();
    for (const length of [undefined, 0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, 1025]) {
      f.state.properties.contentLength = length;
      await assert.rejects(store.read(reference), /Unsafe or oversized/);
    }
    f.state.properties.contentLength = 3;
    f.state.properties.etag = undefined;
    await assert.rejects(store.read(reference), /Unsafe or oversized/);
    f.state.properties.etag = '';
    await assert.rejects(store.read(reference), /Unsafe or oversized/);
    assert.equal(f.calls.downloads.length, 0);
  });

  await t.test('download metadata mismatch or missing stream rejects and aborts/destroys', async child => {
    const f = offlineFixture(child);
    const store = f.create();
    for (const change of ['length', 'etag', 'stream']) {
      const stream = Readable.from([Buffer.from('abc')]);
      f.state.response = { contentLength: change === 'length' ? 4 : 3,
        etag: change === 'etag' ? '"rewritten"' : '"original"',
        readableStreamBody: change === 'stream' ? undefined : stream };
      await assert.rejects(store.read(reference), /changed during read/);
      assert.equal(f.calls.downloads.at(-1)?.options?.abortSignal?.aborted, true);
      if (change !== 'stream') assert.equal(stream.destroyed, true);
      stream.destroy();
    }
  });

  await t.test('oversize stream aborts immediately, rejects truncation/nonbytes and propagates stream errors', async child => {
    const f = offlineFixture(child);
    const store = f.create();
    for (const size of [4, 1025]) {
      let consumed = 0;
      const stream = new Readable({ read() { /* Consumption is controlled by the iterator below. */ } });
      // Avoid Readable.from prefetch: assert adapter consumption, not Node's
      // buffering/scheduler behavior. Keep real Node destroy() semantics.
      Object.defineProperty(stream, Symbol.asyncIterator, { value: async function* () {
        consumed++; yield Buffer.alloc(size);
        consumed++; yield Buffer.from('must not consume');
      } });
      f.state.response.readableStreamBody = stream;
      await assert.rejects(store.read(reference), /exceeds declared size limit/);
      assert.equal(consumed, 1, 'no trailing chunks consumed after overflow');
      assert.equal(f.calls.downloads.at(-1)?.options?.abortSignal?.aborted, true);
      assert.equal(f.state.response.readableStreamBody.destroyed, true);
    }
    for (const [chunks, message] of [
      [[Buffer.from('ab')], /changed during read/], [['abc'], /Invalid backup byte stream/],
    ] as const) {
      f.state.response.readableStreamBody = Readable.from(chunks);
      await assert.rejects(store.read(reference), message);
      assert.equal(f.calls.downloads.at(-1)?.options?.abortSignal?.aborted, true);
      assert.equal(f.state.response.readableStreamBody.destroyed, true);
    }
    const failure = new Error('fake stream failure');
    f.state.response.readableStreamBody = Readable.from((async function* () {
      yield Buffer.from('a'); throw failure;
    })());
    await assert.rejects(store.read(reference), error => error === failure);
    assert.equal(f.calls.downloads.at(-1)?.options?.abortSignal?.aborted, true);
    assert.equal(f.state.response.readableStreamBody.destroyed, true);
    f.state.downloadError = Object.assign(new Error('ETag raced'), { statusCode: 412 });
    await assert.rejects(store.read(reference), error => error === f.state.downloadError);
    assert.equal(f.calls.downloads.at(-1)?.options?.abortSignal?.aborted, true);
  });

  await t.test('remove uses only the observed ETag, rejects absent ETags and propagates raced-delete failure', async child => {
    const f = offlineFixture(child);
    const store = f.create();
    for (const etag of [undefined, '']) {
      f.state.properties.etag = etag;
      await assert.rejects(store.remove(reference), /Unsafe backup artifact/);
    }
    assert.equal(f.calls.deletes.length, 0);
    f.state.properties.etag = '"original"';
    await store.remove(reference);
    assert.deepEqual(f.calls.deletes, [{ conditions: { ifMatch: '"original"' } }]);
    f.state.deleteError = Object.assign(new Error('ETag raced'), { statusCode: 412 });
    await assert.rejects(store.remove(reference), error => error === f.state.deleteError);
    assert.equal(f.calls.deletes.length, 2, 'no unconditional retry or snapshot/version deletion');
    assert.deepEqual(f.calls.deletes[1], { conditions: { ifMatch: '"original"' } });
    assert.ok(f.calls.blobNames.every(name => name === blobName));
  });

  await t.test('read/remove reject nonopaque refs before blob lookup or private-container checks', async child => {
    const f = offlineFixture(child);
    const store = f.create();
    for (const value of ['', '../../secret', `${endpoint}/rollover-backups/${blobName}?sig=secret`,
      blobName, reference.toUpperCase(), reference.replace('-4123-', '-1123-'),
      reference.replace('-8123-', '-7123-'), `${reference}/../secret`, `${reference}?sig=secret`,
      `${reference}\n`, ` ${reference}`]) {
      await assert.rejects(store.read(value), /Invalid internal backup reference/);
      await assert.rejects(store.remove(value), /Invalid internal backup reference/);
    }
    assert.equal(f.calls.blobNames.length, 0);
    assert.equal(f.calls.policies, 0);
    assert.equal(f.calls.properties, 0);
  });
});