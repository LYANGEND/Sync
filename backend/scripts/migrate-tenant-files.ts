import { createHash } from 'crypto';
import { constants as fsConstants, promises as fs } from 'fs';
import path from 'path';
import { systemPrisma } from '../src/utils/prisma';
import {
  buildTenantFileStorageUrl,
  createTenantFileReference,
  getUploadsRoot,
  resolveLegacyTenantFilePath,
  resolveTenantFilePath,
  TenantFileCategory,
} from '../src/services/tenantFileService';

interface LegacyFileRecord {
  model: 'User' | 'SchoolSettings' | 'Branch';
  id: string;
  tenantId: string;
  category: TenantFileCategory;
  storedUrl: string;
}

interface MigrationSummary {
  mode: 'dry-run' | 'apply';
  discovered: number;
  planned: number;
  migrated: number;
  alreadyPresent: number;
  missing: number;
  conflicts: number;
}

const apply = process.argv.includes('--apply');

const legacyFilename = (storedUrl: string, category: TenantFileCategory): string | null => {
  const prefix = `/uploads/${category}/`;
  const pathname = storedUrl.split('?')[0].split('#')[0];
  if (!pathname.startsWith(prefix)) return null;

  const encodedFilename = pathname.slice(prefix.length);
  if (!encodedFilename || encodedFilename.includes('/')) {
    throw new Error(`Invalid legacy ${category} URL: ${storedUrl}`);
  }
  return decodeURIComponent(encodedFilename);
};

const exists = async (filePath: string): Promise<boolean> => {
  try {
    await fs.access(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
};

const digest = async (filePath: string): Promise<string> =>
  createHash('sha256').update(await fs.readFile(filePath)).digest('hex');

const loadRecords = async (): Promise<LegacyFileRecord[]> => {
  const [users, settings, branches] = await Promise.all([
    systemPrisma.user.findMany({
      where: { profilePictureUrl: { startsWith: '/uploads/profiles/' } },
      select: { id: true, tenantId: true, profilePictureUrl: true },
    }),
    systemPrisma.schoolSettings.findMany({
      where: { logoUrl: { startsWith: '/uploads/logos/' } },
      select: { id: true, tenantId: true, logoUrl: true },
    }),
    systemPrisma.branch.findMany({
      where: { logoUrl: { startsWith: '/uploads/logos/' } },
      select: { id: true, tenantId: true, logoUrl: true },
    }),
  ]);

  return [
    ...users.flatMap(record => record.profilePictureUrl ? [{
      model: 'User' as const,
      id: record.id,
      tenantId: record.tenantId,
      category: 'profiles' as const,
      storedUrl: record.profilePictureUrl,
    }] : []),
    ...settings.flatMap(record => record.logoUrl ? [{
      model: 'SchoolSettings' as const,
      id: record.id,
      tenantId: record.tenantId,
      category: 'logos' as const,
      storedUrl: record.logoUrl,
    }] : []),
    ...branches.flatMap(record => record.logoUrl ? [{
      model: 'Branch' as const,
      id: record.id,
      tenantId: record.tenantId,
      category: 'logos' as const,
      storedUrl: record.logoUrl,
    }] : []),
  ];
};

const updateRecord = async (record: LegacyFileRecord, storageUrl: string): Promise<void> => {
  if (record.model === 'User') {
    await systemPrisma.user.update({ where: { id: record.id }, data: { profilePictureUrl: storageUrl } });
  } else if (record.model === 'SchoolSettings') {
    await systemPrisma.schoolSettings.update({ where: { id: record.id }, data: { logoUrl: storageUrl } });
  } else {
    await systemPrisma.branch.update({ where: { id: record.id }, data: { logoUrl: storageUrl } });
  }
};

const migrateRecord = async (
  record: LegacyFileRecord,
  summary: MigrationSummary,
): Promise<void> => {
  const filename = legacyFilename(record.storedUrl, record.category);
  if (!filename) return;

  const reference = createTenantFileReference(record.tenantId, record.category, filename);
  const source = resolveLegacyTenantFilePath(reference);
  const destination = resolveTenantFilePath(reference);
  const storageUrl = buildTenantFileStorageUrl(record.tenantId, record.category, filename);

  if (!(await exists(source))) {
    summary.missing += 1;
    console.error(JSON.stringify({
      event: 'tenant-file.migration.missing',
      model: record.model,
      id: record.id,
      source: path.relative(getUploadsRoot(), source),
    }));
    return;
  }

  if (await exists(destination)) {
    if (await digest(source) !== await digest(destination)) {
      summary.conflicts += 1;
      console.error(JSON.stringify({
        event: 'tenant-file.migration.conflict',
        model: record.model,
        id: record.id,
        destination: path.relative(getUploadsRoot(), destination),
      }));
      return;
    }
    summary.alreadyPresent += 1;
  }

  if (apply) {
    if (!(await exists(destination))) {
      await fs.mkdir(path.dirname(destination), { recursive: true });
      await fs.copyFile(source, destination, fsConstants.COPYFILE_EXCL);
    }
    await updateRecord(record, storageUrl);
  }

  if (apply) summary.migrated += 1;
  else summary.planned += 1;
  console.log(JSON.stringify({
    event: apply ? 'tenant-file.migrated' : 'tenant-file.migration.planned',
    model: record.model,
    id: record.id,
    tenantId: record.tenantId,
    storageUrl,
  }));
};

const main = async (): Promise<void> => {
  const records = await loadRecords();
  const summary: MigrationSummary = {
    mode: apply ? 'apply' : 'dry-run',
    discovered: records.length,
    planned: 0,
    migrated: 0,
    alreadyPresent: 0,
    missing: 0,
    conflicts: 0,
  };

  for (const record of records) {
    await migrateRecord(record, summary);
  }

  console.log(JSON.stringify({ event: 'tenant-file.migration.complete', ...summary }));
  if (summary.missing > 0 || summary.conflicts > 0) process.exitCode = 1;
};

main()
  .catch(error => {
    console.error(JSON.stringify({
      event: 'tenant-file.migration.failed',
      error: error instanceof Error ? error.message : String(error),
    }));
    process.exitCode = 1;
  })
  .finally(async () => {
    await systemPrisma.$disconnect();
  });
