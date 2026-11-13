/**
 * The management console's routes (#2868, ADR-W-208): `…/management`, behind its own login.
 *
 *   GET  /                 what needs me (decisions, tests, PRs, plans) — answerable
 *   GET  /since?from=ISO   what happened since the last visit
 *   GET  /plan             the plan, the pace and unit readiness
 *   GET  /live             what is deployed, what main holds beyond it
 *   GET  /backlog          features we are not getting to, the directions inventory
 *   GET  /usage            usage and what real users failed this week
 *   GET  /cost             what each fix round cost
 *   GET  /issue?n=N        one issue, with its actions
 *   POST /act              one allow-listed action (CSRF)
 *   POST /refresh          drop the cache (CSRF)
 *   POST /login, GET /logout
 */
import { existsSync } from 'node:fs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { readEvents, readVerdicts } from '../admin';
import { hashIp } from '../eventLog';
import { clientIp, makeRateLimiter, readBody } from '../http';
import { planAction, runWrites } from './actions';
import { COOKIE, SESSION_MS, csrfFor, makeSession, readCookies, safeEq, totpOk, validSession } from './auth';
import type { GhClient } from './github';
import { backlogPage, costPage, dryRunText, homePage, issuePage, livePage, loginPage, planPage, sincePage, usagePage, type Frame } from './render';
import { backlog, cost, live, makeCtx, needsMe, pace, sinceLast } from './sections';
import { loadSnapshot, toIssue, type Snapshot } from './snapshot';
import { BUILDERS, builderUsage } from './usage';

export interface ManagementOpts {
  username: string;
  password: string;
  cookieSecret: string;
  /** base32 TOTP secret; empty = no second factor, and then writes stay off */
  totpSecret: string;
  /** Public base path the browser sees. */
  base: string;
  gh: GhClient | null;
  writes: 'on' | 'dry' | 'off';
  /** Branch the ops files are read from (and plan edits written to). */
  ref: string;
  /** Per builder id, its events file; null = this server has no log for it. */
  eventLogs: Record<string, string | null>;
  /** Salt of the visitor hash, so the operator's own devices are recognised. */
  ipSalt: string;
  /** Where the console keeps its own small state (the operator's device hashes, the last visit). */
  stateFile: string;
  now?: () => Date;
}

const loginLimited = makeRateLimiter(10, 60_000);
const actLimited = makeRateLimiter(60, 60_000);

interface State {
  mine: string[];
  lastVisit: string | null;
}

async function readState(file: string): Promise<State> {
  try {
    const s = JSON.parse(await readFile(file, 'utf8')) as State;
    return { mine: Array.isArray(s.mine) ? s.mine : [], lastVisit: s.lastVisit ?? null };
  } catch {
    return { mine: [], lastVisit: null };
  }
}

async function writeState(file: string, s: State): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(s, null, 2));
}

/** The visitor hash of this request — the same hash `/api/log` gives a student's events. */
const iphOf = (req: IncomingMessage, salt: string) => hashIp(clientIp(req), salt);

function send(res: ServerResponse, code: number, html: string, headers: Record<string, string> = {}) {
  res.statusCode = code;
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('x-frame-options', 'DENY');
  res.setHeader('referrer-policy', 'same-origin');
  // No script on any console page: forms only.
  res.setHeader('content-security-policy', "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(html);
}

function redirect(res: ServerResponse, to: string, cookie?: string) {
  res.statusCode = 303;
  res.setHeader('location', to);
  res.setHeader('cache-control', 'no-store');
  if (cookie) res.setHeader('set-cookie', cookie);
  res.end();
}

const SCREEN_PATHS = new Set(['', '/', '/since', '/plan', '/live', '/backlog', '/usage', '/cost', '/issue']);

export async function handleManagement(req: IncomingMessage, res: ServerResponse, opts: ManagementOpts): Promise<void> {
  const now = opts.now?.() ?? new Date();
  const url = new URL(req.url ?? '/', 'http://x');
  const at = url.pathname.indexOf('/management');
  const sub = at < 0 ? '' : url.pathname.slice(at + '/management'.length).replace(/\/$/, '');
  const base = opts.base;
  const cookieAttrs = `HttpOnly; Secure; SameSite=Strict; Path=${base}`;
  const configured = !!(opts.username && opts.password && opts.cookieSecret);
  const twoFactor = opts.totpSecret.length > 0;
  // Writes need the second factor (#2762's minimum): without it the console is read-only.
  const writes: Frame['writes'] = opts.writes === 'on' && !twoFactor ? 'off' : opts.writes;

  if (sub === '/logout') return redirect(res, base, `${COOKIE}=; ${cookieAttrs}; Max-Age=0`);

  if (sub === '/login' && req.method === 'POST') {
    if (loginLimited(clientIp(req))) return send(res, 429, loginPage(base, { error: true, totp: twoFactor, disabled: !configured }));
    const body = await readBody(req, 8 * 1024);
    const p = new URLSearchParams(body ?? '');
    const ok =
      configured &&
      safeEq(p.get('username') ?? '', opts.username) &&
      safeEq(p.get('password') ?? '', opts.password) &&
      (!twoFactor || totpOk(opts.totpSecret, p.get('code') ?? '', now.getTime()));
    if (!ok) return send(res, 401, loginPage(base, { error: true, totp: twoFactor, disabled: !configured }));
    // The device he logs in from is his: its visits leave the student counts.
    const st = await readState(opts.stateFile);
    const me = iphOf(req, opts.ipSalt);
    if (!st.mine.includes(me)) await writeState(opts.stateFile, { ...st, mine: [...st.mine, me] });
    return redirect(res, base, `${COOKIE}=${makeSession(opts.cookieSecret, now.getTime())}; ${cookieAttrs}; Max-Age=${SESSION_MS / 1000}`);
  }

  const session = readCookies(req)[COOKIE];
  if (!configured || !validSession(session, opts.cookieSecret, now.getTime())) {
    return send(res, 200, loginPage(base, { error: false, totp: twoFactor, disabled: !configured }));
  }
  const csrf = csrfFor(session!, opts.cookieSecret);

  if (req.method === 'POST') {
    const body = await readBody(req, 64 * 1024);
    if (body === null) return send(res, 413, 'too large');
    const f = new URLSearchParams(body);
    const origin = req.headers.origin;
    const host = req.headers['x-forwarded-host'] ?? req.headers.host;
    const sameOrigin = !origin || (host && new URL(origin).host === String(host).split(',')[0].trim());
    if (!safeEq(f.get('csrf') ?? '', csrf) || !sameOrigin) return send(res, 403, 'forbidden');
    const back = f.get('back') ?? '';
    const backPath = SCREEN_PATHS.has(back.split('?')[0]) ? back : '';
    const to = (msg: string, ok: boolean) => `${base}${backPath || '/'}${backPath.includes('?') ? '&' : '?'}${ok ? 'ok' : 'err'}=${encodeURIComponent(msg)}`;
    if (sub === '/refresh') {
      opts.gh?.clear();
      return redirect(res, `${base}${backPath || '/'}`);
    }
    if (sub !== '/act') return send(res, 404, 'not found');
    if (actLimited(clientIp(req))) return redirect(res, to('יותר מדי פעולות בדקה. נסו שוב בעוד רגע.', false));
    const plan = planAction(f, now);
    if (!plan.ok) return redirect(res, to(plan.message, false));
    if (writes === 'off') return redirect(res, to('הדף במצב קריאה בלבד: לא נכתב דבר.', false));
    if (writes === 'dry' || !opts.gh) {
      console.log('[management] dry run:', JSON.stringify(plan.writes));
      return redirect(res, to(dryRunText(plan.writes), true));
    }
    try {
      const r = await runWrites(opts.gh, plan.writes, opts.ref);
      return redirect(res, to(r.created ? `${plan.message} (#${r.created})` : plan.message, true));
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      console.error('[management] write failed:', m);
      return redirect(res, to(`GitHub סירב: ${m.slice(0, 200)}`, false));
    }
  }

  if (req.method !== 'GET' || !SCREEN_PATHS.has(sub)) return send(res, 404, 'not found');
  if (!opts.gh) return send(res, 503, 'אין חיבור ל-GitHub: חסר MGMT_GITHUB_TOKEN בשרת.');

  const flash = url.searchParams.get('ok') ? { ok: true, text: url.searchParams.get('ok')! } : url.searchParams.get('err') ? { ok: false, text: url.searchParams.get('err')! } : null;
  const today = now.toISOString().slice(0, 10);
  const st = await readState(opts.stateFile);
  const planStart = '2026-10-20';
  const snap: Snapshot = await loadSnapshot(opts.gh, {
    since: `${planStart}T00:00:00Z`,
    commitsSince: new Date(now.getTime() - 21 * 864e5).toISOString(),
    ref: opts.ref,
    now: () => now,
  });
  const frame: Frame = { base, csrf, writes, flash, asOf: snap.asOf, errors: snap.errors, ref: opts.ref };
  const ctx = makeCtx(snap, today);

  switch (sub) {
    case '':
    case '/': {
      const since = st.lastVisit ?? new Date(now.getTime() - 864e5).toISOString();
      const s = sinceLast(ctx, since);
      return send(res, 200, homePage(frame, needsMe(ctx), snap.asOf, { fixed: s.fixed.length, filed: s.filed.length, deploys: s.deploys.length, since }));
    }
    case '/since': {
      const prev = st.lastVisit ?? new Date(now.getTime() - 864e5).toISOString();
      const from = url.searchParams.get('from');
      const since = from && /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(from) ? from : prev;
      const iso = (d: number) => new Date(now.getTime() - d * 864e5).toISOString();
      // Leaving this screen marks the visit: the next one starts from now.
      await writeState(opts.stateFile, { ...st, lastVisit: now.toISOString() });
      return send(res, 200, sincePage(frame, sinceLast(ctx, since), [
        { label: 'מהביקור הקודם', since: prev },
        { label: '24 שעות', since: iso(1) },
        { label: '3 ימים', since: iso(3) },
        { label: 'שבוע', since: iso(7) },
        { label: 'שבועיים', since: iso(14) },
      ]));
    }
    case '/plan':
      return send(res, 200, planPage(frame, pace(ctx)));
    case '/live':
      return send(res, 200, livePage(frame, live(ctx)));
    case '/backlog':
      return send(res, 200, backlogPage(frame, backlog(ctx), snap.asOf));
    case '/cost':
      return send(res, 200, costPage(frame, cost(ctx)));
    case '/usage': {
      const mine = new Set(st.mine);
      const issues = [...snap.open, ...snap.parked];
      const us = await Promise.all(
        BUILDERS.map(async (b) => {
          const file = opts.eventLogs[b.id];
          const events = file && existsSync(file) ? await readEvents(file) : null;
          const vm = file ? await readVerdicts(join(dirname(file), `verdicts-${b.id}.json`)) : null;
          return builderUsage(b, events, vm, issues, mine, now);
        }),
      );
      return send(res, 200, usagePage(frame, us, mine.size, snap.asOf));
    }
    case '/issue': {
      const n = Number(url.searchParams.get('n'));
      if (!Number.isInteger(n) || n <= 0) return send(res, 404, 'not found');
      let i = ctx.byN.get(n) ?? null;
      if (!i) {
        try {
          const raw = await opts.gh.get<Parameters<typeof toIssue>[0]>(`issues/${n}`);
          i = raw.pull_request ? null : toIssue(raw);
        } catch {
          i = null;
        }
      }
      return send(res, 200, issuePage(frame, i, n));
    }
  }
  return send(res, 404, 'not found');
}
