// Only file in scheduling allowed to import prisma directly.
// Follow the pattern in auth.model.js.

import prisma from '../../shared/db.js';

// --- EventType queries ---

export async function findEventTypeById(id) {
  return prisma.eventType.findUnique({ where: { id } });
}

export async function findEventTypeByName(name) {
  return prisma.eventType.findUnique({ where: { name } });
}

export async function listEventTypes() {
  return prisma.eventType.findMany({ orderBy: { name: 'asc' } });
}

// --- Service queries ---

export async function createService(data) {
  return prisma.service.create({ data });
}

export async function findServiceById(id, { includePerformances = false } = {}) {
  const include = {
    eventType: true,
    createdBy: {
      select: {
        id: true,
        name: true,
      },
    },
    ...(includePerformances && {
      performances: {
        select: {
          songId: true,
        },
      },
    }),
  };

  return prisma.service.findUnique({
    where: { id },
    include,
  });
}

export async function listServices(filters = {}) {
  const where = { ...filters, deletedAt: null };
  return prisma.service.findMany({
    where,
    include: { eventType: true },
    orderBy: { date: 'asc' },
  });
}

export async function updateService(id, data) {
  return prisma.service.update({ where: { id }, data });
}

export async function softDeleteService(id) {
  return prisma.service.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}

export async function findDraftServicesWithinDays(days) {
  const now = new Date();
  const future = new Date();
  future.setDate(now.getDate() + days);

  return prisma.service.findMany({
    where: {
      status: 'DRAFT',
      deletedAt: null,
      date: { gte: now, lte: future },
    },
    include: { eventType: true },
    orderBy: { date: 'asc' },
  });
}
