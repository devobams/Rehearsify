// Weekly song planning job — the "business logic heartbeat" of Rehearsify.
//
// One atomic pass through the entire Planning → Recommendation → Scheduling
// → Email workflow:
//
//   CALL 1: fetch every active (DRAFT, not deleted) service inside the
//           lookahead window.
//   CALL 2: for each service, generate recommendations and lock them into a
//           planning draft (created once, updated on re-runs).
//   CALL 3: for each service, transition scheduling (DRAFT → CONFIRMED),
//           record performance history, and send the confirmation email.
//
// Every dependency is injectable so the job can be unit-tested and dry-run
// safety can be verified without touching the database or SMTP.

import config from '../config/index.js';
import * as schedulingService from '../modules/scheduling/scheduling.service.js';
import * as recommendationService from '../modules/recommendation/recommendation.service.js';
import * as planningService from '../modules/planning-reporting/planning.service.js';
import { logJobRun } from './jobRun.model.js';

export const JOB_NAME = 'weeklySongPlanning';

function nowIso() {
  return new Date().toISOString();
}

/**
 * @param {object} [options]
 * @param {boolean} [options.dryRun=false]  Log what would happen, write nothing.
 * @param {number}  [options.lookaheadDays] Services within this many days.
 * @param {Function}[options.fetcher]       (days) => Promise<Service[]>
 * @param {Function}[options.recommendationFetcher] (serviceId) => Promise<{recommendations: Array<{id: string}>}>
 * @param {Function}[options.draftUpserter] ({serviceId, songIds}) => Promise<Draft>
 * @param {Function}[options.confirmer]     (draftId, options) => Promise<{emailSent: boolean}>
 * @param {Function}[options.jobLogger]     (input) => Promise<JobRun>
 */
export async function weeklySongPlanningJob(options = {}) {
  const {
    dryRun = false,
    lookaheadDays = config.job.lookaheadDays,
    fetcher = schedulingService.getDraftServicesWithinDays,
    recommendationFetcher = recommendationService.getRecommendationsForService,
    draftUpserter = planningService.upsertDraftFromRecommendation,
    confirmer = planningService.confirmDraft,
    jobLogger = logJobRun,
  } = options;

  const startedAt = new Date();
  const logs = [];
  const servicesReport = [];
  let servicesProcessed = 0;
  let servicesSkipped = 0;
  let servicesFailed = 0;

  const tag = dryRun ? `[${JOB_NAME}][DRY-RUN]` : `[${JOB_NAME}]`;
  const push = (line) => {
    logs.push(line);
    console.log(line);
  };

  try {
    // CALL 1: fetch active services for the week
    const services = await fetcher(lookaheadDays);
    push(`${tag} ${nowIso()} Found ${services.length} service(s) needing planning`);

    for (const service of services) {
      const serviceName = service.eventType?.name ?? service.id;
      const entry = {
        serviceId: service.id,
        serviceName,
        serviceDate: service.date,
        status: 'processed',
      };

      try {
        // CALL 2: generate recommendations and lock the planning draft
        const recommendation = await recommendationFetcher(service.id);
        const songIds = (recommendation.recommendations ?? []).map((s) => s.id);

        if (songIds.length === 0) {
          servicesSkipped += 1;
          entry.status = 'skipped';
          entry.reason = 'no eligible songs to recommend';
          push(`${tag}   Skipped ${serviceName}: no eligible songs to recommend`);
          continue;
        }

        if (dryRun) {
          entry.songCount = songIds.length;
          push(`${tag}   Would lock draft for ${serviceName} with ${songIds.length} song(s)`);
          push(`${tag}   Would confirm ${serviceName} and email the director`);
          servicesProcessed += 1;
          continue;
        }

        const draft = await draftUpserter({ serviceId: service.id, songIds });
        entry.draftId = draft.id;
        entry.songCount = songIds.length;
        push(`${tag}   Locked draft ${draft.id} for ${serviceName} (${songIds.length} song(s))`);

        // CALL 3: transition scheduling and send the confirmation email
        const result = await confirmer(draft.id, { recommendationFetcher });
        entry.emailSent = result.emailSent;
        entry.emailError = result.emailError ?? null;

        if (result.emailSent) {
          entry.confirmed = true;
          push(`${tag}   Confirmed ${serviceName} (status -> CONFIRMED, email sent)`);
          servicesProcessed += 1;
        } else {
          servicesFailed += 1;
          entry.status = 'failed';
          entry.error = result.emailError ?? 'confirmation email failed';
          push(
            `${tag}   FAILED ${serviceName}: confirmation email not sent (${result.emailError ?? 'unknown error'})`,
          );
        }
      } catch (err) {
        servicesFailed += 1;
        entry.status = 'failed';
        entry.error = err.message;
        push(`${tag}   FAILED ${serviceName}: ${err.message}`);
      } finally {
        servicesReport.push(entry);
      }
    }

    const success = servicesFailed === 0;
    const status = success ? 'success' : 'partial';
    push(`${tag} Done: ${servicesProcessed} processed, ${servicesSkipped} skipped, ${servicesFailed} failed`);

    if (!dryRun) {
      await jobLogger({
        jobName: JOB_NAME,
        status,
        servicesProcessed,
        servicesSkipped,
        servicesFailed,
        dryRun,
        startedAt,
        logs,
      });
    }

    return {
      job: JOB_NAME,
      success,
      status,
      dryRun,
      lookaheadDays,
      servicesProcessed,
      servicesSkipped,
      servicesFailed,
      services: servicesReport,
      logs,
    };
  } catch (err) {
    push(`${tag} ERROR: ${err.message}`);
    if (!dryRun) {
      await jobLogger({
        jobName: JOB_NAME,
        status: 'failure',
        error: err.message,
        servicesProcessed,
        servicesSkipped,
        servicesFailed,
        dryRun,
        startedAt,
        logs,
      });
    }
    throw err;
  }
}
