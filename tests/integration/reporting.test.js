import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../../src/app.js';
import prisma from '../../src/shared/db.js';
import { hashPassword } from '../../src/shared/utils/password.js';

const createdUserIds = [];
const createdSongIds = [];
const createdServiceIds = [];
const createdPerformanceIds = [];

function uniqueEmail() {
  return `rept-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.com`;
}

async function createTracking() {
  const passwordHash = await hashPassword('password123');
  const user = await prisma.user.create({
    data: { name: 'Report Tester', email: uniqueEmail(), passwordHash, role: 'CHOIR_DIRECTOR' },
  });
  createdUserIds.push(user.id);

  const login = await request(app).post('/api/auth/login').send({ email: user.email, password: 'password123' });
  return { token: login.body.token, userId: user.id };
}

async function createSong({ title, performed }) {
  const song = await prisma.song.create({
    data: {
      title,
      composer: 'Report Composer',
      voicing: 'SATB',
      difficulty: 2,
      season: 'ORDINARY',
      language: 'English',
    },
  });
  createdSongIds.push(song.id);
  if (performed > 0) {
    const eventType = await prisma.eventType.findFirst();
    const service = await prisma.service.create({
      data: {
        eventTypeId: eventType.id,
        date: new Date(Date.now() - 5 * 86400000),
        season: 'ORDINARY',
        createdById: createdUserIds[0],
      },
    });
    createdServiceIds.push(service.id);
    const perfs = await prisma.performance.createMany({
      data: Array.from({ length: performed }, (_, i) => ({
        songId: song.id,
        serviceId: service.id,
        performedDate: new Date(Date.now() - (i + 1) * 86400000),
      })),
    });
    createdPerformanceIds.push(perfs.count);
  }
  return song;
}

async function cleanup() {
  await prisma.performance.deleteMany({ where: { serviceId: { in: createdServiceIds } } });
  await prisma.service.deleteMany({ where: { id: { in: createdServiceIds } } });
  await prisma.song.deleteMany({ where: { id: { in: createdSongIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
}

describe('Reporting Module Integration (existing endpoints)', () => {
  let token;

  before(async () => {
    const { token: t } = await createTracking();
    token = t;
  });
  after(cleanup);

  describe('GET /api/reports/stale-songs', () => {
    it('returns 401 without auth', async () => {
      const res = await request(app).get('/api/reports/stale-songs');
      assert.equal(res.status, 401);
    });

    it('rejects invalid days query -> 400', async () => {
      for (const days of ['0', '-5', 'abc']) {
        const res = await request(app)
          .get(`/api/reports/stale-songs?days=${days}`)
          .set('Authorization', `Bearer ${token}`);
        assert.equal(res.status, 400, `days=${days} should be rejected`);
      }
    });

    it('covers never-performed songs and songs older than cutoff, excludes soft-deleted', async () => {
      const fresh = await createSong({ title: `Fresh Song ${Date.now()}`, performed: 1 });
      const never = await createSong({ title: `Never Song ${Date.now()}`, performed: 0 });

      const deleted = await prisma.song.create({
        data: {
          title: `Deleted ${Date.now()}`,
          composer: 'V',
          voicing: 'SATB',
          difficulty: 1,
          season: 'ORDINARY',
          language: 'English',
          active: false,
        },
      });
      createdSongIds.push(deleted.id);

      const res = await request(app)
        .get('/api/reports/stale-songs?days=90')
        .set('Authorization', `Bearer ${token}`);
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.data));

      const ids = res.body.data.map((s) => s.id);
      assert.ok(ids.includes(never.id), 'never-performed song should be stale');
      assert.ok(!ids.includes(deleted.id), 'inactive song must be excluded');
      assert.ok(!ids.includes(fresh.id), 'recently performed song should NOT be stale');
    });
  });

  describe('GET /api/reports/performance-frequency', () => {
    it('returns songs sorted by performance count descending', async () => {
      await createSong({ title: `High Song ${Date.now()}`, performed: 5 });
      await createSong({ title: `Low Song ${Date.now()}`, performed: 1 });

      const res = await request(app)
        .get('/api/reports/performance-frequency')
        .set('Authorization', `Bearer ${token}`);
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.data));
      assert.equal(res.body.data[0].performanceCount, 5, 'highest count first');
      assert.equal(res.body.data[0].performanceCount >= res.body.data[1].performanceCount, true,
        'sorted descending');
    });

    it('reports a count of 0 for never-performed active songs', async () => {
      const never = await createSong({ title: `Zero Song ${Date.now()}`, performed: 0 });
      const res = await request(app)
        .get('/api/reports/performance-frequency')
        .set('Authorization', `Bearer ${token}`);
      const row = res.body.data.find((s) => s.id === never.id);
      assert.equal(row.performanceCount, 0);
    });

    it('excludes soft-deleted songs', async () => {
      const res = await request(app)
        .get('/api/reports/performance-frequency')
        .set('Authorization', `Bearer ${token}`);
      assert.ok(Array.isArray(res.body.data));
      // All returned songs must be active.
      for (const s of res.body.data) {
        assert.equal(s.active, true);
      }
    });
  });

  describe('Performance smoke', () => {
    it('stale-songs and performance-frequency complete quickly', async () => {
      const t0 = performance.now();
      const stale = await request(app)
        .get('/api/reports/stale-songs?days=90')
        .set('Authorization', `Bearer ${token}`);
      const t1 = performance.now();

      const freq = await request(app)
        .get('/api/reports/performance-frequency')
        .set('Authorization', `Bearer ${token}`);
      const t2 = performance.now();

      assert.equal(stale.status, 200);
      assert.equal(freq.status, 200);
      const staleMs = t1 - t0;
      const freqMs = t2 - t1;
      console.log(`[perf] stale-songs=${staleMs.toFixed(1)}ms  performance-frequency=${freqMs.toFixed(1)}ms`);
      assert.ok(staleMs < 1000, `stale-songs took ${staleMs.toFixed(1)}ms`);
      assert.ok(freqMs < 1000, `performance-frequency took ${freqMs.toFixed(1)}ms`);
    });
  });
});