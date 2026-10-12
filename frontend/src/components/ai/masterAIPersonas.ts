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
  { icon: GraduationCap, label: 'At-Risk Learners', command: 'Which learners are at high risk of falling behind this term?' },
  { icon: CheckCircle2, label: 'Term Rollover', command: 'Is the term rollover ready? What is blocking it?' },
];

export const bursarQuickCommands: QuickCommand[] = [
  { icon: CreditCard, label: 'Fee Balances', command: 'Show learners with outstanding fee balances this term' },
  { icon: BarChart3, label: 'Payments This Week', command: 'How much have we collected this week, by payment method?' },
  { icon: Bell, label: 'Remind Debtors', command: 'Send SMS fee reminders to parents who are more than [30] days overdue' },
  { icon: Pencil, label: 'Invoice Summary', command: 'Give me a summary of invoices this term, including overdue ones' },
  { icon: GraduationCap, label: 'Learner Payments', command: 'Show the payment history for [learner name]' },
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
    { icon: CheckCircle2, label: 'Mark Attendance', command: `Mark attendance for ${where} today. Absent: [names]. Late: [names]` },
    { icon: Pencil, label: 'Enter Marks', command: `Enter marks for [assessment] in ${where}: [name] [score], [name] [score]` },
    { icon: BookOpen, label: 'Missing Homework', command: `Who hasn't handed in the latest homework in ${where}?` },
    { icon: BarChart3, label: 'At-Risk Learners', command: `Which learners in ${where} are at risk of falling behind?` },
    { icon: BookOpen, label: 'Lesson Plans', command: `Generate lesson plans for ${subject}${where} for the next topics not covered yet` },
    { icon: BarChart3, label: 'Class Insights', command: `How is ${where} doing? Who needs extra support?` },
    { icon: CheckCircle2, label: 'Create a Quiz', command: `Create a 10-question quiz with an answer key for ${subject}${where} on the current topic` },
    { icon: Pencil, label: 'Homework', command: `Generate homework for ${subject}${where} on the current topic` },
    { icon: MessageSquare, label: 'Report Remarks', command: `Help me write report card remarks for [learner name] in ${where}` },
    { icon: Sparkles, label: 'Teaching Ideas', command: `Give me practical, low-resource activities to teach [topic] to ${where}` },
    { icon: Calendar, label: 'Upcoming Events', command: 'What events are on the school calendar this month?' },
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
    'Mark attendance, enter marks and find learners at risk',
    'Send fee reminders and check term rollover readiness',
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
    'Mark the register and enter marks by typing or speaking names',
    'See who has not handed in homework and which learners are at risk',
    'Generate and save lesson plans, assessments and homework for your classes',
    'Show attendance, subject averages and learners who need support',
    'Draft and save report card remarks for a learner',
    'Explain concepts, plan lessons, and write questions with answer keys',
    'Analyse a photo of learners\u2019 work or a textbook page',
    'Check the school calendar and syllabus topics',
  ],
  footer: () => 'Master AI can look at images and listen to your voice. Attendance and marks are only saved after you confirm them.',
};

export const bursarPersona: Persona = {
  title: 'Master AI',
  subtitle: () => 'Your finance assistant',
  badge: school => `${school} Finance Assistant`,
  heading: () => 'What do you need on fees today?',
  intro: 'Ask in plain English about payments, balances and invoices.',
  capabilitiesTitle: () => 'What I can do for you',
  capabilities: [
    'Show fee balances by class or learner',
    'Search payments and summarise collections by day, week or month',
    'Look up a learner\u2019s payment history',
    'Summarise invoices, including overdue ones',
    'Send fee reminders to parents who owe',
  ],
  footer: () => 'Fee reminders are only sent after you confirm who will receive them.',
};
