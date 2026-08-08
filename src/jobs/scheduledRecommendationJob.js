import config from '../config/index.js';
// Thin wrapper — three function calls in sequence, per the Build Guide's
// walkthrough. Built LAST (Block D), since it depends on Scheduling,
// Recommendation, and shared/email all being done first.

import cron from 'node-cron';
// import { getDraftServicesWithinDays } from '../modules/scheduling/scheduling.service.js';
// import { getRecommendationsForService } from '../modules/recommendation/recommendation.service.js';
// import { sendDraftPreview } from '../shared/email/mailer.js';

const LOOKAHEAD_DAYS = config.job.lookaheadDays;

// TODO: call getDraftServicesWithinDays(LOOKAHEAD_DAYS)

// Use '* * * * *' (every minute) while developing, switch to daily before demo
cron.schedule('0 6 * * *', async () => {
  console.log(`[${new Date().toISOString()}] Scheduled recommendation job running`);
  // TODO: implement per Build Guide's concrete walkthrough
});