import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../src/app.js';
import prisma from '../../src/shared/db.js';
import config from '../../src/config/index.js';
import { weeklySongPlanningJob, JOB_NAME } from '../../src/jobs/weeklySongPlanning.js';
import { setTransporter } from '../../src/shared/email/mailer.js';

const API = '/api/admin/jobs';
const LOOKAHEAD_DAYS = 1;

let authToken;
let serviceCreatorId;
let serviceCreatorEmail;

let sentMails = [];
const fakeTransport = {
  sendMail: async (mail) => {
    if (fakeTransport.shouldFail) throw new Error('SMTP connection refused');
    sentMails.push(mail);
    return { messageId: `fake-${Date.now()}` };
  },
  shouldFail: false,
};

async function createUser(name, email, role) {
  return prisma.user.create({
    data: { name, email, passwordHash: 'hash', role },
  });
}

async function createDirectorAndToken() {
  const user = await createUser(
    'Job Test Director',
    `job-director-${Date.now()}@test.com`,
    'CHOIR_DIRECTOR',
  );
  const token = jwt.sign(
    { sub: user.id, role: user.role },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn },
  );
  return { user, token };
}

async function ensureEventType() {
  const existing = await prisma.eventType.findFirst({ where: { name: { startsWith: 'Job Test' } } });
  if (existing) return existing.id;
  const eventType = await prisma.eventType.create({
    data: {
      name: `Job Test ${Date.now()}`,
      defaultMinSongs: 1,
      defaultMaxSongs: 10,
    },
  });
  return eventType.id;
}

async function createSong(title, season) {
  return prisma.song.create({
    data: {
      title,
      composer: 'Test Composer',
      voicing: 'SATB',
      difficulty: 3,
      season,
      language: 'English',
    },
  }).then((song) => song.id);
}

async function createService({ date, season, maxSongCount }) {
  const eventTypeId = await ensureEventType();
  return prisma.service.create({
    data: { eventTypeId, date, season, maxSongCount, createdById: serviceCreatorId },
  });
}

// Each fixture uses a unique season so the recommendation engine (which gives
// a +20 season bonus) always ranks this fixture's own songs first — even when
// other fixtures / seed songs exist in the same database. Services are dated
// ~12h out so `lookaheadDays: 1` keeps the job scoped to this test's fixtures
// only (leftover dev data is always further out).
async function createFixture({ songTitles, daysFromNow = 0.5, maxSongCount } = {}) {
  const season = `JOB-TEST-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const songIds = [];
  for (const title of songTitles ?? ['Hymn Alpha', 'Hymn Beta']) {
    songIds.push(await createSong(`${title} ${season}`, season));
  }
  const service = await createService({
    date: new Date(Date.now() + (daysFromNow ?? 0.5) * 86400000),
    season,
    maxSongCount: maxSongCount ?? songTitles?.length ?? 2,
  });
  return { serviceId: service.id, season, songIds };
}

function countJobRuns() {
  return prisma.jobRun.count({ where: { jobName: JOB_NAME } });
}

function latestJobRun() {
  return prisma.jobRun.findFirst({
    where: { jobName: JOB_NAME },
    orderBy: { startedAt: 'desc' },
  });
}

// Removes anything this suite created, even from an aborted earlier run.
// Every artifact lives under the "JOB-TEST-" / "job-" / "Job Test" namespace,
// so this never touches other suites' or the dev seed's data.
async function cleanupTestArtifacts() {
  const orphanServices = await prisma.service.findMany({
    where: { season: { startsWith: 'JOB-TEST-' } },
    select: { id: true },
  });
  const ids = orphanServices.map((s) => s.id);
  if (ids.length > 0) {
    await prisma.performance.deleteMany({ where: { serviceId: { in: ids } } });
    await prisma.planningDraft.deleteMany({ where: { serviceId: { in: ids } } });
    await prisma.service.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.jobRun.deleteMany({ where: { jobName: JOB_NAME } });
  await prisma.song.deleteMany({ where: { season: { startsWith: 'JOB-TEST-' } } });
  await prisma.eventType.deleteMany({ where: { name: { startsWith: 'Job Test' } } }).catch(() => {});
  await prisma.user.deleteMany({ where: { email: { startsWith: 'job-' } } });
}

describe('Weekly Song Planning Job Integration', () => {
  before(async () => {
    await cleanupTestArtifacts();

    const { user, token } = await createDirectorAndToken();
    authToken = token;

    const creator = await createUser(
      'Job Service Creator',
      `job-svc-${Date.now()}@test.com`,
      'CHOIR_DIRECTOR',
    );
    serviceCreatorId = creator.id;
    serviceCreatorEmail = creator.email;
  });

  beforeEach(() => {
    sentMails = [];
    fakeTransport.shouldFail = false;
    setTransporter(fakeTransport);
  });

  after(async () => {
    await cleanupTestArtifacts();
  });

  it('runs end-to-end for one service: recommendation → draft → CONFIRMED → email → job log', async () => {
    const { serviceId, songIds } = await createFixture({ songTitles: ['Job Hymn A', 'Job Hymn B'] });

    const result = await weeklySongPlanningJob({ lookaheadDays: LOOKAHEAD_DAYS });

    assert.equal(result.success, true);
    assert.equal(result.status, 'success');
    assert.equal(result.dryRun, false);
    assert.equal(result.servicesProcessed, 1);
    assert.equal(result.servicesFailed, 0);
    assert.equal(result.services.length, 1);
    assert.equal(result.services[0].serviceId, serviceId);
    assert.equal(result.services[0].songCount, 2);
    assert.equal(result.services[0].emailSent, true);

    const service = await prisma.service.findUnique({ where: { id: serviceId } });
    assert.equal(service.status, 'CONFIRMED');

    const draft = await prisma.planningDraft.findUnique({ where: { serviceId } });
    assert.ok(draft, 'draft should exist');
    assert.deepEqual([...draft.songIds].sort(), [...songIds].sort());

    const perfCount = await prisma.performance.count({ where: { serviceId } });
    assert.equal(perfCount, 2);

    assert.equal(sentMails.length, 1);
    assert.equal(sentMails[0].to, serviceCreatorEmail);
    assert.ok(sentMails[0].subject.includes('Draft Planning Confirmed'));

    const jobRun = await latestJobRun();
    assert.equal(jobRun.status, 'success');
    assert.equal(jobRun.servicesProcessed, 1);
    assert.equal(jobRun.servicesFailed, 0);
  });

  it('processes multiple services in a single pass', async () => {
    const fixtures = [];
    for (let i = 0; i < 5; i += 1) {
      fixtures.push(await createFixture({ songTitles: [`Job Multi ${i}-A`, `Job Multi ${i}-B`] }));
    }

    const result = await weeklySongPlanningJob({ lookaheadDays: LOOKAHEAD_DAYS });

    assert.equal(result.success, true);
    assert.equal(result.servicesProcessed, 5);
    assert.equal(result.servicesFailed, 0);
    assert.equal(result.servicesSkipped, 0);

    for (const { serviceId, songIds } of fixtures) {
      const service = await prisma.service.findUnique({ where: { id: serviceId } });
      assert.equal(service.status, 'CONFIRMED', `service ${serviceId} should be CONFIRMED`);
      const draft = await prisma.planningDraft.findUnique({ where: { serviceId } });
      assert.deepEqual([...draft.songIds].sort(), [...songIds].sort());
    }

    assert.equal(await prisma.planningDraft.count({ where: { serviceId: { in: fixtures.map((f) => f.serviceId) } } }), 5);
    assert.equal(await prisma.performance.count({ where: { serviceId: { in: fixtures.map((f) => f.serviceId) } } }), 10);
    assert.equal(sentMails.length, 5);

    const jobRun = await latestJobRun();
    assert.equal(jobRun.status, 'success');
    assert.equal(jobRun.servicesProcessed, 5);
  });

  it('dry-run logs what would happen with zero writes and zero emails', async () => {
    const { serviceId, songIds } = await createFixture({ songTitles: ['Job Dry A', 'Job Dry B'] });
    const runsBefore = await countJobRuns();

    const result = await weeklySongPlanningJob({ dryRun: true, lookaheadDays: LOOKAHEAD_DAYS });

    assert.equal(result.dryRun, true);
    assert.equal(result.success, true);
    assert.equal(result.servicesProcessed, 1);
    assert.ok(result.logs.some((line) => line.includes('DRY-RUN')));
    assert.equal(result.services[0].songCount, 2);

    const service = await prisma.service.findUnique({ where: { id: serviceId } });
    assert.equal(service.status, 'DRAFT');
    assert.equal(await prisma.planningDraft.count({ where: { serviceId } }), 0);
    assert.equal(await prisma.performance.count({ where: { serviceId } }), 0);
    assert.equal(sentMails.length, 0);
    assert.equal(await countJobRuns(), runsBefore, 'dry-run must not write a job log');

    // dry-run leaves the fixture service in DRAFT — remove it so it cannot
    // leak into the later tests
    await prisma.service.delete({ where: { id: serviceId } });
    await prisma.song.deleteMany({ where: { id: { in: songIds } } });
  });

  it('is idempotent: a second run is a no-op', async () => {
    const fixtures = [];
    fixtures.push(await createFixture({ songTitles: ['Job Idem A', 'Job Idem B'] }));
    fixtures.push(await createFixture({ songTitles: ['Job Idem C', 'Job Idem D'] }));

    const first = await weeklySongPlanningJob({ lookaheadDays: LOOKAHEAD_DAYS });
    assert.equal(first.servicesProcessed, 2);
    const serviceIds = fixtures.map((f) => f.serviceId);

    assert.equal(await prisma.planningDraft.count({ where: { serviceId: { in: serviceIds } } }), 2);
    assert.equal(await prisma.performance.count({ where: { serviceId: { in: serviceIds } } }), 4);
    assert.equal(sentMails.length, 2);

    const second = await weeklySongPlanningJob({ lookaheadDays: LOOKAHEAD_DAYS });
    assert.equal(second.success, true);
    assert.equal(second.servicesProcessed, 0);
    assert.equal(second.servicesFailed, 0);

    assert.equal(await prisma.planningDraft.count({ where: { serviceId: { in: serviceIds } } }), 2);
    assert.equal(await prisma.performance.count({ where: { serviceId: { in: serviceIds } } }), 4);
    assert.equal(sentMails.length, 2, 'no duplicate emails on the second run');

    const lastRun = await latestJobRun();
    assert.equal(lastRun.servicesProcessed, 0);
    assert.equal(lastRun.status, 'success');
  });

  it('updates an existing draft instead of creating a duplicate', async () => {
    const { serviceId, songIds } = await createFixture({ songTitles: ['Job Upd A', 'Job Upd B'] });

    await prisma.planningDraft.create({
      data: { serviceId, songIds: [], manualAdditions: [] },
    });

    const result = await weeklySongPlanningJob({ lookaheadDays: LOOKAHEAD_DAYS });
    assert.equal(result.success, true);
    assert.equal(result.servicesProcessed, 1);

    const drafts = await prisma.planningDraft.findMany({ where: { serviceId } });
    assert.equal(drafts.length, 1, 'draft should be updated, not duplicated');
    assert.deepEqual([...drafts[0].songIds].sort(), [...songIds].sort());

    const service = await prisma.service.findUnique({ where: { id: serviceId } });
    assert.equal(service.status, 'CONFIRMED');
  });

  it('partial failure: failing service is logged, others complete, retry recovers', async () => {
    const a = await createFixture({ songTitles: ['Job Part A-1', 'Job Part A-2'] });
    const b = await createFixture({ songTitles: ['Job Part B-1', 'Job Part B-2'] });
    const c = await createFixture({ songTitles: ['Job Part C-1', 'Job Part C-2'] });

    const mockFetcher = async (serviceId) => {
      if (serviceId === b.serviceId) {
        throw new Error('Recommendation endpoint down');
      }
      const songs = serviceId === a.serviceId ? a.songIds : c.songIds;
      return { recommendations: songs.map((id) => ({ id })) };
    };

    const result = await weeklySongPlanningJob({ recommendationFetcher: mockFetcher, lookaheadDays: LOOKAHEAD_DAYS });
    assert.equal(result.success, false);
    assert.equal(result.status, 'partial');
    assert.equal(result.servicesProcessed, 2);
    assert.equal(result.servicesFailed, 1);

    assert.equal((await prisma.service.findUnique({ where: { id: a.serviceId } })).status, 'CONFIRMED');
    assert.equal((await prisma.service.findUnique({ where: { id: b.serviceId } })).status, 'DRAFT');
    assert.equal((await prisma.service.findUnique({ where: { id: c.serviceId } })).status, 'CONFIRMED');
    assert.equal(await prisma.planningDraft.count({ where: { serviceId: b.serviceId } }), 0);
    assert.equal(sentMails.length, 2);

    const failedRun = await latestJobRun();
    assert.equal(failedRun.status, 'partial');
    assert.equal(failedRun.servicesFailed, 1);
    assert.equal(failedRun.servicesProcessed, 2);

    const retry = await weeklySongPlanningJob();
    assert.equal(retry.success, true);
    assert.equal(retry.servicesProcessed, 1);
    assert.equal((await prisma.service.findUnique({ where: { id: b.serviceId } })).status, 'CONFIRMED');
    assert.equal(await prisma.planningDraft.count({ where: { serviceId: b.serviceId } }), 1);
    assert.equal(sentMails.length, 3, 'retry sends exactly one email for the recovered service');
  });

  it('email failure: affected services are reported as failed, not confirmed', async () => {
    const a = await createFixture({ songTitles: ['Job Mail A-1', 'Job Mail A-2'] });
    const b = await createFixture({ songTitles: ['Job Mail B-1', 'Job Mail B-2'] });

    fakeTransport.shouldFail = true;

    const result = await weeklySongPlanningJob({ lookaheadDays: LOOKAHEAD_DAYS });

    assert.equal(result.success, false);
    assert.equal(result.status, 'partial');
    assert.equal(result.servicesProcessed, 0);
    assert.equal(result.servicesFailed, 2);
    assert.equal(sentMails.length, 0);

    const failedEntries = result.services.filter((entry) => entry.status === 'failed');
    assert.equal(failedEntries.length, 2);
    for (const entry of failedEntries) {
      assert.equal(entry.emailSent, false);
      assert.ok(entry.emailError, 'failed email must carry the SMTP error');
      assert.equal(entry.confirmed, undefined, 'email-failed services must not be reported as confirmed');
    }

    // confirmDraft commits the scheduling transition before the best-effort
    // email, so the services themselves end CONFIRMED — the run just must not
    // claim it processed/confirmed them.
    assert.equal((await prisma.service.findUnique({ where: { id: a.serviceId } })).status, 'CONFIRMED');
    assert.equal((await prisma.service.findUnique({ where: { id: b.serviceId } })).status, 'CONFIRMED');

    const jobRun = await latestJobRun();
    assert.equal(jobRun.status, 'partial');
    assert.equal(jobRun.servicesProcessed, 0);
    assert.equal(jobRun.servicesFailed, 2);
  });

  it('manual trigger endpoint: rejects unauthenticated, unknown jobs, and misspelled params; supports dry-run', async () => {
    const res401 = await request(app).post(`${API}/run?job=${JOB_NAME}`);
    assert.equal(res401.status, 401);

    const res400 = await request(app)
      .post(`${API}/run?job=not-a-real-job`)
      .set('Authorization', `Bearer ${authToken}`);
    assert.equal(res400.status, 400);

    const resStrict = await request(app)
      .post(`${API}/run?job=${JOB_NAME}&lookahead=1`)
      .set('Authorization', `Bearer ${authToken}`);
    assert.equal(resStrict.status, 400, 'misspelled query params must be rejected');

    const resDry = await request(app)
      .post(`${API}/run?job=${JOB_NAME}&dryRun=true&lookaheadDays=1`)
      .set('Authorization', `Bearer ${authToken}`);
    assert.equal(resDry.status, 200);
    assert.equal(resDry.body.data.job, JOB_NAME);
    assert.equal(resDry.body.data.dryRun, true);
    assert.equal(typeof resDry.body.data.success, 'boolean');
    assert.equal(resDry.body.data.servicesProcessed, 0);
  });
});
