import { PrismaClient } from '@prisma/client';

// Singleton PrismaClient to prevent connection pool exhaustion
// Each PrismaClient instance opens ~5 connections by default.
// Previously, every controller/service created its own instance,
// resulting in 200+ connections and crashing PostgreSQL.

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export default prisma;
