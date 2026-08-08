// Business logic and public API for performance-history.
// Other modules call functions exported from HERE, never from performance.model.js.

import * as model from './performance.model.js';

export async function logPerformances(serviceId, songIds, tx) {
  const performedDate = new Date();
  return model.createManyPerformances(
    songIds.map((songId) => ({ serviceId, songId, performedDate })),
    tx,
  );
}

export async function getLastPerformedMap(songIds) {
  const performances = await model.findPerformancesBySongIds(songIds);

  // Initialize every requested song to null
  const result = {};

  for (const songId of songIds) {
    result[songId] = null;
  }

  // Since performances are ordered by performedDate DESC,
  // the first occurrence is the latest.
  for (const performance of performances) {
    if (result[performance.songId] === null) {
      result[performance.songId] = performance.performedDate;
    }
  }

  return result;
}

export async function getPerformanceCounts(songIds) {
  const counts = await model.countPerformances(songIds);

  // Initialize every requested song to 0
  const result = {};

  for (const songId of songIds) {
    result[songId] = 0;
  }

  // Fill in actual counts
  for (const item of counts) {
    result[item.songId] = item._count.songId;
  }

  return result;
}