import * as repertoireService from '../repertoire/repertoire.service.js';
import * as performanceService from '../performance-history/performance.service.js';

export async function getStaleSongsReport(days = 90) {
  const songs = await repertoireService.listSongs({}); // active songs only, by default

  // Guard: no active songs means an empty report, not an error.
  if (songs.length === 0) return [];

  const songIds = songs.map((s) => s.id);
  const lastPerformedMap = await performanceService.getLastPerformedMap(songIds);

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  return songs
    .filter((song) => {
      const last = lastPerformedMap[song.id];
      return !last || new Date(last) < cutoff;
    })
    .map((song) => ({ ...song, lastPerformed: lastPerformedMap[song.id] ?? null }));
}

export async function getPerformanceFrequencyReport() {
  const songs = await repertoireService.listSongs({});

  if (songs.length === 0) return [];

  const songIds = songs.map((s) => s.id);
  const counts = await performanceService.getPerformanceCounts(songIds);

  return songs
    .map((song) => ({ ...song, performanceCount: counts[song.id] ?? 0 }))
    .sort((a, b) => b.performanceCount - a.performanceCount);
}