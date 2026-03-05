import { prisma } from './utils/prisma';
async function main() {
  try {
    console.log('Fetching students...');
    const students = await prisma.student.findMany({
      take: 5,
      include: { class: true }
    });
    console.log('Successfully fetched students:', students.length);
    console.log(students);
  } catch (error) {
    console.error('Error fetching students:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
