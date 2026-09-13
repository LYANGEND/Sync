// Academics is the single sidebar entry for these modules. Backend permissions
// continue to control the records and actions each role may access.
export const ACADEMICS_ROLES = ['SUPER_ADMIN', 'TEACHER', 'BURSAR', 'SECRETARY', 'PARENT', 'BRANCH_MANAGER'];

export const ACADEMIC_TABS = [
  { id: 'gradebook', label: 'Gradebook', roles: ['SUPER_ADMIN', 'TEACHER', 'BURSAR', 'SECRETARY'] },
  { id: 'reports', label: 'Report Cards', roles: ['SUPER_ADMIN', 'TEACHER', 'SECRETARY'] },
  { id: 'attendance', label: 'Attendance', roles: ['SUPER_ADMIN', 'TEACHER', 'SECRETARY'] },
  { id: 'timetable', label: 'Timetable', roles: ['SUPER_ADMIN', 'TEACHER', 'BURSAR', 'SECRETARY', 'PARENT'] },
  { id: 'calendar', label: 'Calendar', roles: ['SUPER_ADMIN', 'TEACHER', 'BURSAR', 'SECRETARY', 'PARENT', 'BRANCH_MANAGER'] },
  { id: 'classes', label: 'Classes', roles: ['SUPER_ADMIN', 'SECRETARY'] },
  { id: 'subjects', label: 'Subjects', roles: ['SUPER_ADMIN'] },
  { id: 'allocation', label: 'Allocation', roles: ['SUPER_ADMIN'] },
  { id: 'grading', label: 'Grading Scales', roles: ['SUPER_ADMIN'] },
  { id: 'terms', label: 'Terms', roles: ['SUPER_ADMIN'] },
  { id: 'promotions', label: 'Promotions', roles: ['SUPER_ADMIN'] },
];

export const academicTabsForRole = (role: string) => ACADEMIC_TABS.filter(tab => tab.roles.includes(role));
