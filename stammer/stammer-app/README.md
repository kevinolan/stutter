# SpeechPal AI — Android-first mobile app

SpeechPal AI is the React Native mobile client in the FluentPath repository. It supports two distinct practice pathways:

- **Pronunciation & articulation** — guided sound, word, and sentence prompts.
- **Fluency & comfortable speaking** — guided recording, breathing, reading, rhythm, and optional delayed auditory feedback.

The current app includes local practice history and an existing offline-first metrics sync path to the repository's Express/SQLite backend. The on-device ONNX analysis is best-effort and is not a clinical diagnostic tool.

## Development

Requirements:
- Node.js LTS and npm
- Android Studio with an Android SDK and emulator, or a physical Android device
- VS Code

From the repository root:

```bash
cd stammer/stammer-app
npm install
npx expo start
```

Start an Android emulator from Android Studio first. Then use the Expo CLI's Android option, or run:

```bash
npx expo start --android
```

For the existing metrics backend, use a second terminal:

```bash
cd backend
npm install
npm run dev
```

The mobile client defaults to `http://10.0.2.2:4000` for Android emulator access to the host computer. For a physical device, set `EXPO_PUBLIC_BACKEND_URL` to a reachable LAN or deployed backend URL.

## Current MVP scope and known gaps

- Navigation: Home, Progress, Settings.
- Two separate pathways and a guided prompt library.
- Record, analyze available local fluency signals, replay the temporary recording, and save session summaries locally.
- A consent-based speech-to-text client and server-side transcription proxy are implemented. To enable them, set `OPENAI_API_KEY` in the backend environment; never place the key in the mobile app. The feature is off by default.
- Pronunciation feedback compares recognized words with the prompt; it is not an acoustic pronunciation score, and transcription can be wrong.
- The current repository's sync backend is Express + SQLite. Supabase integration is planned, but requires the Supabase project to be active and configured before it can be verified.
- The current project uses Expo Router. Do not migrate away from Expo during the short MVP sprint unless required by a blocking issue; that migration would increase delivery risk.

## Privacy and clinical limits

- Audio is kept temporarily for replay while the practice screen is open and removed when the screen is reset or unmounted.
- Session history stores summaries and practice signals, not the audio file.
- Automatic speech signals can be wrong and must not be represented as a diagnosis.
- The app supports practice and reflection; it does not replace assessment or guidance from a qualified speech-language professional.

See [../../docs/speechpal-11-day-delivery-plan.md](../../docs/speechpal-11-day-delivery-plan.md) for the sprint schedule and acceptance criteria.
