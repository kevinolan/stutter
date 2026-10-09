/**
 * Lightweight, on-device fluency / stutter-marker analyzer.
 *
 * This implements the "recognition" half of the project's goal ("controlled
 * synthesis and recognition of stutter speech") without requiring an ML model:
 * it scans a live transcript for surface stuttering behaviors — part-word
 * repetitions ("I-I-I"), sound prolongations ("Mmmmy name"), and blocks
 * ("—" / "..." in the middle of a word) — and reports simple, encouraging
 * metrics. Everything runs in the browser; nothing is uploaded.
 *
 * This is a heuristic signal for self-awareness, NOT a clinical diagnosis.
 */

export interface FluencyReport {
  wordCount: number;
  repetitions: number;
  prolongations: number;
  blocks: number;
  /** Estimated count of disfluent events (repetitions + prolongations + blocks). */
  disfluencies: number;
  /** Rough syllables-per-minute proxy for speech rate (0 if < 1s). */
  ratePerMin: number;
  /** Marked-up transcript with disfluencies wrapped in markers for display. */
  highlights: FluencyToken[];
  /** A short, encouraging human-readable summary. */
  summary: string;
}

export type FluencyToken =
  | { text: string; kind: 'normal' }
  | { text: string; kind: 'repetition' }
  | { text: string; kind: 'prolongation' }
  | { text: string; kind: 'block' };

const REPETITION_RE = /\b(\w)\s*-\s*\1(?:\s*-\s*\1+)?\b/;
// Leading repeated letter run before a word boundary, e.g. "Mmmmy", "sssso".
const PROLONGATION_RE = /\b([bcdfghjklmnpqrstvwxyz])\1{2,}/i;
const BLOCK_TOKENS = ['—', '...', '…', '––', '--'];

/**
 * Analyze a transcript for disfluency markers.
 * @param transcript Raw transcript text.
 * @param durationSec Optional speaking duration to compute a rate.
 */
export function analyzeFluency(transcript: string, durationSec = 0): FluencyReport {
  const tokens: FluencyToken[] = [];
  let repetitions = 0;
  let prolongations = 0;
  let blocks = 0;

  // Split into words, keeping block punctuation as their own tokens.
  const rawWords = transcript.split(/\s+/).filter(Boolean);

  for (const w of rawWords) {
    // Block markers (pauses/blocks the user inserted) count as a disfluency.
    if (BLOCK_TOKENS.includes(w)) {
      blocks += 1;
      tokens.push({ text: w, kind: 'block' });
      continue;
    }

    if (REPETITION_RE.test(w)) {
      repetitions += 1;
      tokens.push({ text: w, kind: 'repetition' });
      continue;
    }

    if (PROLONGATION_RE.test(w)) {
      prolongations += 1;
      tokens.push({ text: w, kind: 'prolongation' });
      continue;
    }

    tokens.push({ text: w, kind: 'normal' });
  }

  const wordCount = rawWords.filter(w => !BLOCK_TOKENS.includes(w)).length;
  const disfluencies = repetitions + prolongations + blocks;
  const ratePerMin = durationSec >= 1 ? Math.round((wordCount / durationSec) * 60) : 0;

  const summary = buildSummary({ wordCount, repetitions, prolongations, blocks, disfluencies });

  return { wordCount, repetitions, prolongations, blocks, disfluencies, ratePerMin, highlights: tokens, summary };
}

function buildSummary(r: { wordCount: number; repetitions: number; prolongations: number; blocks: number; disfluencies: number }): string {
  if (r.wordCount === 0) return 'Say a few words while recording to see your fluency feedback here.';
  if (r.disfluencies === 0) {
    return `Nice smooth run — ${r.wordCount} words with no marked disfluencies. Keep this pace.`;
  }
  const parts: string[] = [];
  if (r.repetitions) parts.push(`${r.repetitions} repetition${r.repetitions > 1 ? 's' : ''}`);
  if (r.prolongations) parts.push(`${r.prolongations} prolongation${r.prolongations > 1 ? 's' : ''}`);
  if (r.blocks) parts.push(`${r.blocks} block${r.blocks > 1 ? 's' : ''}`);
  return `Spotted ${parts.join(', ')} across ${r.wordCount} words. Notice the moments, then try a pull-out or cancellation there — that's how control grows.`;
}
