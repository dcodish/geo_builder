#!/usr/bin/env node
/**
 * #1813 (ADR-W-114) — ONE test run at a time, across every worktree of this repo.
 *
 *   node scripts/suite-lock.mjs <command…>     — wait for the lock, run the command, release.
 *   npm run test:locked -- npx vitest run <files>
 *
 * WHY: a fix round runs its items in parallel, each in its own worktree, and every vitest run already
 * uses all the cores. Overlapping runs doubled every gate in round #822 (ADR-W-034 item 3), and a
 * slow-tier file crawls under load. The rule "never overlap suite runs" was discipline; parallel items
 * make it a race. So the runs QUEUE instead: `test:fast`, `test:full` and the `test:run:<product>`
 * lanes take this lock themselves, and an ad-hoc run goes through `test:locked`.
 *
 * THE LOCK lives in the git COMMON dir (`git rev-parse --git-common-dir`), which every worktree shares
 * and git never commits. It is published by hard-linking a fully written draft onto the lock name —
 * atomic and exclusive — and holds the holder's pid, label and start time.
 *
 * FIRST COME, FIRST SERVED (#1949, ADR-W-123): waiting is a poll loop, so without a queue the lock
 * went to whichever waiter happened to poll first after a release — wait time was unbounded and unfair,
 * and one stream of round #1940 lost about an hour. So a waiter first drops a TICKET in `<lock>.queue/`,
 * named `<arrival ms>.<pid>`, and may attempt the lock only while its ticket is the lowest live one
 * (the current holder's own ticket is skipped, so the waiter at the head still reaches the stale-holder
 * takeover below). Tickets whose pid is gone are reclaimed by any waiter that notices, using the SAME
 * pid-liveness test as the stale-holder path — one definition of "dead", not two. The tickets add only
 * ORDER: exclusion is still the hard link alone, so a lost or duplicated ticket can never let two runs
 * overlap. `<lock>.queue/` is left in place when the queue empties; it costs one empty directory.
 *
 * STALE LOCKS: a holder that died (its pid no longer exists) or that has held past `MAX_HOLD_MS` is
 * taken over, and the takeover is printed. A crashed agent must never wedge the next round.
 *
 * RE-ENTRY: the holder runs its command with `GEO_SUITE_LOCK_HELD=1`, so `test:locked -- npm run
 * test:full` (whose runner also asks for the lock) does not wait for itself — it never takes a ticket.
 */
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  linkSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = resolve(fileURLToPath(import.meta.url), '..', '..');
/** A full suite is ~15 min; a holder past this is treated as dead (its process may have been orphaned). */
export const MAX_HOLD_MS = Number(process.env.GEO_SUITE_LOCK_MAX_HOLD_MS) || 2 * 60 * 60 * 1000;
const POLL_MS = Number(process.env.GEO_SUITE_LOCK_POLL_MS) || 2000;

/** The lock path: an explicit override (tests), else the git common dir shared by all worktrees. */
export function lockPath(cwd = HERE) {
  if (process.env.GEO_SUITE_LOCK_PATH) return process.env.GEO_SUITE_LOCK_PATH;
  const r = spawnSync('git', ['rev-parse', '--git-common-dir'], { cwd, encoding: 'utf8' });
  const dir = (r.stdout ?? '').trim() || '.git';
  return join(isAbsolute(dir) ? dir : resolve(cwd, dir), 'geo-suite.lock');
}

/**
 * THE one definition of "dead" in this file: the stale-holder path and the ticket queue both use it,
 * so a process is never dead for one and alive for the other.
 */
export const isPidAlive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM'; // exists, owned by someone else
  }
};

/**
 * Pure: may this recorded holder be taken over? Exported for `server/__tests__/suite-lock.test.ts`.
 * `holder` is the parsed lock file, or null when it is unreadable (a torn write), which counts as stale.
 */
export function isStale(holder, now = Date.now(), isAlive = isPidAlive) {
  if (!holder || typeof holder.pid !== 'number') return true;
  if (!isAlive(holder.pid)) return true;
  return now - (holder.at ?? 0) > MAX_HOLD_MS;
}

const readHolder = (p) => {
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
};

const sleepSync = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/** The FIFO queue sits beside the lock, in the same dir every worktree shares, so there is one line. */
export const queueDir = (path) => `${path}.queue`;

/** A ticket is its own name: `<arrival ms>.<pid>`. Nothing else in the dir is a ticket. */
export function parseTicket(name) {
  const m = /^(\d+)\.(\d+)$/.exec(name);
  return m ? { name, seq: Number(m[1]), pid: Number(m[2]) } : null;
}

/** Arrival time orders the line; the pid breaks a tie between two waiters that arrived in the same ms. */
const byArrival = (a, b) => a.seq - b.seq || a.pid - b.pid;

const writeTicket = (path, ticket, label) => {
  mkdirSync(queueDir(path), { recursive: true });
  writeFileSync(ticket.file, JSON.stringify({ pid: ticket.pid, label, at: ticket.seq }));
};

/** Take our place in line. The ticket records our arrival, and only our own release gives it up. */
function enqueue(path, label) {
  const seq = Date.now();
  const name = `${seq}.${process.pid}`;
  const ticket = { name, seq, pid: process.pid, file: join(queueDir(path), name) };
  writeTicket(path, ticket, label);
  return ticket;
}

/** Every ticket currently in line. A missing queue dir is an empty line, never an error. */
export function readQueue(path) {
  try {
    return readdirSync(queueDir(path))
      .map(parseTicket)
      .filter((t) => t !== null);
  } catch {
    return [];
  }
}

/**
 * Drop the tickets of processes that are gone — a hard-killed waiter must never wedge the line, and any
 * waiter that notices reclaims it. Uses `isPidAlive`, the same test the stale-holder path uses.
 */
export function pruneQueue(path, tickets, isAlive = isPidAlive) {
  const live = [];
  for (const t of tickets) {
    if (isAlive(t.pid)) live.push(t);
    else rmSync(join(queueDir(path), t.name), { force: true });
  }
  return live;
}

/**
 * Pure: whose turn is it to attempt the lock? The earliest live ticket, ignoring the current holder's
 * own ticket — the holder keeps its place until it releases, and the waiter behind it must still reach
 * the stale-holder takeover. Exported for `server/__tests__/suite-lock.test.ts`.
 */
export function nextInLine(tickets, holderPid = null) {
  return tickets.filter((t) => t.pid !== holderPid).sort(byArrival)[0] ?? null;
}

/**
 * Block until the lock is ours; return a release function. Synchronous on purpose: `test-tiers.mjs`
 * is a synchronous runner, and a wait loop that sleeps the thread costs nothing while it waits.
 */
export function acquireSync(label, { path = lockPath(), log = console.error } = {}) {
  if (process.env.GEO_SUITE_LOCK_HELD === '1') return () => {}; // our parent holds it — we never queue
  const ticket = enqueue(path, label);
  let ticketDropped = false;
  const dropTicket = () => {
    if (ticketDropped) return;
    ticketDropped = true;
    rmSync(ticket.file, { force: true });
  };
  // A waiter that exits must give up its place; one killed outright is reclaimed by `pruneQueue`.
  process.once('exit', dropTicket);
  let announced = false;
  try {
    for (;;) {
      const held = readHolder(path);
      let queue = pruneQueue(path, readQueue(path));
      if (!queue.some((t) => t.name === ticket.name)) {
        writeTicket(path, ticket, label); // our place was removed from under us; take it back, same arrival
        queue = [...queue, ticket];
      }
      const turn = nextInLine(queue, held?.pid ?? null);
      if (turn && turn.name !== ticket.name) {
        // Someone arrived before us. Only the head attempts the lock, so no one can jump the line.
        if (!announced) {
          announced = true;
          const ahead = queue.filter((t) => byArrival(t, ticket) < 0).length;
          const who = held ? `"${held.label}" (pid ${held.pid}) has run for ${Math.round((Date.now() - (held.at ?? 0)) / 60000)} min; ` : '';
          log(`suite-lock: waiting — ${who}${ahead} ahead of you. Runs queue in arrival order so they never overlap (ADR-W-114, ADR-W-123).`);
        }
        sleepSync(POLL_MS);
        continue;
      }
      // Publish by HARD LINK, not open('wx') + write: the content exists before the name does, so a
      // waiter can never read a half-written lock and mistake it for a stale one. link() fails with
      // EEXIST when the lock is held — exclusive and atomic, like 'wx'. Exclusion rests on this link
      // alone, never on the queue: a lost or doubled ticket can misorder the line, never overlap runs.
      const draft = `${path}.${process.pid}.${Date.now()}.draft`;
      writeFileSync(draft, JSON.stringify({ pid: process.pid, label, at: Date.now() }));
      let won = false;
      try {
        linkSync(draft, path);
        won = true;
      } catch (e) {
        if (e.code !== 'EEXIST') {
          rmSync(draft, { force: true });
          throw e;
        }
      }
      rmSync(draft, { force: true });
      if (won) {
        let released = false;
        const release = () => {
          if (released) return;
          released = true;
          const h = readHolder(path);
          if (h?.pid === process.pid) rmSync(path, { force: true });
          dropTicket(); // we leave the line only now, so the waiter behind us becomes the head
        };
        process.once('exit', release);
        return release;
      }
      const holder = readHolder(path);
      if (!holder && !existsSync(path)) continue; // released between our link and our read
      if (isStale(holder)) {
        // Take over by RENAME, which exactly one waiter wins; then check that what we moved is the holder
        // we judged stale. If a faster waiter already replaced it with a live lock, put that one back.
        const grave = `${path}.${process.pid}.${Date.now()}.stale`;
        try {
          renameSync(path, grave);
        } catch {
          continue; // another waiter took it over first
        }
        const moved = readHolder(grave);
        if (moved && holder && (moved.pid !== holder.pid || moved.at !== holder.at) && !isStale(moved)) {
          try {
            linkSync(grave, path);
          } catch {
            /* the path is taken again; that holder is live, so we simply wait */
          }
        } else {
          log(`suite-lock: took over a stale lock (${holder ? `pid ${holder.pid}, "${holder.label}"` : 'unreadable'})`);
        }
        rmSync(grave, { force: true });
        continue;
      }
      if (!announced) {
        const mins = Math.round((Date.now() - holder.at) / 60000);
        log(`suite-lock: waiting — "${holder.label}" (pid ${holder.pid}) has run for ${mins} min. You are next. Runs queue in arrival order so they never overlap (ADR-W-114, ADR-W-123).`);
        announced = true;
      }
      sleepSync(POLL_MS);
    }
  } catch (e) {
    dropTicket();
    throw e;
  }
}

/** CLI: hold the lock for the duration of one command. Exit status is the command's own. */
function main(argv) {
  const cmd = argv[0] === '--' ? argv.slice(1) : argv;
  if (!cmd.length) {
    console.error('usage: node scripts/suite-lock.mjs <command…>');
    process.exit(2);
  }
  const release = acquireSync(cmd.join(' '));
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.once(sig, () => { release(); process.exit(130); });
  const r = spawnSync(cmd[0], cmd.slice(1), {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, GEO_SUITE_LOCK_HELD: '1' },
  });
  release();
  process.exit(r.status ?? 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));
