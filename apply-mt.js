const fs = require('fs');
const schemaPath = 'D:/livingilabs/Sync/backend/prisma/schema.prisma';
let content = fs.readFileSync(schemaPath, 'utf-8');

const tenantBlock = `
enum TenantStatus {
  ACTIVE
  SUSPENDED
}

model Tenant {
  id        String       @id @default(uuid())
  name      String
  slug      String       @unique
  status    TenantStatus @default(ACTIVE)
  createdAt DateTime     @default(now())
  updatedAt DateTime     @updatedAt

  @@map("tenants")
}

`;

content = content.replace('model User {', tenantBlock + 'model User {');

const skipModels = ['Tenant'];
const uniqueToScope = {
  'Subject': 'code', 'ChartOfAccount': 'code', 'JournalEntry': 'entryNumber',
  'Expense': 'expenseNumber', 'FeeCategory': 'code', 'Invoice': 'invoiceNumber',
  'CreditNote': 'creditNoteNumber', 'Refund': 'refundNumber', 'PayrollRun': 'runNumber',
  'Payslip': 'payslipNumber', 'VirtualClassroom': 'roomName',
  'MobileMoneyCollection': 'reference', 'Payment': 'transactionId',
  'AIInsightsCache': 'cacheKey', 'Student': 'admissionNumber',
};

const lines = content.split('\n');
const out = [];
let inModel = false, inEnum = false, curModel = '', mdlLines = [], hasTid = false;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (!inModel && !inEnum && /^enum\s+\w+\s*\{/.test(line)) { inEnum = true; out.push(line); continue; }
  if (inEnum) { out.push(line); if (/^\}\s*$/.test(line)) inEnum = false; continue; }
  const mm = line.match(/^model\s+(\w+)\s*\{/);
  if (mm && !inModel) { inModel = true; curModel = mm[1]; mdlLines = [line]; hasTid = false; continue; }
  if (inModel) {
    if (/tenantId/.test(line)) hasTid = true;
    if (/^\}\s*$/.test(line)) {
      mdlLines.push(line);
      if (!skipModels.includes(curModel) && !hasTid) {
        let ii = mdlLines.length - 1;
        for (let j = 1; j < mdlLines.length - 1; j++) { if (mdlLines[j].trim().startsWith('@@')) { ii = j; break; } }
        mdlLines.splice(ii, 0, '', '  tenantId String @default("SYSTEM")');
        let mi = -1;
        for (let j = 0; j < mdlLines.length; j++) { if (mdlLines[j].trim().startsWith('@@map')) { mi = j; break; } }
        if (mi !== -1) mdlLines.splice(mi, 0, '  @@index([tenantId])');
        else mdlLines.splice(mdlLines.length - 1, 0, '  @@index([tenantId])');
      }
      const sf = uniqueToScope[curModel];
      if (sf) {
        mdlLines = mdlLines.map(l => new RegExp(`(\\s+${sf}\\s+\\S+)\\s+@unique`).test(l) ? l.replace(/@unique/, '') : l);
        let ib = mdlLines.length - 1;
        for (let j = mdlLines.length - 2; j >= 0; j--) { const t = mdlLines[j].trim(); if (t.startsWith('@@')) ib = j; else break; }
        mdlLines.splice(ib, 0, `  @@unique([${sf}, tenantId])`);
      }
      out.push(...mdlLines);
      inModel = false; curModel = ''; mdlLines = []; continue;
    }
    mdlLines.push(line); continue;
  }
  out.push(line);
}

fs.writeFileSync(schemaPath, out.join('\n'));
const f = fs.readFileSync(schemaPath, 'utf-8');
console.log(`Tenant: ${f.includes('model Tenant') ? 'YES' : 'NO'}`);
console.log(`@default("SYSTEM"): ${(f.match(/@default\("SYSTEM"\)/g)||[]).length}`);
console.log(`@@unique+tenantId: ${(f.match(/@@unique\(\[.*tenantId\]/g)||[]).length}`);
console.log(`@@index([tenantId]): ${(f.match(/@@index\(\[tenantId\]\)/g)||[]).length}`);
