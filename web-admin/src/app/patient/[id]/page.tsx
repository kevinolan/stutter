'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { fetchSummary, getSession, type UserSummary } from '@/lib/api';

export default function PatientPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [summary, setSummary] = useState<UserSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const s = getSession();
    if (!s) {
      setError('Not signed in');
      return;
    }
    fetchSummary(id)
      .then(setSummary)
      .catch(() => setError('Could not load this patient'));
  }, [id]);

  return (
    <main className="container">
      <a className="link" href="/">&larr; Back to patients</a>
      {error && <div className="error">{error}</div>}
      {summary && (
        <>
          <h1>{summary.displayName}</h1>
          <div className="badge">{summary.email}</div>
          <div className="card">
            <div className={`trend-${summary.trend}`} style={{ fontWeight: 600 }}>
              {summary.trend === 'up' ? '▲ Worsening trend' : summary.trend === 'down' ? '▼ Improving trend' : '■ Steady'}
            </div>
            <div className="summary">
              <div className="stat"><div className="k">Recorded sessions</div><div className="v">{summary.metricCount}</div></div>
              <div className="stat"><div className="k">Avg P(stutter)</div><div className="v">{summary.avgPStutter === null ? '—' : `${(summary.avgPStutter * 100).toFixed(0)}%`}</div></div>
              <div className="stat"><div className="k">Avg disfluencies</div><div className="v">{summary.avgDisfluencies?.toFixed(1) ?? '—'}</div></div>
              <div className="stat"><div className="k">Avg rate/min</div><div className="v">{summary.avgRatePerMin?.toFixed(0) ?? '—'}</div></div>
              <div className="stat"><div className="k">First session</div><div className="v" style={{ fontSize: '0.9rem' }}>{summary.earliestAt ? new Date(summary.earliestAt).toLocaleDateString() : '—'}</div></div>
              <div className="stat"><div className="k">Latest session</div><div className="v" style={{ fontSize: '0.9rem' }}>{summary.latestAt ? new Date(summary.latestAt).toLocaleDateString() : '—'}</div></div>
            </div>
          </div>
          <p className="footer-hint">
            Trend is a least-squares slope over chronological P(stutter) (falls back to disfluencies when
            P(stutter) is sparse). &quot;Improving&quot; means the disfluency/score signal is decreasing over time.
          </p>
        </>
      )}
    </main>
  );
}
