import type { Session } from '../hooks/useSessions';

/** Calculates the current day streak (consecutive days up to and including today). */
export function calcStreak(sessions: Session[]): number {
  if (sessions.length === 0) return 0;
  const days = new Set(sessions.map(s => s.date.slice(0, 10)));
  let streak = 0;
  const today = new Date();
  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    if (days.has(d.toISOString().slice(0, 10))) {
      streak++;
    } else if (i > 0) {
      // Allow today to be incomplete (i === 0 can be missing)
      break;
    }
  }
  return streak;
}

/** Formats an ISO date string as a short locale date+time string. */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
