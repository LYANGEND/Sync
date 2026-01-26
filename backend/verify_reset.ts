
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const branches = await prisma.branch.findMany();
    console.log('Branches:', branches);

    const users = await prisma.user.findMany({ select: { email: true, branchId: true } });
    console.log('Users:', users);

    const payments = await prisma.payment.findMany({ take: 1, select: { id: true, branchId: true } });
    console.log('Sample Payment:', payments);
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
