import { constants, promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { AzureAuthorityHosts, DefaultAzureCredential } from '@azure/identity';
import { BlobServiceClient, ContainerClient } from '@azure/storage-blob';

const backupId = (reference: string): string => {
  const match = /^rollover-backup:([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/.exec(reference);
  if (!match || match[0] !== reference) throw new Error('Invalid internal backup reference');
  return match[1];
};

// src/services -> backend; dist/src/services -> backend/dist -> backend.
const backendRoot = (): string => {
  const root = path.resolve(__dirname, '../..');
  return path.basename(root) === 'dist' ? path.dirname(root) : root;
};

export const backupSha256 = (bytes: Buffer | string): string => createHash('sha256').update(bytes).digest('hex');
export const backupLimit = (): number => {
  const value = Number(process.env.ROLLOVER_BACKUP_MAX_BYTES ?? 268435456);
  if (!Number.isSafeInteger(value) || value < 1024 || value > 1073741824) throw new Error('Invalid rollover backup size limit');
  return value;
};

/** Opaque references are generated here, never accepted from HTTP requests. No public URLs. */
export interface RolloverBackupStore {
  put(bytes: Buffer): Promise<string>;
  read(reference: string): Promise<Buffer>;
  remove(reference: string): Promise<void>;
}

/** Security boundary: artifacts contain the entire database, including secrets/PII.
 * Operators must preprovision a private container, disable account anonymous/shared
 * key access, restrict networking and grant only container-scoped data permissions.
 * ROLLOVER_BACKUP_AZURE_TRUSTED_HOST is an exact DNS hostname trust override, not
 * a suffix/wildcard; treat it and endpoint configuration like credential routing.
 * Application create-only writes are NOT Azure WORM retention: other authorized
 * principals can still change/delete blobs. Provision retention/ACLs out of band.
 * References are internal capabilities, not HTTP input, SAS tokens or public URLs.
 */
class AzureBlobBackupStore implements RolloverBackupStore {
  private readonly container: ContainerClient;

  constructor() {
    const endpoint = process.env.ROLLOVER_BACKUP_AZURE_ACCOUNT_URL;
    const container = process.env.ROLLOVER_BACKUP_AZURE_CONTAINER;
    // Validate the raw URL as well as its parsed host: no credentials, SAS, port,
    // fragments, encoded paths, traversal, backslashes or URL normalization tricks.
    if (!endpoint || endpoint !== endpoint.trim() || !/^https:\/\/[a-z0-9.-]+\/?$/.test(endpoint)) {
      throw new Error('A trusted HTTPS Azure Blob account URL is required');
    }
    const url = new URL(endpoint);
    const knownHost = /^[a-z0-9]{3,24}\.blob\.core\.(windows\.net|usgovcloudapi\.net|chinacloudapi\.cn)$/.test(url.hostname);
    const trustedHost = process.env.ROLLOVER_BACKUP_AZURE_TRUSTED_HOST;
    if (trustedHost !== undefined && (trustedHost !== trustedHost.trim() || !/^(?=.{1,253}$)[a-z0-9]+(?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9]+(?:[a-z0-9-]*[a-z0-9])?)+$/.test(trustedHost))) {
      throw new Error('Azure Blob trusted host must be an exact DNS hostname');
    }
    if (!knownHost && url.hostname !== trustedHost) throw new Error('Untrusted Azure Blob account host');
    if (!container || container !== container.trim() || !/^(?=.{3,63}$)[a-z0-9]+(?:-[a-z0-9]+)*$/.test(container)) {
      throw new Error('A preprovisioned Azure Blob backup container is required');
    }
    const clientId = process.env.ROLLOVER_BACKUP_AZURE_MANAGED_IDENTITY_CLIENT_ID;
    if (clientId !== undefined && (clientId !== clientId.trim() || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(clientId))) {
      throw new Error('Invalid Azure backup managed identity client ID');
    }
    // DefaultAzureCredential must not silently fall back to developer credentials
    // or service-principal secrets in production. Supported by identity >=4.11.
    if (process.env.NODE_ENV === 'production' && process.env.AZURE_TOKEN_CREDENTIALS !== 'ManagedIdentityCredential') {
      throw new Error('Production Azure backups require AZURE_TOKEN_CREDENTIALS=ManagedIdentityCredential');
    }
    const authorityHost = url.hostname.endsWith('.blob.core.usgovcloudapi.net') ? AzureAuthorityHosts.AzureGovernment
      : url.hostname.endsWith('.blob.core.chinacloudapi.cn') ? AzureAuthorityHosts.AzureChina
        : undefined;
    const credential = new DefaultAzureCredential({ managedIdentityClientId: clientId, authorityHost });
    this.container = new BlobServiceClient(url.origin, credential, {
      // An ambiguous failed write is never retried or overwritten by this adapter.
      retryOptions: { maxTries: 1 },
    }).getContainerClient(container);
  }

  private async privateContainer(): Promise<void> {
    // Verify rather than create or change ACLs. Deployment configuration remains
    // trusted: a privileged operator can change the ACL after this check.
    const policy = await this.container.getAccessPolicy();
    if (policy.blobPublicAccess !== undefined) throw new Error('Azure backup container must be private');
  }

  async put(bytes: Buffer): Promise<string> {
    if (!bytes.length || bytes.length > backupLimit()) throw new Error('Backup artifact exceeds configured size limit');
    const reference = `rollover-backup:${randomUUID()}`;
    const blob = this.container.getBlockBlobClient(`${backupId(reference)}.json`);
    await this.privateContainer();
    // One atomic Put Blob, not uploadData's multi-block staging/retry path.
    await blob.upload(bytes, bytes.length, {
      conditions: { ifNoneMatch: '*' },
      blobHTTPHeaders: { blobContentType: 'application/json', blobCacheControl: 'private, no-store' },
    });
    return reference;
  }

  async read(reference: string): Promise<Buffer> {
    const blob = this.container.getBlobClient(`${backupId(reference)}.json`);
    const limit = backupLimit();
    await this.privateContainer();
    const properties = await blob.getProperties();
    const length = properties.contentLength;
    if (length === undefined || !Number.isSafeInteger(length) || length <= 0 || length > limit || !properties.etag) {
      throw new Error('Unsafe or oversized backup artifact');
    }
    const abort = new AbortController();
    let stream: NodeJS.ReadableStream | undefined;
    try {
      const response = await blob.download(0, undefined, {
        conditions: { ifMatch: properties.etag }, abortSignal: abort.signal, maxRetryRequests: 0,
      });
      stream = response.readableStreamBody;
      if (response.contentLength !== length || response.etag !== properties.etag || !stream) {
        throw new Error('Backup artifact changed during read');
      }
      const bytes = Buffer.alloc(length);
      let size = 0;
      for await (const chunk of stream) {
        if (!(chunk instanceof Uint8Array)) throw new Error('Invalid backup byte stream');
        size += chunk.byteLength;
        if (size > limit || size > length) throw new Error('Backup artifact exceeds declared size limit');
        bytes.set(chunk, size - chunk.byteLength);
      }
      if (size !== length) throw new Error('Backup artifact changed during read');
      return bytes;
    } finally {
      // Abort in-flight I/O on every exit, including a byte-cap violation. Destroy
      // the Node stream too; never keep downloading an oversized artifact.
      abort.abort();
      (stream as import('node:stream').Readable | undefined)?.destroy();
    }
  }

  async remove(reference: string): Promise<void> {
    const blob = this.container.getBlobClient(`${backupId(reference)}.json`);
    await this.privateContainer();
    const { etag } = await blob.getProperties();
    if (!etag) throw new Error('Unsafe backup artifact');
    // Delete only this validated blob, not snapshots, versions or a raced rewrite.
    await blob.delete({ conditions: { ifMatch: etag } });
  }
}

class ProtectedFilesystemBackupStore implements RolloverBackupStore {
  private async directory(): Promise<string> {
    if (process.env.NODE_ENV === 'production') throw new Error('Production backup requires a managed-identity external storage adapter');
    const configured = process.env.ROLLOVER_BACKUP_DIRECTORY;
    const workspace = path.dirname(backendRoot());
    if (!configured || !path.isAbsolute(configured)) throw new Error('An absolute external rollover backup directory is required');
    const directory = path.resolve(configured);
    const withinWorkspace = (candidate: string) => {
      const relative = path.relative(workspace, candidate);
      return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
    };
    // Walk each ancestor: junctions/symlinks are not permissible storage roots.
    let ancestor = directory;
    while (true) {
      const entry = await fs.lstat(ancestor);
      if (entry.isSymbolicLink() || !entry.isDirectory()) throw new Error('Backup directory must not traverse symbolic links');
      const parent = path.dirname(ancestor);
      if (parent === ancestor) break;
      ancestor = parent;
    }
    const real = await fs.realpath(directory);
    if (withinWorkspace(directory) || withinWorkspace(real)) throw new Error('Backup storage must be outside the workspace');
    if (process.platform === 'win32') {
      // POSIX chmod is not an ACL on Windows. Provision the ACL out of band;
      // an explicit attestation is mandatory rather than pretending chmod secures it.
      if (process.env.ROLLOVER_BACKUP_WINDOWS_ACL_PROTECTED !== 'true') throw new Error('A protected Windows ACL must be provisioned and attested');
    } else {
      const stat = await fs.stat(real);
      if ((stat.mode & 0o077) !== 0 || (process.getuid && stat.uid !== process.getuid())) throw new Error('Backup directory must be owned by this process user with mode 0700');
    }
    return real;
  }

  private async location(reference: string): Promise<string> {
    const id = backupId(reference);
    return path.join(await this.directory(), `${id}.json`);
  }

  async put(bytes: Buffer): Promise<string> {
    if (!bytes.length || bytes.length > backupLimit()) throw new Error('Backup artifact exceeds configured size limit');
    const reference = `rollover-backup:${randomUUID()}`;
    const file = await this.location(reference);
    const handle = await fs.open(file, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } catch (error) {
      await fs.unlink(file).catch(() => undefined);
      throw error;
    } finally {
      await handle.close();
    }
    return reference;
  }

  async read(reference: string): Promise<Buffer> {
    const file = await this.location(reference);
    const before = await fs.lstat(file);
    if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1) throw new Error('Unsafe backup artifact');
    const handle = await fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.nlink !== 1 || stat.ino !== before.ino || stat.dev !== before.dev
        || stat.size <= 0 || stat.size > backupLimit()
        || (process.platform !== 'win32' && ((stat.mode & 0o077) !== 0 || (process.getuid && stat.uid !== process.getuid())))) {
        throw new Error('Unsafe or oversized backup artifact');
      }
      // Bound reads even if an external process grows the file after stat. Artifacts
      // are uncompressed JSON, so no decompression or compression-bomb path exists.
      const bytes = Buffer.alloc(stat.size + 1);
      let offset = 0;
      while (offset < bytes.length) {
        const { bytesRead } = await handle.read(bytes, offset, bytes.length - offset, offset);
        if (!bytesRead) break;
        offset += bytesRead;
      }
      if (offset !== stat.size) throw new Error('Backup artifact changed during read');
      return bytes.subarray(0, offset);
    } finally { await handle.close(); }
  }

  async remove(reference: string): Promise<void> { await fs.unlink(await this.location(reference)); }
}

export const getRolloverBackupStore = (): RolloverBackupStore => {
  const provider = process.env.ROLLOVER_BACKUP_PROVIDER ?? 'filesystem';
  if (provider === 'azure-blob') return new AzureBlobBackupStore();
  if (provider === 'filesystem') return new ProtectedFilesystemBackupStore();
  throw new Error('Unsupported backup adapter');
};

export type DatabaseTableSnapshot = { table: string; rows: string[] };
const quote = (identifier: string): string => `"${identifier.replace(/"/g, '""')}"`;

/** Catalog enumeration includes implicit Prisma joins, not just model delegates.
 * Row JSON stays as PostgreSQL-produced text to preserve exact bigint/decimal values.
 * Caller MUST supply its serializable transaction, never the global client.
 */
export async function captureRolloverDatabase(tx: Prisma.TransactionClient): Promise<DatabaseTableSnapshot[]> {
  const tables = await tx.$queryRaw<Array<{ table: string }>>`
    SELECT c.relname AS "table" FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = current_schema() AND c.relkind IN ('r', 'p')
      AND NOT c.relispartition ORDER BY c.relname`;
  const snapshots: DatabaseTableSnapshot[] = [];
  const names = new Set(tables.map(item => item.table));
  if (Prisma.dmmf.datamodel.models.some(model => !names.has(model.dbName ?? model.name))) {
    throw new Error('Restore backup catalog is missing a mapped Prisma application table');
  }
  let size = 0;
  for (const { table } of tables) {
    // Query identifiers come exclusively from the DB catalog, and are quoted.
    const measured = await tx.$queryRawUnsafe<Array<{ bytes: string }>>(
      `SELECT COALESCE(sum(octet_length(to_jsonb(t)::text)), 0)::text AS bytes FROM ${quote(table)} t`,
    );
    if (BigInt(measured[0].bytes) + BigInt(size) > BigInt(backupLimit())) throw new Error('Database snapshot exceeds configured backup size limit');
    const rows = await tx.$queryRawUnsafe<Array<{ row: string }>>(
      `SELECT to_jsonb(t)::text AS row FROM ${quote(table)} t ORDER BY to_jsonb(t)::text COLLATE "C"`,
    );
    size += rows.reduce((sum, row) => sum + Buffer.byteLength(row.row), 0);
    if (size > backupLimit()) throw new Error('Database snapshot exceeds configured backup size limit');
    snapshots.push({ table, rows: rows.map(row => row.row) });
  }
  if (!snapshots.some(table => table.table === '_prisma_migrations')) throw new Error('Migration ledger is required for restore backup');
  return snapshots;
}

export async function rolloverSchemaManifest(tx: Prisma.TransactionClient) {
  // Resolve from source and compiled locations without exposing these paths in DTOs.
  const root = backendRoot();
  const schema = await fs.readFile(path.join(root, 'prisma/schema.prisma'), 'utf8');
  const migrationRoot = path.join(root, 'prisma/migrations');
  const migrationLock = await fs.readFile(path.join(migrationRoot, 'migration_lock.toml'), 'utf8');
  const directories = (await fs.readdir(migrationRoot, { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
  const migrations = await Promise.all(directories.map(async name => {
    const sql = await fs.readFile(path.join(migrationRoot, name, 'migration.sql'), 'utf8');
    return { name, sha256: backupSha256(sql), sql };
  }));
  const applied = await tx.$queryRaw<Array<{ migration_name: string; checksum: string; finished_at: Date | null; rolled_back_at: Date | null }>>`
    SELECT migration_name, checksum, finished_at, rolled_back_at FROM "_prisma_migrations" ORDER BY migration_name`;
  for (const entry of applied.filter(entry => !entry.rolled_back_at)) {
    if (!entry.finished_at || migrations.find(item => item.name === entry.migration_name)?.sha256 !== entry.checksum) {
      throw new Error('Applied migration does not match the restore schema manifest');
    }
  }
  if (migrations.some(item => !applied.some(entry => entry.migration_name === item.name && entry.finished_at && !entry.rolled_back_at))) {
    throw new Error('Backup requires all local migrations to be applied');
  }
  return { schema, schemaSha256: backupSha256(schema), migrationLock, migrations };
}