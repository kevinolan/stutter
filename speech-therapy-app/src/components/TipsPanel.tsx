import { useState, useEffect, useRef } from 'react';
import { useRenderPerf } from '../utils/perf';
import type { Session } from '../hooks/useSessions';

interface Props {
  onSessionComplete: (s: Omit<Session, 'id' | 'date'>) => void;
}

const AFFIRMATIONS = [
  '"Stuttering does not define me — my voice matters."',
  '"Every word I speak is an act of courage."',
  '"Progress, not perfection."',
  '"I communicate with confidence and authenticity."',
  '"My ideas are worth hearing."',
  '"I embrace my voice exactly as it is."',
  '"Each practice session makes me stronger."',
  '"Millions of people stutter — I am not alone."',
  '"Speaking is a skill, and I am always improving."',
  '"I choose to speak up."',
];

const TIPS = [
  {
    icon: '🐢',
    title: 'Slow Down',
    body: 'Speaking slower gives your brain and vocal system more time to coordinate. Aim for a calm, deliberate pace — not rushed.',
  },
  {
    icon: '🌬️',
    title: 'Breathe First',
    body: 'Start every sentence with a breath. Let air flow before your first word. This reduces hard vocal attacks and tension.',
  },
  {
    icon: '👁️',
    title: 'Maintain Eye Contact',
    body: 'Look at the listener. It signals confidence and helps you stay present instead of retreating into fear.',
  },
  {
    icon: '🔊',
    title: 'Use Your Full Voice',
    body: 'Avoid whispering or reducing your volume to "hide" stuttering. Speaking at a comfortable volume actually helps fluency.',
  },
  {
    icon: '🧠',
    title: 'Reframe Stuttering',
    body: 'Stuttering is a neurological difference — not a personal failure. Changing how you think about it reduces its emotional power.',
  },
  {
    icon: '🎯',
    title: 'Prepare, Don\'t Script',
    body: 'Instead of memorizing exact words (which increases pressure), prepare the key ideas you want to convey.',
  },
  {
    icon: '🗺️',
    title: 'Approach Feared Situations',
    body: 'Avoidance grows the fear. Gently approach situations that feel challenging — phones, introductions, ordering food.',
  },
  {
    icon: '🤝',
    title: 'Disclose When Comfortable',
    body: 'Telling someone "I stutter" can dramatically reduce anxiety. Many people respond with empathy and patience.',
  },
  {
    icon: '🧘',
    title: 'Reduce Overall Tension',
    body: 'Exercise, sleep, and mindfulness reduce the general anxiety that worsens stuttering. Take care of your whole self.',
  },
  {
    icon: '👥',
    title: 'Join a Support Group',
    body: 'Organisations like NSA (USA), BSA (UK), and ASHA connect you with other people who stutter. Community is powerful.',
  },
];

const RESOURCES = [
  { label: 'National Stuttering Association (NSA)', url: 'https://www.stutteringhelp.org', region: '🇺🇸' },
  { label: 'British Stammering Association (BSA)', url: 'https://stamma.org', region: '🇬🇧' },
  { label: 'Stuttering Foundation', url: 'https://www.stutteringhelp.org', region: '🌍' },
  { label: 'American Speech-Language-Hearing Association (ASHA)', url: 'https://www.asha.org/public/speech/disorders/stuttering/', region: '🇺🇸' },
];

export default function TipsPanel({ onSessionComplete }: Props) {
  useRenderPerf('TipsPanel');
  const [affIdx, setAffIdx] = useState(() => Math.floor(Math.random() * AFFIRMATIONS.length));
  const [visible, setVisible] = useState(true);
  const startRef = useRef<number>(0);
  const mountedRef = useRef<boolean>(true);
  // Track pending setTimeout ids so we can cancel them on unmount.
  const pendingTimers = useRef<number[]>([]);

  function advanceAffirmation(fadeMs: number) {
    setVisible(false);
    const t = window.setTimeout(() => {
      if (!mountedRef.current) return;
      setAffIdx(i => (i + 1) % AFFIRMATIONS.length);
      setVisible(true);
    }, fadeMs);
    pendingTimers.current.push(t);
  }

  useEffect(() => {
    const id = window.setInterval(() => advanceAffirmation(400), 8000);
    return () => {
      clearInterval(id);
      pendingTimers.current.forEach(t => clearTimeout(t));
      pendingTimers.current = [];
    };
  }, []);

  useEffect(() => {
    // Record the mount time when the panel is shown, and log a session on the
    // *real* unmount — guarded so React 18/19 StrictMode's double-invoke does
    // not double-count.
    startRef.current = Date.now();
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      const elapsed = Math.round((Date.now() - startRef.current) / 1000);
      if (elapsed > 10) {
        onSessionComplete({
          type: 'tips',
          label: 'Reviewed Tips & Resources',
          icon: '💡',
          durationSec: elapsed,
        });
      }
    };
  }, [onSessionComplete]);

  function nextAffirmation() {
    advanceAffirmation(200);
  }

  return (
    <div>
      <h2 className="section-heading">💡 Tips & Support</h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: '1.25rem', fontSize: '0.9rem' }}>
        Evidence-based strategies, affirmations, and resources to support your journey step by step.
      </p>

      {/* Affirmations */}
      <div className="affirmations" style={{ marginBottom: '1.25rem' }}>
        <div className="card-title" style={{ justifyContent: 'center' }}>✨ Daily Affirmation</div>
        <p
          className="affirmation-text"
          style={{ opacity: visible ? 1 : 0 }}
        >
          {AFFIRMATIONS[affIdx]}
        </p>
        <div className="affirmation-controls">
          <button className="btn-outline btn-sm btn-icon" onClick={nextAffirmation}>
            🔀 Next
          </button>
        </div>
      </div>

      {/* Tips */}
      <h3 className="section-heading" style={{ fontSize: '1.1rem' }}>🧩 Practical Strategies</h3>
      <div className="tips-grid" style={{ marginBottom: '1.25rem' }}>
        {TIPS.map((tip, i) => (
          <div className="tip-card" key={i}>
            <div className="tip-icon">{tip.icon}</div>
            <div className="tip-title">{tip.title}</div>
            <p className="tip-body">{tip.body}</p>
          </div>
        ))}
      </div>

      {/* Understanding section */}
      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <div className="card-title">🔬 Understanding Stuttering</div>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
          Stuttering is a neurological speech disorder affecting approximately <strong>70 million people</strong> worldwide (about 1% of the population).
          It typically emerges in early childhood and involves disruptions in the forward flow of speech such as repetitions,
          prolongations, and blocks. The exact cause is multifactorial, involving genetics, neurological differences, and environmental factors.
        </p>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
          Effective management includes fluency shaping techniques, stuttering modification therapy, acceptance and commitment approaches,
          and support from speech-language pathologists (SLPs). There is no "cure", but with steady practice, confidence and fluency can improve over time.
        </p>
      </div>

      {/* Resources */}
      <div className="card">
        <div className="card-title">🌐 Resources & Support Organizations</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {RESOURCES.map(r => (
            <a
              key={r.label}
              href={r.url}
              target="_blank"
              rel="noopener noreferrer"
              className="resource-link"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.6rem',
                padding: '0.65rem 1rem',
                background: 'var(--surface2)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                textDecoration: 'none',
                color: 'var(--primary-dark)',
                fontWeight: 500,
                fontSize: '0.9rem',
                transition: 'all 0.18s',
              }}
            >
              <span>{r.region}</span>
              <span style={{ flex: 1 }}>{r.label}</span>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>↗</span>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
