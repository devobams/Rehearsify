// Only file allowed to import prisma directly for the Performance table.

import prisma from '../../shared/db.js';

export async function createManyPerformances(data, tx = prisma) {
  return tx.performance.createMany({
    data,
  });
}

export async function findPerformancesBySongIds(songIds) {
  return prisma.performance.findMany({
    where: {
      songId: {
        in: songIds,
      },
    },
    orderBy: {
      performedDate: 'desc',
    },
  });
}

export async function countPerformances(songIds) {
  return prisma.performance.groupBy({
    by: ['songId'],
    where: {
      songId: {
        in: songIds,
      },
    },
    _count: {
      songId: true,
    },
  });
}

