import { PrismaClient } from '@prisma/client';

const testPrisma = new PrismaClient();

export async function clearDatabase() {
  await testPrisma.project.deleteMany();
  await testPrisma.owner.deleteMany();
}
