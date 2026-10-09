import { useState, useRef } from 'react';
import type { Session } from '../hooks/useSessions';

interface Exercise {
  id: string;
  icon: string;
  title: string;
  shortDesc: string;
  fullDesc: string;
  steps: string[];
  prompts: string[];
}

const EXERCISES: Exercise[] = [
  {
    id: 'slow_speech',
    icon: '🐢',
    title: 'Slow & Prolonged Speech',
    shortDesc: 'Stretch syllables to 2–3× normal pace',
    fullDesc: 'Deliberately slowing your speech rate gives you more time to coordinate breathing, voicing, and articulation — reducing the chance of blocks and repetitions.',
    steps: [
      'Take a relaxed breath before starting.',
      'Stretch every vowel to at least 2 seconds: "Heeellooo".',
      'Keep your jaw and lips relaxed throughout.',
      'Gradually increase pace as fluency improves.',
    ],
    prompts: [
      'My name is…',
      'Today the weather is…',
      'I would like to order…',
      'Can you help me find…',
      'I am feeling…',
      'One thing I enjoy is…',
    ],
  },
  {
    id: 'easy_onset',
    icon: '🕊️',
    title: 'Easy Onset',
    shortDesc: 'Start sounds gently, without tension',
    fullDesc: 'Easy onset means beginning words with a smooth, light initiation of voice — avoiding the hard attacks that often trigger blocks and prolongations.',
    steps: [
      'Prepare your voice before the first word — let air flow first.',
      'Begin the first sound very gently, as if whispering.',
      'Gradually add volume while keeping the throat relaxed.',
      'Practice with single words, then phrases.',
    ],
    prompts: [
      'Apple',
      'Every morning I…',
      'Honestly, I think…',
      'Under the bridge…',
      'Actually, what I mean is…',
      'Even though it is hard…',
    ],
  },
  {
    id: 'light_contacts',
    icon: '🪶',
    title: 'Light Articulatory Contacts',
    shortDesc: 'Touch lips and tongue lightly to reduce tension',
    fullDesc: 'Hard contacts between lips, tongue, and teeth increase tension and trigger stuttering. Light contacts keep articulation fluid and effortless.',
    steps: [
      'Feel where your tongue and lips normally press together hard (e.g., "p", "b", "t", "d").',
      'Practice those sounds with only 50% of the usual contact pressure.',
      '"p" should feel barely there — not a strong pop.',
      'Move through words without "locking" on any sound.',
    ],
    prompts: [
      'Pineapple pie please.',
      'Better butter beats bad bread.',
      'Tell me the truth.',
      'People prefer peaceful places.',
      'David decided to dance.',
      'Totally tired today.',
    ],
  },
  {
    id: 'cancellation',
    icon: '🔄',
    title: 'Cancellation',
    shortDesc: 'Pause, relax, then reattempt the word',
    fullDesc: 'Cancellation is a stuttering modification technique: when you stutter on a word, pause, release all tension, then calmly say the word again. It builds control and reduces avoidance.',
    steps: [
      'When you stutter on a word, finish it anyway — don\'t stop mid-way.',
      'Pause for 1–2 seconds. Breathe.',
      'Notice where the tension was (throat, jaw, lips).',
      'Release that tension completely.',
      'Say the word again, slowly and easily.',
    ],
    prompts: [
      'Practice the word: "Wonderful"',
      'Practice the word: "Particular"',
      'Practice the phrase: "I want to say…"',
      'Practice the word: "Remember"',
      'Practice the phrase: "What I mean is…"',
      'Practice the word: "Conversation"',
    ],
  },
  {
    id: 'pull_out',
    icon: '🧲',
    title: 'Pull-Out Technique',
    shortDesc: 'Slide out of a stutter while it\'s happening',
    fullDesc: 'A pull-out modifies a stutter in real time: when you feel a block, instead of forcing through or stopping, you deliberately slow and smooth out the word.',
    steps: [
      'When you feel a block starting, don\'t panic — acknowledge it.',
      'Slow down deliberately while still on the sound.',
      'Ease out of the tension smoothly — like sliding off the sound.',
      'Complete the word slowly and fluently.',
      'Continue talking without dwelling on it.',
    ],
    prompts: [
      'Say: "I — I was going to say…"',
      'Say: "Sometimes I ——— struggle with words."',
      'Say: "The meeting is on ——— Monday."',
      'Say: "I want to ——— thank you."',
      'Say: "Could you please ——— help me?"',
    ],
  },
  {
    id: 'voluntary_stuttering',
    icon: '🎯',
    title: 'Voluntary Stuttering',
    shortDesc: 'Stutter on purpose to reduce fear',
    fullDesc: 'Intentionally introducing stutters into fluent speech reduces the fear and shame associated with stuttering. It teaches that stuttering is manageable and not catastrophic.',
    steps: [
      'Choose a word and deliberately add a repetition: "I-I-I want to go."',
      'Or add a prolongation: "Mmmmmmilk please."',
      'Notice that nothing bad happens — you can communicate!',
      'Start in low-stakes situations (practice alone, then trusted friends).',
      'Gradually use in more challenging situations.',
    ],
    prompts: [
      'Introduce yourself using voluntary stuttering.',
      'Order something (real or pretend) with a voluntary stutter.',
      'Tell someone your favourite hobby — stutter intentionally.',
      'Ask a question with a deliberate repetition.',
      '"M-m-may I help you?" — practice in mirror.',
    ],
  },
];

interface Props {
  onSessionComplete: (s: Omit<Session, 'id' | 'date'>) => void;
}

export default function SpeechExercises({ onSessionComplete }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [promptIdx, setPromptIdx] = useState(0);
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const startTimeRef = useRef<number>(0);

  const active = EXERCISES.find(e => e.id === activeId);

  function openExercise(id: string) {
    setActiveId(id);
    setPromptIdx(0);
    // eslint-disable-next-line react-hooks/purity
    startTimeRef.current = Date.now();
  }

  function nextPrompt() {
    if (!active) return;
    setPromptIdx(i => (i + 1) % active.prompts.length);
  }

  function markDone() {
    if (!active) return;
    // eslint-disable-next-line react-hooks/purity
    const elapsed = Math.round((Date.now() - startTimeRef.current) / 1000);
    onSessionComplete({
      type: 'exercises',
      label: active.title,
      icon: active.icon,
      durationSec: Math.max(elapsed, 30),
    });
    setCompleted(prev => new Set([...prev, active.id]));
    setActiveId(null);
  }

  return (
    <div>
      <h2 className="section-heading">🗣️ Speech Exercises</h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: '1.25rem', fontSize: '0.9rem' }}>
        Evidence-based fluency and stuttering-modification techniques used by speech-language pathologists.
        Start with the easiest exercise, repeat it until it feels natural, then move up gradually.
      </p>

      <div className="exercise-list">
        {EXERCISES.map(ex => (
          <button
            key={ex.id}
            className={`exercise-item${activeId === ex.id ? ' active' : ''}`}
            onClick={() => openExercise(ex.id)}
          >
            <span className="exercise-icon">{ex.icon}</span>
            <div className="exercise-info">
              <div className="exercise-title">
                {ex.title}
                {completed.has(ex.id) && (
                  <span className="badge badge-success" style={{ marginLeft: '0.5rem' }}>✓ Done</span>
                )}
              </div>
              <p className="exercise-desc">{ex.shortDesc}</p>
            </div>
            <span style={{ color: 'var(--text-muted)', fontSize: '1.1rem' }}>›</span>
          </button>
        ))}
      </div>

      {active && (
        <div className="exercise-detail">
          <div className="exercise-detail-title">{active.icon} {active.title}</div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1rem' }}>{active.fullDesc}</p>

          <div className="card-title" style={{ fontSize: '0.95rem' }}>How to practise</div>
          <ol className="exercise-steps">
            {active.steps.map((step, i) => (
              <li key={i} className="exercise-step">
                <span className="step-num">{i + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>

          <div className="card-title" style={{ fontSize: '0.95rem' }}>Practice prompt</div>
          <div className="exercise-prompt">
            "{active.prompts[promptIdx]}"
          </div>

          <div className="exercise-actions">
            <button className="btn-primary btn-icon" onClick={nextPrompt}>
              🔀 Next Prompt
            </button>
            <button className="btn-success btn-icon" onClick={markDone}>
              ✓ Mark Complete
            </button>
            <button className="btn-ghost btn-icon" onClick={() => setActiveId(null)}>
              ✕ Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
