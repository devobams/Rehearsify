import * as service from './performance.service.js';

export async function getLastPerformedHandler(req, res, next) {
  try {
    const result = await service.getLastPerformedMap(req.query.songIds);

    res.status(200).json({
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

export async function getPerformanceCountsHandler(req, res, next) {
  try {
    const result = await service.getPerformanceCounts(req.query.songIds);

    res.status(200).json({
      data: result,
    });
  } catch (err) {
    next(err);
  }
}
