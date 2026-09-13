import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import type { AddressInfo } from 'net';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import tenantFileRoutes from '../src/routes/tenantFileRoutes';
import {
  buildTenantFileStorageUrl,
  createTenantFileReference,
  resolveTenantFilePath,
  signTenantFileUrl,
} from '../src/services/tenantFileService';

let uploadsRoot: string;
let baseUrl: string;
let server: ReturnType<ReturnType<typeof express>['listen']>;

const writeTenantFile = async (tenantId: string, contents: string): Promise<string> => {
  const reference = createTenantFileReference(tenantId, 'profiles', 'avatar.png');
  const filePath = resolveTenantFilePath(reference);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, contents);
  return buildTenantFileStorageUrl(tenantId, 'profiles', 'avatar.png');
};

beforeAll(async () => {
  uploadsRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sync-tenant-files-'));
  process.env.UPLOADS_ROOT = uploadsRoot;
  process.env.FILE_SIGNING_SECRET = 'test-only-tenant-file-signing-secret';

  const app = express();
  app.use('/uploads', tenantFileRoutes);
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close(error => {
    if (error) reject(error);
    else resolve();
  }));
  await fs.rm(uploadsRoot, { recursive: true, force: true });
  delete process.env.UPLOADS_ROOT;
  delete process.env.FILE_SIGNING_SECRET;
});

describe('T-020 protected tenant file delivery', () => {
  it('TV-028 denies an unsigned file request', async () => {
    const storageUrl = await writeTenantFile('tenant-a', 'tenant-a-file');

    const response = await fetch(`${baseUrl}${storageUrl}`);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Valid signed file access is required' });
  });

  it('TV-028 serves an existing file through a valid short-lived URL', async () => {
    const storageUrl = await writeTenantFile('tenant-a', 'tenant-a-file');
    const signedUrl = signTenantFileUrl(storageUrl, 'tenant-a');

    const response = await fetch(`${baseUrl}${signedUrl}`);

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('private');
    expect(await response.text()).toBe('tenant-a-file');
  });

  it('TV-028 rejects an expired signed URL', async () => {
    const storageUrl = await writeTenantFile('tenant-a', 'tenant-a-file');
    const expiredUrl = signTenantFileUrl(storageUrl, 'tenant-a', {
      nowMs: Date.now() - 2 * 60 * 1_000,
      ttlSeconds: 60,
    });

    const response = await fetch(`${baseUrl}${expiredUrl}`);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'File access link has expired' });
  });

  it('TV-028 securely maps a legacy flat reference into a tenant-bound URL', async () => {
    const legacyDirectory = path.join(uploadsRoot, 'profiles');
    await fs.mkdir(legacyDirectory, { recursive: true });
    await fs.writeFile(path.join(legacyDirectory, 'legacy.png'), 'legacy-file');
    const signedUrl = signTenantFileUrl('/uploads/profiles/legacy.png', 'tenant-a');

    expect(signedUrl).toContain('/uploads/tenant-a/profiles/legacy.png?');
    const response = await fetch(`${baseUrl}${signedUrl}`);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('legacy-file');
  });
});

describe('T-021 tenant-prefixed file ownership', () => {
  it('TV-029 prevents a signed URL from being replayed against another tenant path', async () => {
    const tenantAUrl = await writeTenantFile('tenant-a', 'tenant-a-file');
    await writeTenantFile('tenant-b', 'tenant-b-file');
    const signedForTenantA = signTenantFileUrl(tenantAUrl, 'tenant-a');
    const replayedForTenantB = signedForTenantA.replace('/tenant-a/', '/tenant-b/');

    const response = await fetch(`${baseUrl}${replayedForTenantB}`);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Valid signed file access is required' });
  });

  it('TV-029 refuses to sign a stored key owned by another tenant', () => {
    expect(() => signTenantFileUrl(
      '/uploads/tenant-a/profiles/avatar.png',
      'tenant-b',
    )).toThrow('Stored file does not belong to the active tenant');
  });

  it('TV-029 rejects traversal components before resolving a disk path', () => {
    expect(() => createTenantFileReference('tenant-a', 'profiles', '..'))
      .toThrow('Invalid tenant filename');
  });
});
