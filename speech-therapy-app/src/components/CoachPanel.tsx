import { useState, useRef, useEffect } from 'react';
import { useRenderPerf } from '../utils/perf';
import { runAgent, type AgentResult } from '../lib/agent';
import { summarizeMetrics } from '../lib/metricsStore';

interface Props {
  streak: number;
}

const QUICK_PROMPTS = [
  "I'm nervous about a presentation tomorrow.",
  'How do I handle a block mid-sentence?',
  'What should I practice today?',
  'I feel like giving up.',
];

export default function CoachPanel({ streak }: Props) {
  useRenderPerf('CoachPanel');
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<{ from: 'user' | 'coach'; text: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [usingLocal, setUsingLocal] = useState<boolean | null>(null);
  const [dataContext, setDataContext] = useState<string>('');
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;

    const history = messages.map(m => ({
      role: (m.from === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: m.text,
    }));

    setMessages(prev => [...prev, { from: 'user', text: trimmed }]);
    setInput('');
    setBusy(true);

    // v1 offline agent: reads the user's measured fluency signal and asks the coach.
    const result: AgentResult = await runAgent({ message: trimmed, history });
    setUsingLocal(result.local);
    setDataContext(result.dataContext);
    setMessages(prev => [...prev, { from: 'coach', text: result.reply }]);
    setBusy(false);
  }

  const summary = summarizeMetrics();

  return (
    <div>
      <h2 className="section-heading">🤖 Fluency Coach</h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: '1.25rem', fontSize: '0.9rem' }}>
        A supportive coach for practice motivation and technique tips. Works offline with a
        built-in coach; connect an LLM in <code>.env.local</code> for more personalized replies.
      </p>

      <div className="card metrics-card">
        <div className="card-title">📈 Your measured signal <span className="offline-badge">100% offline</span></div>
        <p className="metrics-headline">{summary.headline}</p>
        {dataContext && dataContext !== summary.headline && (
          <p className="metrics-datacontext">{dataContext}</p>
        )}
        {streak > 0 && (
          <p className="metrics-streak">🔥 {streak}-day practice streak</p>
        )}
        <p className="fluency-note">
          Aggregated on-device from your recordings (model P(stutter) + technique counts).
          The coach below reasons over this — nothing leaves your device.
        </p>
      </div>

      <div className="coach-card">
        <div className="coach-chat" ref={scrollRef}>
          {messages.length === 0 && (
            <div className="coach-empty">
              👋 I'm your Fluency Coach. Tell me how practice is going, or tap a prompt below.
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`coach-msg coach-${m.from}`}>
              {m.text}
            </div>
          ))}
          {busy && <div className="coach-msg coach-coach coach-typing">Coach is typing…</div>}
        </div>

        {usingLocal === true && messages.length > 0 && (
          <div className="coach-mode-note">Using the built-in offline coach.</div>
        )}

        <div className="coach-quick">
          {QUICK_PROMPTS.map(p => (
            <button key={p} className="coach-chip" onClick={() => send(p)} disabled={busy}>
              {p}
            </button>
          ))}
        </div>

        <form
          className="coach-input-row"
          onSubmit={e => {
            e.preventDefault();
            send(input);
          }}
        >
          <input
            className="coach-input"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Ask your coach…"
            aria-label="Message the coach"
            disabled={busy}
          />
          <button className="btn-primary btn-icon" type="submit" disabled={busy || !input.trim()}>
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
