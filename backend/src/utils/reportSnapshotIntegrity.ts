import { createHash } from 'node:crypto';

const canonicalize = (value: unknown): unknown => {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((result, key) => {
        const item = (value as Record<string, unknown>)[key];
        if (item !== undefined) result[key] = canonicalize(item);
        return result;
      }, {});
  }
  return value;
};

export const createReportSnapshotChecksum = (payload: unknown): string => (
  createHash('sha256').update(JSON.stringify(canonicalize(payload))).digest('hex')
);

export const verifyReportSnapshotIntegrity = (snapshot: unknown): boolean => {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return false;
  const { integrity, ...payload } = snapshot as Record<string, unknown>;
  if (!integrity || typeof integrity !== 'object' || Array.isArray(integrity)) return false;

  const metadata = integrity as Record<string, unknown>;
  return metadata.algorithm === 'SHA-256'
    && typeof metadata.checksum === 'string'
    && metadata.checksum === createReportSnapshotChecksum(payload);
};
