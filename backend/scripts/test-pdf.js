const fs = require('fs');
const path = require('path');

async function extractText(filePath) {
  const pdfjsLib = await import('pdfjs-dist/build/pdf.mjs');
  const data = new Uint8Array(fs.readFileSync(filePath));
  const doc = await pdfjsLib.getDocument({ data }).promise;
  
  let fullText = '';
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map(item => item.str).join(' ');
    fullText += `\n--- PAGE ${i} ---\n${pageText}`;
  }
  return { text: fullText, numPages: doc.numPages };
}

async function main() {
  const file = path.join(__dirname, '..', 'Finalised Syllabi', 'Form 1 - 4', 'MATHEMATICS-O-LEVEL-FORMS-1-4.pdf');
  console.log('Reading:', file);
  
  const result = await extractText(file);
  console.log('Pages:', result.numPages);
  console.log(result.text.substring(0, 5000));
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
