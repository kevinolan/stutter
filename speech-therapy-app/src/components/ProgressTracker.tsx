import type { Session } from '../hooks/useSessions';
import { useRenderPerf } from '../utils/perf';
import { formatDate } from '../utils/helpers';
import { summarize } from '../utils/stats';
import StatsGrid from './StatsGrid';

interface Props {
  sessions: Session[];
  onClear: () => void;
}

interface Achievement {
  id: string;
  icon: string;
  name: string;
  desc: string;
  unlocked: boolean;
}

export default function ProgressTracker({ sessions, onClear }: Props) {
  useRenderPerf('ProgressTracker');
  const stats = summarize(sessions);
  const { totalSessions, totalMinutes, streak } = stats;

  const achievements: Achievement[] = [
    { id: 'first', icon: '🎉', name: 'First Step', desc: 'Complete first session', unlocked: totalSessions >= 1 },
    { id: 'three', icon: '🥉', name: 'Getting Started', desc: '3 sessions done', unlocked: totalSessions >= 3 },
    { id: 'ten', icon: '🥈', name: 'Consistent', desc: '10 sessions done', unlocked: totalSessions >= 10 },
    { id: 'thirty', icon: '🥇', name: 'Dedicated', desc: '30 sessions done', unlocked: totalSessions >= 30 },
    { id: 'hour', icon: '⏱️', name: '1 Hour', desc: '60 minutes practiced', unlocked: totalMinutes >= 60 },
    { id: 'fivehour', icon: '🕔', name: '5 Hours', desc: '300 minutes practiced', unlocked: totalMinutes >= 300 },
    { id: 'streak3', icon: '🔥', name: '3-Day Streak', desc: '3 days in a row', unlocked: streak >= 3 },
    { id: 'streak7', icon: '🌟', name: 'Week Strong', desc: '7 days in a row', unlocked: streak >= 7 },
    { id: 'breathing', icon: '🌬️', name: 'Breath Master', desc: '5 breathing sessions', unlocked: sessions.filter(s => s.type === 'breathing').length >= 5 },
    { id: 'speech', icon: '🗣️', name: 'Speaker', desc: '5 speech exercises', unlocked: sessions.filter(s => s.type === 'exercises').length >= 5 },
    { id: 'recording', icon: '🎙️', name: 'Recorded', desc: '3 voice recordings', unlocked: sessions.filter(s => s.type === 'recorder').length >= 3 },
    { id: 'all', icon: '🏅', name: 'All Rounder', desc: 'Try all 4 activity types', unlocked: new Set(sessions.map(s => s.type)).size >= 4 },
  ];

  const unlockedCount = achievements.filter(a => a.unlocked).length;

  // Weekly activity heatmap (last 7 days)
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d.toISOString().slice(0, 10);
  });
  const dayCounts: Record<string, number> = {};
  sessions.forEach(s => {
    const day = s.date.slice(0, 10);
    dayCounts[day] = (dayCounts[day] ?? 0) + 1;
  });

  return (
    <div className="progress-section">
      <h2 className="section-heading">📊 Your Progress</h2>

      {streak > 0 && (
        <div className="streak-card">
          <span className="streak-fire">🔥</span>
          <div className="streak-info">
            <h3>{streak}-Day Streak!</h3>
            <p>Keep it up — consistency is the key to fluency improvement.</p>
          </div>
        </div>
      )}

      <StatsGrid
        stats={stats}
        achievements={{ unlocked: unlockedCount, total: achievements.length }}
      />

      {/* Weekly Activity */}
      <div className="card">
        <div className="card-title">📆 This Week</div>
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'space-between' }}>
          {weekDays.map(day => {
            const count = dayCounts[day] ?? 0;
            const dayLabel = new Date(day + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short' });
            const intensity = count === 0 ? 0 : count <= 1 ? 0.25 : count <= 3 ? 0.55 : 1;
            return (
              <div key={day} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.3rem' }}>
                <div
                  style={{
                    width: '100%',
                    aspectRatio: '1',
                    borderRadius: '6px',
                    background: `rgba(79,142,247,${intensity})`,
                    border: '1px solid var(--border)',
                    minWidth: '28px',
                  }}
                  title={`${dayLabel}: ${count} session${count !== 1 ? 's' : ''}`}
                />
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{dayLabel}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Activity breakdown */}
      <div className="card">
        <div className="card-title">📈 Activity Breakdown</div>
        {(['breathing', 'exercises', 'recorder', 'tips'] as const).map(type => {
          const count = sessions.filter(s => s.type === type).length;
          const icons: Record<string, string> = { breathing: '🌬️', exercises: '🗣️', recorder: '🎙️', tips: '💡' };
          const labels: Record<string, string> = { breathing: 'Breathing', exercises: 'Speech Exercises', recorder: 'Recordings', tips: 'Tips Viewed' };
          const pct = totalSessions > 0 ? Math.round((count / totalSessions) * 100) : 0;
          return (
            <div key={type} style={{ marginBottom: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', marginBottom: '0.2rem' }}>
                <span>{icons[type]} {labels[type]}</span>
                <span style={{ color: 'var(--text-muted)' }}>{count} ({pct}%)</span>
              </div>
              <div className="progress-bar-wrap">
                <div
                  className="progress-bar-fill"
                  style={{ width: `${pct}%`, background: 'var(--primary)' }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Achievements */}
      <div className="card">
        <div className="card-title">🏆 Achievements</div>
        <div className="achievements-grid">
          {achievements.map(a => (
            <div key={a.id} className={`achievement${a.unlocked ? ' unlocked' : ' achievement-locked'}`} title={a.desc}>
              <span className="achievement-icon">{a.icon}</span>
              <span className="achievement-name">{a.name}</span>
              {!a.unlocked && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{a.desc}</span>}
            </div>
          ))}
        </div>
      </div>

      {/* Session log */}
      {sessions.length > 0 && (
        <div className="card">
          <div className="card-title" style={{ justifyContent: 'space-between' }}>
            <span>🕐 Session History</span>
            <button
              className="btn-ghost btn-sm"
              onClick={() => { if (confirm('Clear all session history?')) onClear(); }}
            >
              Clear
            </button>
          </div>
          <div className="session-log">
            {sessions.slice(0, 20).map(s => (
              <div className="session-entry" key={s.id}>
                <span className="session-icon">{s.icon}</span>
                <div className="session-info">
                  <div className="session-title">{s.label}</div>
                  <div className="session-meta">
                    {formatDate(s.date)} · {s.durationSec}s
                  </div>
                </div>
                <span className="badge badge-primary">{s.type}</span>
              </div>
            ))}
          </div>
          {sessions.length > 20 && (
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.5rem', textAlign: 'center' }}>
              Showing 20 of {sessions.length} sessions
            </p>
          )}
        </div>
      )}

      {sessions.length === 0 && (
        <div className="card" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🌱</div>
          <p>No sessions yet — start your first exercise to begin tracking progress!</p>
        </div>
      )}
    </div>
  );
}
