/// <reference types="vite/client" />

/** Build release id (git short-hash · date), injected by Vite `define` in vite.config.ts. */
declare const __BUILD__: string;
