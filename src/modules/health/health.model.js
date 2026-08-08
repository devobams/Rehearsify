import prisma from '../../shared/db.js';

export async function checkDatabase() {
  return prisma.$queryRaw`SELECT 1`;
}
