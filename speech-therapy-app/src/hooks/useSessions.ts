import { useState, useCallback } from 'react';

export type Tab = 'home' | 'breathing' | 'exercises' | 'recorder' | 'progress' | 'tips' | 'coach';

const STORAGE_KEY = 'stt_sessions';

export interface Session {
  id: string;
  type: Tab;
  label: string;
  icon: string;
  date: string;
  durationSec: number;
}

function load(): Session[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    // Defensively validate the persisted shape — a corrupt or legacy value
    // must not crash the app at render time.
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidSession);
  } catch {
    return [];
  }
}

function isValidSession(s: unknown): s is Session {
  if (typeof s !== 'object' || s === null) return false;
  const o = s as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    typeof o.type === 'string' &&
    typeof o.label === 'string' &&
    typeof o.icon === 'string' &&
    typeof o.date === 'string' &&
    typeof o.durationSec === 'number'
  );
}

function newId(): string {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID();
    }
  } catch {
    // fall through to fallback
  }
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function save(sessions: Session[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  } catch {
    // localStorage may be full or unavailable (e.g. private mode) - fail silently.
  }
}

export function useSessions() {
  const [sessions, setSessions] = useState<Session[]>(load);

  const addSession = useCallback((s: Omit<Session, 'id' | 'date'>) => {
    setSessions(prev => {
      const next: Session[] = [
        { ...s, id: newId(), date: new Date().toISOString() },
        ...prev,
      ].slice(0, 100);
      save(next);
      return next;
    });
  }, []);

  const clearSessions = useCallback(() => {
    setSessions([]);
    save([]);
  }, []);

  return { sessions, addSession, clearSessions };
}
