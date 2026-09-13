import { createHmac, timingSafeEqual } from 'crypto';
import path from 'path';

export const TENANT_FILE_CATEGORIES = ['profiles', 'logos'] as const;
export type TenantFileCategory = typeof TENANT_FILE_CATEGORIES[number];

export interface TenantFileReference {
  tenantId: string;
  category: TenantFileCategory;
  filename: string;
}

export interface SignedTenantFileOptions {
  nowMs?: number;
  ttlSeconds?: number;
}

export type TenantFileSignatureVerification =
  | { valid: true; expiresAt: number }
  | { valid: false; reason: 'missing' | 'invalid' | 'expired' };

const TENANT_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;
const SAFE_FILENAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;
const DEFAULT_FILE_URL_TTL_SECONDS = 60 * 60;
const MIN_FILE_URL_TTL_SECONDS = 60;
const MAX_FILE_URL_TTL_SECONDS = 24 * 60 * 60;

const assertTenantId = (tenantId: string): void => {
  if (!TENANT_ID_PATTERN.test(tenantId)) {
    throw new Error('Invalid tenant file owner');
  }
};

function assertCategory(category: string): asserts category is TenantFileCategory {
  if (!(TENANT_FILE_CATEGORIES as readonly string[]).includes(category)) {
    throw new Error('Invalid tenant file category');
  }
}

const assertFilename = (filename: string): void => {
  if (!SAFE_FILENAME_PATTERN.test(filename) || filename === '.' || filename === '..') {
    throw new Error('Invalid tenant filename');
  }
};

const signingSecret = (): string => {
  const secret = process.env.FILE_SIGNING_SECRET || process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('FILE_SIGNING_SECRET or JWT_SECRET is required for tenant file access');
  }
  return secret;
};

export const getTenantFileUrlTtlSeconds = (): number => {
  const raw = process.env.FILE_URL_TTL_SECONDS;
  if (!raw) return DEFAULT_FILE_URL_TTL_SECONDS;

  const ttl = Number(raw);
  if (!Number.isInteger(ttl) || ttl < MIN_FILE_URL_TTL_SECONDS || ttl > MAX_FILE_URL_TTL_SECONDS) {
    throw new Error(
      `FILE_URL_TTL_SECONDS must be an integer between ${MIN_FILE_URL_TTL_SECONDS} and ${MAX_FILE_URL_TTL_SECONDS}`,
    );
  }
  return ttl;
};

export const createTenantFileReference = (
  tenantId: string,
  category: string,
  filename: string,
): TenantFileReference => {
  assertTenantId(tenantId);
  assertCategory(category);
  assertFilename(filename);
  return { tenantId, category, filename };
};

export const buildTenantFileStorageUrl = (
  tenantId: string,
  category: TenantFileCategory,
  filename: string,
): string => {
  const reference = createTenantFileReference(tenantId, category, filename);
  return `/uploads/${encodeURIComponent(reference.tenantId)}/${reference.category}/${encodeURIComponent(reference.filename)}`;
};

export const parseTenantFileStorageUrl = (value: string): TenantFileReference | null => {
  if (!value.startsWith('/uploads/')) return null;

  const pathname = value.split('?')[0].split('#')[0];
  const segments = pathname.split('/');
  if (segments.length !== 5 || segments[1] !== 'uploads') {
    throw new Error('Invalid stored tenant file URL');
  }

  try {
    return createTenantFileReference(
      decodeURIComponent(segments[2]),
      decodeURIComponent(segments[3]),
      decodeURIComponent(segments[4]),
    );
  } catch {
    throw new Error('Invalid stored tenant file URL');
  }
};

export const resolveStoredTenantFileReference = (
  storedUrl: string,
  expectedTenantId: string,
): TenantFileReference | null => {
  assertTenantId(expectedTenantId);
  if (!storedUrl.startsWith('/uploads/')) return null;

  const pathname = storedUrl.split('?')[0].split('#')[0];
  const segments = pathname.split('/');
  if (segments.length === 4 && segments[1] === 'uploads') {
    try {
      return createTenantFileReference(
        expectedTenantId,
        decodeURIComponent(segments[2]),
        decodeURIComponent(segments[3]),
      );
    } catch {
      throw new Error('Invalid stored tenant file URL');
    }
  }

  const reference = parseTenantFileStorageUrl(storedUrl);
  if (reference?.tenantId !== expectedTenantId) {
    throw new Error('Stored file does not belong to the active tenant');
  }
  return reference;
};

const signaturePayload = (reference: TenantFileReference, expiresAt: number): string =>
  ['tenant-file-v1', reference.tenantId, reference.category, reference.filename, expiresAt].join('\n');

const createSignature = (reference: TenantFileReference, expiresAt: number): string =>
  createHmac('sha256', signingSecret())
    .update(signaturePayload(reference, expiresAt))
    .digest('base64url');

export const signTenantFileUrl = (
  storedUrl: string,
  expectedTenantId: string,
  options: SignedTenantFileOptions = {},
): string => {
  const reference = resolveStoredTenantFileReference(storedUrl, expectedTenantId);
  if (!reference) return storedUrl;

  const ttlSeconds = options.ttlSeconds ?? getTenantFileUrlTtlSeconds();
  if (!Number.isInteger(ttlSeconds) || ttlSeconds < 1 || ttlSeconds > MAX_FILE_URL_TTL_SECONDS) {
    throw new Error('Invalid tenant file URL lifetime');
  }

  const nowMs = options.nowMs ?? Date.now();
  const expiresAt = Math.floor(nowMs / 1000) + ttlSeconds;
  const signature = createSignature(reference, expiresAt);
  const storageUrl = buildTenantFileStorageUrl(
    reference.tenantId,
    reference.category,
    reference.filename,
  );
  return `${storageUrl}?expires=${expiresAt}&signature=${encodeURIComponent(signature)}`;
};

export const verifyTenantFileSignature = (
  reference: TenantFileReference,
  expiresValue: unknown,
  signatureValue: unknown,
  nowMs: number = Date.now(),
): TenantFileSignatureVerification => {
  if (typeof expiresValue !== 'string' || typeof signatureValue !== 'string') {
    return { valid: false, reason: 'missing' };
  }
  if (!/^\d{1,12}$/.test(expiresValue) || !/^[a-zA-Z0-9_-]{43}$/.test(signatureValue)) {
    return { valid: false, reason: 'invalid' };
  }

  const expiresAt = Number(expiresValue);
  if (!Number.isSafeInteger(expiresAt)) {
    return { valid: false, reason: 'invalid' };
  }
  if (expiresAt <= Math.floor(nowMs / 1000)) {
    return { valid: false, reason: 'expired' };
  }

  const expected = Buffer.from(createSignature(reference, expiresAt));
  const supplied = Buffer.from(signatureValue);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
    return { valid: false, reason: 'invalid' };
  }

  return { valid: true, expiresAt };
};

export const getUploadsRoot = (): string =>
  path.resolve(process.env.UPLOADS_ROOT || path.join(process.cwd(), 'uploads'));

export const resolveTenantFilePath = (
  reference: TenantFileReference,
  uploadsRoot: string = getUploadsRoot(),
): string => {
  const validated = createTenantFileReference(
    reference.tenantId,
    reference.category,
    reference.filename,
  );
  const root = path.resolve(uploadsRoot);
  const filePath = path.resolve(
    root,
    validated.tenantId,
    validated.category,
    validated.filename,
  );

  if (!filePath.startsWith(root + path.sep)) {
    throw new Error('Tenant file path escaped the uploads root');
  }
  return filePath;
};

export const resolveLegacyTenantFilePath = (
  reference: TenantFileReference,
  uploadsRoot: string = getUploadsRoot(),
): string => {
  const validated = createTenantFileReference(
    reference.tenantId,
    reference.category,
    reference.filename,
  );
  const root = path.resolve(uploadsRoot);
  const filePath = path.resolve(root, validated.category, validated.filename);
  if (!filePath.startsWith(root + path.sep)) {
    throw new Error('Legacy tenant file path escaped the uploads root');
  }
  return filePath;
};
