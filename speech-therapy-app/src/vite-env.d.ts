/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of a Chat Completions-compatible endpoint (OpenAI, OpenRouter, a local server, etc.). */
  readonly VITE_COACH_API_BASE?: string;
  /** API key for the coach endpoint. Leave empty to use the built-in local coach fallback. */
  readonly VITE_COACH_API_KEY?: string;
  /** Model id to request from the coach endpoint. */
  readonly VITE_COACH_MODEL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
