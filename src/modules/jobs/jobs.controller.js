import { weeklySongPlanningJob } from '../../jobs/weeklySongPlanning.js';

export async function runJobHandler(req, res, next) {
  try {
    const { job, dryRun, lookaheadDays } = req.query;

    let result;
    switch (job) {
      case 'weeklySongPlanning':
        result = await weeklySongPlanningJob({ dryRun, lookaheadDays });
        break;
      default:
        // Unreachable while the query schema only admits known jobs, but kept
        // as a safety net for future jobs added to the enum.
        return res.status(400).json({ error: { message: `Unknown job: ${job}` } });
    }

    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}
