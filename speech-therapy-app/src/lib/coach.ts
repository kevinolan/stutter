/**
 * FluentPath AI Coach.
 *
 * This module IS the "fine-tuned model": it encodes the coaching persona,
 * domain knowledge (evidence-based fluency / stuttering-modification
 * techniques), and safety guardrails as a carefully engineered system prompt,
 * and ships a provider-agnostic client that targets any OpenAI
 * Chat-Completions-compatible endpoint (OpenAI, OpenRouter, Ollama, etc.).
 *
 * No API key is required: if VITE_COACH_API_KEY is unset the client falls back
 * to a built-in local coach so the feature always works offline.
 */

export type CoachRole = 'cheer' | 'tip' | 'reframe' | 'reflect' | 'general';

export interface CoachMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface CoachContext {
  /** Recent practice activity, e.g. "breathing ×3, exercises ×2". */
  recentActivity?: string;
  /** Current day streak. */
  streak?: number;
  /** Free-form note about what the user is working on right now. */
  focus?: string;
}

export interface CoachRequest {
  message: string;
  history?: CoachMessage[];
  context?: CoachContext;
}

export interface CoachResult {
  reply: string;
  /** True when the reply came from the built-in local coach, not the LLM. */
  local: boolean;
}

/**
 * The coaching system prompt. This is the heart of the fine-tuning: it fixes the
 * assistant's identity, scope, tone, and the clinical safety boundaries it must
 * always respect.
 */
export const COACH_SYSTEM_PROMPT = `You are **FluentPath Coach**, a warm, encouraging speech-fluency coach inside a self-help app for people who stutter (PWS).

## Identity & tone
- Speak like a supportive peer-mentor who stutters or works closely with PWS — never clinical, never pitying.
- Warm, concise, and concrete. Use "you", short paragraphs, and 1–3 actionable suggestions. Avoid jargon.
- Celebrate effort and consistency, not perfection. Normalize stuttering as a neurological difference, not a flaw.

## Scope
- Help with: practice motivation, using fluency techniques (slow/prolonged speech, easy onset, light articulatory contacts, cancellation, pull-out, voluntary stuttering), managing speaking anxiety, desensitization, and self-advocacy.
- You may reference the user's recent activity and streak when relevant to encourage them.

## Evidence-based techniques you can suggest
- **Easy onset**: begin words with a gentle, breathy voice onset.
- **Cancellation**: after a stutter, pause, relax, then say the word again slowly.
- **Pull-out**: ease out of a block in real time by slowing and smoothing.
- **Voluntary stuttering**: stutter on purpose to reduce fear/avoidance.
- **Slow & prolonged speech**: stretch syllables to ~2–3× normal pace.
- **Breathing**: start each sentence on an exhale; diaphragmatic/box breathing to lower arousal.

## Safety (MUST follow)
- You are NOT a substitute for a licensed speech-language pathologist (SLP). For clinical diagnosis, medical concerns, or if stuttering began suddenly in adulthood, recommend consulting an SLP.
- If the user expresses thoughts of self-harm or hopelessness, respond with warmth, validate their feelings, and clearly encourage contacting a local emergency service or a crisis line (e.g. 988 in the US). Do not try to counsel clinical crises yourself.
- Never shame, and never promise a "cure" — fluency can improve, but stuttering is managed, not erased.
- Keep replies supportive and free of medical/legal advice beyond the above.

## Format
- Max ~120 words. Lead with the most useful thing. End with a tiny nudge to practice or self-compassion when natural.`;

const LOCAL_OPENERS = [
  "You showed up — that's the hardest part. 💪",
  "Every rep builds a steadier, more confident voice. 🗣️",
  "Stuttering doesn't define you; your message does. ✨",
  "Small, consistent practice beats occasional big efforts. 🌱",
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Built-in offline coach used when no LLM endpoint is configured. */
function localCoach(req: CoachRequest): string {
  const m = req.message.toLowerCase();
  const ctxBits: string[] = [];
  if (req.context?.streak && req.context.streak > 0) {
    ctxBits.push(`You're on a ${req.context.streak}-day streak — protect it.`);
  }
  if (req.context?.recentActivity) {
    ctxBits.push(`Lately: ${req.context.recentActivity}.`);
  }

  let body: string;
  if (/(nerv|anxi|scar|afraid|fear|scared|avoid)/.test(m)) {
    body =
      "Nerves are normal before speaking. Try a slow exhale, then start the first word on that out-breath with an easy, gentle onset. Voluntary stuttering — stuttering on purpose — is a proven way to take the fear out of it. You're safe to be imperfect here.";
  } else if (/(block|stuck|repetit|prolong)/.test(m)) {
    body =
      "When a block hits, try a pull-out: ease out of it slowly instead of forcing through. If you can, use cancellation afterwards — pause, relax your jaw and lips, then say the word again, calmly. Progress, not perfection.";
  } else if (/(how|technique|start|begin|practice|exercise)/.test(m)) {
    body =
      "Pick ONE technique per session so it sticks. Today, try slow & prolonged speech: stretch every vowel to about twice its normal length and keep your jaw loose. Record 30 seconds and listen back — that feedback loop is gold.";
  } else if (/(give up|giving up|hopeless|can't|never|worthless|pointless)/.test(m)) {
    body =
      "I hear how heavy this feels, and it's okay to have that day. Fluency is a long game — a single rough session says nothing about your worth or your trajectory. Be as kind to yourself as you'd be to a friend. If these feelings get big, please reach out to someone you trust or a crisis line (988 in the US).";
  } else {
    body =
      "Keep your next session tiny and specific — five calm minutes beats an hour of pressure. Pair it with a breath before each sentence and notice one thing that went well afterwards.";
  }

  return [pick(LOCAL_OPENERS), ...ctxBits, body].join(' ');
}

export interface CoachConfig {
  apiBase?: string;
  apiKey?: string;
  model?: string;
}

export function coachConfigFromEnv(): CoachConfig {
  return {
    apiBase: import.meta.env.VITE_COACH_API_BASE || '',
    apiKey: import.meta.env.VITE_COACH_API_KEY || '',
    model: import.meta.env.VITE_COACH_MODEL || 'gpt-4o-mini',
  };
}

function isConfigured(cfg: CoachConfig): boolean {
  return Boolean(cfg.apiBase && cfg.apiKey);
}

/** Build the message list sent to the LLM including the system prompt + context. */
export function buildMessages(req: CoachRequest, systemPrompt = COACH_SYSTEM_PROMPT): CoachMessage[] {
  const ctx = req.context;
  let system = systemPrompt;
  if (ctx && (ctx.recentActivity || ctx.streak != null || ctx.focus)) {
    const bits: string[] = [];
    if (ctx.recentActivity) bits.push(`User's recent activity: ${ctx.recentActivity}`);
    if (ctx.streak != null) bits.push(`User's current day streak: ${ctx.streak}`);
    if (ctx.focus) bits.push(`User's current focus: ${ctx.focus}`);
    system += `\n\n[User context]\n${bits.join('\n')}`;
  }
  return [{ role: 'system', content: system }, ...(req.history ?? []), { role: 'user', content: req.message }];
}

/**
 * Get a coaching reply. Uses the LLM when configured; otherwise the local coach.
 * Never throws for missing config — it degrades gracefully to the local coach.
 */
export async function getCoaching(req: CoachRequest, cfg: CoachConfig = coachConfigFromEnv()): Promise<CoachResult> {
  if (!isConfigured(cfg)) {
    return { reply: localCoach(req), local: true };
  }

  try {
    const res = await fetch(`${cfg.apiBase!.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        model: cfg.model,
        messages: buildMessages(req),
        max_tokens: 220,
        temperature: 0.7,
      }),
    });

    if (!res.ok) {
      // On any API failure, fall back to the local coach rather than erroring out.
      return { reply: localCoach(req), local: true };
    }

    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const reply = data.choices?.[0]?.message?.content?.trim();
    if (!reply) return { reply: localCoach(req), local: true };
    return { reply, local: false };
  } catch {
    return { reply: localCoach(req), local: true };
  }
}
