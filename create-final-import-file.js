const XLSX = require('xlsx');
const fs = require('fs');

// Production class IDs from your database
const classMap = {
  'Baby Class': '5cd5b0bb-c4c4-497a-a879-4c6558be40dc',
  'Day Care': '16a926d8-dbb0-474d-96bf-efd1bd63cb58',
  'Middle Class': 'bfe61030-8798-4905-9546-93ff9601bdca',
  'Reception Class': 'c9ccfabb-e802-48e4-8c37-2fbeebbea0d9',
  'Grade One': '34800277-3350-437a-bdb1-090c0c3016b8',
  'Grade Two': '92ad1bf1-0ef5-4966-be87-7f302e51a58d',
  'Grade Three': '595afcad-1a8f-4f10-8d74-8ae20a8e0917',
  'Grade Four': '1ae86214-321d-4707-9fe9-5ef9734cb80c',
  'Grade Five': '6206a449-99a6-4b6d-ab42-e3cb7547cf76',
  'Grade Six': '77ada2bd-9303-4487-8699-d983eff5ed75',
  'Grade Seven': '5c257ab5-cd9a-49a4-a9bd-423630b78369'
};

// Grade mapping
const gradeMapping = {
  'B': 'Baby Class',
  'DC': 'Day Care',
  'MC': 'Middle Class',
  'RC': 'Reception Class',
  'REC': 'Reception Class',
  '1': 'Grade One',
  '2': 'Grade Two',
  '3': 'Grade Three',
  '4': 'Grade Four',
  '5': 'Grade Five',
  '6': 'Grade Six',
  '7': 'Grade Seven'
};

function cleanName(name) {
  if (!name) return null;
  return name
    .replace(/\*/g, '')
    .replace(/\./g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function splitName(fullName) {
  const parts = fullName.split(' ').filter(p => p.length > 0);
  if (parts.length === 0) return { firstName: 'Unknown', lastName: 'Unknown' };
  if (parts.length === 1) return { firstName: parts[0], lastName: parts[0] };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

console.log('Reading Excel file...');
const workbook = XLSX.readFile('robbie.xlsx');
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];
const data = XLSX.utils.sheet_to_json(worksheet);

console.log(`Found ${data.length} students`);

const cleanedData = [];
let processed = 0;

for (let i = 0; i < data.length; i++) {
  const row = data[i];
  const rawName = row.NAME;
  const gradeRaw = row.GRADE;
  
  if (!rawName || gradeRaw == null || gradeRaw === '') continue;
  
  const grade = String(gradeRaw).trim();
  if (grade.toLowerCase() === 'grade' || grade.toLowerCase() === 'class') continue;

  const cleanedName = cleanName(rawName);
  if (!cleanedName) continue;

  const className = gradeMapping[grade];
  if (!className) continue;

  const { firstName, lastName } = splitName(cleanedName);
  const year = new Date().getFullYear();
  const admissionNumber = `${year}${String(processed + 1).padStart(4, '0')}`;
  const now = new Date().toISOString();

  cleanedData.push({
    firstName,
    lastName,
    admissionNumber,
    dateOfBirth: '2010-01-01',
    gender: 'MALE',
    className,  // Use className instead of classId
    guardianName: '',
    guardianPhone: '',
    address: ''
  });

  processed++;
}

// Create Excel file
const outputWorkbook = XLSX.utils.book_new();
const outputWorksheet = XLSX.utils.json_to_sheet(cleanedData);
XLSX.utils.book_append_sheet(outputWorkbook, outputWorksheet, 'Students');
XLSX.writeFile(outputWorkbook, 'students-ready-to-import.xlsx');

// Create CSV file
const csv = XLSX.utils.sheet_to_csv(outputWorksheet);
fs.writeFileSync('students-ready-to-import.csv', csv);

console.log(`\n✅ Successfully processed ${processed} students`);
console.log('✅ Created: students-ready-to-import.xlsx');
console.log('✅ Created: students-ready-to-import.csv');
console.log('\nThese files are ready to import into your system!');
