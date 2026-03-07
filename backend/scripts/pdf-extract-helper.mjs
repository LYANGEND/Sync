// ESM helper for PDF text extraction — called via child_process from the main seeder
import { readFileSync } from 'fs';

// Suppress pdfjs warnings that pollute stdout
const origWarn = console.warn;
console.warn = (...args) => {
  // Redirect to stderr only
  process.stderr.write(args.join(' ') + '\n');
};

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: node pdf-extract-helper.mjs <path>');
    process.exit(1);
  }

  const pdfjsLib = await import('pdfjs-dist/build/pdf.mjs');
  const data = new Uint8Array(readFileSync(filePath));
  const doc = await pdfjsLib.getDocument({ data }).promise;

  let fullText = '';
  const maxPages = Math.min(80, doc.numPages);

  for (let i = 1; i <= maxPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map(item => item.str).join(' ');
    const readableRatio = pageText.replace(/[^\x20-\x7E]/g, '').length / (pageText.length || 1);
    if (pageText.trim().length > 30 && readableRatio > 0.3) {
      fullText += `\n[PAGE ${i}]\n${pageText}\n`;
    }
  }

  // Output as JSON to stdout
  process.stdout.write(JSON.stringify({ text: fullText, numPages: doc.numPages }));
}

main().catch(e => {
  console.error(e.message);
  process.exit(1);
});
