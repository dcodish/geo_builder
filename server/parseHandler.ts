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

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 30; // requests/minute/IP
const MAX_BODY = 4096; // bytes
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > MAX_PER_WINDOW;
}

/**
 * The client IP for rate-limiting. Behind the production reverse proxy every
 * request's `socket.remoteAddress` is the proxy's loopback (127.0.0.1), which
 * would collapse the per-IP limiter into one global bucket — so prefer the
 * `X-Forwarded-For` / `X-Real-IP` header the proxy sets. Safe to trust because
 * the server binds to loopback and only the reverse proxy can reach it; in dev
 * (no header) it falls back to the socket address.
 */
function clientIp(req: IncomingMessage): string {
  const xff = req.headers?.['x-forwarded-for'];
  const fwd = Array.isArray(xff) ? xff[0] : xff;
  if (fwd) return fwd.split(',')[0].trim();
  const real = req.headers?.['x-real-ip'];
  if (typeof real === 'string' && real) return real;
  return req.socket?.remoteAddress ?? 'local';
}

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

  let body = '';
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY) return send(413, { error: 'too-large' });
    body += chunk;
  }

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
