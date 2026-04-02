#!/usr/bin/env ts-node
/**
 * PDF Content Ingestion Script
 * 
 * Parses all 140 official Zambian CDC PDFs (syllabi + teaching modules)
 * and stores the extracted text in the TeachingContent table.
 * 
 * The AI Tutor automatically picks up this content via
 * loadApprovedTeachingContent() — no further code changes needed.
 * 
 * Usage:
 *   npx ts-node scripts/ingestPDFs.ts              # Ingest all PDFs
 *   npx ts-node scripts/ingestPDFs.ts --syllabi     # Only syllabi
 *   npx ts-node scripts/ingestPDFs.ts --modules     # Only modules
 *   npx ts-node scripts/ingestPDFs.ts --status      # Show ingestion status
 */

import { ingestAllPDFs, getIngestionStatus } from '../src/services/contentIngestionService';

async function main() {
  const args = process.argv.slice(2);

  // Show status only
  if (args.includes('--status')) {
    console.log('\n📊 TeachingContent Ingestion Status\n');
    const status = await getIngestionStatus();
    console.log(`Total records:     ${status.totalRecords}`);
    console.log(`Total characters:  ${(status.totalCharacters / 1_000_000).toFixed(2)} million`);
    console.log(`Source files:      ${status.sourceFiles.length}`);
    console.log('\nBy subject:');
    for (const s of status.bySubject) {
      console.log(`  ${s.subjectName.padEnd(30)} ${s.count} chunks`);
    }
    console.log('\nBy content type:');
    for (const t of status.byContentType) {
      console.log(`  ${t.contentType.padEnd(15)} ${t.count} chunks`);
    }
    process.exit(0);
  }

  // Determine what to ingest
  const syllabi = args.includes('--syllabi') || (!args.includes('--modules'));
  const modules = args.includes('--modules') || (!args.includes('--syllabi'));

  console.log('\n📚 Zambian CDC Content Ingestion Pipeline');
  console.log('=========================================');
  console.log(`Syllabi:  ${syllabi ? '✓' : '✗'}`);
  console.log(`Modules:  ${modules ? '✓' : '✗'}`);
  console.log('');

  const start = Date.now();
  const summary = await ingestAllPDFs({ syllabi, modules });
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  console.log('\n=========================================');
  console.log(`📋 INGESTION SUMMARY`);
  console.log(`=========================================`);
  console.log(`Total PDFs:        ${summary.totalFiles}`);
  console.log(`Successful:        ${summary.successfulFiles}`);
  console.log(`Failed:            ${summary.failedFiles}`);
  console.log(`Total chunks:      ${summary.totalChunks}`);
  console.log(`Total characters:  ${(summary.totalCharacters / 1_000_000).toFixed(2)} million`);
  console.log(`Time elapsed:      ${elapsed}s`);

  if (summary.failedFiles > 0) {
    console.log('\n⚠ Failed files:');
    for (const r of summary.results.filter(r => r.error)) {
      console.log(`  ${r.file}: ${r.error}`);
    }
  }

  console.log('\n✅ Content is now available to the AI Tutor via loadApprovedTeachingContent()');
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
