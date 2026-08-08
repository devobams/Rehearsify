import * as reportingService from './reporting.service.js';

export async function staleSongsHandler(req, res, next) {
  try {
    const { days } = req.query;
    const report = await reportingService.getStaleSongsReport(days);
    res.status(200).json({ data: report });
  } catch (err) {
    next(err);
  }
}

export async function performanceFrequencyHandler(req, res, next) {
  try {
    const report = await reportingService.getPerformanceFrequencyReport();
    res.status(200).json({ data: report });
  } catch (err) {
    next(err);
  }
}