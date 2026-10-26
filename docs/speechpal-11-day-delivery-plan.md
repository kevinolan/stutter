# SpeechPal AI — 11-Day Delivery Plan

## Delivery target
Deliver a testable Android-first MVP, not a clinically validated diagnostic product. The app provides guided pronunciation practice, supportive fluency activities, recording/replay, session history, and a speech-to-text feedback path. It must never present model output as a diagnosis.

## Existing project audit
- Mobile app: `stammer/stammer-app`, React Native + Expo Router (SDK 52).
- Existing activities: recording/analysis, breathing, metronome, guided reading, and delayed auditory feedback.
- Existing model pipeline: ONNX fluency signal and heuristic transcript analyzer.
- Existing sync layer: Express + SQLite with local offline queue.
- Important gaps: duplicate home route, default Expo Explore screen, no integrated STT, no pronunciation pathway, no local progress dashboard, no Supabase integration.
- Time-box decision: keep the existing runtime during the 11-day delivery window; do not migrate frameworks mid-sprint. Record the Expo dependency as a product/architecture decision to revisit after delivery.

## 11-day sprint
1. **Foundation and route audit** — fix home routing, establish Home / Progress / Settings tabs, create the two separate pathways, keep changes on a feature branch.
2. **Pronunciation journey** — exercise library, prompt selection, record/replay, prompt-aware result state.
3. **Fluency journey** — connect existing breathing, reading, metronome, DAF, and recording activities into a clear path.
4. **Speech-to-text integration** — add a server-side transcription endpoint; keep provider keys out of the app; configure the key only as a backend secret.
5. **Feedback rules** — compare transcript to target prompt, show differences gently, explain that transcription errors are possible.
6. **Session persistence** — save safe summary metrics locally; keep temporary audio out of long-term storage by default.
7. **Backend/data decision** — choose whether the final demo uses the existing Express/SQLite backend or Supabase. If Supabase is required, add Auth + Postgres with RLS and migrate only the session data needed for the MVP; do not maintain two competing sources of truth.
8. **Progress dashboard** — session count, practice time, pathway breakdown, and recent sessions.
9. **Stability pass** — Android permissions, app lifecycle cleanup, offline/error states, navigation and smaller-screen checks.
10. **Android release candidate** — build/install on emulator and a physical Android device; verify configuration and privacy copy.
11. **Final QA and handover** — fix blocker bugs, make a signed/release build if credentials permit, document setup, limitations, and demo steps.

## Definition of done
- Android app launches and Home, Progress, and Settings work.
- Pronunciation and fluency are distinct, navigable pathways.
- A user can choose a prompt, record, stop, replay where supported, and see a truthful result state.
- Progress is based on saved sessions, not invented sample data.
- API secrets are server-side only.
- Mic permission denial, offline requests, and missing service configuration are handled visibly.
- Speech metrics are framed as practice signals, not diagnosis or a replacement for a speech-language professional.

## Scope guardrails
If the schedule slips, protect the working Android flow, one reliable STT integration, local session history, and documentation. Defer social features, clinician portal redesign, cloud audio storage, advanced analytics, multi-language optimization, and model retraining.
