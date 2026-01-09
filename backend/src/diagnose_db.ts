
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('Testing DB Connection...');
    try {
        const count = await prisma.user.count();
        console.log(`User Count: ${count}`);

        console.log('Testing Classes...');
        const classes = await prisma.class.findMany({ take: 1 });
        console.log('Classes fetch success:', classes);

        console.log('Testing Subjects...');
        const subjects = await prisma.subject.findMany({ take: 1 });
        console.log('Subjects fetch success:', subjects);

        console.log('Testing Payments...');
        const payments = await prisma.payment.findMany({ take: 1 });
        console.log('Payments fetch success:', payments);

    } catch (e: any) {
        console.error('ERROR OCCURRED:');
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
