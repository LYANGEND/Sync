import {
  Sparkles, Calendar, BookOpen, GraduationCap, CreditCard, Bell, BarChart3,
  CheckCircle2, Pencil, MessageSquare,
} from 'lucide-react';

const year = new Date().getFullYear();

export type QuickCommand = { icon: typeof Calendar; label: string; command: string };

// Starters are placed in the input for review; [bracketed] parts are selected so they can be typed over.
export const adminQuickCommands: QuickCommand[] = [
  { icon: Calendar, label: 'Add Zambian Holidays', command: `Add all public holidays for Zambia for ${year} to the academic calendar` },
  { icon: Calendar, label: 'Add Zimbabwe Holidays', command: `Add all public holidays for Zimbabwe for ${year} to the academic calendar` },
  { icon: Calendar, label: 'Add SA Holidays', command: `Add all public holidays for South Africa for ${year} to the academic calendar` },
  { icon: BookOpen, label: 'Create Subjects', command: 'Create standard primary school subjects: Mathematics, English, Science, Social Studies, Physical Education, Art, Music, Computer Studies' },
  { icon: GraduationCap, label: 'Setup Classes', command: 'Create classes for a primary school from Grade 1 to Grade 7 with capacity [40] each' },
  { icon: CreditCard, label: 'Setup Fee Structure', command: 'Create fee templates: Tuition Fee ([amount] per term), Transport Fee ([amount] per month)' },
  { icon: BarChart3, label: 'School Statistics', command: 'Show me the current school statistics - how many students, teachers, classes, etc.' },
  { icon: Bell, label: 'Create Announcement', command: 'Create a high priority announcement for all teachers and parents: "[message]"' },
];

/** A class from GET /classes; for teachers, subjects are limited to the ones they teach there. */
export interface TeacherClass {
  id: string;
  name: string;
  subjects: { name: string }[];
}

// One subject is named directly; several become a [placeholder] listing the options.
const subjectSlot = (cls: TeacherClass) =>
  cls.subjects.length === 1 ? cls.subjects[0].name : `[${cls.subjects.map(s => s.name).join(' / ') || 'subject'}]`;

export const teacherQuickCommands = (cls?: TeacherClass): QuickCommand[] => {
  const where = cls ? cls.name : 'my class';
  const subject = cls ? `${subjectSlot(cls)} in ` : '';
  return [
    { icon: BookOpen, label: 'Lesson Plans', command: `Generate lesson plans for ${subject}${where} for the next topics not covered yet` },
    { icon: BarChart3, label: 'Class Insights', command: `How is ${where} doing? Who needs extra support?` },
    { icon: CheckCircle2, label: 'Create a Quiz', command: `Create a 10-question quiz with an answer key for ${subject}${where} on the current topic` },
    { icon: Pencil, label: 'Homework', command: `Generate homework for ${subject}${where} on the current topic` },
    { icon: MessageSquare, label: 'Report Remarks', command: `Help me write report card remarks for [learner name] in ${where}` },
    { icon: Sparkles, label: 'Teaching Ideas', command: `Give me practical, low-resource activities to teach [topic] to ${where}` },
    { icon: Calendar, label: 'Upcoming Events', command: 'What events are on the school calendar this month?' },
    { icon: GraduationCap, label: 'My Lesson Plans', command: 'List my recent lesson plans' },
  ];
};

export interface Persona {
  title: string;
  subtitle: (school: string) => string;
  badge: (school: string) => string;
  heading: (school: string) => string;
  intro: string;
  capabilitiesTitle: (school: string) => string;
  capabilities: string[];
  footer: (school: string) => string;
}

export const adminPersona: Persona = {
  title: 'Master AI',
  subtitle: school => `Natural language control for ${school}`,
  badge: school => `${school} AI Command Center`,
  heading: school => `What would you like me to do for ${school}?`,
  intro: 'Tell me in plain English and I\u2019ll execute it across calendar, students, classes, fees, communication, and more.',
  capabilitiesTitle: school => `What can I help ${school} with?`,
  capabilities: [
    'Add public holidays by country to the academic calendar',
    'Create classes, subjects, and fee structures',
    'Search for students, teachers, and users',
    'Create announcements and send notifications',
    'Set up academic terms and assessment schedules',
    'Record expenses and manage scholarships',
    'View school statistics and analytics',
  ],
  footer: school => `Master AI can look at images, listen to your voice, and manage operations across ${school}. Deleting data and sending messages always ask for your confirmation first.`,
};

export const teacherPersona: Persona = {
  title: 'Master AI',
  subtitle: () => 'Your teaching assistant',
  badge: school => `${school} Teaching Assistant`,
  heading: () => 'How can I help with your teaching today?',
  intro: 'Ask in plain English. I know your classes and subjects for this term.',
  capabilitiesTitle: () => 'What I can do for you',
  capabilities: [
    'Generate and save lesson plans, assessments and homework for your classes',
    'Show attendance, subject averages and learners who need support',
    'Draft report card remarks for a learner',
    'Explain concepts, plan lessons, and write questions with answer keys',
    'Analyse a photo of learners\u2019 work or a textbook page',
    'Check the school calendar and syllabus topics',
  ],
  footer: () => 'Master AI can look at images and listen to your voice. Lesson plans, assessments and homework it generates are saved to your classes.',
};
