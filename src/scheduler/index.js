// Scheduler integration. Registers the weekly song planning job with
// node-cron and exposes start/stop/task-inspection helpers so tests (and the
// manual-trigger endpoint) can drive it without waiting for a real tick.
//
// Per the Build Guide's "3-call pattern", this is deliberately thin — the job
// itself lives in src/jobs/weeklySongPlanning.js.

import cron from 'node-cron';
import config from '../config/index.js';
import { weeklySongPlanningJob } from '../jobs/weeklySongPlanning.js';

export const JOB_NAME = 'weeklySongPlanning';
export const DEFAULT_SCHEDULE = config.job.cronSchedule;

const registeredTasks = new Map();

/**
 * Registers (and starts) the weekly planning job on the given cron schedule.
 * Re-invoking replaces any previously registered task for the same name.
 *
 * @param {object} [options]
 * @param {string} [options.schedule]  Cron expression. Defaults to config.job.cronSchedule.
 * @param {Function}[options.job]      Job function to invoke (defaults to weeklySongPlanningJob).
 * @param {string}  [options.name]     Task name used for lookup/stopping.
 */
export function startScheduler({ schedule = DEFAULT_SCHEDULE, job = weeklySongPlanningJob, name = JOB_NAME } = {}) {
  if (registeredTasks.has(name)) {
    registeredTasks.get(name).destroy();
    registeredTasks.delete(name);
  }

  const task = cron.schedule(
    schedule,
    async () => {
      console.log(`[scheduler] Running ${name} at ${new Date().toISOString()}`);
      try {
        const result = await job();
        console.log(
          `[scheduler] ${name} finished: ` +
            `success=${result?.success} processed=${result?.servicesProcessed} skipped=${result?.servicesSkipped} failed=${result?.servicesFailed}`,
        );
      } catch (err) {
        console.error(`[scheduler] ${name} failed:`, err.message);
      }
    },
    { name, noOverlap: true },
  );

  registeredTasks.set(name, task);
  return { name, schedule, task };
}

/** Stops every task this scheduler registered. */
export function stopScheduler() {
  for (const task of registeredTasks.values()) {
    task.destroy();
  }
  registeredTasks.clear();
}

/** Names of the tasks currently registered with this scheduler. */
export function getScheduledTasks() {
  return Array.from(registeredTasks.keys());
}
