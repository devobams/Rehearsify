import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../../src/app.js';
import prisma from '../../src/shared/db.js';

const API = '/api/plans';

let authToken;
let testUserId;
let serviceCreatorId;
let testServiceId;
let testServiceId2;
let testSongIds = [];
let testDraftId;

async function registerAndGetToken(email, password) {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ name: 'Test User', email, password, role: 'CHOIR_DIRECTOR' });
  return { token: res.body.token, userId: res.body.user.id };
}

async function createService(date, season = 'ORDINARY') {
  const eventType = await prisma.eventType.findFirst();
  if (!serviceCreatorId) {
    const user = await prisma.user.create({
      data: { name: 'Service Creator', email: `svc-creator-${Date.now()}@test.com`, passwordHash: 'hash', role: 'CHOIR_DIRECTOR' },
    });
    serviceCreatorId = user.id;
  }
  const service = await prisma.service.create({
    data: {
      eventTypeId: eventType.id,
      date,
      season,
      createdById: serviceCreatorId,
    },
  });
  return service.id;
}

async function seedTestSongs() {
  const songs = await prisma.song.findMany({ take: 5 });
  return songs.map((s) => s.id);
}

function api(method, path, body = null) {
  const req = request(app)[method](path).set('Authorization', `Bearer ${authToken}`);
  if (body) req.send(body);
  return req;
}

describe('Planning Module Integration', () => {
  before(async () => {
    const { token, userId } = await registerAndGetToken(
      `planner-${Date.now()}@test.com`,
      'password123',
    );
    authToken = token;
    testUserId = userId;

    const now = new Date();
    testServiceId = await createService(new Date(now.getTime() + 7 * 86400000));
    testServiceId2 = await createService(new Date(now.getTime() + 14 * 86400000));
    testSongIds = await seedTestSongs();
  });

  after(async () => {
    await prisma.planningDraft.deleteMany({
      where: { serviceId: { in: [testServiceId, testServiceId2] } },
    });
    await prisma.service.deleteMany({ where: { createdById: { in: [testUserId, serviceCreatorId] } } });
    await prisma.user.delete({ where: { id: testUserId } }).catch(() => {});
    if (serviceCreatorId) {
      await prisma.user.delete({ where: { id: serviceCreatorId } }).catch(() => {});
    }
  });

  describe('POST /draft - create draft', () => {
    it('creates a draft for a service', async () => {
      const res = await api('post', `${API}/draft`, { serviceId: testServiceId });
      assert.equal(res.status, 201);
      assert.ok(res.body.data.id);
      testDraftId = res.body.data.id;
    });

    it('returns 409 for duplicate service', async () => {
      const res = await api('post', `${API}/draft`, { serviceId: testServiceId });
      assert.equal(res.status, 409);
    });
  });

  describe('POST /draft/:draftId/song/:songId - add songs', () => {
    it('adds a song to the draft', async () => {
      const res = await api('post', `${API}/draft/${testDraftId}/song/${testSongIds[0]}`);
      assert.equal(res.status, 200);
    });

    it('adds second song', async () => {
      const res = await api('post', `${API}/draft/${testDraftId}/song/${testSongIds[1]}`);
      assert.equal(res.status, 200);
    });

    it('returns 409 for duplicate song', async () => {
      const res = await api('post', `${API}/draft/${testDraftId}/song/${testSongIds[0]}`);
      assert.equal(res.status, 409);
    });
  });

  describe('GET /draft/:draftId - enriched fetch', () => {
    it('returns enriched draft with song details and duration', async () => {
      const res = await api('get', `${API}/draft/${testDraftId}`);
      assert.equal(res.status, 200);

      const draft = res.body.data;
      assert.equal(draft.id, testDraftId);
      assert.equal(draft.serviceId, testServiceId);
      assert.ok(draft.serviceName);
      assert.ok(draft.serviceDate);
      assert.equal(draft.songCount, 2);
      assert.ok(draft.totalDuration > 0);
      assert.ok(Array.isArray(draft.songs));
      assert.equal(draft.songs.length, 2);

      const song = draft.songs[0];
      assert.ok(song.songId);
      assert.ok(song.title);
      assert.ok(typeof song.duration === 'number');
      assert.ok(typeof song.difficulty === 'number');
    });
  });

  describe('GET /drafts - list with filters', () => {
    it('lists active drafts', async () => {
      const res = await api('get', `${API}/drafts?status=active`);
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.data));
      assert.ok(res.body.pagination);
      assert.ok(res.body.pagination.total >= 1);
    });

    it('filters by serviceId', async () => {
      const res = await api('get', `${API}/drafts?serviceId=${testServiceId}`);
      assert.equal(res.status, 200);
      assert.equal(res.body.data.length, 1);
      assert.equal(res.body.data[0].serviceId, testServiceId);
    });

    it('paginates correctly', async () => {
      const res = await api('get', `${API}/drafts?limit=1&page=1`);
      assert.equal(res.status, 200);
      assert.equal(res.body.data.length, 1);
      assert.ok(res.body.pagination.totalPages >= 1);
    });

    it('sorts by serviceDate ascending', async () => {
      const res = await api('get', `${API}/drafts?sortBy=serviceDate&sortOrder=asc`);
      assert.equal(res.status, 200);
      if (res.body.data.length >= 2) {
        const d1 = new Date(res.body.data[0].service?.date ?? 0);
        const d2 = new Date(res.body.data[1].service?.date ?? 0);
        assert.ok(d1 <= d2);
      }
    });

    it('sorts by createdAt descending', async () => {
      const res = await api('get', `${API}/drafts?sortBy=createdAt&sortOrder=desc`);
      assert.equal(res.status, 200);
      assert.ok(res.body.data.length >= 1);
    });
  });

  describe('PATCH /draft/:draftId/clear - clear songs', () => {
    it('clears all songs from draft', async () => {
      const res = await api('patch', `${API}/draft/${testDraftId}/clear`);
      assert.equal(res.status, 200);
      assert.equal(res.body.data.songIds.length, 0);
      assert.equal(res.body.data.manualAdditions.length, 0);
    });

    it('getDraft shows 0 songs after clear', async () => {
      const res = await api('get', `${API}/draft/${testDraftId}`);
      assert.equal(res.status, 200);
      assert.equal(res.body.data.songCount, 0);
      assert.equal(res.body.data.totalDuration, 0);
    });
  });

  describe('POST /draft/:draftId/clone - clone draft', () => {
    it('clones draft to new service', async () => {
      await api('post', `${API}/draft/${testDraftId}/song/${testSongIds[2]}`);

      const res = await api('post', `${API}/draft/${testDraftId}/clone`, {
        targetServiceId: testServiceId2,
      });
      assert.equal(res.status, 201);
      assert.equal(res.body.data.serviceId, testServiceId2);
      assert.deepEqual(res.body.data.songIds, [testSongIds[2]]);
    });

    it('returns 409 if target service already has draft', async () => {
      const res = await api('post', `${API}/draft/${testDraftId}/clone`, {
        targetServiceId: testServiceId2,
      });
      assert.equal(res.status, 409);
    });
  });

  describe('DELETE /draft/:draftId - soft delete', () => {
    it('soft-deletes the draft', async () => {
      const res = await api('delete', `${API}/draft/${testDraftId}`);
      assert.equal(res.status, 204);
    });

    it('returns 404 for deleted draft', async () => {
      const res = await api('get', `${API}/draft/${testDraftId}`);
      assert.equal(res.status, 404);
    });

    it('deleted draft excluded from active list', async () => {
      const res = await api('get', `${API}/drafts?status=active`);
      const found = res.body.data.find((d) => d.id === testDraftId);
      assert.equal(found, undefined);
    });
  });

  describe('Validation', () => {
    it('rejects invalid serviceId on create', async () => {
      const res = await api('post', `${API}/draft`, { serviceId: 'not-a-uuid' });
      assert.equal(res.status, 400);
    });

    it('rejects invalid query params', async () => {
      const res = await api('get', `${API}/drafts?page=-1`);
      assert.equal(res.status, 400);
    });
  });
});
