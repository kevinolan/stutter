import type { Session } from '../hooks/useSessions';
import { calcStreak } from './helpers';

export interface SessionStats {
  totalSessions: number;
  totalMinutes: number;
  streak: number;
  /** Sessions grouped by activity type. */
  byType: Record<Session['type'], number>;
  /** Distinct activity types the user has tried. */
  uniqueTypes: number;
}

/** Single source of truth for the headline stats shown on Dashboard and Progress. */
export function summarize(sessions: Session[]): SessionStats {
  const byType = {
    home: 0,
    breathing: 0,
    exercises: 0,
    recorder: 0,
    progress: 0,
    tips: 0,
  } as Record<Session['type'], number>;

  for (const s of sessions) {
    byType[s.type] = (byType[s.type] ?? 0) + 1;
  }

  return {
    totalSessions: sessions.length,
    totalMinutes: Math.round(sessions.reduce((a, s) => a + s.durationSec, 0) / 60),
    streak: calcStreak(sessions),
    byType,
    uniqueTypes: new Set(sessions.map(s => s.type)).size,
  };
}
