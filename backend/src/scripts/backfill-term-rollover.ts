import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '../utils/prisma';
import { planTermBackfill } from '../services/termBackfillPlanner';
import {
  applyTermBackfillReport,
  loadTermBackfillData,
} from '../services/termBackfillDataSource';

interface CliOptions {
  apply: boolean;
  reportPath: string;
  defaultTermCount: number;
  inferredYearNamePrefix: string;
}

const usage = (): string => [
  'Usage: ts-node src/scripts/backfill-term-rollover.ts [options]',
  '',
  'Options:',
  '  --apply                         Apply a blocker-free plan in one transaction.',
  '  --report <path>                 JSON report path.',
  '  --default-term-count <number>   Required term count for inferred calendar years (default: 3).',
  '  --year-name-prefix <text>       Prefix for inferred academic years (default: Academic Year).',
  '  --help                          Show this help.',
  '',
  'The command is dry-run by default. It never assigns the nearest year or class.',
].join('\n');

const defaultReportPath = (): string => path.resolve(
  process.cwd(),
  'reports',
  'term-backfill',
  `term-backfill-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
);

const parseArgs = (args: string[]): CliOptions => {
  const options: CliOptions = {
    apply: false,
    reportPath: defaultReportPath(),
    defaultTermCount: 3,
    inferredYearNamePrefix: 'Academic Year',
  };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--help') {
      console.log(usage());
      process.exit(0);
    }
    if (argument === '--apply') {
      options.apply = true;
      continue;
    }
    if (argument === '--report') {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) throw new Error('--report requires a path');
      options.reportPath = path.resolve(process.cwd(), value);
      index += 1;
      continue;
    }
    if (argument === '--default-term-count') {
      const value = Number(args[index + 1]);
      if (!Number.isInteger(value) || value < 1) {
        throw new Error('--default-term-count requires a positive integer');
      }
      options.defaultTermCount = value;
      index += 1;
      continue;
    }
    if (argument === '--year-name-prefix') {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) throw new Error('--year-name-prefix requires text');
      options.inferredYearNamePrefix = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown option: ${argument}`);
  }

  return options;
};

const printSummary = (report: ReturnType<typeof planTermBackfill>, reportPath: string): void => {
  console.log('\nDeterministic term backfill analysis');
  console.log(`  Source fingerprint: ${report.sourceFingerprint}`);
  console.log(`  Blockers: ${report.summary.blockers}`);
  console.log(`  Warnings: ${report.summary.warnings}`);
  console.log(`  Terms to update: ${report.summary.proposals.termsToUpdate}`);
  console.log(`  Cohorts to create: ${report.summary.proposals.cohortsToCreate}`);
  console.log(`  Enrollments to create: ${report.summary.proposals.enrollmentsToCreate}`);
  console.log(`  Can apply: ${report.canApply ? 'yes' : 'no'}`);
  console.log(`  Report: ${reportPath}`);
};

const main = async (): Promise<void> => {
  const options = parseArgs(process.argv.slice(2));
  const loaded = await loadTermBackfillData(prisma);
  const report = planTermBackfill(loaded.input, {
    defaultTermCount: options.defaultTermCount,
    inferredYearNamePrefix: options.inferredYearNamePrefix,
  });

  await mkdir(path.dirname(options.reportPath), { recursive: true });
  await writeFile(options.reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  printSummary(report, options.reportPath);

  if (!options.apply) {
    if (report.summary.blockers > 0) {
      process.exitCode = 2;
    }
    return;
  }

  if (!report.canApply) {
    throw new Error('Apply refused: resolve every blocker and generate a new report first.');
  }

  const result = await applyTermBackfillReport(
    prisma,
    report,
    loaded.snapshotFingerprint,
  );
  console.log('\nBackfill applied atomically.');
  console.log(JSON.stringify(result, null, 2));

  const verification = await loadTermBackfillData(prisma);
  const verificationReport = planTermBackfill(verification.input, {
    defaultTermCount: options.defaultTermCount,
    inferredYearNamePrefix: options.inferredYearNamePrefix,
  });
  const pending = Object.values(verificationReport.summary.proposals)
    .reduce((total, count) => total + count, 0);
  if (verificationReport.summary.blockers > 0 || pending > 0) {
    throw new Error(
      `Post-apply verification failed: ${verificationReport.summary.blockers} blocker(s), ${pending} pending proposal(s).`,
    );
  }
  console.log('Post-apply verification passed; rerun is idempotent.');
};

main()
  .catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
