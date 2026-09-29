/**
 * #1279 (ADR-W-103) — THE PREFLIGHT PROBES ROUTES, NOT ONLY ARTIFACTS.
 *
 * On 2026-09-20 every row of `deploy:preflight` read MATCHES while `/analytic-builder/api/parse`
 * answered 404: the conf was in the repo and had never been pasted into Plesk. The tool that exists to
 * say "this deploy is complete" measured the bundles and the proxy, never the path between them.
 *
 * These locks CALL the real decisions in `scripts/preflight-routes.mjs` and `preflightVerdict` — the
 * function whose `code` is the script's exit code — and never re-state them:
 *
 *  1. the route list is DERIVED from the tracked confs (a new conf line adds a probe);
 *  2. every probe, sent to the REAL proxy (`server/standalone.ts`, booted here with the prefix-stripping
 *     Apache does emulated in `fetch`), reads as routed — and not one of them reaches the model SDK;
 *  3. an Apache-style 404 on any route makes the preflight exit non-zero.
 *
 * No network: the only server is the in-process proxy on loopback.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — plain .mjs scripts, deliberately untyped
import { probeFor, probeRoutes, readConfRoutes, routeRows } from '../../scripts/preflight-routes.mjs';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — plain .mjs scripts, deliberately untyped
import { preflightVerdict } from '../../scripts/preflight-targets.mjs';

/** A probe must never start a model call: importing the SDK at all is the tripwire. */
const sdkImported = vi.hoisted(() => ({ count: 0 }));
vi.mock('@anthropic-ai/sdk', () => {
  sdkImported.count++;
  throw new Error('a route probe reached the Anthropic SDK — it must be answered before any model call');
});

type Route = { product: string; conf: string; public: string; backend: string };
type Row = { what: string; status: string };

const root = resolve(__dirname, '..', '..');
const registry = JSON.parse(readFileSync(join(root, 'products.json'), 'utf8')) as {
  products: { id: string; url: string; enabled?: boolean }[];
};
const enabled = registry.products.filter((p) => p.enabled !== false);
const real = readConfRoutes(join(root, 'deploy'), registry) as { routes: Route[]; missingConfs: unknown[] };

describe('#1279 — the route list is DERIVED from the tracked confs', () => {
  it('reads every enabled product, and the route that 404d on 2026-09-20 is on it', () => {
    expect(real.missingConfs).toEqual([]);
    expect(new Set(real.routes.map((r) => r.product))).toEqual(new Set(enabled.map((p) => p.id)));
    expect(real.routes).toContainEqual(
      expect.objectContaining({ public: '/analytic-builder/api/parse', backend: '/api/parse' }),
    );
    // Apache strips the prefix; the 3-D dashboard is the distinct /admin3 tail — read from the conf.
    expect(real.routes).toContainEqual(expect.objectContaining({ public: '/3d-builder/admin', backend: '/admin3' }));
  });

  it('every declared route has a probe shape, and every probe is a bodiless GET', () => {
    for (const r of real.routes) {
      const p = probeFor(r);
      expect(p, `no probe shape for ${r.public} -> ${r.backend}`).not.toBeNull();
      expect(p.method, r.public).toBe('GET');
    }
  });

  it('a new product conf with new lines ADDS probes — no list here to forget', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pf-routes-'));
    const reg = { products: [...registry.products, { id: 'fifth', url: '/fifth-builder/', enabled: true }] };
    const conf = (lines: string[]) =>
      writeFileSync(join(dir, 'apache-fifth-builder.conf'), `# a comment\n${lines.join('\n')}\n`);

    // No conf at all: the product is enabled, so that is itself a finding.
    const none = readConfRoutes(dir, reg);
    expect(none.missingConfs).toContainEqual({ product: 'fifth', conf: 'apache-fifth-builder.conf' });

    conf([
      'ProxyPass /fifth-builder/api/config http://127.0.0.1:8788/api/config',
      'ProxyPassReverse /fifth-builder/api/config http://127.0.0.1:8788/api/config',
    ]);
    const one = readConfRoutes(dir, reg).routes.filter((r: Route) => r.product === 'fifth');
    expect(one.map((r: Route) => r.public)).toEqual(['/fifth-builder/api/config']);

    conf([
      'ProxyPass /fifth-builder/api/config http://127.0.0.1:8788/api/config',
      'ProxyPass /fifth-builder/api/parse http://127.0.0.1:8788/api/parse',
    ]);
    const two = readConfRoutes(dir, reg).routes.filter((r: Route) => r.product === 'fifth');
    expect(two.map((r: Route) => r.public)).toEqual(['/fifth-builder/api/config', '/fifth-builder/api/parse']);
  });

  it('a backend tail with no probe shape is BROKEN, never silently skipped', async () => {
    const [row] = await probeRoutes([{ product: 'x', conf: 'c', public: '/x/api/new', backend: '/api/new' }], {
      origin: 'http://unused',
      fetchImpl: async () => {
        throw new Error('must not be called');
      },
    });
    expect(row.status).toBe('BROKEN');
    expect(row.detail).toContain('no probe shape');
  });
});

describe('#1279 — against the REAL proxy, every probe reads routed and none reaches the model', () => {
  let origin = '';

  beforeAll(async () => {
    const port = await new Promise<number>((ok) => {
      const s = createServer();
      s.listen(0, '127.0.0.1', () => {
        const p = (s.address() as { port: number }).port;
        s.close(() => ok(p));
      });
    });
    const data = mkdtempSync(join(tmpdir(), 'pf-proxy-'));
    mkdirSync(join(data, 'shares'));
    Object.assign(process.env, {
      PORT: String(port),
      HOST: '127.0.0.1',
      // A key IS set, so the only thing standing between a probe and the SDK is the probe's shape.
      ANTHROPIC_API_KEY: 'test-key-never-used',
      EVENTS_LOG_PATH: join(data, 'events.jsonl'),
      SHARE_STORE_PATH: join(data, 'shares'),
    });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await import('../standalone'); // load-in-body-ok: booting the real proxy must follow the env vars set just above (PORT, the test key)
    origin = `http://127.0.0.1:${port}`;
    // Wait until it is listening.
    for (let i = 0; i < 50; i++) {
      try {
        if ((await fetch(`${origin}/healthz`)).ok) break;
      } catch {
        await new Promise((r) => setTimeout(r, 20));
      }
    }
  }, 60_000);
  afterAll(() => vi.restoreAllMocks());

  /** Apache's ProxyPass: the public prefix is replaced by the backend tail; anything else 404s. */
  const apache =
    (installed: Route[]) =>
    async (url: string, init: RequestInit): Promise<Response> => {
      const path = url.slice(origin.length);
      const rule = installed.find((r) => path.startsWith(r.public));
      if (!rule) return new Response('<title>404 Not Found</title>', { status: 404, headers: { 'content-type': 'text/html' } });
      return fetch(`${origin}${rule.backend}${path.slice(rule.public.length)}`, init);
    };

  it('with every conf installed, every route MATCHES and the verdict is clean', async () => {
    const rows = (await routeRows({ root, origin, fetchImpl: apache(real.routes) })) as Row[];
    expect(rows.length).toBe(real.routes.length);
    expect(rows.filter((r) => r.status !== 'MATCHES live')).toEqual([]);
    expect(preflightVerdict(rows, 'host').code).toBe(0);
    expect(sdkImported.count, 'a probe reached the model SDK').toBe(0);
  });

  it('the 2026-09-20 failure: one route never pasted into Plesk -> BROKEN, preflight exits 1', async () => {
    const missing = '/analytic-builder/api/parse';
    const rows = (await routeRows({
      root,
      origin,
      fetchImpl: apache(real.routes.filter((r) => r.public !== missing)),
    })) as Row[];
    const broken = rows.filter((r) => r.status.startsWith('BROKEN'));
    expect(broken.map((r) => r.what)).toEqual([`route ${missing}`]);
    expect(broken[0].status).toContain('-> 404');
    const verdict = preflightVerdict(rows, 'host');
    expect(verdict.code).toBe(1);
    expect(verdict.lines.join('\n')).toContain('1 route(s) BROKEN');
  });

  it('a bare 404 on /g/ is NOT routed — the share page is told apart by its x-robots-tag', async () => {
    const rows = (await routeRows({
      root,
      origin,
      fetchImpl: apache(real.routes.filter((r) => r.public !== '/g/')),
    })) as Row[];
    expect(rows.find((r) => r.what === 'route /g/')?.status).toMatch(/^BROKEN/);
  });

  it('an unreachable host is UNKNOWN, and an incomplete verdict still exits 1', async () => {
    const rows = (await routeRows({
      root,
      origin,
      fetchImpl: async () => {
        throw new Error('ECONNREFUSED');
      },
    })) as Row[];
    expect(rows.every((r) => r.status.startsWith('UNKNOWN'))).toBe(true);
    expect(preflightVerdict(rows, 'host').code).toBe(1);
  });
});
