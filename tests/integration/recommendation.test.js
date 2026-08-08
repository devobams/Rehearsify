import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../../src/app.js';
import prisma from '../../src/shared/db.js';

const API = '/api/recommendations';

let authToken;
let testUserId;
let serviceCreatorId;
let testEventTypeId;
let targetServiceId;
let otherServiceId;
let confirmedServiceId;
let pastServiceId;
let freshSongId;
let recentSongId;
let attachedSongId;
const createdSongIds = [];
const createdServiceIds = [];

async function registerAndGetToken(email, password) {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ name: 'Test User', email, password, role: 'CHOIR_DIRECTOR' });
  return { token: res.body.token, userId: res.body.user.id };
}

async function ensureEventType() {
  const existing = await prisma.eventType.findFirst();
  if (existing) return existing.id;
  const eventType = await prisma.eventType.create({
    data: {
      name: `Recommendation Test ${Date.now()}`,
      defaultMinSongs: 3,
      defaultMaxSongs: 8,
    },
  });
  testEventTypeId = eventType.id;
  return eventType.id;
}

async function createService(date, season = 'ORDINARY', overrides = {}) {
  if (!serviceCreatorId) {
    const user = await prisma.user.create({
      data: {
        name: 'Service Creator',
        email: `rec-svc-${Date.now()}@test.com`,
        passwordHash: 'hash',
        role: 'CHOIR_DIRECTOR',
      },
    });
    serviceCreatorId = user.id;
  }
  const eventTypeId = await ensureEventType();
  const service = await prisma.service.create({
    data: { eventTypeId, date, season, createdById: serviceCreatorId, ...overrides },
  });
  createdServiceIds.push(service.id);
  return service.id;
}

async function createSong(title) {
  const song = await prisma.song.create({
    data: {
      title,
      composer: 'Test Composer',
      voicing: 'SATB',
      difficulty: 3,
      season: 'ORDINARY',
      language: 'English',
    },
  });
  createdSongIds.push(song.id);
  return song.id;
}

function api(method, path) {
  return request(app)[method](path).set('Authorization', `Bearer ${authToken}`);
}

describe('Recommendation Module Integration', () => {
  before(async () => {
    const { token, userId } = await registerAndGetToken(
      `recommender-${Date.now()}@test.com`,
      'password123',
    );
    authToken = token;
    testUserId = userId;

    const now = new Date();
    targetServiceId = await createService(
      new Date(now.getTime() + 14 * 86400000),
      'ORDINARY',
      { maxSongCount: 100 },
    );
    otherServiceId = await createService(new Date(now.getTime() + 21 * 86400000));
    confirmedServiceId = await createService(
      new Date(now.getTime() + 7 * 86400000),
      'ORDINARY',
      { status: 'CONFIRMED' },
    );
    pastServiceId = await createService(new Date(now.getTime() - 7 * 86400000));

    freshSongId = await createSong(`Fresh ${Date.now()}`);
    recentSongId = await createSong(`Recent ${Date.now()}`);
    attachedSongId = await createSong(`Attached ${Date.now()}`);

    // Recently performed on a DIFFERENT service -> should be excluded by rotation window
    await prisma.performance.create({
      data: { serviceId: otherServiceId, songId: recentSongId, performedDate: now },
    });

    // Already attached to the target service -> should be excluded from candidates
    await prisma.performance.create({
      data: { serviceId: targetServiceId, songId: attachedSongId, performedDate: now },
    });
  });

  after(async () => {
    await prisma.performance.deleteMany({
      where: {
        serviceId: { in: createdServiceIds },
        songId: { in: createdSongIds },
      },
    });
    await prisma.service.deleteMany({ where: { id: { in: createdServiceIds } } });
    await prisma.song.deleteMany({ where: { id: { in: createdSongIds } } });
    if (testEventTypeId) {
      await prisma.eventType.delete({ where: { id: testEventTypeId } }).catch(() => {});
    }
    await prisma.user.deleteMany({
      where: { id: { in: [testUserId, serviceCreatorId].filter(Boolean) } },
    });
  });

  it('returns 401 without a token', async () => {
    const res = await request(app).get(`${API}/${targetServiceId}`);
    assert.equal(res.status, 401);
  });

  it('returns 400 for a non-uuid serviceId', async () => {
    const res = await api('get', `${API}/not-a-uuid`);
    assert.equal(res.status, 400);
  });

  it('returns 404 for an unknown service', async () => {
    const res = await api('get', `${API}/00000000-0000-4000-8000-000000000000`);
    assert.equal(res.status, 404);
  });

  it('returns 400 for a confirmed service', async () => {
    const res = await api('get', `${API}/${confirmedServiceId}`);
    assert.equal(res.status, 400);
  });

  it('returns 400 for a past service', async () => {
    const res = await api('get', `${API}/${pastServiceId}`);
    assert.equal(res.status, 400);
  });

  it('returns ranked recommendations excluding attached and rotation-window songs', async () => {
    const res = await api('get', `${API}/${targetServiceId}`);
    assert.equal(res.status, 200);

    const data = res.body.data;
    assert.equal(data.serviceId, targetServiceId);
    assert.ok(Array.isArray(data.recommendations));
    assert.equal(data.returnedCount, data.recommendations.length);
    assert.ok(data.returnedCount <= data.requestedCount);
    assert.equal(typeof data.belowMinimum, 'boolean');
    assert.ok(data.minCount > 0);
    assert.equal(data.requestedCount, 100);

    const ids = data.recommendations.map((r) => r.id);
    assert.ok(!ids.includes(attachedSongId), 'attached song should be excluded');
    assert.ok(!ids.includes(recentSongId), 'recently performed song should be excluded by rotation window');
    assert.ok(ids.includes(freshSongId), 'never-performed fresh song should be recommended');

    for (const r of data.recommendations) {
      assert.ok(r.id);
      assert.ok(r.title);
      assert.equal(typeof r.score, 'number');
      assert.ok(r.scoreBreakdown);
      assert.equal(typeof r.performanceCount, 'number');
    }

    for (let i = 1; i < data.recommendations.length; i++) {
      assert.ok(
        data.recommendations[i - 1].score >= data.recommendations[i].score,
        'recommendations must be sorted by score descending',
      );
    }
  });
});
