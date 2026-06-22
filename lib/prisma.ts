/**
 * Shared Prisma client instance.
 *
 * In development Next.js hot-reloads modules, which can exhaust the database
 * connection pool by creating many clients. We cache a single instance on the
 * global object to avoid that.
 */
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
