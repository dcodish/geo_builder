/// <reference types="vite/client" />

// No client-side API key: the Claude key lives only in the server proxy
// (server/llmProxy.ts), never in the browser bundle (ADR-023). Intentionally
// no VITE_*_API_KEY here — the old browser-key approach is abandoned.
