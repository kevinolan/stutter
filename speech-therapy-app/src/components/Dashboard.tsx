import type { Session, Tab } from '../hooks/useSessions';
import { calcStreak, formatDate } from '../utils/helpers';

interface Props {
  sessions: Session[];
  onNavigate: (tab: Tab) => void;
}

export default function Dashboard({ sessions, onNavigate }: Props) {
  const totalSessions = sessions.length;
  const totalMinutes = Math.round(sessions.reduce((a, s) => a + s.durationSec, 0) / 60);
  const streak = calcStreak(sessions);
  const latestSession = sessions[0];
  const typeCounts = sessions.reduce<Record<string, number>>((acc, session) => {
    acc[session.type] = (acc[session.type] ?? 0) + 1;
    return acc;
  }, {});

  const recommendation = getNextRecommendation(typeCounts, latestSession?.type);
  const roadmap = [
    {
      id: 'settle',
      icon: '🌬️',
      title: 'Settle the body',
      goal: 'Breathing and tension release',
      detail: 'Start with short breathing drills to lower pressure before speaking.',
    },
    {
      id: 'shape',
      icon: '🐢',
      title: 'Shape the words',
      goal: 'Slow speech and easy onset',
      detail: 'Practice smoother starts and a gentler pace on safe prompts.',
    },
    {
      id: 'stretch',
      icon: '🗣️',
      title: 'Use the techniques',
      goal: 'Pull-outs and cancellations',
      detail: 'Work through blocks without forcing, then reset and try again.',
    },
    {
      id: 'carry',
      icon: '🎙️',
      title: 'Carry into daily speech',
      goal: 'Record, reflect, repeat',
      detail: 'Listen back, notice progress, and gently increase challenge over time.',
    },
  ];

  const currentStep = Math.min(Math.floor(totalSessions / 3), roadmap.length - 1);

  return (
    <div>
      <div className="dashboard-welcome">
        <h2>Welcome back! 👋</h2>
        <p>Keep going — every practice session builds confidence, control, and fluency one step at a time.</p>
        <span className="dashboard-wave" aria-hidden>🗣️</span>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <span className="stat-card-icon">📅</span>
          <span className="stat-card-value">{totalSessions}</span>
          <span className="stat-card-label">Total Sessions</span>
        </div>
        <div className="stat-card">
          <span className="stat-card-icon">⏱️</span>
          <span className="stat-card-value">{totalMinutes}</span>
          <span className="stat-card-label">Minutes Practiced</span>
        </div>
        <div className="stat-card">
          <span className="stat-card-icon">🔥</span>
          <span className="stat-card-value">{streak}</span>
          <span className="stat-card-label">Day Streak</span>
        </div>
        <div className="stat-card">
          <span className="stat-card-icon">🏆</span>
          <span className="stat-card-value">{calcBadges(totalSessions)}</span>
          <span className="stat-card-label">Badges Earned</span>
        </div>
      </div>

      <div className="card" style={{ marginTop: '1.25rem' }}>
        <div className="card-title">🎯 Next recommendation</div>
        <p style={{ marginTop: 0, color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          Based on your recent practice, the next best step is to keep the work small, repeatable, and low-pressure.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
            <span style={{ fontSize: '1.5rem' }} aria-hidden>{recommendation.icon}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, marginBottom: '0.2rem' }}>{recommendation.title}</div>
              <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>{recommendation.body}</div>
              {latestSession && (
                <div style={{ marginTop: '0.45rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Last session: {latestSession.label}
                </div>
              )}
            </div>
          </div>
          <button className="btn-primary btn-sm" onClick={() => onNavigate(recommendation.tab)}>
            Start {recommendation.buttonLabel}
          </button>
        </div>
      </div>

      <h3 className="section-heading">🚀 Quick Start</h3>
      <div className="quick-actions">
        <button className="quick-action-btn" onClick={() => onNavigate('breathing')}>
          <span className="quick-action-icon">🌬️</span>
          <span className="quick-action-label">Breathing Exercise</span>
          <span className="quick-action-sub">Calm nerves, steady breath</span>
        </button>
        <button className="quick-action-btn" onClick={() => onNavigate('exercises')}>
          <span className="quick-action-icon">🗣️</span>
          <span className="quick-action-label">Speech Practice</span>
          <span className="quick-action-sub">Fluency techniques</span>
        </button>
        <button className="quick-action-btn" onClick={() => onNavigate('recorder')}>
          <span className="quick-action-icon">🎙️</span>
          <span className="quick-action-label">Record & Listen</span>
          <span className="quick-action-sub">Hear your progress</span>
        </button>
        <button className="quick-action-btn" onClick={() => onNavigate('tips')}>
          <span className="quick-action-icon">💡</span>
          <span className="quick-action-label">Tips & Support</span>
          <span className="quick-action-sub">Techniques & motivation</span>
        </button>
      </div>

      <div className="card" style={{ marginTop: '1.25rem' }}>
        <div className="card-title">🌱 Your gradual path</div>
        <p style={{ marginTop: 0, color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          The goal is steady improvement, not perfection. Move through small steps, then repeat them until they feel easier.
        </p>
        <div className="achievements-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
          {roadmap.map((step, index) => (
            <div key={step.id} className={`achievement${index <= currentStep ? ' unlocked' : ' achievement-locked'}`}>
              <span className="achievement-icon">{step.icon}</span>
              <span className="achievement-name">{step.title}</span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center' }}>{step.goal}</span>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textAlign: 'center' }}>{step.detail}</span>
            </div>
          ))}
        </div>
      </div>

      {sessions.length > 0 && (
        <>
          <h3 className="section-heading" style={{ marginTop: '1.5rem' }}>🕐 Recent Activity</h3>
          <div className="session-log">
            {sessions.slice(0, 4).map(s => (
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
        </>
      )}
    </div>
  );
}

function calcBadges(sessions: number): number {
  return Math.floor(sessions / 3);
}

function getNextRecommendation(typeCounts: Record<string, number>, latestType?: string) {
  const breathing = typeCounts.breathing ?? 0;
  const exercises = typeCounts.exercises ?? 0;
  const recordings = typeCounts.recorder ?? 0;

  if (!latestType) {
    return {
      tab: 'breathing' as const,
      icon: '🌬️',
      title: 'Start with a reset breath',
      body: 'A breathing session is the easiest way to lower pressure before you speak.',
      buttonLabel: 'Breathing',
    };
  }

  if (latestType === 'breathing') {
    return {
      tab: 'exercises' as const,
      icon: '🗣️',
      title: 'Carry the calm into speech practice',
      body: 'You just settled your body, so now is a good time to practice slow speech or easy onset.',
      buttonLabel: 'Speech Practice',
    };
  }

  if (latestType === 'exercises') {
    return {
      tab: 'recorder' as const,
      icon: '🎙️',
      title: 'Listen back and notice what changed',
      body: 'Recording right after exercises helps you hear smoother starts and track small wins.',
      buttonLabel: 'Record & Listen',
    };
  }

  if (latestType === 'recorder') {
    return {
      tab: 'tips' as const,
      icon: '💡',
      title: 'Review one support strategy',
      body: 'Use a short tips session to reinforce one idea before your next practice round.',
      buttonLabel: 'Tips & Support',
    };
  }

  if (breathing < 3) {
    return {
      tab: 'breathing' as const,
      icon: '🌬️',
      title: 'Build your base with breathing',
      body: 'Do a short breathing session to lower tension and settle into a slower pace before speech practice.',
      buttonLabel: 'Breathing',
    };
  }

  if (exercises < 4) {
    return {
      tab: 'exercises' as const,
      icon: '🗣️',
      title: 'Practice one fluency technique',
      body: 'Work on slow speech, easy onset, or light contacts for a few minutes, then stop before fatigue sets in.',
      buttonLabel: 'Speech Practice',
    };
  }

  if (recordings < 2) {
    return {
      tab: 'recorder' as const,
      icon: '🎙️',
      title: 'Listen back and reflect',
      body: 'Record a short reading or self-introduction, then replay it to notice what already feels easier.',
      buttonLabel: 'Record & Listen',
    };
  }

  return {
    tab: 'tips' as const,
    icon: '💡',
    title: 'Reinforce the habit',
    body: 'Review one practical strategy, then return to the exercise you have been repeating most often.',
    buttonLabel: 'Tips & Support',
  };
}
