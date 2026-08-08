import prisma from '../../shared/db.js';
import { hashPassword } from '../../shared/utils/password.js';

export async function seedUsers() {
  const existing = await prisma.user.findUnique({ where: { email: 'director@rehearsify.test' } });
  if (existing) return;

  const passwordHash = await hashPassword('SeedPassword123');
  await prisma.user.create({
    data: {
      name: 'Seed Director',
      email: 'director@rehearsify.test',
      passwordHash,
      role: 'CHOIR_DIRECTOR',
    },
  });
}