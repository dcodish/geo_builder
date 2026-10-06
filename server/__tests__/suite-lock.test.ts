/**
 * #1813 (ADR-W-114) — test runs QUEUE across worktrees; they never overlap.
 *
 * A fix round now runs its items in parallel, each in its own worktree, and every vitest run already
 * uses all the cores. "Never overlap suite runs" (ADR-W-034 item 3) was discipline; parallel items made
 * it a race. `scripts/suite-lock.mjs` turns it into a queue. These drive the REAL CLI in real concurrent
 * processes and read the order they ran in, because mutual exclusion is a property of processes, not of
 * a function.
 *
 * It lives in `server/__tests__/` for the `isolation.test.ts` reason: it runs in every per-product lane,
 * and this script belongs to no product.
 */
import { describe, expect, it } from 'vitest';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
// @ts-expect-error — plain-JS tooling module, deliberately not part of any product's type graph
import { MAX_HOLD_MS, acquireSync, isStale } from '../../scripts/suite-lock.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CLI = join(ROOT, 'scripts', 'suite-lock.mjs');

/** A pid that certainly belonged to a process that has exited. */
const deadPid = (): number => spawnSync(process.execPath, ['-e', '0']).pid as number;

describe('#1813 — which holders may be taken over', () => {
  const now = 1_000_000_000;
  it('a holder whose process is gone is stale — a crashed agent must not wedge the next round', () => {
    expect(isStale({ pid: 4242, label: 'x', at: now }, now, () => false)).toBe(true);
  });
  it('a live holder within the hold limit is NOT stale', () => {
    expect(isStale({ pid: 4242, label: 'x', at: now - 60_000 }, now, () => true)).toBe(false);
  });
  it('a live holder past the hold limit is stale (an orphaned run)', () => {
    expect(isStale({ pid: 4242, label: 'x', at: now - MAX_HOLD_MS - 1 }, now, () => true)).toBe(true);
  });
  it('an unreadable lock is stale', () => {
    expect(isStale(null, now, () => true)).toBe(true);
  });
});

describe('#1813 — the lock in real processes', () => {
  it('three concurrent runs execute one at a time, and each one runs', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'geo-lock-'));
    const lock = join(dir, 'geo-suite.lock');
    const log = join(dir, 'log.txt');
    const worker = join(dir, 'worker.cjs');
    // Each "run" records its start and end around a 300 ms busy period.
    writeFileSync(
      worker,
      `const fs=require('fs');const id=process.argv[2];fs.appendFileSync(${JSON.stringify(log)},'start '+id+'\\n');` +
        `const t=Date.now();while(Date.now()-t<300){}fs.appendFileSync(${JSON.stringify(log)},'end '+id+'\\n');`,
    );
    const env: NodeJS.ProcessEnv = { ...process.env, GEO_SUITE_LOCK_PATH: lock, GEO_SUITE_LOCK_POLL_MS: '25' };
    delete env.GEO_SUITE_LOCK_HELD;
    try {
      const runs = ['a', 'b', 'c'].map(
        (id) =>
          new Promise<number>((done) => {
            const p = spawn(process.execPath, [CLI, 'node', worker, id], { env, stdio: 'ignore' });
            p.on('exit', (code) => done(code ?? 1));
          }),
      );
      expect(await Promise.all(runs)).toEqual([0, 0, 0]);
      const lines = readFileSync(log, 'utf8').trim().split('\n');
      expect(lines).toHaveLength(6);
      // Strictly alternating start/end of the SAME run: no run started while another was inside.
      for (let i = 0; i < 6; i += 2) {
        expect(lines[i]).toMatch(/^start /);
        expect(lines[i + 1]).toBe(lines[i].replace('start', 'end'));
      }
      expect(existsSync(lock), 'the last run released the lock').toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);

  it('the command’s exit status is passed through, and a failing run still releases the lock', () => {
    const dir = mkdtempSync(join(tmpdir(), 'geo-lock-'));
    const lock = join(dir, 'geo-suite.lock');
    const env: NodeJS.ProcessEnv = { ...process.env, GEO_SUITE_LOCK_PATH: lock };
    delete env.GEO_SUITE_LOCK_HELD;
    try {
      const r = spawnSync(process.execPath, [CLI, 'node', '-e', 'process.exit(3)'], { env });
      expect(r.status).toBe(3);
      expect(existsSync(lock)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('a lock left by a dead process is taken over, and the takeover is said aloud', () => {
    const dir = mkdtempSync(join(tmpdir(), 'geo-lock-'));
    const lock = join(dir, 'geo-suite.lock');
    writeFileSync(lock, JSON.stringify({ pid: deadPid(), label: 'crashed agent', at: Date.now() }));
    const said: string[] = [];
    const held = process.env.GEO_SUITE_LOCK_HELD;
    delete process.env.GEO_SUITE_LOCK_HELD;
    try {
      const release = acquireSync('test', { path: lock, log: (m: string) => said.push(m) });
      expect(JSON.parse(readFileSync(lock, 'utf8')).pid).toBe(process.pid);
      expect(said.join('\n')).toMatch(/took over a stale lock .*crashed agent/);
      release();
      expect(existsSync(lock)).toBe(false);
    } finally {
      if (held !== undefined) process.env.GEO_SUITE_LOCK_HELD = held;
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('a run nested inside a held lock does not wait for itself (test:locked -- npm run test:full)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'geo-lock-'));
    const lock = join(dir, 'geo-suite.lock');
    // The parent's lock, held by a live process (this one).
    writeFileSync(lock, JSON.stringify({ pid: process.pid, label: 'parent', at: Date.now() }));
    const env = { ...process.env, GEO_SUITE_LOCK_PATH: lock, GEO_SUITE_LOCK_HELD: '1' };
    try {
      const r = spawnSync(process.execPath, [CLI, 'node', '-e', '0'], { env, timeout: 10_000 });
      expect(r.status).toBe(0);
      expect(JSON.parse(readFileSync(lock, 'utf8')).label, 'the parent’s lock is untouched').toBe('parent');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
