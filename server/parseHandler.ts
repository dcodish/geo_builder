/**
 * LLM-fallback proxy — the shared request handler (Phase 7).
 *
 * Both hosts of the proxy call this one function so dev and prod are identical:
 *  - the Vite dev plugin (`server/llmProxy.ts`, mounted at `POST /api/parse`), and
 *  - the standalone production server (`server/standalone.ts`, behind the web
 *    server's reverse proxy at `/geo-builder/api/parse`).
 *
 * It holds the API key only inside this Node process — the browser never sees it.
 * Cost controls live here: a per-IP rate limit, a small body cap, low `max_tokens`
 * and the cheap Haiku model (the last two in `llmShared`). The Anthropic SDK is
 * imported dynamically at request time, so importing this module never pulls it in
 * and the proxy degrades gracefully (503) when the key is missing.
 *
 * `req`/`res` are Node's `http` types, which the Vite middleware and a bare
 * `http.createServer` both provide — that shared shape is why one handler suffices.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { buildLlmRequest, extractSteps } from '../src/parser/llmShared';
import { clientIp, makeRateLimiter, readBody } from './http';

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 30; // requests/minute/IP
const MAX_BODY = 4096; // bytes
const rateLimited = makeRateLimiter(MAX_PER_WINDOW, WINDOW_MS);

// GLOBAL daily ceiling on Haiku dispatches (SEC-2): the per-IP limiter alone is bypassable across IPs and
// over time, so a bot flooding the proxy with random input could still run up the prepaid credit. This is
// the hard cost backstop — a cap on TOTAL calls per UTC day, in-process (a restart resets it; acceptable
// for a cost guard). Real users are not expected to reach it. `LLM_DAILY_MAX` (read per-request so it's
// tunable without a rebuild) defaults to 1000/day ≈ a dollar or two of Haiku worst-case.
let dayKey = '';
let dayCount = 0;

export interface ParseHandlerOpts {
  /** The Anthropic key, resolved by the host. When absent the handler answers 503. */
  apiKey: string | undefined;
  /** Where to log an upstream failure (Vite's logger in dev, console in prod). */
  logError?: (msg: string) => void;
}

/** Handle one `POST .../api/parse`: validate, rate-limit, ask Haiku, return `{ steps }`. */
export async function handleParse(
  req: IncomingMessage,
  res: ServerResponse,
  { apiKey, logError = console.error }: ParseHandlerOpts,
): Promise<void> {
  const send = (code: number, obj: unknown) => {
    res.statusCode = code;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(obj));
  };
  if (req.method !== 'POST') return send(405, { error: 'method-not-allowed' });

  if (!apiKey) return send(503, { error: 'no-api-key' }); // proxy not configured

  if (rateLimited(clientIp(req))) return send(429, { error: 'rate-limited' });

  const body = await readBody(req, MAX_BODY);
  if (body === null) return send(413, { error: 'too-large' });

  let utterance = '';
  let context = '';
  try {
    const j = JSON.parse(body) as { utterance?: unknown; context?: unknown };
    utterance = String(j.utterance ?? '').slice(0, 400);
    context = String(j.context ?? '').slice(0, 1000);
  } catch {
    return send(400, { error: 'bad-json' });
  }
  if (!utterance.trim()) return send(400, { error: 'empty' });

  // Global daily ceiling — checked after validation (junk never burns quota) and before the SDK call.
  // When hit, a DISTINCT 429 `daily-limit` (the client shows "service busy", not "couldn't understand")
  // and a log line so the operator can see how often it happens: `journalctl -u geo-proxy | grep 'daily limit'`.
  // `|| 1000` would treat a configured 0 as unset (0 is falsy) — parse explicitly so 0 can hard-disable.
  const rawMax = process.env.LLM_DAILY_MAX;
  const dailyMax = rawMax && Number.isFinite(Number(rawMax)) ? Number(rawMax) : 1000;
  const today = new Date().toISOString().slice(0, 10); // UTC day
  if (today !== dayKey) {
    dayKey = today;
    dayCount = 0;
  }
  if (dayCount >= dailyMax) {
    logError(`[geo-llm-proxy] daily limit reached (${dayCount}/${dailyMax}) on ${today} — request blocked`);
    return send(429, { error: 'daily-limit' });
  }
  dayCount++; // count this dispatch toward the cap (before the call, so an upstream error still counts)

  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey });
    const msg = await client.messages.create(buildLlmRequest(utterance, context));
    const steps = extractSteps(msg.content as { type: string; name?: string; input?: unknown }[]) ?? [];
    return send(200, { steps });
  } catch (e) {
    logError('[geo-llm-proxy] ' + (e instanceof Error ? e.message : String(e)));
    return send(502, { error: 'llm-failed' });
  }
}
