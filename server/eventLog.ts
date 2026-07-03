/**
 * Production usage-event sink (admin dashboard data source).
 *
 * Hosts `POST .../api/log`: the SPA's `logDebug` fire-and-forgets one lean event
 * per user action (a `session` marker per page load, a `submit` per utterance).
 * We validate it, HASH the client IP (salted — the raw IP is never stored), and
 * append one JSON line to `events.jsonl`. The admin dashboard (`server/admin.ts`)
 * reads + aggregates that file.
 *
 * Best-effort: it never blocks the app and always answers quickly. Holds no
 * secrets beyond the in-process hash salt. Mirrors `parseHandler.ts` conventions
 * (shared rate-limit / body-cap / client-IP helpers).
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { createHmac } from 'node:crypto';
import { appendFile, mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { clientIp, makeRateLimiter, readBody } from './http';

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 120; // events/minute/IP — a busy session fires several per submit
const MAX_BODY = 8192; // bytes
const MAX_UTTERANCE = 400; // chars — match the parse proxy's cap
const MAX_LOG_BYTES = 50 * 1024 * 1024; // rotate past 50 MB so the file never grows unbounded

const rateLimited = makeRateLimiter(MAX_PER_WINDOW, WINDOW_MS);

/** Resolve the events-log path: `EVENTS_LOG_PATH` env, else `./logs/events.jsonl`. */
export function eventsLogPath(): string {
  return process.env.EVENTS_LOG_PATH || path.resolve(process.cwd(), 'logs', 'events.jsonl');
}

/** Salted, truncated HMAC of the IP — stable per IP+salt, not reversible to the IP. */
export function hashIp(ip: string, salt: string): string {
  return createHmac('sha256', salt).update(ip).digest('hex').slice(0, 16);
}

/** A stored usage event (server fields + the client's lean payload). */
export interface UsageEvent {
  serverTs: string;
  iph: string;
  ev: 'session' | 'submit';
  sid?: string;
  t?: string;
  rel?: string; // the build release (git short-hash · date) this event came from — for the dashboard's release filter
  utterance?: string;
  locale?: string;
  source?: string;
  result?: string;
}

export interface LogHandlerOpts {
  /** Salt for the IP hash (root-only env). Absent → a constant fallback (still non-reversible-ish). */
  ipSalt: string;
  /** Override the events file (tests). Defaults to `eventsLogPath()`. */
  logPath?: string;
}

/** Validate + normalise one client payload into a lean stored event (or null to drop). */
function normalise(raw: unknown): Omit<UsageEvent, 'serverTs' | 'iph'> | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const ev = o.ev;
  if (ev !== 'session' && ev !== 'submit') return null;
  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : undefined);
  const out: Omit<UsageEvent, 'serverTs' | 'iph'> = { ev };
  out.sid = str(o.sid, 16);
  out.t = str(o.t, 40);
  out.rel = str(o.rel, 32); // stamped on BOTH session + submit so a release filter keeps session/visitor counts
  if (ev === 'submit') {
    out.utterance = str(o.utterance, MAX_UTTERANCE);
    out.locale = str(o.locale, 8);
    out.source = str(o.source, 24);
    out.result = str(o.result, 64);
  }
  return out;
}

/**
 * Drop events older than the cutoff (SEC-7 privacy retention). Pure: keeps lines whose `serverTs` is on or
 * after `cutoffMs`; a blank line is dropped, an UNPARSEABLE line is KEPT (never lose data on one bad line).
 * A minors'-data tool shouldn't retain student utterances + IP hashes forever; `EVENTS_RETENTION_DAYS`
 * bounds the age, and this is applied at most once per day so it's cheap.
 */
export function pruneOldEvents(text: string, cutoffMs: number): string {
  const kept = text
    .split('\n')
    .filter((line) => {
      if (!line.trim()) return false;
      try {
        const ts = Date.parse((JSON.parse(line) as { serverTs?: string }).serverTs ?? '');
        return !Number.isFinite(ts) || ts >= cutoffMs; // keep undated/malformed rather than silently drop
      } catch {
        return true;
      }
    })
    .join('\n');
  return kept ? kept + '\n' : '';
}

/**
 * All writers to the events file run through ONE in-process queue. The prune is a read-modify-write
 * with awaits between; a concurrent request's `appendFile` landing inside that window was CLOBBERED
 * by the prune's rewrite (proven by probe: an event that had already received its 204 vanished —
 * review 2026-07-03, V1). Serializing every prune/rotate/append closes the lost-write race.
 */
let writeQueue: Promise<unknown> = Promise.resolve();
function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeQueue.then(fn, fn);
  writeQueue = run.catch(() => {});
  return run;
}

let lastPruneDay = '';
/** Once per UTC day, rewrite the log without events older than `EVENTS_RETENTION_DAYS` (unset → keep all). */
async function pruneByRetention(file: string): Promise<void> {
  const days = Number(process.env.EVENTS_RETENTION_DAYS);
  if (!days || !Number.isFinite(days) || days <= 0) return; // retention disabled → keep everything (no change)
  const today = new Date().toISOString().slice(0, 10);
  if (today === lastPruneDay) return; // already pruned today
  lastPruneDay = today;
  try {
    const text = await readFile(file, 'utf8');
    const pruned = pruneOldEvents(text, Date.now() - days * 86_400_000);
    // Atomic swap (write a sibling tmp, then rename over) so a concurrent dashboard read never sees a
    // torn / mid-truncate file; rename replaces in place on the same filesystem.
    if (pruned.length !== text.length) {
      await writeFile(file + '.tmp', pruned, 'utf8');
      await rename(file + '.tmp', file);
    }
  } catch {
    /* no file yet, or a read/write race — ignore (best-effort) */
  }
}

/** Rotate the log if it has grown past the cap (best-effort; keeps one `.1` backup). */
async function rotateIfLarge(file: string): Promise<void> {
  try {
    const s = await stat(file);
    if (s.size > MAX_LOG_BYTES) await rename(file, file + '.1');
  } catch {
    /* no file yet, or rename raced — ignore */
  }
}

/** Handle one `POST .../api/log`: validate, rate-limit, hash IP, append. Always best-effort. */
export async function handleLog(
  req: IncomingMessage,
  res: ServerResponse,
  { ipSalt, logPath }: LogHandlerOpts,
): Promise<void> {
  const end = (code: number) => {
    res.statusCode = code;
    res.end();
  };
  if (req.method !== 'POST') return end(405);

  const ip = clientIp(req);
  if (rateLimited(ip)) return end(429);

  const body = await readBody(req, MAX_BODY);
  if (body === null) return end(413);

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return end(400);
  }
  const lean = normalise(payload);
  if (!lean) return end(400);

  const file = logPath ?? eventsLogPath();
  const entry: UsageEvent = { serverTs: new Date().toISOString(), iph: hashIp(ip, ipSalt), ...lean };
  try {
    // One writer at a time (see `serialized`): the prune's read-modify-write and every append are
    // mutually ordered, so no committed event can be clobbered by a concurrent prune rewrite.
    await serialized(async () => {
      await mkdir(path.dirname(file), { recursive: true });
      await pruneByRetention(file); // age-based retention (SEC-7), at most once/day
      await rotateIfLarge(file);
      await appendFile(file, JSON.stringify(entry) + '\n', 'utf8');
    });
  } catch {
    /* disk hiccup — logging must never surface to the user */
  }
  return end(204);
}
