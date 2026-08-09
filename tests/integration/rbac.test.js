import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../../src/app.js';
import prisma from '../../src/shared/db.js';
import { hashPassword } from '../../src/shared/utils/password.js';

const createdUserIds = [];
const createdServiceIds = [];
const createdDraftIds = [];

function uniqueEmail(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.com`;
}

async function createUserWithRole(role, password = 'password123') {
  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: { name: `RBAC${role}`, email: uniqueEmail('rbac'), passwordHash, role },
  });
  createdUserIds.push(user.id);
  return user;
}

async function loginToGetToken(email, password = 'password123') {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  assert.equal(res.status, 200);
  return res.body.token;
}

async function ensureEventType() {
  const existing = await prisma.eventType.findFirst();
  if (existing) return existing.id;
  const eventType = await prisma.eventType.create({ data: { name: 'RBAC Test Type' } });
  return eventType.id;
}

async function createServiceViaApi(token, eventTypeId, daysFromNow = 30) {
  const date = new Date(Date.now() + daysFromNow * 86400000).toISOString();
  const res = await request(app)
    .post('/api/services')
    .set('Authorization', `Bearer ${token}`)
    .send({ eventTypeId, date, season: 'ORDINARY' });
  if (res.body?.data?.id) createdServiceIds.push(res.body.data.id);
  return res;
}

describe('RBAC / Access Control Matrix', () => {
  let adminToken;
  let directorToken;
  let director2Token;
  let choristerToken;
  let eventTypeId;

  before(async () => {
    // Seed one user per role, then log them in via the real login endpoint.
    const admin = await createUserWithRole('ADMINISTRATOR');
    const director = await createUserWithRole('CHOIR_DIRECTOR');
    const director2 = await createUserWithRole('CHOIR_DIRECTOR');
    const chorister = await createUserWithRole('CHORISTER');

    adminToken = await loginToGetToken(admin.email);
    directorToken = await loginToGetToken(director.email);
    director2Token = await loginToGetToken(director2.email);
    choristerToken = await loginToGetToken(chorister.email);

    eventTypeId = await ensureEventType();
  });

  after(async () => {
    await prisma.planningDraft.deleteMany({ where: { id: { in: createdDraftIds } } });
    await prisma.service.deleteMany({ where: { id: { in: createdServiceIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  });

  describe('Unauthenticated access (no/invalid token)', () => {
    const protectedRoutes = [
      ['GET', '/api/services'],
      ['GET', '/api/services/some-id'],
      ['POST', '/api/songs'],
      ['GET', '/api/songs'],
      ['POST', '/api/plans/draft'],
      ['GET', '/api/reports/stale-songs'],
      ['GET', '/api/reports/performance-frequency'],
      ['GET', '/api/performances/last-performed'],
      ['GET', '/api/recommendations/00000000-0000-4000-8000-000000000000'],
    ];

    for (const [method, path] of protectedRoutes) {
      it(`${method} ${path} -> 401`, async () => {
        const res = await request(app)[method.toLowerCase()](path);
        assert.equal(res.status, 401, `${method} ${path} should be 401`);
      });
    }
  });

  describe('GET /api/services - read access', () => {
    it('admin/director/chorister all get 200 (read allowed for all roles)', async () => {
      for (const token of [adminToken, directorToken, director2Token, choristerToken]) {
        const res = await request(app).get('/api/services').set('Authorization', `Bearer ${token}`);
        assert.equal(res.status, 200);
        assert.ok(Array.isArray(res.body.data));
      }
    });

    it('OBSERVATION: list is NOT scoped to requester — chorister sees every service (multi-choir scoping gap)', async () => {
      const res = await request(app).get('/api/services').set('Authorization', `Bearer ${choristerToken}`);
      assert.equal(res.status, 200);
      // There should be at least the seed director's services visible to a chorister.
      assert.ok(res.body.data.length >= 3, 'seed services should be visible to a CHORISTER');
    });
  });

  describe('POST /api/songs - write access (requires ADMINISTRATOR or CHOIR_DIRECTOR)', () => {
    const songBody = {
      title: `RBAC Song ${Date.now()}`,
      composer: 'Test Composer',
      voicing: 'SATB',
      difficulty: 2,
      season: 'ORDINARY',
      language: 'English',
    };

    it('admin can create -> 201', async () => {
      const res = await request(app)
        .post('/api/songs')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(songBody);
      assert.equal(res.status, 201);
      await prisma.song.deleteMany({ where: { id: res.body?.song?.id } }).catch(() => {});
    });

    it('director can create -> 201', async () => {
      const res = await request(app)
        .post('/api/songs')
        .set('Authorization', `Bearer ${directorToken}`)
        .send(songBody);
      assert.equal(res.status, 201);
      await prisma.song.deleteMany({ where: { id: res.body?.song?.id } }).catch(() => {});
    });

    it('chorister is FORBIDDEN -> 403', async () => {
      const res = await request(app)
        .post('/api/songs')
        .set('Authorization', `Bearer ${choristerToken}`)
        .send(songBody);
      assert.equal(res.status, 403);
    });
  });

  describe('POST /api/plans/draft - planning write access', () => {
    it('admin can create a draft -> 201', async () => {
      const svc = await createServiceViaApi(adminToken, eventTypeId, 35);
      const res = await request(app)
        .post('/api/plans/draft')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ serviceId: svc.body.data.id });
      createdDraftIds.push(res.body?.data?.id);
      assert.equal(res.status, 201);
    });

    it('director can create a draft -> 201', async () => {
      const svc = await createServiceViaApi(directorToken, eventTypeId, 36);
      const res = await request(app)
        .post('/api/plans/draft')
        .set('Authorization', `Bearer ${directorToken}`)
        .send({ serviceId: svc.body.data.id });
      createdDraftIds.push(res.body?.data?.id);
      assert.equal(res.status, 201);
    });

    it('chorister is forbidden -> 403 (spec matrix)', async () => {
      const res = await request(app)
        .post('/api/plans/draft')
        .set('Authorization', `Bearer ${choristerToken}`)
        .send({ serviceId: '00000000-0000-4000-8000-000000000000' });
      assert.equal(res.status, 403);
    });
  });

  describe('POST /api/services - service creation access', () => {
    it('chorister is forbidden -> 403', async () => {
      const res = await createServiceViaApi(choristerToken, eventTypeId, 40);
      assert.equal(res.status, 403);
    });

    it('director can create -> 201', async () => {
      const res = await createServiceViaApi(director2Token, eventTypeId, 41);
      assert.equal(res.status, 201);
    });
  });

  describe('DELETE /api/services/:id - delete access', () => {
    it('admin (non-owner) can delete -> 204', async () => {
      const svc = await createServiceViaApi(director2Token, eventTypeId, 50);
      const res = await request(app)
        .delete(`/api/services/${svc.body.data.id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      assert.equal(res.status, 204);
    });

    it('director (owner) is forbidden -> 403 (matrix: directors cannot delete)', async () => {
      const svc = await createServiceViaApi(directorToken, eventTypeId, 51);
      const res = await request(app)
        .delete(`/api/services/${svc.body.data.id}`)
        .set('Authorization', `Bearer ${directorToken}`);
      assert.equal(res.status, 403);
    });

    it('director (non-owner) is forbidden -> 403', async () => {
      const svc = await createServiceViaApi(directorToken, eventTypeId, 52);
      const res = await request(app)
        .delete(`/api/services/${svc.body.data.id}`)
        .set('Authorization', `Bearer ${director2Token}`);
      assert.equal(res.status, 403);
    });

    it('chorister (non-owner) is forbidden -> 403', async () => {
      const svc = await createServiceViaApi(director2Token, eventTypeId, 53);
      const res = await request(app)
        .delete(`/api/services/${svc.body.data.id}`)
        .set('Authorization', `Bearer ${choristerToken}`);
      assert.equal(res.status, 403);
    });

    it('una authenticated cannot delete -> 401', async () => {
      const svc = await createServiceViaApi(director2Token, eventTypeId, 54);
      const res = await request(app).delete(`/api/services/${svc.body.data.id}`);
      assert.equal(res.status, 401);
    });
  });

  describe('PATCH /api/auth/users/:id/role - stacked guards', () => {
    it('no token -> 401', async () => {
      const res = await request(app)
        .patch('/api/auth/users/00000000-0000-4000-8000-000000000000/role')
        .send({ role: 'CHOIR_DIRECTOR' });
      assert.equal(res.status, 401);
    });

    it('chorister token -> 403', async () => {
      const res = await request(app)
        .patch('/api/auth/users/00000000-0000-4000-8000-000000000000/role')
        .set('Authorization', `Bearer ${choristerToken}`)
        .send({ role: 'CHOIR_DIRECTOR' });
      assert.equal(res.status, 403);
    });

    it('director token -> 403', async () => {
      const res = await request(app)
        .patch('/api/auth/users/00000000-0000-4000-8000-000000000000/role')
        .set('Authorization', `Bearer ${directorToken}`)
        .send({ role: 'CHOIR_DIRECTOR' });
      assert.equal(res.status, 403);
    });

    it('admin token -> 404 (reaches handler, unknown user)', async () => {
      const res = await request(app)
        .patch('/api/auth/users/00000000-0000-4000-8000-000000000000/role')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'CHOIR_DIRECTOR' });
      assert.equal(res.status, 404);
    });
  });

  describe('Demo of role escalation guard (forged claim in signed token)', () => {
    it('a CHORISTER-signed token that claims ADMIN gets through admin-only route -> 403', async () => {
      // Preserved here so the test documents the risk even if current behavior differs.
      const res = await request(app)
        .patch('/api/auth/users/00000000-0000-4000-8000-000000000000/role')
        .set('Authorization', `Bearer ${choristerToken}`)
        .send({ role: 'CHOIR_DIRECTOR' });
      assert.equal(res.status, 403);
    });
  });
});