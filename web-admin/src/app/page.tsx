'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { login, logout, fetchPatients, getSession, type UserSummary } from '@/lib/api';

export default function HomePage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [patients, setPatients] = useState<UserSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // restore session
  useEffect(() => {
    const s = getSession();
    if (s) {
      setToken(s.token);
      loadPatients();
    }
  }, []);

  async function loadPatients() {
    try {
      setPatients(await fetchPatients());
    } catch {
      setError('Could not load patients (is the backend running + seeded?)');
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await login(email, password);
      setToken(res.token);
      await loadPatients();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'login_failed');
    } finally {
      setBusy(false);
    }
  }

  async function onLogout() {
    await logout();
    setToken(null);
    setPatients([]);
  }

  if (!token) {
    return (
      <main className="container">
        <h1>FluentPath — Clinician Login</h1>
        <form className="card" onSubmit={onSubmit}>
          <label htmlFor="email">Email</label>
          <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <label htmlFor="password">Password</label>
          <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <button type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
          {error && <div className="error">{error}</div>}
        </form>
        <p className="footer-hint">
          Default seed: <code>clinician@fluentpath.dev</code> / <code>fluentpath-dev-1234</code>
          <br />Set <code>NEXT_PUBLIC_BACKEND_URL</code> to point at your backend (default http://localhost:4000).
        </p>
      </main>
    );
  }

  return (
    <main className="container">
      <div className="row">
        <h1>Patients</h1>
        <button onClick={onLogout} style={{ marginTop: 0 }}>Log out</button>
      </div>
      {error && <div className="error">{error}</div>}
      {patients.length === 0 && <div className="card">No patients with recorded metrics yet.</div>}
      {patients.map((p) => (
        <a key={p.id} className="card listitem link" href={`/patient/${p.id}`}>
          <div className="row">
            <div>
              <strong>{p.displayName}</strong> <span className="badge">{p.email}</span>
            </div>
            <span className={`trend-${p.trend}`}>
              {p.trend === 'up' ? '▲ worsening' : p.trend === 'down' ? '▼ improving' : '■ steady'}
            </span>
          </div>
          <div className="summary">
            <div className="stat"><div className="k">Sessions</div><div className="v">{p.metricCount}</div></div>
            <div className="stat"><div className="k">Avg P(stutter)</div><div className="v">{p.avgPStutter === null ? '—' : `${(p.avgPStutter * 100).toFixed(0)}%`}</div></div>
            <div className="stat"><div className="k">Avg disfluencies</div><div className="v">{p.avgDisfluencies?.toFixed(1) ?? '—'}</div></div>
            <div className="stat"><div className="k">Rate/min</div><div className="v">{p.avgRatePerMin?.toFixed(0) ?? '—'}</div></div>
          </div>
        </a>
      ))}
    </main>
  );
}
