/**
 * LLM-fallback proxy (Phase 7) — the server side that holds the API key.
 *
 * Mounted into the Vite dev server as `POST /api/parse`. The browser never sees
 * the key (it lives in `process.env.ANTHROPIC_API_KEY` on this Node process);
 * the client only talks to this proxy. Cost controls: a small request-size cap,
 * a per-IP rate limit, low `max_tokens`, and the cheap Haiku model. The same
 * handler is extractable to a serverless function for production (the dev plugin
 * is just one host of it).
 *
 * The Anthropic SDK is imported dynamically at request time so loading the Vite
 * config never pulls it in, and the proxy degrades gracefully (503) if the key
 * or the SDK is missing.
 */

import { loadEnv, type Plugin } from 'vite';
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

export function llmProxyPlugin(): Plugin {
  // Resolved from `.env`/`.env.local` (or the shell) at config time. `loadEnv`
  // with an empty prefix reads non-VITE vars for server use only — they are NOT
  // exposed to the client bundle.
  let apiKey: string | undefined;
  return {
    name: 'geo-llm-proxy',
    configResolved(config) {
      const env = loadEnv(config.mode, config.root, '');
      apiKey = env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
    },
    configureServer(server) {
      server.middlewares.use('/api/parse', async (req, res) => {
        const send = (code: number, obj: unknown) => {
          res.statusCode = code;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify(obj));
        };
        if (req.method !== 'POST') return send(405, { error: 'method-not-allowed' });

        if (!apiKey) return send(503, { error: 'no-api-key' }); // proxy not configured

        const ip = req.socket.remoteAddress ?? 'local';
        if (rateLimited(ip)) return send(429, { error: 'rate-limited' });

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
          server.config.logger.error('[geo-llm-proxy] ' + (e instanceof Error ? e.message : String(e)));
          return send(502, { error: 'llm-failed' });
        }
      });
    },
  };
}
