# FluentPath — Speech Therapy App for People Who Stutter

A privacy-first, offline-capable web app for practising fluency and
stuttering-modification techniques. Built with **React 19 + TypeScript + Vite**.

## Features

- **Breathing exercises** — diaphragmatic, box, and pursed-lip patterns with a guided visual timer.
- **Speech exercises** — evidence-based techniques (slow/prolonged speech, easy onset, light articulatory contacts, cancellation, pull-out, voluntary stuttering).
- **Voice recorder** — record, listen back, and see **live, on-device transcription** plus a **fluency/stutter-marker analysis** (repetitions, prolongations, blocks, speech rate).
- **Progress tracker** — streaks, stats, weekly heatmap, activity breakdown, and achievement badges (persisted in `localStorage`).
- **Tips & support** — affirmations, practical strategies, and vetted resources.
- **AI Fluency Coach** — a supportive coaching chat (see below).

> Everything runs client-side. Audio, transcripts, and analysis never leave the
> browser unless you explicitly configure a coach endpoint.

## AI Fluency Coach

The "model" behind the coach is a carefully engineered coaching system prompt
(`src/lib/coach.ts`) that fixes the assistant's persona, technique knowledge, and
clinical safety boundaries, plus a provider-agnostic client for any
OpenAI-compatible Chat Completions endpoint.

- **Zero-config, offline mode:** with no API key set, the app uses a built-in
  rule-based local coach, so the feature always works.
- **LLM mode:** copy `.env.example` to `.env.local` and set
  `VITE_COACH_API_BASE`, `VITE_COACH_API_KEY`, and `VITE_COACH_MODEL`. Any
  OpenAI-compatible endpoint works (OpenAI, OpenRouter, Ollama, etc.). On any API
  error it gracefully falls back to the local coach.

> The coach is a self-help aid, **not** a substitute for a licensed
> speech-language pathologist.

## Stutter recognition

`src/lib/fluency.ts` implements lightweight, on-device detection of surface
disfluencies from a live transcript (repetitions like "I-I-I", prolongations like
"Mmmmy", and inserted blocks). It is a heuristic self-awareness signal, not a
clinical diagnosis. Live transcription uses the browser **Web Speech API**
(`src/hooks/useSpeechRecognition.ts`).

## Getting started

```bash
npm install
npm run dev      # start the dev server
npm run build    # typecheck (tsc -b) + production build
npm run test     # run the vitest suite
npm run lint     # eslint
```

## Project layout

```
src/
  components/        UI panels (Dashboard, Breathing, Exercises, Recorder, Progress, Tips, Coach)
  hooks/            useSessions (state + persistence), useSpeechRecognition
  lib/              coach.ts (coaching "model"), fluency.ts (stutter analysis)
  utils/            helpers (streak/format), stats (shared stats), perf (dev profiler)
  __tests__/        vitest specs
```

## Deployment (GitHub Pages)

This repository includes a GitHub Actions workflow that builds the app and deploys the `dist/` output to GitHub Pages whenever `main` is pushed.

1. Commit and push your changes to the `main` branch.
2. The workflow `.github/workflows/gh-pages.yml` runs automatically and publishes the site.
3. After the first successful run, GitHub Pages will host the site.

## Disclaimer

FluentPath is an educational self-help tool. It does not provide medical advice or
diagnosis. Always work with a qualified speech-language pathologist for clinical
guidance.
