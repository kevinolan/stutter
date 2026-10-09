import type { SessionStats } from '../utils/stats';

interface StatCard {
  icon: string;
  value: string | number;
  label: string;
}

interface Props {
  stats: SessionStats;
  /** Optional override for the "achievements" card (used by ProgressTracker). */
  achievements?: { unlocked: number; total: number };
  extraCards?: StatCard[];
}

/** Reusable headline-stats grid used by both Dashboard and ProgressTracker. */
export default function StatsGrid({ stats, achievements, extraCards = [] }: Props) {
  const cards: StatCard[] = [
    { icon: '📅', value: stats.totalSessions, label: 'Total Sessions' },
    { icon: '⏱️', value: stats.totalMinutes, label: 'Minutes Practiced' },
    ...(achievements
      ? [{ icon: '🏆', value: `${achievements.unlocked}/${achievements.total}`, label: 'Achievements' }]
      : [{ icon: '🏆', value: Math.floor(stats.totalSessions / 3), label: 'Badges Earned' }]),
    { icon: '🔥', value: stats.streak, label: 'Day Streak' },
    ...extraCards,
  ];

  return (
    <div className="stats-grid">
      {cards.map(c => (
        <div className="stat-card" key={c.label}>
          <span className="stat-card-icon">{c.icon}</span>
          <span className="stat-card-value">{c.value}</span>
          <span className="stat-card-label">{c.label}</span>
        </div>
      ))}
    </div>
  );
}
