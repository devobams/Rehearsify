import prisma from '../../shared/db.js';

export async function seedPerformances() {
  const services = await prisma.service.findMany({ orderBy: { date: 'asc' } });
  const songs = await prisma.song.findMany({ where: { active: true }, take: 10 });

  if (services.length === 0 || songs.length === 0) {
    throw new Error('seedPerformances requires services and songs to be seeded first');
  }

  const existing = await prisma.performance.findFirst();
  if (existing) return;

  // Oldest service gets the first 3 songs performed (so they're "stale" now)
  // Most recent service gets a different set (so those are "fresh")
  const [oldest, , newest] = services;

  await prisma.performance.createMany({
    data: [
      ...songs.slice(0, 3).map((s) => ({ songId: s.id, serviceId: oldest.id, performedDate: oldest.date })),
      ...songs.slice(3, 6).map((s) => ({ songId: s.id, serviceId: newest.id, performedDate: newest.date })),
    ],
  });
}