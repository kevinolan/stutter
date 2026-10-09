import { useEffect, useRef, useState, useCallback } from 'react';

export type SpeechRecognitionErrorReason =
  | 'not-allowed'
  | 'no-speech'
  | 'audio-capture'
  | 'network'
  | 'aborted'
  | 'insecure-context'
  | 'unsupported'
  | 'unknown';

interface UseSpeechRecognition {
  supported: boolean;
  listening: boolean;
  transcript: string;
  interim: string;
  error: SpeechRecognitionErrorReason | null;
  start: () => void;
  stop: () => void;
  reset: () => void;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

interface SpeechRecognitionAlternative { transcript: string; }
interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionAlternative;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResult>;
}

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  // Chrome/Edge/Android Chrome expose `webkitSpeechRecognition`; some newer
  // Chromium builds also expose the unprefixed `SpeechRecognition`. Safari
  // (14.1+, macOS only — not iOS) exposes `webkitSpeechRecognition` too.
  // Firefox (desktop and mobile) exposes neither — `supported` will be false
  // there and the UI should hide/disable the live-transcript feature.
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function mapErrorReason(reason: string): SpeechRecognitionErrorReason {
  switch (reason) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'not-allowed';
    case 'no-speech':
      return 'no-speech';
    case 'audio-capture':
      return 'audio-capture';
    case 'network':
      return 'network';
    case 'aborted':
      return 'aborted';
    default:
      return 'unknown';
  }
}

/**
 * Thin React wrapper around the Web Speech API for live, on-device
 * transcription, written to tolerate the API's inconsistent behavior across
 * browsers/devices:
 *
 * - Firefox (desktop + mobile) and iOS Safari don't implement the API at
 *   all — `supported` is false so the UI can degrade gracefully.
 * - The API requires a secure context (HTTPS or localhost). If the page is
 *   served over plain HTTP, browsers refuse to start recognition — we detect
 *   this upfront rather than failing silently on `start()`.
 * - Chrome (desktop + Android) frequently ends recognition on its own after
 *   a short pause in speech even with `continuous: true`. We auto-restart in
 *   that case as long as the user hasn't explicitly called `stop()`.
 * - `start()` throws synchronously if called while already running (e.g. a
 *   double-click, or a race between manual stop and an auto-restart) — all
 *   start attempts are wrapped and idempotent.
 */
export function useSpeechRecognition(lang = 'en-US'): UseSpeechRecognition {
  const Ctor = getRecognitionCtor();
  const secureContext = typeof window === 'undefined' || window.isSecureContext !== false;
  const [supported] = useState(() => Boolean(Ctor) && secureContext);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<SpeechRecognitionErrorReason | null>(
    () => (!Ctor ? 'unsupported' : !secureContext ? 'insecure-context' : null),
  );

  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const finalRef = useRef('');
  const wantListeningRef = useRef(false);
  const restartTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const createRecognizer = useCallback((): SpeechRecognitionLike | null => {
    if (!Ctor) return null;
    const rec = new Ctor();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onresult = (event) => {
      let interimText = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const chunk = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalRef.current += (finalRef.current ? ' ' : '') + chunk;
          setTranscript(finalRef.current.trim());
        } else {
          interimText += chunk;
        }
      }
      setInterim(interimText);
    };

    rec.onerror = (event) => {
      const reason = mapErrorReason(event.error);
      // "no-speech" / "aborted" fire routinely (e.g. brief silence, or our own
      // restart) — don't surface them as user-facing errors, just note that
      // recognition isn't currently active. Anything else (permissions,
      // hardware, network) is worth surfacing.
      if (reason !== 'no-speech' && reason !== 'aborted') {
        setError(reason);
      }
      if (reason === 'not-allowed' || reason === 'audio-capture' || reason === 'service-not-allowed') {
        // Unrecoverable for this session — stop trying to auto-restart.
        wantListeningRef.current = false;
      }
    };

    rec.onend = () => {
      setListening(false);
      setInterim('');
      // Some browsers (notably Chrome) end recognition on their own after a
      // pause even with `continuous: true`. If the user hasn't explicitly
      // stopped, restart automatically so "Recording" and "Listening" stay
      // in sync for the whole session.
      if (wantListeningRef.current) {
        restartTimeoutRef.current = setTimeout(() => {
          if (wantListeningRef.current) attemptStart();
        }, 250);
      }
    };

    return rec;
  }, [Ctor, lang]);

  const attemptStart = useCallback(() => {
    if (!Ctor) return;
    const rec = createRecognizer();
    if (!rec) return;
    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
      setError(null);
    } catch {
      // Thrown if recognition is already running (e.g. a restart raced with
      // a manual start) — treat as a no-op rather than surfacing an error.
      setListening(prev => prev);
    }
  }, [Ctor, createRecognizer]);

  const start = useCallback(() => {
    if (!Ctor || !secureContext) return;
    wantListeningRef.current = true;
    if (restartTimeoutRef.current) {
      clearTimeout(restartTimeoutRef.current);
      restartTimeoutRef.current = null;
    }
    attemptStart();
  }, [Ctor, secureContext, attemptStart]);

  const stop = useCallback(() => {
    wantListeningRef.current = false;
    if (restartTimeoutRef.current) {
      clearTimeout(restartTimeoutRef.current);
      restartTimeoutRef.current = null;
    }
    recRef.current?.stop();
  }, []);

  const reset = useCallback(() => {
    finalRef.current = '';
    setTranscript('');
    setInterim('');
    setError(prev => (prev === 'not-allowed' || prev === 'unsupported' || prev === 'insecure-context' ? prev : null));
  }, []);

  useEffect(() => {
    return () => {
      wantListeningRef.current = false;
      if (restartTimeoutRef.current) clearTimeout(restartTimeoutRef.current);
      // abort() (rather than stop()) discards any in-flight result callback
      // so we don't touch state after unmount.
      recRef.current?.abort();
    };
  }, []);

  return { supported, listening, transcript, interim, error, start, stop, reset };
}
