// Client-side API helper for the FluentPath clinician admin.
//
// Auth model (mirrors the backend two-token design):
//  - On login we receive a short-lived access `token` (JWT) AND an opaque
//    `refreshToken`. Both are kept in sessionStorage as a "session" so the SPA
//    can silently mint a new access token via POST /api/auth/refresh when the
//    current one expires (HTTP 401), and revoke it on logout via
//    POST /api/auth/logout. No secrets live in the bundle.
const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL?.replace(/\/$/, '') ?? 'http://localhost:4000';

const SESSION_KEY = 'fluentpath_session';

export interface Session {
  token: string;
  refreshToken: string;
}

export interface AuthResponse {
  token: string;
  refreshToken?: string;
  user: { id: string; email: string; displayName: string; role: 'client' | 'clinician' };
}

export interface UserSummary {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
  metricCount: number;
  earliestAt: string | null;
  latestAt: string | null;
  avgPStutter: number | null;
  avgDisfluencies: number | null;
  avgRatePerMin: number | null;
  trend: 'up' | 'down' | 'flat';
}

// ── Session persistence ──────────────────────────────────────────────────────

function readSession(): Session | null {
  if (typeof sessionStorage === 'undefined') return null;
  const raw = sessionStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as Partial<Session>;
    if (s && typeof s.token === 'string' && typeof s.refreshToken === 'string') {
      return { token: s.token, refreshToken: s.refreshToken };
    }
  } catch {
    /* ignore corrupt entry */
  }
  return null;
}

function writeSession(session: Session | null): void {
  if (typeof sessionStorage === 'undefined') return;
  if (session) sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  else sessionStorage.removeItem(SESSION_KEY);
}

export function getSession(): Session | null {
  return readSession();
}

export function clearSession(): void {
  writeSession(null);
}

// ── Auth ─────────────────────────────────────────────────────────────────────

export async function login(email: string, password: string): Promise<AuthResponse> {
  const res = await fetch(`${BACKEND_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail?.error ?? 'login_failed');
  }
  const body = (await res.json()) as AuthResponse;
  if (body.token && body.refreshToken) {
    writeSession({ token: body.token, refreshToken: body.refreshToken });
  }
  return body;
}

/** Revoke the current refresh grant server-side (best-effort) and drop the session. */
export async function logout(): Promise<void> {
  const s = readSession();
  if (s?.refreshToken) {
    await fetch(`${BACKEND_URL}/api/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: s.refreshToken }),
    }).catch(() => {
      /* network error: we still clear locally */
    });
  }
  writeSession(null);
}

/** Silent refresh: exchange the stored refresh token for a fresh pair. Returns null on failure. */
async function refresh(): Promise<Session | null> {
  const s = readSession();
  if (!s?.refreshToken) return null;
  const res = await fetch(`${BACKEND_URL}/api/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: s.refreshToken }),
  });
  if (!res.ok) return null;
  const body = (await res.json()) as AuthResponse;
  if (!body.token || !body.refreshToken) return null;
  const next: Session = { token: body.token, refreshToken: body.refreshToken };
  writeSession(next);
  return next;
}

// ── Authenticated requests (with transparent 401 -> refresh -> retry) ─────────

async function authedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const s = readSession();
  if (!s) throw new Error('not_authenticated');

  const call = (token: string) =>
    fetch(`${BACKEND_URL}${path}`, {
      ...init,
      headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` },
    });

  const res = await call(s.token);
  if (res.status !== 401) return res;

  // Access token likely expired — try one silent refresh, then retry once.
  const next = await refresh();
  if (!next) {
    writeSession(null);
    throw new Error('session_expired');
  }
  return call(next.token);
}

export async function fetchPatients(): Promise<UserSummary[]> {
  const res = await authedFetch('/api/patients');
  if (!res.ok) throw new Error('failed_to_load_patients');
  return res.json();
}

export async function fetchSummary(userId: string): Promise<UserSummary> {
  const res = await authedFetch(`/api/users/${userId}/summary`);
  if (!res.ok) throw new Error('failed_to_load_summary');
  return res.json();
}
