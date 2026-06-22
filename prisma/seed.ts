/**
 * Database seed script.
 *
 * Run with: `npm run db:seed`
 *
 * NOTE: There are no domain models yet (added in task 2.1), so this seed is a
 * placeholder that establishes the script + npm wiring for later tasks.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seed: no domain models yet — nothing to seed. (Placeholder for task 2.1+)');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
