import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  daysSince,
  isInsideRotationWindow,
  getSeasonScore,
  getDifficultyScore,
  getNeverPerformedScore,
  getPerformanceCountScore,
  calculateScore,
  compareRecommendations,
} from '../../src/modules/recommendation/recommendation.service.js';

const DAY = 86400000;

describe('recommendation scoring helpers', () => {
  describe('daysSince', () => {
    it('returns Infinity for never-performed songs', () => {
      assert.equal(daysSince(null), Infinity);
      assert.equal(daysSince(undefined), Infinity);
    });

    it('returns the number of days since the last performance', () => {
      const days = daysSince(new Date(Date.now() - 10 * DAY));
      assert.equal(days, 10);
    });

    it('returns a negative value for future dates', () => {
      const days = daysSince(new Date(Date.now() + 1 * DAY));
      assert.equal(days, -1);
    });
  });

  describe('isInsideRotationWindow', () => {
    it('never-performed songs are always eligible', () => {
      assert.equal(isInsideRotationWindow(null), false);
    });

    it('returns true within the rotation window', () => {
      assert.equal(isInsideRotationWindow(new Date(Date.now() - 1 * DAY)), true);
    });

    it('returns false outside the rotation window', () => {
      assert.equal(isInsideRotationWindow(new Date(Date.now() - 100 * DAY)), false);
    });

    it('returns false exactly at the window boundary', () => {
      assert.equal(isInsideRotationWindow(new Date(Date.now() - 42 * DAY)), false);
    });
  });

  describe('getSeasonScore', () => {
    it('scores a matching season', () => {
      assert.equal(getSeasonScore('ORDINARY', 'ORDINARY'), 20);
    });

    it('scores zero for a mismatched season', () => {
      assert.equal(getSeasonScore('ADVENT', 'ORDINARY'), 0);
    });
  });

  describe('getDifficultyScore', () => {
    it('scores max when difficulty matches choir skill', () => {
      assert.equal(getDifficultyScore(3), 30);
    });

    it('scores less for each step of difference', () => {
      assert.equal(getDifficultyScore(2), 20);
      assert.equal(getDifficultyScore(1), 10);
      assert.equal(getDifficultyScore(4), 20);
      assert.equal(getDifficultyScore(5), 10);
    });
  });

  describe('getNeverPerformedScore', () => {
    it('rewards never-performed songs', () => {
      assert.equal(getNeverPerformedScore(null), 30);
    });

    it('rewards nothing for performed songs', () => {
      assert.equal(getNeverPerformedScore(new Date()), 0);
    });
  });

  describe('getPerformanceCountScore', () => {
    it('does not double-reward never-performed songs', () => {
      assert.equal(getPerformanceCountScore(0), 0);
    });

    it('rewards less frequently used songs more', () => {
      assert.equal(getPerformanceCountScore(1), 18);
      assert.equal(getPerformanceCountScore(2), 16);
      assert.equal(getPerformanceCountScore(5), 10);
    });

    it('floors at zero', () => {
      assert.equal(getPerformanceCountScore(9), 2);
      assert.equal(getPerformanceCountScore(10), 0);
      assert.equal(getPerformanceCountScore(20), 0);
    });
  });

  describe('calculateScore', () => {
    it('sums the breakdown into the total', () => {
      const song = { season: 'ORDINARY', difficulty: 3 };
      const service = { season: 'ORDINARY' };
      const result = calculateScore(song, service, null, 0);

      assert.equal(result.total, 80);
      assert.deepEqual(result.breakdown, {
        season: 20,
        difficulty: 30,
        neverPerformed: 30,
        performanceCount: 0,
      });
    });

    it('scores performed songs with no never-performed bonus', () => {
      const song = { season: 'ORDINARY', difficulty: 3 };
      const service = { season: 'ORDINARY' };
      const result = calculateScore(song, service, '2026-01-01', 2);

      assert.equal(result.total, 66);
      assert.equal(result.breakdown.neverPerformed, 0);
      assert.equal(result.breakdown.performanceCount, 16);
    });
  });

  describe('compareRecommendations', () => {
    const base = { score: 50, lastPerformed: null, performanceCount: 1, title: 'Song' };

    it('sorts by highest score first', () => {
      const list = [
        { ...base, score: 60, title: 'B' },
        { ...base, score: 80, title: 'A' },
      ];
      list.sort(compareRecommendations);
      assert.equal(list[0].score, 80);
    });

    it('breaks ties by least recently performed', () => {
      const list = [
        { ...base, score: 70, lastPerformed: new Date(Date.now() - 5 * DAY), title: 'Recent' },
        { ...base, score: 70, lastPerformed: null, title: 'Fresh' },
      ];
      list.sort(compareRecommendations);
      assert.equal(list[0].title, 'Fresh');
    });

    it('breaks ties by lowest performance count', () => {
      const list = [
        { ...base, score: 70, lastPerformed: null, performanceCount: 3, title: 'A' },
        { ...base, score: 70, lastPerformed: null, performanceCount: 1, title: 'B' },
      ];
      list.sort(compareRecommendations);
      assert.equal(list[0].performanceCount, 1);
    });

    it('breaks final ties alphabetically by title', () => {
      const list = [
        { ...base, score: 70, lastPerformed: null, performanceCount: 1, title: 'Zulu' },
        { ...base, score: 70, lastPerformed: null, performanceCount: 1, title: 'Alpha' },
      ];
      list.sort(compareRecommendations);
      assert.equal(list[0].title, 'Alpha');
    });
  });
});
