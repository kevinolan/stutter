import { useState, useEffect, useRef } from 'react';
import { useRenderPerf } from '../utils/perf';
import type { Session } from '../hooks/useSessions';

interface Technique {
  id: string;
  name: string;
  desc: string;
  phases: Phase[];
}

interface Phase {
  label: string;
  seconds: number;
  instruction: string;
  state: 'inhale' | 'hold' | 'exhale' | 'rest';
}

const TECHNIQUES: Technique[] = [
  {
    id: 'diaphragmatic',
    name: 'Diaphragmatic Breathing',
    desc: '4-4-6 pattern — reduces tension before speaking',
    phases: [
      { label: 'Inhale', seconds: 4, instruction: 'Breathe deeply into your belly. Feel it rise.', state: 'inhale' },
      { label: 'Hold', seconds: 4, instruction: 'Hold gently. Stay relaxed.', state: 'hold' },
      { label: 'Exhale', seconds: 6, instruction: 'Slowly release all air. Feel calm.', state: 'exhale' },
    ],
  },
  {
    id: 'box',
    name: 'Box Breathing',
    desc: '4-4-4-4 pattern — used by athletes and speakers',
    phases: [
      { label: 'Inhale', seconds: 4, instruction: 'Inhale slowly through your nose.', state: 'inhale' },
      { label: 'Hold', seconds: 4, instruction: 'Hold your breath comfortably.', state: 'hold' },
      { label: 'Exhale', seconds: 4, instruction: 'Exhale slowly through your mouth.', state: 'exhale' },
      { label: 'Rest', seconds: 4, instruction: 'Pause before the next cycle.', state: 'rest' },
    ],
  },
  {
    id: 'pursed',
    name: 'Pursed-Lip Breathing',
    desc: '2-4 pattern — slows breath, eases vocal tension',
    phases: [
      { label: 'Inhale', seconds: 2, instruction: 'Breathe in through your nose.', state: 'inhale' },
      { label: 'Exhale', seconds: 4, instruction: 'Breathe out slowly through pursed lips.', state: 'exhale' },
    ],
  },
];

interface Props {
  onSessionComplete: (s: Omit<Session, 'id' | 'date'>) => void;
}

export default function BreathingExercise({ onSessionComplete }: Props) {
  useRenderPerf('BreathingExercise');
  const [selectedId, setSelectedId] = useState(TECHNIQUES[0].id);
  const [running, setRunning] = useState(false);
  const [phaseIdx, setPhaseIdx] = useState(0);
  const [count, setCount] = useState(0);
  const [cycles, setCycles] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);

  const technique = TECHNIQUES.find(t => t.id === selectedId)!;
  const phase = technique.phases[phaseIdx];

  useEffect(() => {
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  function start() {
    setPhaseIdx(0);
    setCount(technique.phases[0].seconds);
    setCycles(0);
    setRunning(true);
    startTimeRef.current = Date.now();

    let pIdx = 0;
    let remaining = technique.phases[0].seconds;

    intervalRef.current = setInterval(() => {
      remaining -= 1;
      setCount(remaining);

      if (remaining <= 0) {
        pIdx = (pIdx + 1) % technique.phases.length;
        if (pIdx === 0) setCycles(c => c + 1);
        remaining = technique.phases[pIdx].seconds;
        setPhaseIdx(pIdx);
        setCount(remaining);
      }
    }, 1000);
  }

  function stop() {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setRunning(false);
    // eslint-disable-next-line react-hooks/purity
    const elapsed = Math.round((Date.now() - startTimeRef.current) / 1000);
    if (elapsed > 5) {
      onSessionComplete({
        type: 'breathing',
        label: `${technique.name} — ${cycles} cycles`,
        icon: '🌬️',
        durationSec: elapsed,
      });
    }
  }

  function selectTechnique(id: string) {
    if (running) stop();
    setSelectedId(id);
    const t = TECHNIQUES.find(t => t.id === id)!;
    setPhaseIdx(0);
    setCount(t.phases[0].seconds);
    setCycles(0);
  }

  return (
    <div>
      <h2 className="section-heading">🌬️ Breathing Exercises</h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: '1.25rem', fontSize: '0.9rem' }}>
        Controlled breathing reduces anxiety and vocal tension — a key foundation for fluent speech.
        Choose a technique, then press <strong>Start</strong>.
      </p>

      <div className="card">
        <div className="card-title">Choose a technique</div>
        <div className="breathing-technique-grid">
          {TECHNIQUES.map(t => (
            <button
              key={t.id}
              className={`technique-card${selectedId === t.id ? ' selected' : ''}`}
              onClick={() => selectTechnique(t.id)}
            >
              <div className="technique-card-title">{t.name}</div>
              <div className="technique-card-desc">{t.desc}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="breathing-stage">
          <div className="breathing-circle-wrap">
            <div className={`breathing-circle${running ? ' ' + phase.state : ''}`}>
              <span className="circle-count">{running ? count : '—'}</span>
              <span className="circle-label">{running ? phase.label : 'Ready'}</span>
            </div>
          </div>

          {running ? (
            <>
              <div className="breathing-phase-label">{phase.label}</div>
              <p className="breathing-instructions">{phase.instruction}</p>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Cycle {cycles + 1}</p>
            </>
          ) : (
            <p className="breathing-instructions">
              Press <strong>Start</strong> to begin. Breathe with the circle.
            </p>
          )}

          <div className="breathing-controls">
            {!running ? (
              <button className="btn-primary btn-lg btn-icon" onClick={start}>
                ▶ Start Session
              </button>
            ) : (
              <button className="btn-danger btn-lg btn-icon" onClick={stop}>
                ⏹ Stop
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">💡 Why breathing matters for stuttering</div>
        <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.9rem', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <li>Reduces physical tension in the neck, jaw, and chest</li>
          <li>Lowers anxiety before and during speaking situations</li>
          <li>Creates a steady airflow that supports smoother speech onset</li>
          <li>Activates the parasympathetic nervous system, calming fight-or-flight</li>
        </ul>
      </div>
    </div>
  );
}
