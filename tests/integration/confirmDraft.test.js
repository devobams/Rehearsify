import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../../src/app.js';
import prisma from '../../src/shared/db.js';
import * as planningService from '../../src/modules/planning-reporting/planning.service.js';
import { setTransporter } from '../../src/shared/email/mailer.js';

const API = '/api/plans';

let authToken;
let testUserId;
let serviceCreatorId;
let serviceCreatorEmail;
let testEventTypeId;
let happySvcId;
let recFailSvcId;
let emailFailSvcId;
let partialSvcId;
let concurrentSvcId;
let pastSvcId;
let songA;
let songB;
let songC;
let happyDraftId;
let recFailDraftId;
let emailFailDraftId;
let partialDraftId;
let concurrentDraftId;
let pastDraftId;
const createdServiceIds = [];
const createdSongIds = [];

let sentMails = [];
const fakeTransport = {
  sendMail: async (mail) => {
    if (fakeTransport.shouldFail) throw new Error('SMTP connection refused');
    sentMails.push(mail);
    return { messageId: `fake-${Date.now()}` };
  },
  shouldFail: false,
};

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
      name: `Confirm Test ${Date.now()}`,
      defaultMinSongs: 1,
      defaultMaxSongs: 10,
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
        email: `confirm-svc-${Date.now()}@test.com`,
        passwordHash: 'hash',
        role: 'CHOIR_DIRECTOR',
      },
    });
    serviceCreatorId = user.id;
    serviceCreatorEmail = user.email;
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

function api(method, path, body = null) {
  const req = request(app)[method](path).set('Authorization', `Bearer ${authToken}`);
  if (body) req.send(body);
  return req;
}

async function createDraftAndAddSongs(serviceId, songIds) {
  const createRes = await api('post', `${API}/draft`, { serviceId });
  assert.equal(createRes.status, 201);
  const draftId = createRes.body.data.id;
  for (const songId of songIds) {
    const addRes = await api('post', `${API}/draft/${draftId}/song/${songId}`);
    assert.equal(addRes.status, 200);
  }
  return draftId;
}

describe('Confirm Draft Integration', () => {
  before(async () => {
    const { token, userId } = await registerAndGetToken(
      `confirm-${Date.now()}@test.com`,
      'password123',
    );
    authToken = token;
    testUserId = userId;

    const now = new Date();
    happySvcId = await createService(new Date(now.getTime() + 14 * 86400000));
    recFailSvcId = await createService(new Date(now.getTime() + 21 * 86400000));
    emailFailSvcId = await createService(new Date(now.getTime() + 28 * 86400000));
    partialSvcId = await createService(new Date(now.getTime() + 35 * 86400000));
    concurrentSvcId = await createService(new Date(now.getTime() + 42 * 86400000));
    pastSvcId = await createService(new Date(now.getTime() - 7 * 86400000));

    songA = await createSong(`Confirm A ${Date.now()}`);
    songB = await createSong(`Confirm B ${Date.now()}`);
    songC = await createSong(`Confirm C ${Date.now()}`);

    happyDraftId = await createDraftAndAddSongs(happySvcId, [songA, songB]);
    recFailDraftId = await createDraftAndAddSongs(recFailSvcId, [songA]);
    emailFailDraftId = await createDraftAndAddSongs(emailFailSvcId, [songA]);
    partialDraftId = await createDraftAndAddSongs(partialSvcId, [songA, songB]);
    concurrentDraftId = await createDraftAndAddSongs(concurrentSvcId, [songA, songB]);
    pastDraftId = await createDraftAndAddSongs(pastSvcId, [songA]);
  });

  beforeEach(() => {
    sentMails = [];
    fakeTransport.shouldFail = false;
    setTransporter(fakeTransport);
  });

  after(async () => {
    await prisma.performance.deleteMany({
      where: { serviceId: { in: createdServiceIds } },
    });
    await prisma.planningDraft.deleteMany({
      where: { serviceId: { in: createdServiceIds } },
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
    const res = await request(app).post(`${API}/draft/${happyDraftId}/confirm`);
    assert.equal(res.status, 401);
  });

  it('returns 400 for a non-uuid draftId', async () => {
    const res = await api('post', `${API}/draft/not-a-uuid/confirm`);
    assert.equal(res.status, 400);
  });

  it('returns 404 for an unknown draft', async () => {
    const res = await api('post', `${API}/draft/00000000-0000-4000-8000-000000000000/confirm`);
    assert.equal(res.status, 404);
  });

  it('happy path: confirms service, logs performances, sends email', async () => {
    const res = await api('post', `${API}/draft/${happyDraftId}/confirm`);
    assert.equal(res.status, 200);

    const data = res.body.data;
    assert.equal(data.success, true);
    assert.equal(data.draftId, happyDraftId);
    assert.equal(data.serviceId, happySvcId);
    assert.deepEqual([...data.confirmedSongIds].sort(), [songA, songB].sort());
    assert.ok(data.recommendation, 'recommendation should be attached');
    assert.ok(Array.isArray(data.recommendation.recommendations));
    assert.equal(data.emailSent, true);
    assert.equal(data.emailError, null);

    // DB state: service locked to CONFIRMED
    const service = await prisma.service.findUnique({ where: { id: happySvcId } });
    assert.equal(service.status, 'CONFIRMED');

    // DB state: every draft song logged to performance history
    const perfCount = await prisma.performance.count({ where: { serviceId: happySvcId } });
    assert.equal(perfCount, 2);

    // DB state: draft unchanged (still the source of truth)
    const draft = await prisma.planningDraft.findUnique({ where: { id: happyDraftId } });
    assert.deepEqual(draft.songIds, [songA, songB]);

    // Email: exactly one confirmation sent to the service creator
    assert.equal(sentMails.length, 1);
    assert.equal(sentMails[0].to, serviceCreatorEmail);
    assert.ok(sentMails[0].subject.includes('Draft Planning Confirmed'));
  });

  it('returns 409 when the service is already confirmed', async () => {
    const res = await api('post', `${API}/draft/${happyDraftId}/confirm`);
    assert.equal(res.status, 409);
    assert.equal(res.body.error.message, 'Service already confirmed');
  });

  it('returns 400 for a past service', async () => {
    const res = await api('post', `${API}/draft/${pastDraftId}/confirm`);
    assert.equal(res.status, 400);
    assert.equal(res.body.error.message, 'Cannot confirm a service that has already taken place');
  });

  it('recommendation unavailable: rolls back, service stays DRAFT and draft editable', async () => {
    await assert.rejects(
      () =>
        planningService.confirmDraft(recFailDraftId, {
          recommendationFetcher: async () => {
            throw new Error('endpoint down');
          },
        }),
      (err) => err.statusCode === 502 && err.message === 'Recommendation unavailable',
    );

    // DB state: nothing committed
    const service = await prisma.service.findUnique({ where: { id: recFailSvcId } });
    assert.equal(service.status, 'DRAFT');
    const perfCount = await prisma.performance.count({ where: { serviceId: recFailSvcId } });
    assert.equal(perfCount, 0);
    const draft = await prisma.planningDraft.findUnique({ where: { id: recFailDraftId } });
    assert.deepEqual(draft.songIds, [songA]);

    // Draft still editable after the failed confirm
    const addRes = await api('post', `${API}/draft/${recFailDraftId}/song/${songC}`);
    assert.equal(addRes.status, 200);
  });

  it('email fails: data still committed, error logged in response', async () => {
    fakeTransport.shouldFail = true;

    const result = await planningService.confirmDraft(emailFailDraftId, {
      recommendationFetcher: async (serviceId) => ({
        serviceId,
        recommendations: [{ id: songA, score: 0.9 }],
      }),
    });

    assert.equal(result.success, true);
    assert.equal(result.emailSent, false);
    assert.equal(result.emailError, 'SMTP connection refused');
    assert.equal(sentMails.length, 0);

    // DB state: critical writes succeeded despite the email failure
    const service = await prisma.service.findUnique({ where: { id: emailFailSvcId } });
    assert.equal(service.status, 'CONFIRMED');
    const perfCount = await prisma.performance.count({ where: { serviceId: emailFailSvcId } });
    assert.equal(perfCount, 1);
  });

  it('partial recommendation: still confirms using draft songs as source of truth', async () => {
    const result = await planningService.confirmDraft(partialDraftId, {
      recommendationFetcher: async (serviceId) => ({
        serviceId,
        recommendations: [{ id: songA, score: 0.92 }],
        returnedCount: 1,
      }),
    });

    assert.equal(result.success, true);
    assert.equal(result.recommendation.recommendations.length, 1);

    // DB state: BOTH draft songs logged, not just the recommended subset
    const service = await prisma.service.findUnique({ where: { id: partialSvcId } });
    assert.equal(service.status, 'CONFIRMED');
    const performances = await prisma.performance.findMany({
      where: { serviceId: partialSvcId },
      select: { songId: true },
    });
    assert.deepEqual(performances.map((p) => p.songId).sort(), [songA, songB].sort());
  });

  it('concurrent confirms: one succeeds, one conflicts, only one set of performance rows', async () => {
    const results = await Promise.allSettled([
      planningService.confirmDraft(concurrentDraftId),
      planningService.confirmDraft(concurrentDraftId),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
    assert.equal(fulfilled[0].value.success, true);
    assert.equal(rejected[0].reason.statusCode, 409);
    assert.equal(rejected[0].reason.message, 'Service already confirmed');

    // DB state: exactly one set of performance rows, service locked once
    const perfCount = await prisma.performance.count({ where: { serviceId: concurrentSvcId } });
    assert.equal(perfCount, 2);
    const service = await prisma.service.findUnique({ where: { id: concurrentSvcId } });
    assert.equal(service.status, 'CONFIRMED');
  });
});
