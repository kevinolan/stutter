import AsyncStorage from '@react-native-async-storage/async-storage';

const HISTORY_KEY = 'speechpal_practice_history_v1';
const MAX_SESSIONS = 250;

export type PracticePathway = 'pronunciation' | 'fluency';

export interface PracticeSession {
  id: string;
  pathway: PracticePathway;
  exerciseTitle: string;
  prompt?: string;
  createdAt: string;
  durationSec: number;
  pStutter: number | null;
  wordCount: number;
  disfluencies: number;
  easeRating: number;
  feedback: string;
}

export async function getPracticeHistory(): Promise<PracticeSession[]> {
  const raw = await AsyncStorage.getItem(HISTORY_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is PracticeSession =>
      Boolean(
        item &&
        typeof item.id === 'string' &&
        (item.pathway === 'pronunciation' || item.pathway === 'fluency') &&
        typeof item.createdAt === 'string'
      )
    );
  } catch {
    return [];
  }
}

export async function savePracticeSession(session: PracticeSession): Promise<void> {
  const sessions = await getPracticeHistory();
  const withoutDuplicate = sessions.filter((item) => item.id !== session.id);
  await AsyncStorage.setItem(
    HISTORY_KEY,
    JSON.stringify([session, ...withoutDuplicate].slice(0, MAX_SESSIONS)),
  );
}

export async function clearPracticeHistory(): Promise<void> {
  await AsyncStorage.removeItem(HISTORY_KEY);
}
