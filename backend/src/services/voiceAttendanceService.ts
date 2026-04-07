import aiService from './aiService';
import { prisma } from '../utils/prisma';

// ==========================================
// VOICE ATTENDANCE SERVICE
// ==========================================
// Take attendance using voice commands
// Saves teachers 5-10 minutes per class

interface VoiceAttendanceResult {
  present: string[];
  absent: string[];
  late: string[];
  unmatched: string[];
  totalProcessed: number;
  confidence: number;
}

/**
 * Process voice attendance input and create attendance records
 */
export async function processVoiceAttendance(
  classId: string,
  audioBuffer: Buffer,
  date: Date,
  mimeType: string = 'audio/webm'
): Promise<VoiceAttendanceResult> {
  // 1. Transcribe audio
  const transcript = await aiService.transcribeAudio(audioBuffer, mimeType);

  if (!transcript || transcript.trim().length === 0) {
    throw new Error('No speech detected in audio');
  }

  console.log('[VoiceAttendance] Transcript:', transcript);

  // 2. Get class roster
  const classInfo = await prisma.class.findUnique({
    where: { id: classId },
    include: {
      students: {
        where: { status: 'ACTIVE' },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          admissionNumber: true,
        },
        orderBy: { lastName: 'asc' },
      },
    },
  });

  if (!classInfo) {
    throw new Error('Class not found');
  }

  const students = classInfo.students;
  const studentNames = students.map(s => `${s.firstName} ${s.lastName}`).join(', ');

  // 3. Parse attendance from transcript using AI
  const prompt = `Parse attendance from this teacher's voice input.

TRANSCRIPT: "${transcript}"

CLASS ROSTER (${students.length} students):
${students.map((s, i) => `${i + 1}. ${s.firstName} ${s.lastName}`).join('\n')}

The teacher may have said things like:
- "Present: John, Mary, Peter"
- "Absent: Sarah, David"
- "Late: Michael"
- "Everyone is here except Sarah and David"
- "All present"
- "John is absent, everyone else is here"

Extract:
- PRESENT students (explicitly mentioned as present/here, or implied if "all present" or "everyone here")
- ABSENT students (explicitly mentioned as absent/not here/missing)
- LATE students (explicitly mentioned as late/tardy)

Match names to the class roster above. Be flexible with name matching (first name only, last name only, nicknames).

If the teacher says "all present" or "everyone here", mark ALL students as present.
If the teacher says "all here except [names]", mark those as absent and rest as present.

Return JSON:
{
  "present": ["Full Name 1", "Full Name 2"],
  "absent": ["Full Name 3"],
  "late": ["Full Name 4"],
  "confidence": 0.95
}

Use exact names from the roster. If you can't match a name confidently, omit it.`;

  const parsed = await aiService.generateJSON<{
    present: string[];
    absent: string[];
    late: string[];
    confidence: number;
  }>(prompt, {
    systemPrompt: `You are parsing attendance from voice input. 
Be accurate with name matching. 
If unsure about a name, don't include it.
Consider common Zambian names and pronunciation variations.`,
    temperature: 0.1, // Very low for accuracy
  });

  // 4. Match parsed names to student IDs
  const matchStudent = (name: string) => {
    const normalized = name.toLowerCase().trim();
    
    // Try exact match first
    let match = students.find(s => 
      `${s.firstName} ${s.lastName}`.toLowerCase() === normalized
    );
    
    // Try first name match
    if (!match) {
      match = students.find(s => 
        s.firstName.toLowerCase() === normalized ||
        s.lastName.toLowerCase() === normalized
      );
    }
    
    // Try partial match
    if (!match) {
      match = students.find(s => 
        `${s.firstName} ${s.lastName}`.toLowerCase().includes(normalized) ||
        normalized.includes(s.firstName.toLowerCase()) ||
        normalized.includes(s.lastName.toLowerCase())
      );
    }
    
    return match;
  };

  const result: VoiceAttendanceResult = {
    present: [],
    absent: [],
    late: [],
    unmatched: [],
    totalProcessed: 0,
    confidence: parsed.confidence || 0.8,
  };

  // 5. Process present students
  for (const name of parsed.present || []) {
    const student = matchStudent(name);
    if (student) {
      await prisma.attendance.upsert({
        where: {
          studentId_date: { studentId: student.id, date },
        },
        create: {
          studentId: student.id,
          classId,
          date,
          status: 'PRESENT',
          markedBy: 'voice-ai',
        },
        update: { 
          status: 'PRESENT',
          markedBy: 'voice-ai',
        },
      });
      result.present.push(`${student.firstName} ${student.lastName}`);
      result.totalProcessed++;
    } else {
      result.unmatched.push(name);
    }
  }

  // 6. Process absent students
  for (const name of parsed.absent || []) {
    const student = matchStudent(name);
    if (student) {
      await prisma.attendance.upsert({
        where: {
          studentId_date: { studentId: student.id, date },
        },
        create: {
          studentId: student.id,
          classId,
          date,
          status: 'ABSENT',
          markedBy: 'voice-ai',
        },
        update: { 
          status: 'ABSENT',
          markedBy: 'voice-ai',
        },
      });
      result.absent.push(`${student.firstName} ${student.lastName}`);
      result.totalProcessed++;
    } else {
      result.unmatched.push(name);
    }
  }

  // 7. Process late students
  for (const name of parsed.late || []) {
    const student = matchStudent(name);
    if (student) {
      await prisma.attendance.upsert({
        where: {
          studentId_date: { studentId: student.id, date },
        },
        create: {
          studentId: student.id,
          classId,
          date,
          status: 'LATE',
          markedBy: 'voice-ai',
        },
        update: { 
          status: 'LATE',
          markedBy: 'voice-ai',
        },
      });
      result.late.push(`${student.firstName} ${student.lastName}`);
      result.totalProcessed++;
    } else {
      result.unmatched.push(name);
    }
  }

  return result;
}

/**
 * Process text-based attendance command (for Master AI integration)
 */
export async function processTextAttendance(
  classId: string,
  textInput: string,
  date: Date
): Promise<VoiceAttendanceResult> {
  // Get class roster
  const classInfo = await prisma.class.findUnique({
    where: { id: classId },
    include: {
      students: {
        where: { status: 'ACTIVE' },
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
        orderBy: { lastName: 'asc' },
      },
    },
  });

  if (!classInfo) {
    throw new Error('Class not found');
  }

  const students = classInfo.students;

  // Parse using AI
  const prompt = `Parse attendance from this text command.

COMMAND: "${textInput}"

CLASS ROSTER:
${students.map((s, i) => `${i + 1}. ${s.firstName} ${s.lastName}`).join('\n')}

Extract present, absent, and late students. Match names to the roster.

Return JSON:
{
  "present": ["Full Name 1"],
  "absent": ["Full Name 2"],
  "late": ["Full Name 3"],
  "confidence": 0.95
}`;

  const parsed = await aiService.generateJSON<{
    present: string[];
    absent: string[];
    late: string[];
    confidence: number;
  }>(prompt, {
    systemPrompt: 'Parse attendance accurately. Match names to roster.',
    temperature: 0.1,
  });

  // Process similar to voice attendance
  const matchStudent = (name: string) => {
    const normalized = name.toLowerCase().trim();
    return students.find(s => 
      `${s.firstName} ${s.lastName}`.toLowerCase().includes(normalized) ||
      normalized.includes(s.firstName.toLowerCase())
    );
  };

  const result: VoiceAttendanceResult = {
    present: [],
    absent: [],
    late: [],
    unmatched: [],
    totalProcessed: 0,
    confidence: parsed.confidence || 0.8,
  };

  // Process each category
  for (const name of parsed.present || []) {
    const student = matchStudent(name);
    if (student) {
      await prisma.attendance.upsert({
        where: {
          studentId_date: { studentId: student.id, date },
        },
        create: {
          studentId: student.id,
          classId,
          date,
          status: 'PRESENT',
          markedBy: 'text-ai',
        },
        update: { status: 'PRESENT', markedBy: 'text-ai' },
      });
      result.present.push(`${student.firstName} ${student.lastName}`);
      result.totalProcessed++;
    } else {
      result.unmatched.push(name);
    }
  }

  for (const name of parsed.absent || []) {
    const student = matchStudent(name);
    if (student) {
      await prisma.attendance.upsert({
        where: {
          studentId_date: { studentId: student.id, date },
        },
        create: {
          studentId: student.id,
          classId,
          date,
          status: 'ABSENT',
          markedBy: 'text-ai',
        },
        update: { status: 'ABSENT', markedBy: 'text-ai' },
      });
      result.absent.push(`${student.firstName} ${student.lastName}`);
      result.totalProcessed++;
    } else {
      result.unmatched.push(name);
    }
  }

  for (const name of parsed.late || []) {
    const student = matchStudent(name);
    if (student) {
      await prisma.attendance.upsert({
        where: {
          studentId_date: { studentId: student.id, date },
        },
        create: {
          studentId: student.id,
          classId,
          date,
          status: 'LATE',
          markedBy: 'text-ai',
        },
        update: { status: 'LATE', markedBy: 'text-ai' },
      });
      result.late.push(`${student.firstName} ${student.lastName}`);
      result.totalProcessed++;
    } else {
      result.unmatched.push(name);
    }
  }

  return result;
}

export default {
  processVoiceAttendance,
  processTextAttendance,
};
