/**
 * #2752 (ADR-W-192) — A REQUEST'S FAILURE NEVER ENDS THE PROCESS.
 *
 * One process serves the AI fallback, the usage log, sharing and the dashboards for all four builders. A
 * client that dropped mid-upload made the body reader reject outside every handler's `try`, the router had
 * fired the handler and forgotten it, and Node exited (measured on loopback, 2026-11-08: the first aborted
 * POST to /api/log ended the process with `Error: aborted`, ECONNRESET).
 *
 * The mechanism has two chokepoints, and these locks call both:
 *  1. `serveSafely` — the one failure boundary per request, around the production router and every dev mount;
 *  2. `readBody` — the one body reader, which resolves `null` (never rejects) when the client goes away.
 *
 * No network: the only servers are in-process on loopback, and the model SDK is a tripwire.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { createServer as createHttpServer, type IncomingMessage, type Server } from 'node:http';
import { createConnection, createServer as createNetServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { readBody, serveSafely } from '../http';

/** Nothing here may start a model call: importing the SDK at all is the tripwire. */
const sdkImported = vi.hoisted(() => ({ count: 0 }));
vi.mock('@anthropic-ai/sdk', () => {
  sdkImported.count++;
  throw new Error('a #2752 lock reached the Anthropic SDK — an aborted body must be answered before any model call');
});

const SERVER_DIR = resolve(__dirname, '..');

function freePort(): Promise<number> {
  return new Promise((ok) => {
    const s = createNetServer();
    s.listen(0, '127.0.0.1', () => {
      const p = (s.address() as { port: number }).port;
      s.close(() => ok(p));
    });
  });
}

/** POST with a Content-Length larger than what is sent, then drop the connection (a lost phone signal). */
function abortMidBody(port: number, path: string): Promise<void> {
  return new Promise((done) => {
    const sock = createConnection(port, '127.0.0.1', () => {
      sock.write(
        `POST ${path} HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\nContent-Length: 100000\r\n\r\n{"partial":"`,
      );
      setTimeout(() => {
        sock.destroy();
        done();
      }, 50);
    });
    sock.on('error', () => done());
  });
}

const settle = (ms = 150) => new Promise((r) => setTimeout(r, ms));

describe('#2752 — the REAL proxy survives a client that drops mid-upload, on every route that reads a body', () => {
  let port = 0;
  let origin = '';
  let errors: string[] = [];

  beforeAll(async () => {
    port = await freePort();
    const data = mkdtempSync(join(tmpdir(), 'boundary-proxy-'));
    mkdirSync(join(data, 'shares'));
    Object.assign(process.env, {
      PORT: String(port),
      HOST: '127.0.0.1',
      // A key IS set, so /api/parse reads its body; the aborted body must stop it before the SDK.
      ANTHROPIC_API_KEY: 'test-key-never-used',
      EVENTS_LOG_PATH: join(data, 'events.jsonl'),
      SHARE_STORE_PATH: join(data, 'shares'),
    });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => {
      errors.push(a.map(String).join(' '));
    });
    await import('../standalone'); // load-in-body-ok: booting the real proxy must follow the env vars set just above (PORT, the test key)
    origin = `http://127.0.0.1:${port}`;
    for (let i = 0; i < 50; i++) {
      try {
        if ((await fetch(`${origin}/healthz`)).ok) break;
      } catch {
        await settle(20);
      }
    }
  }, 60_000);
  afterAll(() => vi.restoreAllMocks());

  const ROUTES = [
    '/geo-builder/api/parse',
    '/geo-builder/api/log',
    '/geo-builder/api/share',
    '/geo-builder/admin/login',
    '/analytic-builder/admin-analytic/login',
    '/3d-builder/admin3/login',
    '/geo-builder/admin/config',
  ];

  for (const route of ROUTES) {
    it(`an aborted POST ${route} leaves the proxy answering`, async () => {
      errors = [];
      await abortMidBody(port, route);
      await settle();
      expect((await fetch(`${origin}/healthz`)).status).toBe(200);
      // …and the next real request on a body route is served normally.
      const next = await fetch(`${origin}/geo-builder/api/log`, { method: 'GET' });
      expect(next.status).toBe(405);
      expect(errors.filter((e) => /unhandled rejection/i.test(e)), 'a rejection escaped its request').toEqual([]);
    });
  }

  it('no aborted body reached the model SDK', () => {
    expect(sdkImported.count).toBe(0);
  });
});

describe('#2752 — serveSafely ends a failing request, never the server', () => {
  let server: Server;
  let origin = '';
  const logged: string[] = [];

  beforeAll(async () => {
    server = createHttpServer(
      serveSafely(
        async (req, res) => {
          const path = req.url ?? '';
          if (path === '/sync') throw new Error('a synchronous throw');
          if (path === '/async') {
            await settle(5);
            throw new Error('a rejected promise');
          }
          if (path === '/late') {
            res.writeHead(200, { 'content-type': 'text/plain' });
            res.write('half');
            await settle(5);
            throw new Error('failed after answering began');
          }
          res.end('ok');
        },
        (m) => logged.push(m),
      ),
    );
    await new Promise<void>((ok) => server.listen(0, '127.0.0.1', () => ok()));
    origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  });
  afterAll(() => new Promise<void>((ok) => server.close(() => ok())));

  it('a handler that throws synchronously answers 500, and the log names the request', async () => {
    const r = await fetch(`${origin}/sync`);
    expect(r.status).toBe(500);
    expect(logged.some((m) => m.includes('/sync') && m.includes('a synchronous throw'))).toBe(true);
  });

  it('a handler that rejects answers 500', async () => {
    expect((await fetch(`${origin}/async`)).status).toBe(500);
  });

  it('a handler that fails after answering began closes that connection', async () => {
    const outcome = await fetch(`${origin}/late`).then(
      (r) => r.text().then(() => 'completed', () => 'closed'),
      () => 'closed',
    );
    expect(outcome).toBe('closed');
  });

  it('the server keeps serving after all three', async () => {
    const r = await fetch(`${origin}/fine`);
    expect(r.status).toBe(200);
    expect(await r.text()).toBe('ok');
  });
});

describe('#2752 — readBody, the one body reader', () => {
  const fakeReq = (chunks: (Buffer | string)[], failAfter = false) =>
    ({
      async *[Symbol.asyncIterator]() {
        for (const c of chunks) yield c;
        if (failAfter) throw Object.assign(new Error('aborted'), { code: 'ECONNRESET' });
      },
    }) as unknown as IncomingMessage;

  it('resolves null (never rejects) when the client goes away mid-body', async () => {
    await expect(readBody(fakeReq([Buffer.from('{"a":')], true), 1000)).resolves.toBeNull();
  });

  it('resolves null over the cap', async () => {
    await expect(readBody(fakeReq([Buffer.alloc(600), Buffer.alloc(600)]), 1000)).resolves.toBeNull();
  });

  it('keeps a Hebrew letter whole when its two bytes arrive in different chunks', async () => {
    const bytes = Buffer.from('אב', 'utf8'); // d7 90 d7 91
    const body = await readBody(fakeReq([bytes.subarray(0, 1), bytes.subarray(1, 3), bytes.subarray(3)]), 1000);
    expect(body).toBe('אב');
  });

  it('accepts string chunks (a host that set an encoding)', async () => {
    await expect(readBody(fakeReq(['{"a":', '1}']), 1000)).resolves.toBe('{"a":1}');
  });
});

describe('#2752 — the ratchet: no server module fires a handler and forgets it, or reads a body itself', () => {
  const sources = readdirSync(SERVER_DIR)
    .filter((f) => f.endsWith('.ts'))
    .map((f) => ({ f, text: readFileSync(join(SERVER_DIR, f), 'utf8') }));

  it('the server tree has modules to check', () => {
    expect(sources.length).toBeGreaterThan(5);
  });

  it('no `void handleX(...)` anywhere in server/: a handler is returned into the boundary', () => {
    const offenders = sources.filter((s) => /\bvoid\s+handle[A-Z]\w*\(/.test(s.text)).map((s) => s.f);
    expect(offenders).toEqual([]);
  });

  it('only http.ts iterates a request body; everyone else calls readBody', () => {
    const offenders = sources
      .filter((s) => s.f !== 'http.ts' && /for\s+await\s*\(\s*const\s+\w+\s+of\s+req\b/.test(s.text))
      .map((s) => s.f);
    expect(offenders).toEqual([]);
  });

  it('every dev mount runs inside serveSafely', () => {
    const unguarded: string[] = [];
    for (const { f, text } of sources) {
      for (const m of text.matchAll(/middlewares\.use\(\s*'([^']*)'\s*,\s*/g)) {
        const after = text.slice((m.index ?? 0) + m[0].length);
        if (!after.startsWith('serveSafely(')) unguarded.push(`${f} ${m[1]}`);
      }
    }
    expect(unguarded).toEqual([]);
  });

  it('the production server mounts its router inside serveSafely', () => {
    const standalone = sources.find((s) => s.f === 'standalone.ts')?.text ?? '';
    expect(standalone).toContain('createServer(serveSafely(dispatch))');
  });
});
