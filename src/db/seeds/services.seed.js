import prisma from '../../shared/db.js';

export async function seedServices() {
  const director = await prisma.user.findUnique({ where: { email: 'director@rehearsify.test' } });
  const eventType = await prisma.eventType.findFirst();

  if (!director || !eventType) {
    throw new Error('seedServices requires users and eventTypes to be seeded first');
  }

  const existing = await prisma.service.findFirst({ where: { createdById: director.id } });
  if (existing) return;

  const dates = [
    { daysAgo: 120, season: 'ORDINARY' },
    { daysAgo: 45, season: 'ORDINARY' },
    { daysAgo: 10, season: 'ORDINARY' },
  ];

  for (const { daysAgo, season } of dates) {
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);

    await prisma.service.create({
      data: {
        eventTypeId: eventType.id,
        date,
        season,
        status: 'CONFIRMED',
        createdById: director.id,
      },
    });
  }
}