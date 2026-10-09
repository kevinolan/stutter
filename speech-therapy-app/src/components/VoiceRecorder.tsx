import { useState, useRef, useEffect, useMemo } from 'react';
import { useRenderPerf } from '../utils/perf';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';
import { analyzeFluency } from '../lib/fluency';
import { predictStutter } from '../lib/stutterModel';
import { ingestRecording } from '../lib/metricsStore';
import type { Session } from '../hooks/useSessions';

interface RecordingEntry {
  id: string;
  url: string;
  label: string;
  date: string;
}

interface Props {
  onSessionComplete: (s: Omit<Session, 'id' | 'date'>) => void;
}

const BAR_COUNT = 40;

export default function VoiceRecorder({ onSessionComplete }: Props) {
  useRenderPerf('VoiceRecorder');
  const [recordings, setRecordings] = useState<RecordingEntry[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [supported] = useState(() => !!navigator.mediaDevices?.getUserMedia);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const speech = useSpeechRecognition();

  const mediaRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const mountedRef = useRef(true);
  const audioCtxRef = useRef<AudioContext | null>(null);
  // Mirror of recordings so the unmount cleanup can revoke object URLs
  // without re-subscribing to `recordings` on every change.
  const recordingsRef = useRef<RecordingEntry[]>([]);
  // Most recent recording duration (seconds), captured at stop so runDeepModel can ingest it.
  const durationSecRef = useRef(0);

  // Deep model (fine-tuned ONNX) result for the most recent recording.
  const [modelResult, setModelResult] = useState<{ probability: number; logit: number } | null>(null);
  const [modelLoading, setModelLoading] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);

  function stopAnimation() {
    if (animFrameRef.current !== null) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
  }

  useEffect(() => {
    recordingsRef.current = recordings;
  }, [recordings]);

  // Derive the live fluency report during render (pure function of transcript + elapsed).
  const liveReport = useMemo(
    () => (speech.transcript ? analyzeFluency(speech.transcript, elapsed) : null),
    [speech.transcript, elapsed],
  );

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      stopAnimation();
      if (timerRef.current) clearInterval(timerRef.current);
      // Release the microphone if the component unmounts mid-recording
      if (mediaRef.current && mediaRef.current.state !== 'inactive') mediaRef.current.stop();
      streamRef.current?.getTracks().forEach(t => t.stop());
      // Free object URLs + audio context so we don't leak memory.
      recordingsRef.current.forEach(r => URL.revokeObjectURL(r.url));
      audioCtxRef.current?.close().catch(() => {});
    };
  }, []);

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Set up audio visualiser
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 128;
      source.connect(analyser);

      function drawBars() {
        const data = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(data);
        const canvas = canvasRef.current;
        if (canvas) {
          const ctx = canvas.getContext('2d');
          if (ctx) {
            const w = canvas.width;
            const h = canvas.height;
            ctx.clearRect(0, 0, w, h);
            const barW = w / BAR_COUNT;
            const step = Math.floor(data.length / BAR_COUNT) || 1;
            for (let i = 0; i < BAR_COUNT; i++) {
              const val = data[i * step] ?? 0;
              const barH = Math.max(4, (val / 255) * (h - 4));
              const x = i * barW;
              const y = h - barH;
              ctx.fillStyle = isRecording ? 'rgba(79,142,247,1)' : 'rgba(79,142,247,0.35)';
              ctx.fillRect(x + 1, y, Math.max(1, barW - 2), barH);
            }
          }
        }
        animFrameRef.current = requestAnimationFrame(drawBars);
      }
      drawBars();

      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        stopAnimation();
        stream.getTracks().forEach(t => t.stop());
        streamRef.current = null;
        audioCtxRef.current?.close().catch(() => {});
        audioCtxRef.current = null;

        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        const entry: RecordingEntry = {
          id: crypto.randomUUID(),
          url,
          label: `Recording ${new Date().toLocaleTimeString()}`,
          date: new Date().toISOString(),
        };

        // The recorder may stop after the component unmounted (e.g. user
        // navigated away) — only update state if we are still mounted.
        if (!mountedRef.current) {
          URL.revokeObjectURL(url);
          return;
        }
        setRecordings(prev => [entry, ...prev]);

        // Run the fine-tuned stutter-detection model on this recording (async).
        void runDeepModel(blob);

        const dur = Math.round((Date.now() - startTimeRef.current) / 1000);
        durationSecRef.current = dur;
        onSessionComplete({
          type: 'recorder',
          label: 'Voice Recording',
          icon: '🎙️',
          durationSec: dur,
        });
      };

      mr.start();
      mediaRef.current = mr;
      startTimeRef.current = Date.now();
      setIsRecording(true);
      setElapsed(0);
      // Start live, on-device transcription in parallel with audio capture.
      speech.reset();
      if (speech.supported) speech.start();

      timerRef.current = setInterval(() => setElapsed(s => s + 1), 1000);
    } catch {
      alert('Microphone access denied. Please allow microphone access in your browser settings.');
    }
  }

  function stopRecording() {
    if (timerRef.current) clearInterval(timerRef.current);
    mediaRef.current?.stop();
    speech.stop();
    setIsRecording(false);
    setElapsed(0);
  }

  // Decode a recording blob to mono 16 kHz Float32 PCM and run the fine-tuned model.
  async function runDeepModel(blob: Blob) {
    setModelLoading(true);
    setModelError(null);
    let pStutter: number | null = null;
    try {
      const arrayBuf = await blob.arrayBuffer();
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ac = new AC();
      const audioBuf = await ac.decodeAudioData(arrayBuf);
      const ch = audioBuf.numberOfChannels > 1 ? audioBuf.getChannelData(1) : audioBuf.getChannelData(0);
      const pcm = new Float32Array(ch.length);
      pcm.set(ch);
      const res = await predictStutter(pcm, audioBuf.sampleRate);
      await ac.close();
      if (mountedRef.current) setModelResult(res);
      pStutter = res.probability;
    } catch (e) {
      if (mountedRef.current) setModelError(e instanceof Error ? e.message : 'model failed');
    } finally {
      if (mountedRef.current) setModelLoading(false);
    }

    // Ingest this recording's measured signal into the local offline store so the
    // AI agent (Coach tab) can reason over real data — no network involved.
    try {
      const report = analyzeFluency(speech.transcript || '', durationSecRef.current || 0);
      ingestRecording({ durationSec: durationSecRef.current, pStutter, report });
    } catch {
      /* ingestion failure must never break the recorder */
    }
  }

  function deleteRecording(id: string) {
    setRecordings(prev => {
      const entry = prev.find(r => r.id === id);
      if (entry) URL.revokeObjectURL(entry.url);
      return prev.filter(r => r.id !== id);
    });
  }

  function formatTime(sec: number) {
    const m = Math.floor(sec / 60).toString().padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  return (
    <div>
      <h2 className="section-heading">🎙️ Voice Recorder</h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: '1.25rem', fontSize: '0.9rem' }}>
        Record yourself reading aloud or practising exercises. Listening back helps you notice patterns and track improvement over time.
      </p>

      <div className="card">
        <div className="card-title">Record your voice</div>

        {!supported ? (
          <div style={{ color: 'var(--danger)', fontSize: '0.9rem' }}>
            ⚠️ Your browser does not support audio recording. Please use a modern browser like Chrome or Firefox.
          </div>
        ) : (
          <div className="recorder-section">
            <canvas
              ref={canvasRef}
              className="recorder-visualizer"
              aria-hidden
              width={800}
              height={120}
              style={{ width: '100%', height: '60px' }}
            />

            {isRecording && (
              <div className="recorder-status">
                <span className="rec-dot" />
                Recording — {formatTime(elapsed)}
              </div>
            )}

            {speech.supported && speech.listening && (
              <div className="recorder-transcript" aria-live="polite">
                {speech.transcript || speech.interim ? (
                  <>
                    {speech.transcript}
                    {speech.interim && <span className="transcript-interim"> {speech.interim}</span>}
                  </>
                ) : (
                  <span style={{ color: 'var(--text-muted)' }}>Listening… speak now.</span>
                )}
              </div>
            )}

            {liveReport && (
              <div className="fluency-report" role="status">
                <div className="fluency-summary">{liveReport.summary}</div>
                <div className="fluency-stats">
                  <span>🗣️ {liveReport.wordCount} words</span>
                  <span>🔁 {liveReport.repetitions}</span>
                  <span>〰️ {liveReport.prolongations}</span>
                  <span>⏸️ {liveReport.blocks}</span>
                  {liveReport.ratePerMin > 0 && <span>⏱️ ~{liveReport.ratePerMin}/min</span>}
                </div>
                <p className="fluency-note">
                  Heuristic, on-device signal for self-awareness — not a clinical measure.
                </p>
              </div>
            )}

            {(modelLoading || modelResult || modelError) && (
              <div className="fluency-report model-report" role="status">
                {modelLoading && <div className="fluency-summary">🧠 Deep model analysing…</div>}
                {modelError && (
                  <div className="fluency-summary" style={{ color: 'var(--danger)' }}>
                    Model unavailable: {modelError}
                  </div>
                )}
                {modelResult && (
                  <>
                    <div className="fluency-summary">
                      🧠 Trained model: P(stutter) = {(modelResult.probability * 100).toFixed(1)}%
                    </div>
                    <div className="fluency-stats">
                      <span
                        className={modelResult.probability > 0.5 ? 'flag-high' : 'flag-low'}
                      >
                        {modelResult.probability > 0.5 ? 'Above threshold' : 'Below threshold'}
                      </span>
                    </div>
                    <p className="fluency-note">
                      Fine-tuned CNN (librosa log-Mel features), runs fully on-device via ONNX. Threshold 0.5.
                    </p>
                  </>
                )}
              </div>
            )}

            {!speech.supported && (
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                {speech.error === 'insecure-context'
                  ? 'Live transcription requires a secure (HTTPS) connection'
                  : 'Live transcription is not supported in this browser (try Chrome, Edge, or Safari)'}
                {' '}— audio recording still works.
              </p>
            )}

            {speech.supported && speech.error && (
              <p style={{ fontSize: '0.8rem', color: 'var(--danger)', textAlign: 'center' }}>
                {speech.error === 'not-allowed'
                  ? 'Microphone access for transcription was denied — audio recording still works.'
                  : speech.error === 'network'
                  ? 'Live transcription lost its network connection and stopped.'
                  : 'Live transcription is unavailable right now — audio recording still works.'}
              </p>
            )}

            <button
              className={`recorder-btn btn-primary${isRecording ? ' recording' : ''}`}
              onClick={isRecording ? stopRecording : startRecording}
              aria-label={isRecording ? 'Stop recording' : 'Start recording'}
            >
              {isRecording ? '⏹' : '🎙️'}
            </button>

            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center' }}>
              {isRecording ? 'Press the button to stop' : 'Press the button to start recording'}
            </p>
          </div>
        )}
      </div>

      {recordings.length > 0 && (
        <div className="card">
          <div className="card-title">🎧 Your Recordings</div>
          <div className="recordings-list">
            {recordings.map(r => (
              <div className="recording-entry" key={r.id}>
                <span className="recording-label">{r.label}</span>
                <audio controls src={r.url} />
                <button
                  className="recording-delete"
                  onClick={() => deleteRecording(r.id)}
                  aria-label="Delete recording"
                  title="Delete"
                >
                  🗑️
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-title">📋 What to record</div>
        <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.9rem', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <li>Read a short paragraph aloud at a comfortable pace</li>
          <li>Introduce yourself — name, where you're from, one hobby</li>
          <li>Describe your day or something you did recently</li>
          <li>Practice a specific speech technique (e.g., easy onset)</li>
          <li>Repeat the same recording weekly to hear your progress</li>
        </ul>
      </div>
    </div>
  );
}
