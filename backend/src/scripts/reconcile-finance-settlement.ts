import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '../utils/prisma';
import {
  applyFinanceSettlementReconciliationPlan,
  buildFinanceSettlementReconciliationPlan,
} from '../services/financeSettlementReconciliationService';

const args = process.argv.slice(2);
const shouldApply = args.includes('--apply');
const confirmArgument = args.find(argument => argument.startsWith('--confirm='));
const outputArgument = args.find(argument => argument.startsWith('--output='));
const confirmation = confirmArgument?.slice('--confirm='.length);
const outputPath = outputArgument?.slice('--output='.length);

const emit = async (value: unknown) => {
  const serialized = `${JSON.stringify(value, null, 2)}\n`;
  if (outputPath) {
    const absolutePath = path.resolve(outputPath);
    await writeFile(absolutePath, serialized, 'utf8');
    console.error(`Finance settlement reconciliation report written to ${absolutePath}`);
    return;
  }
  process.stdout.write(serialized);
};

const main = async () => {
  const plan = await buildFinanceSettlementReconciliationPlan();
  if (!shouldApply) {
    await emit({ mode: 'DRY_RUN', plan });
    return;
  }

  if (!confirmation) {
    throw new Error(
      `Apply requires --confirm=${plan.sourceFingerprint} from the latest dry-run report`,
    );
  }

  const result = await applyFinanceSettlementReconciliationPlan(confirmation);
  await emit({
    mode: 'APPLIED',
    appliedActions: result.appliedActions,
    appliedAmount: result.appliedAmount,
    sourceFingerprint: result.before.sourceFingerprint,
    after: result.after,
  });
};

main()
  .catch(error => {
    console.error('Finance settlement reconciliation failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
