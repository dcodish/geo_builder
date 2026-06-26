/**
 * Shared proxy handler — boundary + safety, NO live API calls.
 *
 * Exercises the guards (method, missing key, body cap, empty utterance) that
 * run BEFORE the dynamic Anthropic import, so the SDK is never touched. The live
 * Haiku path is covered indirectly by the pure `buildLlmRequest`/`extractSteps`
 * tests in `src/parser/__tests__/llm.test.ts` (the operator authorises live calls).
 */

import { describe, it, expect } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleParse } from '../parseHandler';

function mockRes() {
  return {
    statusCode: 0,
    headers: {} as Record<string, string>,
    body: '',
    setHeader(k: string, v: string) {
      this.headers[k] = v;
    },
    end(s?: string) {
      this.body = s ?? '';
    },
  };
}

async function* chunks(parts: string[]) {
  for (const p of parts) yield Buffer.from(p);
}

function mockReq(method: string, ip: string, parts: string[] = [], headers: Record<string, string> = {}) {
  const req = chunks(parts) as AsyncGenerator<Buffer> & {
    method: string;
    socket: { remoteAddress: string };
    headers: Record<string, string>;
  };
  req.method = method;
  req.socket = { remoteAddress: ip };
  req.headers = headers;
  return req;
}

// The mocks satisfy only the bits the handler reads; cast through the Node types.
const run = (req: ReturnType<typeof mockReq>, res: ReturnType<typeof mockRes>, apiKey: string | undefined) =>
  handleParse(req as unknown as IncomingMessage, res as unknown as ServerResponse, { apiKey, logError: () => {} });

describe('handleParse (shared proxy handler)', () => {
  it('rejects a non-POST with 405 before reaching the key/SDK', async () => {
    const res = mockRes();
    await run(mockReq('GET', '10.0.0.1'), res, 'sk-test');
    expect(res.statusCode).toBe(405);
  });

  it('answers 503 when no API key is configured (graceful degrade)', async () => {
    const res = mockRes();
    await run(mockReq('POST', '10.0.0.2', ['{}']), res, undefined);
    expect(res.statusCode).toBe(503);
    expect(JSON.parse(res.body)).toEqual({ error: 'no-api-key' });
  });

  it('caps the request body at 4 KB with 413', async () => {
    const res = mockRes();
    await run(mockReq('POST', '10.0.0.3', ['x'.repeat(5000)]), res, 'sk-test');
    expect(res.statusCode).toBe(413);
  });

  it('rejects an empty utterance with 400', async () => {
    const res = mockRes();
    await run(mockReq('POST', '10.0.0.4', [JSON.stringify({ utterance: '   ' })]), res, 'sk-test');
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toEqual({ error: 'empty' });
  });

  it('rate-limits a flood from one IP with 429', async () => {
    const ip = '10.0.0.5';
    // Empty-body requests: rateLimited counts each (it runs BEFORE body parse),
    // then they short-circuit at 400 — so the limiter trips without ever reaching
    // the live SDK path (no autonomous API calls).
    let last = mockRes();
    for (let i = 0; i < 32; i++) {
      last = mockRes();
      await run(mockReq('POST', ip, ['{}']), last, 'sk-test');
    }
    // The 31st+ request in the window trips the limiter (MAX_PER_WINDOW = 30).
    expect(last.statusCode).toBe(429);
  });

  it('rate-limits per X-Forwarded-For client, not the (shared) reverse-proxy socket', async () => {
    // All requests arrive from the same proxy socket (127.0.0.1) but carry
    // distinct forwarded client IPs — each must keep its own bucket, so a single
    // request per client never trips the limiter.
    for (let i = 0; i < 40; i++) {
      const res = mockRes();
      await run(mockReq('POST', '127.0.0.1', ['{}'], { 'x-forwarded-for': `203.0.113.${i}` }), res, 'sk-test');
      expect(res.statusCode).toBe(400); // empty utterance — never rate-limited, never the SDK
    }
  });
});
