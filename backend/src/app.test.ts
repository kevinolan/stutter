import { describe, test, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { openMemoryDb, type DbHandle } from './db.js';
import { createApp } from './app.js';
import { signToken, issueRefreshToken } from './auth.js';
import { createUser, insertRefreshToken, findRefreshToken } from './repo.js';

function sampleMetric(over: Record<string, unknown> = {}) {
  return {
    id: 'm1',
    recordedAt: '2026-08-12T10:00:00.000Z',
    durationSec: 12,
    pStutter: 0.42,
    heuristic: {
      repetitions: 2,
      prolongations: 1,
      blocks: 0,
      wordCount: 40,
      ratePerMin: 180,
      disfluencies: 3,
    },
    ...over,
  };
}

function authHeader(claims: { sub: string; role: 'client' | 'clinician'; email: string }) {
  return `Bearer ${signToken(claims)}`;
}

describe('backend API (in-memory DB)', () => {
  let db: DbHandle;
  let app: ReturnType<typeof createApp>;

  beforeEach(async () => {
    db = await openMemoryDb();
    app = createApp(db);
  });

  test('GET /api/health (open)', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  test('POST /api/users accepts a valid client (open) and returns 201', async () => {
    const res = await request(app)
      .post('/api/users')
      .send({ email: 'a@b.com', displayName: 'Ada', role: 'client' });
    expect(res.status).toBe(201);
    expect(res.body.role).toBe('client');
  });

  test('POST /api/users rejects an invalid email with 400', async () => {
    const res = await request(app)
      .post('/api/users')
      .send({ email: 'not-an-email', displayName: 'Ada' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_user');
  });

  test('POST /api/users ignores a password on the public endpoint', async () => {
    const res = await request(app)
      .post('/api/users')
      .send({ email: 'sec@x.com', displayName: 'Sec', role: 'client', password: 'supersecret123' });
    expect(res.status).toBe(201);
    // Public create never stores a usable password -> cannot log in with it.
    const login = await request(app).post('/api/auth/login').send({ email: 'sec@x.com', password: 'supersecret123' });
    expect(login.status).toBe(401);
  });

  test('protected reads require a token', async () => {
    const res = await request(app).get('/api/users');
    expect(res.status).toBe(401);
  });

  test('login returns a token for a seeded clinician, and /api/me works', async () => {
    const clinician = createUser(db, { email: 'doc@x.com', displayName: 'Dr', role: 'clinician', password: 'password123' });
    db.persist();

    const login = await request(app).post('/api/auth/login').send({ email: 'doc@x.com', password: 'password123' });
    expect(login.status).toBe(200);
    expect(login.body.token).toBeTruthy();
    expect(login.body.user.role).toBe('clinician');

    const me = await request(app).get('/api/me').set('Authorization', `Bearer ${login.body.token}`);
    expect(me.status).toBe(200);
    expect(me.body.id).toBe(clinician.id);

    const badPw = await request(app).post('/api/auth/login').send({ email: 'doc@x.com', password: 'wrong' });
    expect(badPw.status).toBe(401);
  });

  test('clinician can list patients with summaries; client cannot', async () => {
    const clinician = createUser(db, { email: 'doc@x.com', displayName: 'Dr', role: 'clinician', password: 'password123' });
    const patient = createUser(db, { email: 'p@x.com', displayName: 'Pat', role: 'client' });
    db.persist();
    const token = authHeader({ sub: clinician.id, role: 'clinician', email: 'doc@x.com' });

    await request(app).post('/api/metrics').send({ userId: patient.id, deviceId: 'd', metrics: [sampleMetric()] });

    const patients = await request(app).get('/api/patients').set('Authorization', token);
    expect(patients.status).toBe(200);
    expect(patients.body.length).toBe(1);
    expect(patients.body[0].id).toBe(patient.id);
    expect(patients.body[0].avgDisfluencies).toBe(3);

    // a non-clinician token is forbidden
    const clientTok = authHeader({ sub: patient.id, role: 'client', email: 'p@x.com' });
    const forbidden = await request(app).get('/api/patients').set('Authorization', clientTok);
    expect(forbidden.status).toBe(403);
  });

  test('patient summary computes aggregates + trend', async () => {
    const clinician = createUser(db, { email: 'doc@x.com', displayName: 'Dr', role: 'clinician', password: 'password123' });
    const patient = createUser(db, { email: 'p@x.com', displayName: 'Pat', role: 'client' });
    db.persist();
    const token = authHeader({ sub: clinician.id, role: 'clinician', email: 'doc@x.com' });
    await request(app).post('/api/metrics').send({
      userId: patient.id,
      deviceId: 'd',
      metrics: [
        sampleMetric({ id: 'm1', pStutter: 0.1, recordedAt: '2026-08-12T09:00:00.000Z' }),
        sampleMetric({ id: 'm2', pStutter: 0.5, recordedAt: '2026-08-12T10:00:00.000Z' }),
        sampleMetric({ id: 'm3', pStutter: 0.9, recordedAt: '2026-08-12T11:00:00.000Z' }), // rising
      ],
    });
    const sum = await request(app).get(`/api/users/${patient.id}/summary`).set('Authorization', token);
    expect(sum.status).toBe(200);
    expect(sum.body.metricCount).toBe(3);
    expect(sum.body.avgPStutter).toBeCloseTo(0.5, 5);
    expect(sum.body.trend).toBe('up');
  });

  test('POST /api/metrics ingests a batch (open) and GET returns it (auth)', async () => {
    const user = await request(app)
      .post('/api/users')
      .send({ email: 'e@f.com', displayName: 'Eve' });
    const userId = user.body.id;

    const res = await request(app)
      .post('/api/metrics')
      .send({
        userId,
        deviceId: 'dev-1',
        metrics: [
          sampleMetric(),
          sampleMetric({ id: 'm2', pStutter: null, recordedAt: '2026-08-12T11:00:00.000Z' }),
        ],
      });
    expect(res.status).toBe(202);
    expect(res.body.accepted).toBe(2);

    // GET now requires auth
    const noAuth = await request(app).get(`/api/users/${userId}/metrics`);
    expect(noAuth.status).toBe(401);
    const got = await request(app)
      .get(`/api/users/${userId}/metrics`)
      .set('Authorization', authHeader({ sub: userId, role: 'client', email: 'e@f.com' }));
    expect(got.status).toBe(200);
    expect(got.body).toHaveLength(2);
  });

  test('POST /api/metrics rejects a malformed payload with 400', async () => {
    const res = await request(app)
      .post('/api/metrics')
      .send({ userId: 'u', deviceId: 'd', metrics: [{ id: 'x' }] }); // missing fields
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_metrics');
  });

  test('GET metrics for a non-existent user returns 404', async () => {
    const res = await request(app)
      .get('/api/users/ghost/metrics')
      .set('Authorization', authHeader({ sub: 'ghost', role: 'clinician', email: 'x' }));
    expect(res.status).toBe(404);
  });

  test('login returns a refresh token and /refresh mints a new access token', async () => {
    createUser(db, { email: 'doc@x.com', displayName: 'Dr', role: 'clinician', password: 'password123' });
    db.persist();

    const login = await request(app).post('/api/auth/login').send({ email: 'doc@x.com', password: 'password123' });
    expect(login.status).toBe(200);
    expect(login.body.refreshToken).toBeTruthy();

    const refresh = await request(app).post('/api/auth/refresh').send({ refreshToken: login.body.refreshToken });
    expect(refresh.status).toBe(200);
    expect(refresh.body.token).toBeTruthy();
    expect(refresh.body.refreshToken).toBeTruthy();

    // The new access token must authenticate /api/me.
    const me = await request(app).get('/api/me').set('Authorization', `Bearer ${refresh.body.token}`);
    expect(me.status).toBe(200);
    expect(me.body.email).toBe('doc@x.com');
  });

  test('/logout revokes the refresh token so /refresh fails afterwards', async () => {
    createUser(db, { email: 'doc@x.com', displayName: 'Dr', role: 'clinician', password: 'password123' });
    db.persist();
    const login = await request(app).post('/api/auth/login').send({ email: 'doc@x.com', password: 'password123' });
    const rt = login.body.refreshToken;

    const logout = await request(app).post('/api/auth/logout').send({ refreshToken: rt });
    expect(logout.status).toBe(204);

    const refresh = await request(app).post('/api/auth/refresh').send({ refreshToken: rt });
    expect(refresh.status).toBe(401);
  });

  test('/refresh rejects an unknown refresh token', async () => {
    const res = await request(app).post('/api/auth/refresh').send({ refreshToken: 'not-a-real-token' });
    expect(res.status).toBe(401);
  });

  test('/refresh requires a refreshToken body', async () => {
    const res = await request(app).post('/api/auth/refresh').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_refresh');
  });

  test('account locks after too many failed logins (per-email)', async () => {
    // LOGIN_MAX_ATTEMPTS defaults to 5 -> the 6th failure sets the lock, so the
    // 7th attempt is rejected before authentication even runs.
    for (let i = 0; i < 6; i++) {
      const r = await request(app)
        .post('/api/auth/login')
        .send({ email: 'lockme@x.com', password: 'wrong' });
      expect(r.status).toBe(401);
    }
    const locked = await request(app)
      .post('/api/auth/login')
      .send({ email: 'lockme@x.com', password: 'wrong' });
    expect(locked.status).toBe(429);
    expect(locked.body.error).toBe('account_locked');
    expect(locked.headers['retry-after']).toBeDefined();
  });

  test('per-IP rate limit triggers on the auth surface', async () => {
    // AUTH_RATE_LIMIT defaults to 20 (per 60s window). Use a distinct email
    // per request so the per-email lockout never fires; only the IP cap should.
    const statuses: number[] = [];
    for (let i = 0; i < 21; i++) {
      const r = await request(app)
        .post('/api/auth/login')
        .send({ email: `rl${i}@x.com`, password: 'wrong' });
      statuses.push(r.status);
    }
    expect(statuses.slice(0, 20).every((s) => s === 401)).toBe(true);
    expect(statuses[20]).toBe(429);
    const over = await request(app)
      .post('/api/auth/login')
      .send({ email: 'rl21@x.com', password: 'wrong' });
    expect(over.status).toBe(429);
    expect(over.body.error).toBe('rate_limited');
    expect(over.headers['retry-after']).toBeDefined();
  });

  test('rate limiting ignores spoofed forwarded IPs by default', async () => {
    for (let i = 0; i < 21; i++) {
      const r = await request(app)
        .post('/api/auth/login')
        .set('X-Forwarded-For', `198.51.100.${i + 1}`)
        .send({ email: `spoof${i}@x.com`, password: 'wrong' });
      expect(r.status).toBe(i < 20 ? 401 : 429);
    }
  });

  test('db.clear() also drops refresh tokens so a stale grant cannot be replayed', async () => {
    const u = createUser(db, { email: 'rt@x.com', displayName: 'RT', role: 'clinician', password: 'password123' });
    const rt = issueRefreshToken();
    insertRefreshToken(db, u.id, rt);
    expect(findRefreshToken(db, rt.hash)).not.toBeNull();
    db.clear();
    expect(findRefreshToken(db, rt.hash)).toBeNull();
  });
});
