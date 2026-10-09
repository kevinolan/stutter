import { useEffect, useRef, useState } from 'react';
import './App.css';
import { useSessions, type Tab } from './hooks/useSessions';
import Dashboard from './components/Dashboard';
import BreathingExercise from './components/BreathingExercise';
import SpeechExercises from './components/SpeechExercises';
import VoiceRecorder from './components/VoiceRecorder';
import ProgressTracker from './components/ProgressTracker';
import TipsPanel from './components/TipsPanel';
import CoachPanel from './components/CoachPanel';
import { dumpPerfMeasures } from './utils/perf';
import { calcStreak } from './utils/helpers';

interface NavItem {
  id: Tab;
  icon: string;
  label: string;
}

const NAV: NavItem[] = [
  { id: 'home', icon: '🏠', label: 'Home' },
  { id: 'breathing', icon: '🌬️', label: 'Breathing' },
  { id: 'exercises', icon: '🗣️', label: 'Exercises' },
  { id: 'recorder', icon: '🎙️', label: 'Record' },
  { id: 'progress', icon: '📊', label: 'Progress' },
  { id: 'tips', icon: '💡', label: 'Tips' },
  { id: 'coach', icon: '🤖', label: 'Coach' },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('home');
  const [nextStepNotice, setNextStepNotice] = useState<string | null>(null);
  const { sessions, addSession, clearSessions } = useSessions();
  const streak = calcStreak(sessions);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (noticeTimerRef.current) {
        clearTimeout(noticeTimerRef.current);
      }
    };
  }, []);

  function handleSessionComplete(session: Parameters<typeof addSession>[0]) {
    addSession(session);
    const nextTab = getNextTab(session.type);
    setNextStepNotice(getNextStepNotice(session.type, nextTab));
    setActiveTab(nextTab);

    if (noticeTimerRef.current) {
      clearTimeout(noticeTimerRef.current);
    }
    noticeTimerRef.current = setTimeout(() => setNextStepNotice(null), 3000);
  }

  return (
    <>
      <header className="app-header">
        <div className="app-header-inner">
          <div className="app-brand">
            <span className="app-logo" aria-hidden>🗣️</span>
            <span className="app-name">FluentPath</span>
          </div>
          <nav className="nav-tabs" aria-label="Main navigation">
            {NAV.map(item => (
              <button
                key={item.id}
                className={`nav-tab${activeTab === item.id ? ' active' : ''}`}
                onClick={() => setActiveTab(item.id)}
                aria-current={activeTab === item.id ? 'page' : undefined}
              >
                <span aria-hidden>{item.icon}</span>
                <span className="tab-label">{item.label}</span>
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="app-main">
        {nextStepNotice && (
          <div className="card" style={{ marginBottom: '1rem', borderColor: 'var(--primary)' }}>
            <div className="card-title">✅ Next up</div>
            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem' }}>{nextStepNotice}</p>
          </div>
        )}
        {activeTab === 'home' && (
          <Dashboard sessions={sessions} onNavigate={setActiveTab} />
        )}
        {activeTab === 'breathing' && (
          <BreathingExercise onSessionComplete={handleSessionComplete} />
        )}
        {activeTab === 'exercises' && (
          <SpeechExercises onSessionComplete={handleSessionComplete} />
        )}
        {activeTab === 'recorder' && (
          <VoiceRecorder onSessionComplete={handleSessionComplete} />
        )}
        {activeTab === 'progress' && (
          <ProgressTracker sessions={sessions} onClear={clearSessions} />
        )}
        {activeTab === 'tips' && (
          <TipsPanel onSessionComplete={handleSessionComplete} />
        )}
        {activeTab === 'coach' && (
          <CoachPanel streak={streak} />
        )}
      </main>

      <footer className="app-footer">
        FluentPath — Speech Therapy App for People Who Stutter &nbsp;·&nbsp;
        <span style={{ fontSize: '0.8em' }}>Always work with a qualified speech-language pathologist for clinical guidance.</span>
        {import.meta.env.DEV && (
          <button
            style={{ marginLeft: '1rem' }}
            className="btn-ghost btn-sm"
            onClick={() => dumpPerfMeasures()}
            title="Dump perf measures to console"
          >
            🧪 Perf
          </button>
        )}
      </footer>
    </>
  );
}

function getNextTab(type: Tab): Tab {
  switch (type) {
    case 'breathing':
      return 'exercises';
    case 'exercises':
      return 'recorder';
    case 'recorder':
      return 'tips';
    case 'tips':
      return 'home';
    case 'home':
    case 'progress':
    case 'coach':
    default:
      return 'home';
  }
}

function getNextStepNotice(type: Tab, nextTab: Tab): string {
  const labels: Record<Tab, string> = {
    home: 'Home',
    breathing: 'Breathing',
    exercises: 'Speech Practice',
    recorder: 'Record & Listen',
    progress: 'Progress',
    tips: 'Tips & Support',
    coach: 'Coach',
  };

  if (type === 'tips') {
    return 'You’ve finished the support loop — returning you to Home to choose the next round.';
  }

  return `Great work — next up is ${labels[nextTab]}.`;
}
