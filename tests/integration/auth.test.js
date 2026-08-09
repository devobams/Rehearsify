import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../src/app.js';
import prisma from '../../src/shared/db.js';
import config from '../../src/config/index.js';
import { hashPassword } from '../../src/shared/utils/password.js';

const API = '/api/auth';

const createdUserIds = [];

function uniqueEmail(prefix = 'auth') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.com`;
}

async function register(body) {
  return request(app).post(`${API}/register`).send(body);
}

async function login(email, password) {
  return request(app).post(`${API}/login`).send({ email, password });
}

// Register via the public API, then create a REAL user row for cleanup.
async function registerTracked(name, email, password) {
  const res = await register({ name, email, password });
  if (res.body?.user?.id) createdUserIds.push(res.body.user.id);
  return res;
}

async function createUserViaDb({ name, email, password, role }) {
  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({ data: { name, email, passwordHash, role } });
  createdUserIds.push(user.id);
  return user;
}

function signToken(payload, opts = {}) {
  return jwt.sign(payload, config.jwt.secret, opts);
}

describe('Auth Module Integration — register/login/security', () => {
  after(async () => {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  });

  describe('Register flow', () => {
    it('registers a valid user -> 201, JWT issued with CHORISTER role', async () => {
      const email = uniqueEmail();
      const res = await registerTracked('Alice Test', email, 'password123');

      assert.equal(res.status, 201);
      assert.equal(res.body.user.email, email);
      assert.equal(res.body.user.role, 'CHORISTER');
      assert.ok(res.body.token, 'expected a token in the response body');

      const decoded = jwt.verify(res.body.token, config.jwt.secret);
      assert.equal(decoded.sub, res.body.user.id);
      assert.equal(decoded.role, 'CHORISTER');
    });

    it('duplicate email -> 409 Conflict', async () => {
      const email = uniqueEmail();
      await registerTracked('First User', email, 'password123');

      const res = await register({ name: 'Second User', email, password: 'password123' });
      assert.equal(res.status, 409);
    });
    it('rejects password shorter than 8 chars -> 400', async () => {
      const res = await register({ name: 'Bob', email: uniqueEmail(), password: 'short' });
      assert.equal(res.status, 400);
      assert.equal(res.body.error.message, 'Validation failed');
    });

    it('rejects name shorter than 2 chars -> 400', async () => {
      const res = await register({ name: 'A', email: uniqueEmail(), password: 'password123' });
      assert.equal(res.status, 400);
    });

    it('rejects malformed email -> 400', async () => {
      const res = await register({ name: 'Bob', email: 'not-an-email', password: 'password123' });
      assert.equal(res.status, 400);
    });
  });

  describe('Login flow', () => {
    it('logs in with correct credentials -> 200 + token', async () => {
      const email = uniqueEmail();
      await registerTracked('Carol', email, 'password123');
      const res = await login(email, 'password123');
      assert.equal(res.status, 200);
      assert.ok(res.body.token);
      assert.equal(res.body.user.email, email);
    });

    it('wrong password -> 401 (generic message, no user/email leak)', async () => {
      const email = uniqueEmail();
      await registerTracked('Dave', email, 'password123');

      const wrongPw = await login(email, 'wrong-password-1');
      assert.equal(wrongPw.status, 401);
      assert.equal(wrongPw.body.error.message, 'Invalid credentials');

      const wrongUser = await login(`nobody-${Date.now()}@test.com`, 'password123');
      assert.equal(wrongUser.status, 401);
      assert.equal(wrongUser.body.error.message, wrongPw.body.error.message,
        'email-not-found and wrong-password must produce identical messages');
    });

    it('missing fields -> 400', async () => {
      const noPw = await request(app).post(`${API}/login`).send({ email: 'x@test.com' });
      assert.equal(noPw.status, 400);
      const noEmail = await request(app).post(`${API}/login`).send({ password: 'password123' });
      assert.equal(noEmail.status, 400);
    });

    it('maleated email format -> 400', async () => {
      const res = await login('definitely-not-an-email', 'password123');
    it('malformed email format -> 400', async () => {
      const res = await login('definitely-not-an-email', 'password123');
      assert.equal(res.status, 400);
    });      const email = uniqueEmail();
      await registerTracked('Eve', email, 'password123');
      const results = await Promise.all(
        Array.from({ length: 10 }, () => login(email, 'password123')),
      );
      for (const res of results) {
        assert.equal(res.status, 200);
      }
    });
  });

  describe('Token security & middleware guardrails', () => {
    it('no Authorization header -> 401 on a protected route', async () => {
      const res = await request(app).get('/api/songs');
      assert.equal(res.status, 401);
      assert.equal(res.body.error.message, 'Unauthorized');
    });

    it('malformed token -> 401 (not 500)', async () => {
      const res = await request(app).get('/api/songs').set('Authorization', 'Bearer not.a.jwt');
      assert.equal(res.status, 401);
    });

    it('expired token -> 401', async () => {
      const user = await createUserViaDb({ name: 'Expired', email: uniqueEmail(), password: 'password123', role: 'CHORISTER' });
      const token = signToken({ sub: user.id, role: 'CHORISTER' }, { expiresIn: '-10s' });
      const res = await request(app).get('/api/songs').set('Authorization', `Bearer ${token}`);
      assert.equal(res.status, 401);
    });

    it('tampered token (role claim flipped in a copied token) -> 401', async () => {
      const user = await createUserViaDb({ name: 'Tamper', email: uniqueEmail(), password: 'password123', role: 'CHORISTER' });
      const good = signToken({ sub: user.id, role: 'CHORISTER' });
      // Flip a char in the signature portion so verification fails.
      const signature = good.split('.').pop();
      const flipped = signature[0] === 'A' ? 'B' : 'A';
      const tampered = `${good.slice(0, good.lastIndexOf('.') + 1)}${flipped}${signature.slice(1)}`;
      const res = await request(app).get('/api/songs').set('Authorization', `Bearer ${tampered}`);
      assert.equal(res.status, 401);
    });

    it('does NOT trust a role claim that does not match the DB (role enforced from token is rejected on change)', async () => {
      // A user whose real role is CHORISTER, but whose token claims ADMINISTRATOR.
      const user = await createUserViaDb({ name: 'Forger', email: uniqueEmail(), password: 'password123', role: 'CHORISTER' });
    it('does NOT trust a role claim that does not match the DB (role enforced from token is rejected on change)', async () => {
      // A user whose real role is CHORISTER, but whose token claims ADMINISTRATOR.
      const user = await createUserViaDb({ name: 'Forger', email: uniqueEmail(), password: 'password123', role: 'CHORISTER' });
      const forged = signToken({ sub: user.id, role: 'ADMINISTRATOR' });
      // Attempt an admin-only action with the forged token.
      const res = await request(app)
        .patch(`${API}/users/${user.id}/role`)
        .set('Authorization', `Bearer ${forged}`)
        .send({ role: 'CHOIR_DIRECTOR' });
      // requireRole reads the role from the database, so the forged ADMINISTRATOR claim is rejected.
      assert.equal(res.status, 403);
    });      const res = await request(app).get('/api/songs').set('Authorization', `Bearer ${huge}`);
      assert.ok(res.status >= 400 && res.status < 500, `expected 4xx, got ${res.status}`);
    });

    it('bearer token without "Bearer " scheme -> 401', async () => {
      const user = await createUserViaDb({ name: 'NoScheme', email: uniqueEmail(), password: 'password123', role: 'CHORISTER' });
      const token = signToken({ sub: user.id, role: 'CHORISTER' });
      const res = await request(app).get('/api/songs').set('Authorization', token);
      assert.equal(res.status, 401);
    });

    it('tokens carry a bounded TTL (exp - iat == configured expiry)', async () => {
      const email = uniqueEmail();
      await registerTracked('TTL', email, 'password123');
      const res = await login(email, 'password123');
      assert.equal(res.status, 200);
      const { iat, exp } = jwt.decode(res.body.token);
      assert.equal(exp - iat, 86400, '1d token issued by login should be exactly 86400s');
    });
  });

  describe('Credential hygiene', () => {
    it('response bodies never leak the password', async () => {
      const email = uniqueEmail();
      const res = await registerTracked('Hygiene', email, 'SuperSecret99');
      assert.equal(res.status, 201);
      const body = JSON.stringify(res.body).toLowerCase();
      assert.ok(!body.includes('supersecret99'));
      assert.ok(!body.includes('passwordhash'));
    });

    it('passwords are stored hashed (bcrypt), not plaintext', async () => {
      const email = uniqueEmail();
      const res = await registerTracked('HashCheck', email, 'PlainTextPass1');
      const stored = await prisma.user.findUnique({ where: { id: res.body.user.id } });
      assert.ok(stored.passwordHash.startsWith('$2'));
      assert.notEqual(stored.passwordHash, 'PlainTextPass1');
    });

    it('validation errors do not echo password values', async () => {
      const res = await register({ name: 'X', email: 'valid@test.com', password: 'topsecret-value' });
      assert.equal(res.status, 400);
      assert.ok(!JSON.stringify(res.body).toLowerCase().includes('topsecret-value'));
    });
  });

  describe('Role management (admin-only)', () => {
    it('admin promotes a user -> 200 and a new login token carries the new role', async () => {
      const admin = await createUserViaDb({ name: 'Admin', email: uniqueEmail(), password: 'password123', role: 'ADMINISTRATOR' });
      const adminLogin = await login(admin.email, 'password123');
      const victim = await registerTracked('Victim', uniqueEmail(), 'password123');

      const adminRes = await request(app)
        .patch(`${API}/users/${victim.body.user.id}/role`)
        .set('Authorization', `Bearer ${adminLogin.body.token}`)
        .send({ role: 'CHOIR_DIRECTOR' });
      assert.equal(adminRes.status, 200);
      assert.equal(adminRes.body.user.role, 'CHOIR_DIRECTOR');

      // A NEW token for the promoted user reflects the new role.
      const relogin = await login(victim.body.user.email, 'password123');
      assert.equal(relogin.status, 200);
      assert.equal(relogin.body.user.role, 'CHOIR_DIRECTOR');
      const decoded = jwt.verify(relogin.body.token, config.jwt.secret);
      assert.equal(decoded.role, 'CHOIR_DIRECTOR');
    });

    it('admin role change -> 403 without auth, 401 without token', async () => {
      const admin = await createUserViaDb({ name: 'Admin2', email: uniqueEmail(), password: 'password123', role: 'ADMINISTRATOR' });
      const res = await request(app)
        .patch(`${API}/users/${admin.id}/role`)
    it('role change without a token -> 401', async () => {
      const admin = await createUserViaDb({ name: 'Admin2', email: uniqueEmail(), password: 'password123', role: 'ADMINISTRATOR' });
      const res = await request(app)
        .patch(`${API}/users/${admin.id}/role`)
        .send({ role: 'CHOIR_DIRECTOR' });
      assert.equal(res.status, 401);
    });      const victim = await registerTracked('Victim2', uniqueEmail(), 'password123');
      const res = await request(app)
        .patch(`${API}/users/${victim.body.user.id}/role`)
        .set('Authorization', `Bearer ${adminLogin.body.token}`)
        .send({ role: 'SUPER_USER' });
      assert.equal(res.status, 400);
    });

    it('role change on unknown user -> 404', async () => {
      const admin = await createUserViaDb({ name: 'Admin4', email: uniqueEmail(), password: 'password123', role: 'ADMINISTRATOR' });
      const adminLogin = await login(admin.email, 'password123');
      const res = await request(app)
        .patch(`${API}/users/00000000-0000-4000-8000-000000000000/role`)
        .set('Authorization', `Bearer ${adminLogin.body.token}`)
        .send({ role: 'CHOIR_DIRECTOR' });
      assert.equal(res.status, 404);
    });
  });
});