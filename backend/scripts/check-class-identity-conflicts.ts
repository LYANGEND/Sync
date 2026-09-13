import { systemPrisma } from '../src/utils/prisma';

type ClassIdentityConflict = {
  tenantId: string;
  academicTermId: string;
  branchId: string | null;
  normalizedName: string;
  duplicateCount: number;
  classIds: string[];
  storedNames: string[];
};

async function main(): Promise<void> {
  const conflicts = await systemPrisma.$queryRaw<ClassIdentityConflict[]>`
    SELECT
      "tenantId" AS "tenantId",
      "academicTermId" AS "academicTermId",
      "branchId" AS "branchId",
      LOWER(BTRIM("name")) AS "normalizedName",
      COUNT(*)::INTEGER AS "duplicateCount",
      ARRAY_AGG("id" ORDER BY "id") AS "classIds",
      ARRAY_AGG("name" ORDER BY "id") AS "storedNames"
    FROM "classes"
    GROUP BY
      "tenantId",
      "academicTermId",
      "branchId",
      LOWER(BTRIM("name"))
    HAVING COUNT(*) > 1
    ORDER BY "tenantId", "academicTermId", "branchId", LOWER(BTRIM("name"));
  `;

  if (conflicts.length === 0) {
    console.log('Class identity preflight passed: no duplicate groups found.');
    return;
  }

  console.error(`Class identity preflight failed: ${conflicts.length} duplicate group(s) found.`);
  for (const conflict of conflicts) {
    console.error(JSON.stringify({
      tenantId: conflict.tenantId,
      academicTermId: conflict.academicTermId,
      branchId: conflict.branchId,
      normalizedName: conflict.normalizedName,
      duplicateCount: conflict.duplicateCount,
      classIds: conflict.classIds,
      storedNames: conflict.storedNames,
    }));
  }

  console.error('Review and merge these records manually before applying the class uniqueness migration.');
  process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error('Class identity preflight could not run:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await systemPrisma.$disconnect();
  });
