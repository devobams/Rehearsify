// Audit trail for scheduled jobs. The only job-layer file allowed to touch
// prisma directly — every write goes through logJobRun().

import prisma from '../shared/db.js';

export async function logJobRun(input) {
  return prisma.jobRun.create({
    data: {
      jobName: input.jobName,
      status: input.status,
      servicesProcessed: input.servicesProcessed ?? 0,
      servicesSkipped: input.servicesSkipped ?? 0,
      servicesFailed: input.servicesFailed ?? 0,
      dryRun: input.dryRun ?? false,
      error: input.error ?? null,
      logs: input.logs ?? [],
      startedAt: input.startedAt ?? new Date(),
      completedAt: new Date(),
    },
  });
}

export function findJobRunById(id) {
  return prisma.jobRun.findUnique({ where: { id } });
}

export function listJobRuns({ jobName, limit = 20 } = {}) {
  return prisma.jobRun.findMany({
    where: jobName ? { jobName } : undefined,
    orderBy: { startedAt: 'desc' },
    take: limit,
  });
}
