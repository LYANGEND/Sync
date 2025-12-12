# Bulk Import Implementation Plan

## Overview
Add bulk import functionality for Classes, Subjects, Scholarships, and Fee Templates with CSV upload support.

## Backend Implementation

### 1. Classes ✅ (DONE)
- Route: `POST /api/v1/classes/bulk`
- Fields: name, gradeLevel, teacherId (optional), academicTermId (optional)
- CSV Format: `name,gradeLevel`

### 2. Subjects ✅ (DONE)
- Route: `POST /api/v1/subjects/bulk`
- Fields: name, code
- CSV Format: `name,code`

### 3. Scholarships (TODO)
- Route: `POST /api/v1/scholarships/bulk`
- Fields: name, percentage, description (optional)
- CSV Format: `name,percentage,description`

### 4. Fee Templates (TODO)
- Route: `POST /api/v1/fees/templates/bulk`
- Fields: name, amount, applicableGrade, academicTermId (optional)
- CSV Format: `name,amount,applicableGrade`

## Frontend Implementation

### Reusable Component: BulkImportModal
Create a generic modal component that can be reused for all entities.

**Props:**
- entityName: string (e.g., "Classes", "Subjects")
- apiEndpoint: string
- templateFields: string[]
- onSuccess: () => void

**Features:**
- CSV file upload
- Template download
- Progress indicator
- Error handling
- Success message

### Page Updates

1. **Classes Page** - Add "Import Classes" button
2. **Subjects Page** - Add "Import Subjects" button  
3. **Scholarships Page** - Add "Import Scholarships" button
4. **Fee Templates Page** - Add "Import Fee Templates" button

## CSV Template Examples

### Classes Template
```csv
name,gradeLevel
Baby Class,-2
Grade One,1
Grade Two,2
```

### Subjects Template
```csv
name,code
Mathematics,MATH
English,ENG
Science,SCI
```

### Scholarships Template
```csv
name,percentage,description
Full Scholarship,100,Complete tuition waiver
Half Scholarship,50,50% tuition discount
```

### Fee Templates Template
```csv
name,amount,applicableGrade
Tuition Fee,5000,1
Lab Fee,500,7
```

## Implementation Order

1. ✅ Backend: Classes bulk import
2. ✅ Backend: Subjects bulk import
3. ⏳ Backend: Scholarships bulk import
4. ⏳ Backend: Fee Templates bulk import
5. ⏳ Frontend: Reusable BulkImportModal component
6. ⏳ Frontend: Integrate into all pages
7. ⏳ Testing & Documentation
