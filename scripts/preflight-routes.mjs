/**
 * THE ROUTE PROBES — the half of a deploy the artifact hashes cannot see (#1279, ADR-W-103).
 *
 * On 2026-09-20 every row of `deploy:preflight` read MATCHES while `/analytic-builder/api/parse`
 * answered 404: the conf existed in `deploy/`, and nobody had pasted it into Plesk. The bundle and the
 * proxy were both current; the ROUTE between them was missing, and nothing measured routes. The same
 * class had already happened once (#903: `/complex-builder/api/*` 404 for a month), and every consumer
 * has a deliberate degraded path, so a missing route is silent by construction.
 *
 * ## Where the route list comes from
 *
 * **From the tracked confs, never from a list written here.** For every product `products.json`
 * marks enabled, its `deploy/apache-<prefix>.conf` is read and every `ProxyPass <public> <backend>`
 * line becomes one probe. A conf that gains a line gains a probe; a new builder gains its probes the
 * moment its conf exists. An enabled product with NO conf is itself reported BROKEN.
 *
 * ## What a probe sends, and why it can never reach the model
 *
 * What IS written here is one PROBE SHAPE per proxy handler — the request and the answer that proves
 * the request reached `geo-proxy` rather than Apache's filesystem (which answers 404). The shape is
 * chosen by the conf line's BACKEND tail, mirroring `server/standalone.ts`'s dispatch. A tail with no
 * shape is reported BROKEN ("no probe shape"), so a new handler cannot ship unprobed.
 *
 * Every probe is a **GET with no body**. For `api/parse` the handler's FIRST statement is
 * `if (req.method !== 'POST') return send(405, …)` (`server/parseHandler.ts`) — before the API-key
 * check, the per-IP rate limiter, the body read, the daily counter and the dynamic SDK import. So a
 * probe cannot start a model call, cannot spend quota, and cannot even consume a rate-limit slot.
 * The same first-statement 405 guards `api/log` (nothing is written) and `api/share` (no share is
 * stored — unlike the RUNBOOK's manual POST probe, which creates one).
 *
 * It reads. Nothing here writes to the server.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** `/geo-builder/` → `apache-geo-builder.conf` — the naming #903's lock already enforces. */
export const confFor = (url) => `apache${url.replace(/\/$/, '').replace(/\//g, '-')}.conf`;

const PROXY_LINE = /^ProxyPass\s+(\S+)\s+https?:\/\/127\.0\.0\.1:8788(\S+)\s*$/;

/**
 * Every route the enabled products' confs declare.
 *
 * @param {string} deployDir  the directory holding `apache-*.conf`
 * @param {{ products: { id: string, url: string, enabled?: boolean }[] }} registry  `products.json`
 * @returns {{ routes: { product: string, conf: string, public: string, backend: string }[],
 *             missingConfs: { product: string, conf: string }[] }}
 */
export function readConfRoutes(deployDir, registry) {
  const routes = [];
  const missingConfs = [];
  const seen = new Set();
  for (const p of registry.products.filter((q) => q.enabled !== false)) {
    const conf = confFor(p.url);
    const file = resolve(deployDir, conf);
    if (!existsSync(file)) {
      missingConfs.push({ product: p.id, conf });
      continue;
    }
    for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = raw.trim().match(PROXY_LINE);
      if (!m || seen.has(m[1])) continue;
      seen.add(m[1]);
      routes.push({ product: p.id, conf, public: m[1], backend: m[2] });
    }
  }
  return { routes, missingConfs };
}

/**
 * One probe shape per proxy handler, keyed by the BACKEND tail as `server/standalone.ts` dispatches
 * it. `suffix` is appended to the public path; `routed(status, headers, body)` is true only for an
 * answer Apache's static handler cannot produce for a path with no ProxyPass.
 */
const SHAPES = [
  {
    kind: 'share page',
    match: (tail) => tail.startsWith('/g/'),
    suffix: 'preflight-probe',
    expect: '404 + x-robots-tag',
    // A dead share id is a 404 from the proxy too — so the status alone cannot tell routed from not.
    // `handleSharePage` sets `x-robots-tag: noindex` on EVERY answer (#1384); Apache's own 404 has none.
    routed: (s, h) => s === 404 && /noindex/i.test(h.get('x-robots-tag') ?? ''),
  },
  { kind: 'llm parse', match: (t) => t.endsWith('/api/parse'), suffix: '', expect: '405', routed: (s) => s === 405 },
  { kind: 'events log', match: (t) => t.endsWith('/api/log'), suffix: '', expect: '405', routed: (s) => s === 405 },
  { kind: 'share upload', match: (t) => t.endsWith('/api/share'), suffix: '', expect: '405', routed: (s) => s === 405 },
  {
    kind: 'config read',
    match: (t) => t.endsWith('/api/config'),
    suffix: '?tool=preflight-probe',
    expect: '204',
    // An unknown tool answers 204 before any file is read (`handleConfigRead`).
    routed: (s) => s === 204,
  },
  {
    kind: 'dashboard',
    match: (t) => t.startsWith('/admin'),
    suffix: '',
    expect: '200 login form',
    // Unauthenticated, every dashboard mount answers its login page — a form posting to `<base>/login`.
    routed: (s, _h, body) => s === 200 && /action="[^"]*\/login"/.test(body),
  },
];

/** The probe for one conf route, or `null` when no handler shape matches its backend tail. */
export function probeFor(route) {
  const shape = SHAPES.find((s) => s.match(route.backend));
  if (!shape) return null;
  return { ...shape, method: 'GET', path: `${route.public}${shape.suffix}` };
}

/**
 * Probe every route. `fetchImpl` is injected so a test can stand in for the network (or for Apache).
 *
 * @returns {Promise<{ route: object, status: string, detail: string }[]>}  status is
 *   `MATCHES live`, `BROKEN` or `UNKNOWN` (the request itself failed — the verdict is incomplete).
 */
export async function probeRoutes(routes, { origin, fetchImpl = fetch }) {
  const out = [];
  for (const route of routes) {
    const probe = probeFor(route);
    if (!probe) {
      out.push({ route, status: 'BROKEN', detail: `no probe shape for backend tail ${route.backend} — add one to scripts/preflight-routes.mjs` });
      continue;
    }
    let res;
    try {
      res = await fetchImpl(`${origin}${probe.path}`, { method: probe.method, redirect: 'manual' });
    } catch (e) {
      out.push({ route, status: 'UNKNOWN', detail: `GET ${probe.path} failed: ${e?.message ?? e}` });
      continue;
    }
    const body = await res.text().catch(() => '');
    if (probe.routed(res.status, res.headers, body)) {
      out.push({ route, status: 'MATCHES live', detail: `GET ${probe.path} -> ${res.status}` });
    } else {
      const why = res.status === 404 ? 'not routed — Apache has no ProxyPass for it (paste the conf into Plesk)' : `expected ${probe.expect}`;
      out.push({ route, status: 'BROKEN', detail: `GET ${probe.path} -> ${res.status}, ${why}` });
    }
  }
  return out;
}

/**
 * The whole route check as the preflight runs it: the enabled products' confs, probed against
 * `origin`. Returns preflight rows (`what`, `status`) — a missing conf is a BROKEN row of its own.
 */
export async function routeRows({ root, origin, fetchImpl = fetch, registry }) {
  const reg = registry ?? JSON.parse(readFileSync(resolve(root, 'products.json'), 'utf8'));
  const { routes, missingConfs } = readConfRoutes(resolve(root, 'deploy'), reg);
  const rows = missingConfs.map((m) => ({
    what: `route (${m.product}) deploy/${m.conf}`,
    status: 'BROKEN — the product is enabled and has no conf, so none of its routes exist (#903)',
  }));
  for (const r of await probeRoutes(routes, { origin, fetchImpl })) {
    rows.push({ what: `route ${r.route.public}`, status: r.status === 'MATCHES live' ? r.status : `${r.status} — ${r.detail}` });
  }
  return rows;
}
