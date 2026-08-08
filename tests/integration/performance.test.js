import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../../src/app.js';
import prisma from '../../src/shared/db.js';

const API = '/api/performances';

let authToken;
let testUserId;
let serviceCreatorId;
let testEventTypeId;
let pastServiceId;
let freshSongId;
let performedSongId;
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
      name: `Performance Test ${Date.now()}`,
      defaultMinSongs: 3,
      defaultMaxSongs: 8,
    },
  });
  testEventTypeId = eventType.id;
  return eventType.id;
}

async function createService(date) {
  if (!serviceCreatorId) {
    const user = await prisma.user.create({
      data: {
        name: 'Service Creator',
        email: `perf-svc-${Date.now()}@test.com`,
        passwordHash: 'hash',
        role: 'CHOIR_DIRECTOR',
      },
    });
    serviceCreatorId = user.id;
  }
  const eventTypeId = await ensureEventType();
  const service = await prisma.service.create({
    data: { eventTypeId, date, season: 'ORDINARY', createdById: serviceCreatorId },
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

describe('Performance Module Integration', () => {
  before(async () => {
    const { token, userId } = await registerAndGetToken(
      `perf-user-${Date.now()}@test.com`,
      'password123',
    );
    authToken = token;
    testUserId = userId;

    const now = new Date();
    pastServiceId = await createService(new Date(now.getTime() - 14 * 86400000));

    freshSongId = await createSong(`Fresh ${Date.now()}`);
    performedSongId = await createSong(`Performed ${Date.now()}`);

    await prisma.performance.create({
      data: {
        serviceId: pastServiceId,
        songId: performedSongId,
        performedDate: new Date(now.getTime() - 3 * 86400000),
      },
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
    const res = await request(app).get(`${API}/last-performed`);
    assert.equal(res.status, 401);
  });

  it('returns 400 when songIds is missing', async () => {
    const res = await api('get', `${API}/last-performed`);
    assert.equal(res.status, 400);
    assert.equal(res.body.error.message, 'Validation failed');
  });

  it('returns 400 for a non-uuid songIds value', async () => {
    const res = await api('get', `${API}/counts?songIds=not-a-uuid`);
    assert.equal(res.status, 400);
    assert.equal(res.body.error.message, 'Validation failed');
  });

  it('returns 400 when more than 200 songIds are provided', async () => {
    const songIds = Array.from(
      { length: 201 },
      (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    );
    const query = songIds.map((id) => `songIds=${id}`).join('&');
    const res = await api('get', `${API}/last-performed?${query}`);
    assert.equal(res.status, 400);
  });

  it('handles a single songIds query param for last-performed', async () => {
    const res = await api('get', `${API}/last-performed?songIds=${freshSongId}`);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data, { [freshSongId]: null });
  });

  it('handles repeated songIds query params for last-performed', async () => {
    const res = await api(
      'get',
      `${API}/last-performed?songIds=${freshSongId}&songIds=${performedSongId}`,
    );
    assert.equal(res.status, 200);
    const data = res.body.data;
    assert.equal(Object.keys(data).length, 2);
    assert.equal(data[freshSongId], null);
    assert.notEqual(data[performedSongId], null);
    assert.ok(!Number.isNaN(new Date(data[performedSongId]).getTime()));
  });

  it('handles repeated songIds query params for counts', async () => {
    const res = await api(
      'get',
      `${API}/counts?songIds=${freshSongId}&songIds=${performedSongId}`,
    );
    assert.equal(res.status, 200);
    const data = res.body.data;
    assert.equal(data[freshSongId], 0);
    assert.equal(data[performedSongId], 1);
  });
});
