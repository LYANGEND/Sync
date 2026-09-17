import bcrypt from 'bcryptjs';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { gunzipSync, gzipSync } from 'zlib';
import { Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma';

export const SCHOOL_ARCHIVE_FORMAT = 'sync-school-data';
export const SCHOOL_ARCHIVE_VERSION = 1;
export const MAX_ARCHIVE_UPLOAD_BYTES = 50 * 1024 * 1024;
export const MAX_ARCHIVE_UNCOMPRESSED_BYTES = 250 * 1024 * 1024;
export const MAX_ARCHIVE_RECORDS = 250_000;

export const EXCLUDED_ARCHIVE_MODELS: Record<string, string> = {
  PushSubscription: 'Device-specific browser credentials cannot be transferred safely.',
  MobileMoneyCollection: 'Live payment-provider collection references must remain with their originating installation.',
  AIInsightsCache: 'Generated cache data is rebuilt automatically.',
  AuditLog: 'Operational audit records can contain historical request payloads and remain on the source installation.',
};

const SENSITIVE_FIELD_NAMES = new Set([
  'passwordHash',
  'smtpPassword',
  'smsApiKey',
  'smsApiSecret',
  'lencoApiKey',
  'aiApiKey',
  'whatsappApiKey',
  'roomPassword',
]);

/**
 * Several legacy schema fields contain application IDs without declaring a Prisma
 * relation. Keeping this map explicit lets imports remap those references when a
 * natural-key match (for example, an existing user email) changes the target ID.
 */
const LOOSE_REFERENCE_TARGETS: Record<string, string> = {
  'AcademicEvent.createdBy': 'User',
  'AdaptedLesson.sourceActionId': 'PendingTeacherAction',
  'AdaptedLesson.targetStudentIds': 'Student',
  'AIArtifact.userId': 'User',
  'AIConversation.userId': 'User',
  'AIFavoritePrompt.userId': 'User',
  'AIProactiveAlert.actionedBy': 'User',
  'AIProactiveAlert.branchId': 'Branch',
  'AIProactiveAlert.dismissedBy': 'User',
  'AIUsageLog.branchId': 'Branch',
  'AIUsageLog.userId': 'User',
  'AnnouncementAcknowledgment.userId': 'User',
  'AttendanceAlert.resolvedBy': 'User',
  'AttendanceAlert.studentId': 'Student',
  'BranchTransfer.transferredByUserId': 'User',
  'Budget.approvedBy': 'User',
  'Budget.createdBy': 'User',
  'Budget.termId': 'AcademicTerm',
  'CampaignMessage.studentId': 'Student',
  'ClassroomChat.senderId': 'User',
  'ClassroomParticipant.studentId': 'Student',
  'ClassroomParticipant.userId': 'User',
  'CommunicationPreference.userId': 'User',
  'CreditNote.issuedBy': 'User',
  'Expense.approvedBy': 'User',
  'Expense.rejectedBy': 'User',
  'Expense.requestedBy': 'User',
  'FinancialAuditLog.branchId': 'Branch',
  'FinancialAuditLog.userId': 'User',
  'HomeworkSubmission.gradedBy': 'User',
  'InterventionRecord.studentIds': 'Student',
  'Invoice.termId': 'AcademicTerm',
  'InvoiceItem.feeTemplateId': 'FeeTemplate',
  'JournalEntry.postedBy': 'User',
  'MessageTemplate.createdById': 'User',
  'Payment.reconciledByUserId': 'User',
  'PaymentPlan.studentId': 'Student',
  'PaymentPlanSchedule.paymentId': 'Payment',
  'Payslip.userId': 'User',
  'PettyCashAccount.custodianId': 'User',
  'PettyCashTransaction.approvedBy': 'User',
  'PettyCashTransaction.recordedBy': 'User',
  'Refund.approvedBy': 'User',
  'Refund.processedBy': 'User',
  'Refund.rejectedBy': 'User',
  'Refund.requestedBy': 'User',
  'Refund.studentId': 'Student',
  'StaffPayroll.userId': 'User',
  'StudentResponse.selectedOptionId': 'QuestionOption',
  'StudentRiskAssessment.reviewedBy': 'User',
  'StudentRiskAssessment.studentId': 'Student',
  'StudentRiskAssessment.termId': 'AcademicTerm',
  'TeachingContent.subjectId': 'Subject',
  'TeachingContent.subTopicId': 'SubTopic',
  'TeachingContent.topicId': 'Topic',
  'VirtualClassroom.classId': 'Class',
  'VirtualClassroom.createdById': 'User',
  'VirtualClassroom.selectedSubTopicIds': 'SubTopic',
  'VirtualClassroom.subjectId': 'Subject',
  'VirtualClassroom.teacherId': 'User',
  'VirtualClassroom.topicId': 'Topic',
};

const EXTRA_MODEL_DEPENDENCIES: Record<string, string[]> = {
  BranchTransfer: ['Student', 'User'],
};

const modelDefinitions = Prisma.dmmf.datamodel.models;
const modelByName = new Map(modelDefinitions.map(model => [model.name, model]));
const allowedModelDefinitions = modelDefinitions.filter(model => !EXCLUDED_ARCHIVE_MODELS[model.name]);
const allowedModelNames = new Set(allowedModelDefinitions.map(model => model.name));
type ArchiveDbClient = Prisma.TransactionClient | typeof prisma;

interface ArchiveFileReference {
  model: string;
  recordId: string;
  field: string;
  path: string;
}

interface ClassSubjectLink {
  classId: string;
  subjectId: string;
}

export interface SchoolArchiveManifest {
  format: typeof SCHOOL_ARCHIVE_FORMAT;
  formatVersion: number;
  createdAt: string;
  applicationVersion: string;
  schemaFingerprint: string;
  school: {
    name: string;
  };
  modelCount: number;
  totalRecords: number;
  recordCounts: Record<string, number>;
  checksum: string;
  security: {
    credentialsIncluded: false;
    providerSecretsIncluded: false;
    uploadedFilesIncluded: false;
  };
  excludedModels: Array<{ model: string; reason: string }>;
}

export interface SchoolDataArchive {
  manifest: SchoolArchiveManifest;
  data: Record<string, Array<Record<string, unknown>>>;
  links: {
    classSubjects: ClassSubjectLink[];
  };
  files: {
    included: false;
    references: ArchiveFileReference[];
  };
}

export interface ArchivePreview {
  canImport: boolean;
  integrityVerified: boolean;
  checksum: string;
  sourceSchoolName: string;
  destinationSchoolName: string;
  createdAt: string;
  formatVersion: number;
  schemaMatches: boolean;
  totalRecords: number;
  modelCount: number;
  fileReferenceCount: number;
  recordCounts: Record<string, number>;
  topRecordCounts: Array<{ model: string; count: number }>;
  warnings: string[];
}

export interface ArchiveImportResult {
  checksum: string;
  sourceSchoolName: string;
  totalProcessed: number;
  created: number;
  updated: number;
  linked: number;
  disabledUsers: number;
  fileReferencesNotRestored: number;
  models: Array<{ model: string; created: number; updated: number }>;
  warnings: string[];
}

export interface DataManagementOverview {
  schoolName: string;
  counts: {
    students: number;
    users: number;
    classes: number;
    subjects: number;
    branches: number;
    payments: number;
    attendance: number;
    assessments: number;
  };
  archive: {
    formatVersion: number;
    transferableModels: number;
    excludedModels: number;
    maxUploadMb: number;
  };
  recentActivity: Array<{
    id: string;
    action: string;
    createdAt: Date;
    userId: string | null;
    details: Record<string, unknown> | null;
  }>;
}

export class SchoolArchiveError extends Error {
  constructor(message: string, public statusCode = 400) {
    super(message);
    this.name = 'SchoolArchiveError';
  }
}

function quoteIdentifier(value: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    throw new SchoolArchiveError('The database schema contains an unsafe identifier.', 500);
  }
  return `"${value}"`;
}

function databaseTableName(model: (typeof modelDefinitions)[number]): string {
  return model.dbName || model.name;
}

function scalarFields(model: (typeof modelDefinitions)[number]) {
  return model.fields.filter(field => field.kind !== 'object' && !SENSITIVE_FIELD_NAMES.has(field.name));
}

async function getTenantScopedTables(client: ArchiveDbClient): Promise<Set<string>> {
  const rows = await client.$queryRawUnsafe<Array<{ table_name: string }>>(
    `SELECT table_name FROM information_schema.columns WHERE table_schema = 'public' AND column_name = 'tenantId'`,
  );
  return new Set(rows.map(row => row.table_name));
}

interface SchoolContext {
  tenantId: string;
  schoolName: string;
}

async function resolveSchoolContext(client: ArchiveDbClient, actorUserId: string): Promise<SchoolContext> {
  const tenantTables = await getTenantScopedTables(client);
  const usersAreTenantScoped = tenantTables.has(databaseTableName(modelByName.get('User')!));
  const userRows = usersAreTenantScoped
    ? await client.$queryRawUnsafe<Array<{ tenantId: string; role: string; isActive: boolean }>>(
        `SELECT "tenantId", role::text AS role, "isActive" FROM users WHERE id = $1::text LIMIT 1`,
        actorUserId,
      )
    : await client.$queryRawUnsafe<Array<{ role: string; isActive: boolean }>>(
        `SELECT role::text AS role, "isActive" FROM users WHERE id = $1::text LIMIT 1`,
        actorUserId,
      );

  const user = userRows[0];
  if (!user || user.role !== 'SUPER_ADMIN' || !user.isActive) {
    throw new SchoolArchiveError('An active school administrator account is required.', 403);
  }

  const tenantId = usersAreTenantScoped ? (user as any).tenantId : 'SYSTEM';
  const settingsTable = databaseTableName(modelByName.get('SchoolSettings')!);
  const settingsRows = tenantTables.has(settingsTable)
    ? await client.$queryRawUnsafe<Array<{ schoolName: string }>>(
        `SELECT "schoolName" FROM ${quoteIdentifier(settingsTable)} WHERE "tenantId" = $1::text ORDER BY id LIMIT 1`,
        tenantId,
      )
    : await client.$queryRawUnsafe<Array<{ schoolName: string }>>(
        `SELECT "schoolName" FROM ${quoteIdentifier(settingsTable)} ORDER BY id LIMIT 1`,
      );

  return { tenantId, schoolName: settingsRows[0]?.schoolName || 'My School' };
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function buildSchemaFingerprint(): string {
  const descriptor = allowedModelDefinitions
    .map(model => ({
      name: model.name,
      fields: model.fields
        .filter(field => field.kind !== 'object' && !SENSITIVE_FIELD_NAMES.has(field.name))
        .map(field => ({
          name: field.name,
          type: field.type,
          list: field.isList,
          required: field.isRequired,
        })),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return hash(JSON.stringify(descriptor));
}

export const CURRENT_SCHEMA_FINGERPRINT = buildSchemaFingerprint();

function getImportOrder(): string[] {
  const dependencies = new Map<string, Set<string>>();

  for (const model of allowedModelDefinitions) {
    const modelDependencies = new Set<string>();

    for (const field of model.fields) {
      if (
        field.kind === 'object' &&
        field.relationFromFields?.length &&
        field.type !== model.name &&
        allowedModelNames.has(field.type)
      ) {
        modelDependencies.add(field.type);
      }
    }

    for (const [referenceKey, targetModel] of Object.entries(LOOSE_REFERENCE_TARGETS)) {
      if (referenceKey.startsWith(`${model.name}.`) && targetModel !== model.name && allowedModelNames.has(targetModel)) {
        modelDependencies.add(targetModel);
      }
    }

    for (const targetModel of EXTRA_MODEL_DEPENDENCIES[model.name] || []) {
      if (targetModel !== model.name && allowedModelNames.has(targetModel)) {
        modelDependencies.add(targetModel);
      }
    }

    dependencies.set(model.name, modelDependencies);
  }

  const ordered: string[] = [];
  while (dependencies.size > 0) {
    const ready = [...dependencies.entries()]
      .filter(([, modelDependencies]) => [...modelDependencies].every(dependency => !dependencies.has(dependency)))
      .map(([modelName]) => modelName)
      .sort();

    if (ready.length === 0) {
      throw new Error(`School archive model dependency cycle: ${[...dependencies.keys()].join(', ')}`);
    }

    for (const modelName of ready) {
      ordered.push(modelName);
      dependencies.delete(modelName);
    }
  }

  return ordered;
}

export const SCHOOL_ARCHIVE_MODEL_ORDER = getImportOrder();

function serializeFieldValue(value: unknown, type: string, isList: boolean): unknown {
  if (value === null || value === undefined) return value;
  if (isList && Array.isArray(value)) {
    return value.map(item => serializeFieldValue(item, type, false));
  }

  if (type === 'DateTime') {
    return value instanceof Date ? value.toISOString() : String(value);
  }
  if (type === 'Decimal' || type === 'BigInt') {
    return String(value);
  }
  if (type === 'Bytes') {
    return Buffer.from(value as Buffer).toString('base64');
  }

  return value;
}

function deserializeFieldValue(value: unknown, type: string, isList: boolean, fieldLabel: string): unknown {
  if (value === null || value === undefined) return value;
  if (isList) {
    if (!Array.isArray(value)) {
      throw new SchoolArchiveError(`${fieldLabel} must be an array.`);
    }
    return value.map(item => deserializeFieldValue(item, type, false, fieldLabel));
  }

  if (type === 'DateTime') {
    const date = new Date(String(value));
    if (Number.isNaN(date.getTime())) {
      throw new SchoolArchiveError(`${fieldLabel} contains an invalid date.`);
    }
    return date;
  }
  if (type === 'Decimal') {
    try {
      return new Prisma.Decimal(String(value));
    } catch {
      throw new SchoolArchiveError(`${fieldLabel} contains an invalid decimal value.`);
    }
  }
  if (type === 'BigInt') {
    try {
      return BigInt(String(value));
    } catch {
      throw new SchoolArchiveError(`${fieldLabel} contains an invalid integer value.`);
    }
  }
  if (type === 'Bytes') {
    return Buffer.from(String(value), 'base64');
  }

  return value;
}

export function sanitizeRecordForArchive(modelName: string, record: Record<string, unknown>): Record<string, unknown> {
  const model = modelByName.get(modelName);
  if (!model) throw new SchoolArchiveError(`Unknown data model: ${modelName}`);

  const sanitized: Record<string, unknown> = {};
  for (const field of model.fields) {
    if (field.kind === 'object' || SENSITIVE_FIELD_NAMES.has(field.name)) continue;
    if (!Object.prototype.hasOwnProperty.call(record, field.name)) continue;
    sanitized[field.name] = serializeFieldValue(record[field.name], field.type, field.isList);
  }
  return sanitized;
}

function deserializeRecord(modelName: string, record: Record<string, unknown>): Record<string, any> {
  const model = modelByName.get(modelName);
  if (!model) throw new SchoolArchiveError(`Unknown data model: ${modelName}`);

  const deserialized: Record<string, any> = {};
  for (const field of model.fields) {
    if (field.kind === 'object' || SENSITIVE_FIELD_NAMES.has(field.name)) continue;
    if (!Object.prototype.hasOwnProperty.call(record, field.name)) continue;
    deserialized[field.name] = deserializeFieldValue(
      record[field.name],
      field.type,
      field.isList,
      `${modelName}.${field.name}`,
    );
  }
  return deserialized;
}

function collectFileReferences(data: SchoolDataArchive['data']): ArchiveFileReference[] {
  const references: ArchiveFileReference[] = [];
  for (const [modelName, records] of Object.entries(data)) {
    for (const record of records) {
      const recordId = typeof record.id === 'string' ? record.id : 'unknown';
      for (const [field, value] of Object.entries(record)) {
        if (!/(?:Url|URL)$/.test(field) || typeof value !== 'string' || !value.startsWith('/uploads/')) continue;
        references.push({ model: modelName, recordId, field, path: value });
      }
    }
  }
  return references;
}

export function computeArchiveChecksum(
  data: SchoolDataArchive['data'],
  links: SchoolDataArchive['links'],
  files: SchoolDataArchive['files'],
): string {
  return hash(JSON.stringify({ data, links, files }));
}

function safeSchoolSlug(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return slug || 'school';
}

export async function createSchoolArchive(actorUserId: string): Promise<{
  buffer: Buffer;
  filename: string;
  manifest: SchoolArchiveManifest;
}> {
  const schoolContext = await resolveSchoolContext(prisma, actorUserId);
  const tenantTables = await getTenantScopedTables(prisma);
  const data: SchoolDataArchive['data'] = {};

  for (const modelName of SCHOOL_ARCHIVE_MODEL_ORDER) {
    const model = modelByName.get(modelName)!;
    const tableName = databaseTableName(model);
    const selectList = scalarFields(model)
      .map(field => `${quoteIdentifier(field.dbName || field.name)} AS ${quoteIdentifier(field.name)}`)
      .join(', ');
    const predicates: string[] = [];
    const parameters: unknown[] = [];

    if (tenantTables.has(tableName)) {
      parameters.push(schoolContext.tenantId);
      predicates.push(`"tenantId" = $${parameters.length}::text`);
    }
    if (modelName === 'User') {
      predicates.push(`role::text <> 'PLATFORM_ADMIN'`);
    }

    const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT ${selectList} FROM ${quoteIdentifier(tableName)}` +
        (predicates.length > 0 ? ` WHERE ${predicates.join(' AND ')}` : '') +
        ` ORDER BY id`,
      ...parameters,
    );
    data[modelName] = rows.map((row: Record<string, unknown>) => sanitizeRecordForArchive(modelName, row));
  }

  const classTable = databaseTableName(modelByName.get('Class')!);
  const subjectTable = databaseTableName(modelByName.get('Subject')!);
  const linkPredicates: string[] = [];
  const linkParameters: unknown[] = [];
  if (tenantTables.has(classTable)) {
    linkParameters.push(schoolContext.tenantId);
    linkPredicates.push(`c."tenantId" = $${linkParameters.length}::text`);
  }
  if (tenantTables.has(subjectTable)) {
    linkParameters.push(schoolContext.tenantId);
    linkPredicates.push(`s."tenantId" = $${linkParameters.length}::text`);
  }
  const classSubjects = await prisma.$queryRawUnsafe<ClassSubjectLink[]>(
    `SELECT links."A" AS "classId", links."B" AS "subjectId"
       FROM "_ClassSubjects" links
       JOIN ${quoteIdentifier(classTable)} c ON c.id = links."A"
       JOIN ${quoteIdentifier(subjectTable)} s ON s.id = links."B"` +
      (linkPredicates.length > 0 ? ` WHERE ${linkPredicates.join(' AND ')}` : '') +
      ` ORDER BY links."A", links."B"`,
    ...linkParameters,
  );

  const links: SchoolDataArchive['links'] = { classSubjects };
  const files: SchoolDataArchive['files'] = {
    included: false,
    references: collectFileReferences(data),
  };
  const recordCounts = Object.fromEntries(
    Object.entries(data).map(([modelName, records]) => [modelName, records.length]),
  );
  const totalRecords = Object.values(recordCounts).reduce((total, count) => total + count, 0);
  const schoolName = schoolContext.schoolName;
  const checksum = computeArchiveChecksum(data, links, files);

  const manifest: SchoolArchiveManifest = {
    format: SCHOOL_ARCHIVE_FORMAT,
    formatVersion: SCHOOL_ARCHIVE_VERSION,
    createdAt: new Date().toISOString(),
    applicationVersion: '1.0.0',
    schemaFingerprint: CURRENT_SCHEMA_FINGERPRINT,
    school: { name: schoolName },
    modelCount: Object.keys(data).length,
    totalRecords,
    recordCounts,
    checksum,
    security: {
      credentialsIncluded: false,
      providerSecretsIncluded: false,
      uploadedFilesIncluded: false,
    },
    excludedModels: Object.entries(EXCLUDED_ARCHIVE_MODELS).map(([model, reason]) => ({ model, reason })),
  };

  const archive: SchoolDataArchive = { manifest, data, links, files };
  const json = JSON.stringify(archive);
  const buffer = gzipSync(Buffer.from(json, 'utf8'), { level: 9 });
  const date = manifest.createdAt.slice(0, 10);

  return {
    buffer,
    filename: `sync-${safeSchoolSlug(schoolName)}-${date}.sync.json.gz`,
    manifest,
  };
}

function isPlainRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function decodeArchiveBuffer(buffer: Buffer): string {
  if (buffer.length === 0) throw new SchoolArchiveError('The selected archive is empty.');
  if (buffer.length > MAX_ARCHIVE_UPLOAD_BYTES) {
    throw new SchoolArchiveError('The archive exceeds the 50 MB upload limit.', 413);
  }

  try {
    const isGzip = buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b;
    const decoded = isGzip
      ? gunzipSync(buffer, { maxOutputLength: MAX_ARCHIVE_UNCOMPRESSED_BYTES })
      : buffer;

    if (decoded.length > MAX_ARCHIVE_UNCOMPRESSED_BYTES) {
      throw new SchoolArchiveError('The expanded archive exceeds the 250 MB safety limit.', 413);
    }
    return decoded.toString('utf8');
  } catch (error) {
    if (error instanceof SchoolArchiveError) throw error;
    throw new SchoolArchiveError('The archive is not valid JSON or gzip-compressed JSON.');
  }
}

export function inspectSchoolArchive(buffer: Buffer): { archive: SchoolDataArchive; preview: Omit<ArchivePreview, 'destinationSchoolName'> } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(decodeArchiveBuffer(buffer));
  } catch (error) {
    if (error instanceof SchoolArchiveError) throw error;
    throw new SchoolArchiveError('The archive contains invalid JSON.');
  }

  if (!isPlainRecord(parsed) || !isPlainRecord(parsed.manifest) || !isPlainRecord(parsed.data)) {
    throw new SchoolArchiveError('The file is not a Sync school data archive.');
  }

  const manifest = parsed.manifest as Record<string, any>;
  if (manifest.format !== SCHOOL_ARCHIVE_FORMAT) {
    throw new SchoolArchiveError('The selected file is not a Sync school data archive.');
  }
  if (manifest.formatVersion !== SCHOOL_ARCHIVE_VERSION) {
    throw new SchoolArchiveError(
      `Archive version ${String(manifest.formatVersion)} is not supported by this application version.`,
      409,
    );
  }
  if (!isPlainRecord(manifest.school) || typeof manifest.school.name !== 'string') {
    throw new SchoolArchiveError('The archive does not identify its source school.');
  }
  if (typeof manifest.createdAt !== 'string' || Number.isNaN(new Date(manifest.createdAt).getTime())) {
    throw new SchoolArchiveError('The archive creation date is invalid.');
  }

  const data = parsed.data as Record<string, Array<Record<string, unknown>>>;
  let totalRecords = 0;
  const actualCounts: Record<string, number> = {};
  const warnings: string[] = [];

  for (const [modelName, records] of Object.entries(data)) {
    if (!Array.isArray(records)) {
      throw new SchoolArchiveError(`${modelName} data must be an array.`);
    }
    actualCounts[modelName] = records.length;
    totalRecords += records.length;
    if (totalRecords > MAX_ARCHIVE_RECORDS) {
      throw new SchoolArchiveError(`The archive exceeds the ${MAX_ARCHIVE_RECORDS.toLocaleString()} record limit.`, 413);
    }
    if (!allowedModelNames.has(modelName)) {
      warnings.push(`${modelName} is not supported by this application and will be skipped.`);
      continue;
    }

    const recordIds = new Set<string>();
    for (const [index, record] of records.entries()) {
      if (!isPlainRecord(record) || typeof record.id !== 'string' || record.id.length === 0) {
        throw new SchoolArchiveError(`${modelName} record ${index + 1} does not have a valid ID.`);
      }
      if (recordIds.has(record.id)) {
        throw new SchoolArchiveError(`${modelName} contains the duplicate record ID ${record.id}.`, 409);
      }
      recordIds.add(record.id);

      const sensitiveField = Object.keys(record).find(fieldName => SENSITIVE_FIELD_NAMES.has(fieldName));
      if (sensitiveField) {
        throw new SchoolArchiveError(`The archive contains the protected field ${modelName}.${sensitiveField}.`, 409);
      }
      if (modelName === 'User' && record.role === 'PLATFORM_ADMIN') {
        throw new SchoolArchiveError('Platform administrator accounts cannot be imported into a school.', 409);
      }
    }
  }

  const linksValue = isPlainRecord(parsed.links) ? parsed.links : {};
  const classSubjectsValue = Array.isArray(linksValue.classSubjects) ? linksValue.classSubjects : [];
  const classSubjects: ClassSubjectLink[] = classSubjectsValue.map((link: unknown, index: number) => {
    if (
      !isPlainRecord(link) ||
      typeof link.classId !== 'string' ||
      link.classId.length === 0 ||
      typeof link.subjectId !== 'string' ||
      link.subjectId.length === 0
    ) {
      throw new SchoolArchiveError(`Class-subject link ${index + 1} is invalid.`);
    }
    return { classId: link.classId, subjectId: link.subjectId };
  });
  if (classSubjects.length > MAX_ARCHIVE_RECORDS) {
    throw new SchoolArchiveError(`The archive exceeds the ${MAX_ARCHIVE_RECORDS.toLocaleString()} relationship limit.`, 413);
  }

  const classIds = new Set((data.Class || []).map(record => record.id));
  const subjectIds = new Set((data.Subject || []).map(record => record.id));
  for (const [index, link] of classSubjects.entries()) {
    if (!classIds.has(link.classId) || !subjectIds.has(link.subjectId)) {
      throw new SchoolArchiveError(`Class-subject link ${index + 1} refers to a record that is not in the archive.`, 409);
    }
  }

  const filesValue = isPlainRecord(parsed.files) ? parsed.files : {};
  const referencesValue = Array.isArray(filesValue.references) ? filesValue.references : [];
  const references: ArchiveFileReference[] = referencesValue.map((reference: unknown, index: number) => {
    if (
      !isPlainRecord(reference) ||
      typeof reference.model !== 'string' ||
      typeof reference.recordId !== 'string' ||
      typeof reference.field !== 'string' ||
      typeof reference.path !== 'string'
    ) {
      throw new SchoolArchiveError(`File reference ${index + 1} is invalid.`);
    }
    return {
      model: reference.model,
      recordId: reference.recordId,
      field: reference.field,
      path: reference.path,
    };
  });
  if (references.length > MAX_ARCHIVE_RECORDS) {
    throw new SchoolArchiveError(`The archive exceeds the ${MAX_ARCHIVE_RECORDS.toLocaleString()} file-reference limit.`, 413);
  }

  const archive: SchoolDataArchive = {
    manifest: manifest as SchoolArchiveManifest,
    data,
    links: { classSubjects },
    files: { included: false, references },
  };

  const checksum = computeArchiveChecksum(archive.data, archive.links, archive.files);
  if (typeof manifest.checksum !== 'string' || checksum !== manifest.checksum) {
    throw new SchoolArchiveError('Archive integrity check failed. The file may be incomplete or modified.', 409);
  }

  if (!isPlainRecord(manifest.recordCounts)) {
    throw new SchoolArchiveError('The archive record manifest is invalid.', 409);
  }
  const manifestModels = Object.keys(manifest.recordCounts).sort();
  const actualModels = Object.keys(actualCounts).sort();
  if (JSON.stringify(manifestModels) !== JSON.stringify(actualModels)) {
    throw new SchoolArchiveError('The archive model list does not match its manifest.', 409);
  }
  for (const [modelName, count] of Object.entries(actualCounts)) {
    if (manifest.recordCounts[modelName] !== count) {
      throw new SchoolArchiveError(`The ${modelName} record count does not match the archive manifest.`, 409);
    }
  }
  if (manifest.totalRecords !== totalRecords) {
    throw new SchoolArchiveError('The archive total does not match its manifest.', 409);
  }
  if (manifest.modelCount !== actualModels.length) {
    throw new SchoolArchiveError('The archive model count does not match its manifest.', 409);
  }

  const schemaMatches = manifest.schemaFingerprint === CURRENT_SCHEMA_FINGERPRINT;
  if (!schemaMatches) {
    warnings.push('This archive was created with a different database schema. Supported fields will be imported; incompatible required fields may stop the import.');
  }
  if (references.length > 0) {
    warnings.push(`${references.length.toLocaleString()} uploaded-file reference(s) are included, but file contents are not. Restore uploaded files separately.`);
  }
  warnings.push('Passwords and provider secrets are never imported. New user accounts will be disabled until an administrator sets a password.');

  const topRecordCounts = Object.entries(actualCounts)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([model, count]) => ({ model, count }));

  return {
    archive,
    preview: {
      canImport: true,
      integrityVerified: true,
      checksum,
      sourceSchoolName: manifest.school.name,
      createdAt: manifest.createdAt,
      formatVersion: manifest.formatVersion,
      schemaMatches,
      totalRecords,
      modelCount: Object.keys(actualCounts).length,
      fileReferenceCount: references.length,
      recordCounts: actualCounts,
      topRecordCounts,
      warnings,
    },
  };
}

export async function previewSchoolArchive(buffer: Buffer, actorUserId: string): Promise<ArchivePreview> {
  const { preview } = inspectSchoolArchive(buffer);
  const schoolContext = await resolveSchoolContext(prisma, actorUserId);
  const destinationSchoolName = schoolContext.schoolName;
  const warnings = [...preview.warnings];

  if (
    preview.sourceSchoolName.trim().toLowerCase() !== destinationSchoolName.trim().toLowerCase() &&
    destinationSchoolName !== 'My School'
  ) {
    warnings.unshift(`This archive belongs to “${preview.sourceSchoolName}”; the current installation is “${destinationSchoolName}”.`);
  }

  return { ...preview, destinationSchoolName, warnings };
}

function mapReferenceValue(value: any, targetModel: string, idMaps: Map<string, Map<string, string>>): any {
  const targetMap = idMaps.get(targetModel);
  if (!targetMap || value === null || value === undefined) return value;
  if (Array.isArray(value)) {
    return value.map(item => typeof item === 'string' ? targetMap.get(item) || item : item);
  }
  return typeof value === 'string' ? targetMap.get(value) || value : value;
}

function remapLooseReferences(
  modelName: string,
  record: Record<string, any>,
  idMaps: Map<string, Map<string, string>>,
): void {
  for (const [referenceKey, targetModel] of Object.entries(LOOSE_REFERENCE_TARGETS)) {
    const [referenceModel, fieldName] = referenceKey.split('.');
    if (referenceModel !== modelName || !Object.prototype.hasOwnProperty.call(record, fieldName)) continue;
    record[fieldName] = mapReferenceValue(record[fieldName], targetModel, idMaps);
  }

  if (modelName === 'BranchTransfer' && typeof record.entityId === 'string') {
    const targetModel = record.entityType === 'STUDENT' ? 'Student' : record.entityType === 'USER' ? 'User' : undefined;
    if (targetModel) record.entityId = mapReferenceValue(record.entityId, targetModel, idMaps);
  }
}

function remapDeclaredRelations(
  modelName: string,
  record: Record<string, any>,
  idMaps: Map<string, Map<string, string>>,
): Array<{ fields: string[]; values: any[]; targetModel: string }> {
  const model = modelByName.get(modelName)!;
  const deferredSelfRelations: Array<{ fields: string[]; values: any[]; targetModel: string }> = [];

  for (const relation of model.fields.filter(field => field.kind === 'object' && field.relationFromFields?.length)) {
    const relationFields = relation.relationFromFields || [];

    if (!allowedModelNames.has(relation.type)) {
      for (const fieldName of relationFields) delete record[fieldName];
      continue;
    }

    if (relation.type === modelName) {
      deferredSelfRelations.push({
        fields: [...relationFields],
        values: relationFields.map(fieldName => record[fieldName]),
        targetModel: relation.type,
      });
      for (const fieldName of relationFields) delete record[fieldName];
      continue;
    }

    if (relationFields.length === 1 && relation.relationToFields?.[0] === 'id') {
      const fieldName = relationFields[0];
      record[fieldName] = mapReferenceValue(record[fieldName], relation.type, idMaps);
    }
  }

  return deferredSelfRelations;
}

function uniqueCandidateFields(model: (typeof modelDefinitions)[number]): string[][] {
  const candidates = model.fields
    .filter(field => field.isUnique && !field.isId && !SENSITIVE_FIELD_NAMES.has(field.name))
    .map(field => [field.name]);
  for (const fields of model.uniqueFields || []) {
    if (fields.length > 0 && !fields.some(field => SENSITIVE_FIELD_NAMES.has(field))) candidates.push([...fields]);
  }
  return candidates;
}

function sqlCast(field: (typeof modelDefinitions)[number]['fields'][number]): string {
  const suffix = field.isList ? '[]' : '';
  if (field.kind === 'enum') return `::${quoteIdentifier(field.type)}${suffix}`;

  const scalarTypes: Record<string, string> = {
    String: 'text',
    Int: 'integer',
    BigInt: 'bigint',
    Float: 'double precision',
    Decimal: 'numeric',
    Boolean: 'boolean',
    DateTime: 'timestamp',
    Json: 'jsonb',
    Bytes: 'bytea',
  };
  const databaseType = scalarTypes[field.type];
  if (!databaseType) throw new SchoolArchiveError(`Unsupported field type ${field.type}.`, 409);
  return `::${databaseType}${suffix}`;
}

function sqlParameterValue(field: (typeof modelDefinitions)[number]['fields'][number], value: any): any {
  if (value === null || value === undefined) return value;
  if (field.type === 'Json') return JSON.stringify(value);
  return value;
}

function scopedPredicate(tableIsTenantScoped: boolean, tenantParameterIndex: number): string {
  return tableIsTenantScoped ? ` AND "tenantId" = $${tenantParameterIndex}::text` : '';
}

async function findExistingRecord(
  client: ArchiveDbClient,
  model: (typeof modelDefinitions)[number],
  record: Record<string, any>,
  tenantId: string,
  tableIsTenantScoped: boolean,
): Promise<{ id: string } | null> {
  const tableName = databaseTableName(model);
  const matches = new Map<string, { id: string }>();
  const sourceId = record.id;
  const idParameters = tableIsTenantScoped ? [sourceId, tenantId] : [sourceId];
  const byIdRows = await client.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT id FROM ${quoteIdentifier(tableName)} WHERE id = $1::text${scopedPredicate(tableIsTenantScoped, 2)} LIMIT 1`,
    ...idParameters,
  );
  const byId = byIdRows[0];
  if (byId) matches.set(byId.id, byId);

  if (model.name === 'SchoolSettings') {
    const singletonParameters = tableIsTenantScoped ? [tenantId] : [];
    const singletonRows = await client.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM ${quoteIdentifier(tableName)}` +
        (tableIsTenantScoped ? ` WHERE "tenantId" = $1::text` : '') +
        ` ORDER BY id LIMIT 1`,
      ...singletonParameters,
    );
    const singleton = singletonRows[0];
    if (singleton) matches.set(singleton.id, singleton);
  }

  for (const fields of uniqueCandidateFields(model)) {
    if (fields.some(field => record[field] === null || record[field] === undefined || record[field] === '')) continue;
    const parameters: any[] = [];
    const predicates = fields.map(fieldName => {
      const field = model.fields.find(candidate => candidate.name === fieldName)!;
      parameters.push(sqlParameterValue(field, record[fieldName]));
      return `${quoteIdentifier(field.dbName || field.name)} = $${parameters.length}${sqlCast(field)}`;
    });
    if (tableIsTenantScoped) {
      parameters.push(tenantId);
      predicates.push(`"tenantId" = $${parameters.length}::text`);
    }
    const matchRows = await client.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM ${quoteIdentifier(tableName)} WHERE ${predicates.join(' AND ')} ORDER BY id LIMIT 1`,
      ...parameters,
    );
    const match = matchRows[0];
    if (match) matches.set(match.id, match);
  }

  if (matches.size > 1) {
    throw new SchoolArchiveError(
      `${model.name} ${sourceId} conflicts with more than one existing record. No changes were applied.`,
      409,
    );
  }
  return matches.values().next().value || null;
}

async function chooseImportRecordId(
  client: ArchiveDbClient,
  model: (typeof modelDefinitions)[number],
  id: string,
  tableIsTenantScoped: boolean,
): Promise<string> {
  if (!tableIsTenantScoped) return id;
  const rows = await client.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT id FROM ${quoteIdentifier(databaseTableName(model))} WHERE id = $1::text LIMIT 1`,
    id,
  );
  if (rows.length === 0) return id;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const replacementId = randomUUID();
    const replacementRows = await client.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM ${quoteIdentifier(databaseTableName(model))} WHERE id = $1::text LIMIT 1`,
      replacementId,
    );
    if (replacementRows.length === 0) return replacementId;
  }
  throw new SchoolArchiveError(`Could not allocate a safe ID for ${model.name} ${id}. No changes were applied.`, 409);
}

async function insertRecord(
  client: ArchiveDbClient,
  model: (typeof modelDefinitions)[number],
  record: Record<string, any>,
  tenantId: string,
  tableIsTenantScoped: boolean,
): Promise<string> {
  const fields = model.fields.filter(field =>
    field.kind !== 'object' &&
    Object.prototype.hasOwnProperty.call(record, field.name) &&
    (!SENSITIVE_FIELD_NAMES.has(field.name) || (model.name === 'User' && field.name === 'passwordHash')),
  );
  const parameters = fields.map(field => sqlParameterValue(field, record[field.name]));
  const columns = fields.map(field => quoteIdentifier(field.dbName || field.name));
  const values = fields.map((field, index) => `$${index + 1}${sqlCast(field)}`);

  if (tableIsTenantScoped) {
    columns.push('"tenantId"');
    parameters.push(tenantId);
    values.push(`$${parameters.length}::text`);
  }

  const rows = await client.$queryRawUnsafe<Array<{ id: string }>>(
    `INSERT INTO ${quoteIdentifier(databaseTableName(model))} (${columns.join(', ')}) ` +
      `VALUES (${values.join(', ')}) RETURNING id`,
    ...parameters,
  );
  if (!rows[0]?.id) throw new SchoolArchiveError(`Failed to create ${model.name} ${record.id}.`, 409);
  return rows[0].id;
}

async function updateRecord(
  client: ArchiveDbClient,
  model: (typeof modelDefinitions)[number],
  id: string,
  record: Record<string, any>,
  tenantId: string,
  tableIsTenantScoped: boolean,
): Promise<void> {
  const fields = scalarFields(model).filter(field =>
    !field.isId && Object.prototype.hasOwnProperty.call(record, field.name),
  );
  if (fields.length === 0) return;

  const parameters = fields.map(field => sqlParameterValue(field, record[field.name]));
  const assignments = fields.map((field, index) =>
    `${quoteIdentifier(field.dbName || field.name)} = $${index + 1}${sqlCast(field)}`,
  );
  parameters.push(id);
  const idIndex = parameters.length;
  if (tableIsTenantScoped) parameters.push(tenantId);

  const changed = await client.$executeRawUnsafe(
    `UPDATE ${quoteIdentifier(databaseTableName(model))} SET ${assignments.join(', ')} ` +
      `WHERE id = $${idIndex}::text${scopedPredicate(tableIsTenantScoped, idIndex + 1)}`,
    ...parameters,
  );
  if (changed !== 1) throw new SchoolArchiveError(`Could not update ${model.name} ${id}.`, 409);
}

function actorProtectedUserData(data: Record<string, any>, targetId: string, actorUserId: string): Record<string, any> {
  if (targetId !== actorUserId) return data;
  const protectedData = { ...data };
  delete protectedData.email;
  delete protectedData.role;
  delete protectedData.isActive;
  delete protectedData.branchId;
  return protectedData;
}

export async function importSchoolArchive(
  buffer: Buffer,
  options: { expectedChecksum: string; actorUserId: string },
): Promise<ArchiveImportResult> {
  const { archive, preview } = inspectSchoolArchive(buffer);
  if (preview.checksum !== options.expectedChecksum) {
    throw new SchoolArchiveError('The archive changed after preview. Review it again before importing.', 409);
  }

  const schoolContext = await resolveSchoolContext(prisma, options.actorUserId);
  const tenantTables = await getTenantScopedTables(prisma);
  const passwordHash = await bcrypt.hash(randomBytes(48).toString('hex'), 12);
  const idMaps = new Map<string, Map<string, string>>(
    SCHOOL_ARCHIVE_MODEL_ORDER.map(modelName => [modelName, new Map<string, string>()]),
  );
  const modelResults: ArchiveImportResult['models'] = [];
  let totalCreated = 0;
  let totalUpdated = 0;
  let disabledUsers = 0;

  const linked = await prisma.$transaction(async transaction => {
    for (const modelName of SCHOOL_ARCHIVE_MODEL_ORDER) {
      const records = archive.data[modelName] || [];
      if (records.length === 0) continue;

      const model = modelByName.get(modelName)!;
      const tableIsTenantScoped = tenantTables.has(databaseTableName(model));
      const deferred: Array<{
        sourceRecordId: string;
        relations: Array<{ fields: string[]; values: any[]; targetModel: string }>;
      }> = [];
      let created = 0;
      let updated = 0;

      for (const archiveRecord of records) {
        const sourceId = archiveRecord.id as string;
        const record = deserializeRecord(modelName, archiveRecord);
        const deferredRelations = remapDeclaredRelations(modelName, record, idMaps);
        remapLooseReferences(modelName, record, idMaps);

        const existing = await findExistingRecord(
          transaction,
          model,
          record,
          schoolContext.tenantId,
          tableIsTenantScoped,
        );
        let targetId: string;

        if (existing) {
          targetId = existing.id;
          const updateData = { ...record };
          delete updateData.id;
          delete updateData.passwordHash;
          const safeUpdateData = modelName === 'User'
            ? actorProtectedUserData(updateData, targetId, options.actorUserId)
            : updateData;

          await updateRecord(
            transaction,
            model,
            targetId,
            safeUpdateData,
            schoolContext.tenantId,
            tableIsTenantScoped,
          );
          updated += 1;
        } else {
          const createData = { ...record };
          createData.id = await chooseImportRecordId(transaction, model, sourceId, tableIsTenantScoped);
          if (modelName === 'User') {
            createData.passwordHash = passwordHash;
            createData.isActive = false;
            disabledUsers += 1;
          }
          targetId = await insertRecord(
            transaction,
            model,
            createData,
            schoolContext.tenantId,
            tableIsTenantScoped,
          );
          created += 1;
        }

        idMaps.get(modelName)!.set(sourceId, targetId);
        if (deferredRelations.length > 0) {
          deferred.push({ sourceRecordId: sourceId, relations: deferredRelations });
        }
      }

      for (const deferredRecord of deferred) {
        const targetId = idMaps.get(modelName)!.get(deferredRecord.sourceRecordId)!;
        const data: Record<string, any> = {};
        for (const relation of deferredRecord.relations) {
          relation.fields.forEach((fieldName, index) => {
            data[fieldName] = mapReferenceValue(relation.values[index], relation.targetModel, idMaps);
          });
        }
        if (Object.keys(data).length > 0) {
          await updateRecord(
            transaction,
            model,
            targetId,
            data,
            schoolContext.tenantId,
            tableIsTenantScoped,
          );
        }
      }

      totalCreated += created;
      totalUpdated += updated;
      modelResults.push({ model: modelName, created, updated });
    }

    const uniqueLinks = new Set<string>();
    for (const link of archive.links.classSubjects) {
      const classId = idMaps.get('Class')?.get(link.classId) || link.classId;
      const subjectId = idMaps.get('Subject')?.get(link.subjectId) || link.subjectId;
      uniqueLinks.add(`${classId}\u0000${subjectId}`);
    }

    let linksCreated = 0;
    const classTable = databaseTableName(modelByName.get('Class')!);
    const subjectTable = databaseTableName(modelByName.get('Subject')!);
    for (const uniqueLink of uniqueLinks) {
      const [classId, subjectId] = uniqueLink.split('\u0000');
      const parameters: any[] = [classId, subjectId];
      const classTenantPredicate = tenantTables.has(classTable)
        ? (parameters.push(schoolContext.tenantId), ` AND c."tenantId" = $${parameters.length}::text`)
        : '';
      const subjectTenantPredicate = tenantTables.has(subjectTable)
        ? (parameters.push(schoolContext.tenantId), ` AND s."tenantId" = $${parameters.length}::text`)
        : '';
      const changed = await transaction.$executeRawUnsafe(
        `INSERT INTO "_ClassSubjects" ("A", "B")
         SELECT $1::text, $2::text
          WHERE EXISTS (
            SELECT 1 FROM ${quoteIdentifier(classTable)} c
             WHERE c.id = $1::text${classTenantPredicate}
          )
            AND EXISTS (
              SELECT 1 FROM ${quoteIdentifier(subjectTable)} s
               WHERE s.id = $2::text${subjectTenantPredicate}
            )
         ON CONFLICT DO NOTHING`,
        ...parameters,
      );
      linksCreated += changed;
    }
    return linksCreated;
  }, { maxWait: 15_000, timeout: 300_000 });

  const warnings = [...preview.warnings];
  if (disabledUsers > 0) {
    warnings.unshift(`${disabledUsers} new user account(s) were imported as inactive. Set passwords before activating them.`);
  }

  return {
    checksum: preview.checksum,
    sourceSchoolName: preview.sourceSchoolName,
    totalProcessed: totalCreated + totalUpdated,
    created: totalCreated,
    updated: totalUpdated,
    linked,
    disabledUsers,
    fileReferencesNotRestored: preview.fileReferenceCount,
    models: modelResults,
    warnings,
  };
}

async function countModelRows(
  client: ArchiveDbClient,
  modelName: string,
  tenantId: string,
  tenantTables: Set<string>,
): Promise<number> {
  const model = modelByName.get(modelName)!;
  const tableName = databaseTableName(model);
  const parameters: any[] = [];
  const predicates: string[] = [];
  if (tenantTables.has(tableName)) {
    parameters.push(tenantId);
    predicates.push(`"tenantId" = $${parameters.length}::text`);
  }
  if (modelName === 'User') predicates.push(`role::text <> 'PLATFORM_ADMIN'`);
  const rows = await client.$queryRawUnsafe<Array<{ count: number }>>(
    `SELECT COUNT(*)::int AS count FROM ${quoteIdentifier(tableName)}` +
      (predicates.length > 0 ? ` WHERE ${predicates.join(' AND ')}` : ''),
    ...parameters,
  );
  return rows[0]?.count || 0;
}

export async function logSchoolArchiveAudit(options: {
  actorUserId: string;
  action: 'SCHOOL_DATA_EXPORT' | 'SCHOOL_DATA_IMPORT';
  entityId: string;
  details: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<void> {
  const schoolContext = await resolveSchoolContext(prisma, options.actorUserId);
  const tenantTables = await getTenantScopedTables(prisma);
  const auditTable = databaseTableName(modelByName.get('AuditLog')!);
  const columns = [
    'id',
    'userId',
    'action',
    'entityType',
    'entityId',
    'newValue',
    'ipAddress',
    'userAgent',
    'createdAt',
  ];
  const parameters: any[] = [
    randomUUID(),
    options.actorUserId,
    options.action,
    'SchoolDataArchive',
    options.entityId,
    JSON.stringify(options.details),
    options.ipAddress || null,
    options.userAgent || null,
    new Date(),
  ];
  const values = [
    '$1::text',
    '$2::text',
    '$3::text',
    '$4::text',
    '$5::text',
    '$6::jsonb',
    '$7::text',
    '$8::text',
    '$9::timestamp',
  ];

  if (tenantTables.has(auditTable)) {
    columns.push('tenantId');
    parameters.push(schoolContext.tenantId);
    values.push(`$${parameters.length}::text`);
  }

  await prisma.$executeRawUnsafe(
    `INSERT INTO ${quoteIdentifier(auditTable)} (${columns.map(quoteIdentifier).join(', ')}) VALUES (${values.join(', ')})`,
    ...parameters,
  );
}

export async function getDataManagementOverview(actorUserId: string): Promise<DataManagementOverview> {
  const schoolContext = await resolveSchoolContext(prisma, actorUserId);
  const tenantTables = await getTenantScopedTables(prisma);
  const auditTable = databaseTableName(modelByName.get('AuditLog')!);

  const [students, users, classes, subjects, branches, payments, attendance, assessments] = await Promise.all([
    countModelRows(prisma, 'Student', schoolContext.tenantId, tenantTables),
    countModelRows(prisma, 'User', schoolContext.tenantId, tenantTables),
    countModelRows(prisma, 'Class', schoolContext.tenantId, tenantTables),
    countModelRows(prisma, 'Subject', schoolContext.tenantId, tenantTables),
    countModelRows(prisma, 'Branch', schoolContext.tenantId, tenantTables),
    countModelRows(prisma, 'Payment', schoolContext.tenantId, tenantTables),
    countModelRows(prisma, 'Attendance', schoolContext.tenantId, tenantTables),
    countModelRows(prisma, 'Assessment', schoolContext.tenantId, tenantTables),
  ]);

  const activityParameters: any[] = [['SCHOOL_DATA_EXPORT', 'SCHOOL_DATA_IMPORT']];
  let activityWhere = `action = ANY($1::text[])`;
  if (tenantTables.has(auditTable)) {
    activityParameters.push(schoolContext.tenantId);
    activityWhere += ` AND "tenantId" = $2::text`;
  }
  const activity = await prisma.$queryRawUnsafe<Array<{
    id: string;
    action: string;
    createdAt: Date;
    userId: string | null;
    newValue: unknown;
  }>>(
    `SELECT id, action, "createdAt", "userId", "newValue"
       FROM ${quoteIdentifier(auditTable)}
      WHERE ${activityWhere}
      ORDER BY "createdAt" DESC
      LIMIT 10`,
    ...activityParameters,
  );

  return {
    schoolName: schoolContext.schoolName,
    counts: { students, users, classes, subjects, branches, payments, attendance, assessments },
    archive: {
      formatVersion: SCHOOL_ARCHIVE_VERSION,
      transferableModels: allowedModelDefinitions.length,
      excludedModels: Object.keys(EXCLUDED_ARCHIVE_MODELS).length,
      maxUploadMb: MAX_ARCHIVE_UPLOAD_BYTES / 1024 / 1024,
    },
    recentActivity: activity.map((entry: any) => ({
      id: entry.id,
      action: entry.action,
      createdAt: entry.createdAt,
      userId: entry.userId,
      details: isPlainRecord(entry.newValue) ? entry.newValue : null,
    })),
  };
}
