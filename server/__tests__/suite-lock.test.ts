/**
 * #1813 (ADR-W-114) — test runs QUEUE across worktrees; they never overlap.
 *
 * A fix round now runs its items in parallel, each in its own worktree, and every vitest run already
 * uses all the cores. "Never overlap suite runs" (ADR-W-034 item 3) was discipline; parallel items made
 * it a race. `scripts/suite-lock.mjs` turns it into a queue. These drive the REAL CLI in real concurrent
 * processes and read the order they ran in, because mutual exclusion is a property of processes, not of
 * a function.
 *
 * #1949 (ADR-W-123) — and they queue IN ARRIVAL ORDER. The last describe covers the FIFO tickets.
 *
 * It lives in `server/__tests__/` for the `isolation.test.ts` reason: it runs in every per-product lane,
 * and this script belongs to no product.
 */
import { describe, expect, it } from 'vitest';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
// @ts-expect-error — plain-JS tooling module, deliberately not part of any product's type graph
import { MAX_HOLD_MS, acquireSync, isLightCommand, isStale, nextInLine, parseTicket, pruneQueue, withWorkerCap } from '../../scripts/suite-lock.mjs';

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


const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (pred: () => boolean, what: string) => {
  for (let i = 0; i < 600; i++) {
    if (pred()) return;
    await sleep(25);
  }
  throw new Error(`timed out waiting for ${what}`);
};

describe('#1949 — the queue is first come, first served', () => {
  it('the earliest arrival is next, with the pid breaking a same-millisecond tie', () => {
    const q = [
      { name: '200.7', seq: 200, pid: 7 },
      { name: '100.9', seq: 100, pid: 9 },
      { name: '100.4', seq: 100, pid: 4 },
    ];
    expect(nextInLine(q).name).toBe('100.4');
  });

  it('the holder keeps its place but is skipped, so the waiter behind it still reaches the lock', () => {
    const q = [
      { name: '100.4', seq: 100, pid: 4 }, // the holder: arrived first, still in line
      { name: '200.7', seq: 200, pid: 7 },
    ];
    expect(nextInLine(q, 4).name, 'the waiter behind the holder').toBe('200.7');
  });

  it('a file in the queue dir that is not a ticket is ignored', () => {
    expect(parseTicket('100.4')).toEqual({ name: '100.4', seq: 100, pid: 4 });
    expect(parseTicket('README')).toBeNull();
    expect(parseTicket('100.4.draft')).toBeNull();
  });

  it('pruneQueue drops the dead and keeps the live, by the SAME pid test the stale-lock path uses', () => {
    const dir = mkdtempSync(join(tmpdir(), 'geo-lock-'));
    const lock = join(dir, 'geo-suite.lock');
    const queue = `${lock}.queue`;
    mkdirSync(queue, { recursive: true });
    const gone = `1.${deadPid()}`;
    const mine = `2.${process.pid}`;
    for (const n of [gone, mine]) writeFileSync(join(queue, n), '{}');
    try {
      const live = pruneQueue(lock, [parseTicket(gone), parseTicket(mine)]);
      expect(live.map((t: { name: string }) => t.name)).toEqual([mine]);
      expect(readdirSync(queue), 'the dead ticket’s file is reclaimed, not just filtered').toEqual([mine]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('three waiters run in ARRIVAL order even when the first one polls 60× slower (#1949)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'geo-lock-'));
    const lock = join(dir, 'geo-suite.lock');
    const queue = `${lock}.queue`;
    const log = join(dir, 'log.txt');
    const gate = join(dir, 'open-the-gate');
    const worker = join(dir, 'worker.cjs');
    writeFileSync(
      worker,
      `const fs=require('fs');fs.appendFileSync(${JSON.stringify(log)},process.argv[2]+'\\n');` +
        `const t=Date.now();while(Date.now()-t<60){}`,
    );
    // The holder keeps the lock until the gate file appears, so the three waiters queue in a KNOWN order.
    // It is a FILE, not `node -e`: the CLI spawns with a shell on Windows, which mangles `&&` and `<`.
    const holderScript = join(dir, 'holder.cjs');
    writeFileSync(
      holderScript,
      `const fs=require('fs');const s=(ms)=>Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,ms);` +
        `const t=Date.now();while(!fs.existsSync(${JSON.stringify(gate)})&&Date.now()-t<20000)s(20);`,
    );
    const start = (cmd: string[], poll: number) => {
      const env: NodeJS.ProcessEnv = { ...process.env, GEO_SUITE_LOCK_PATH: lock, GEO_SUITE_LOCK_POLL_MS: String(poll) };
      delete env.GEO_SUITE_LOCK_HELD;
      const p = spawn(process.execPath, [CLI, ...cmd], { env, stdio: 'ignore' });
      return { pid: p.pid as number, done: new Promise<number>((r) => p.on('exit', (c) => r(c ?? 1))) };
    };
    const ticketed = (pid: number) => existsSync(queue) && readdirSync(queue).some((n) => n.endsWith(`.${pid}`));
    try {
      const holder = start(['node', holderScript], 25);
      await waitFor(() => existsSync(lock), 'the holder to take the lock');
      // A arrives FIRST but polls every 1500 ms; B and C arrive after it and poll every 25 ms. Before
      // the FIFO tickets, B and C took the lock inside A's sleep — the unfairness this test locks out.
      const a = start(['node', worker, 'A'], 1500);
      await waitFor(() => ticketed(a.pid), 'A to take a ticket');
      const b = start(['node', worker, 'B'], 25);
      await waitFor(() => ticketed(b.pid), 'B to take a ticket');
      const c = start(['node', worker, 'C'], 25);
      await waitFor(() => ticketed(c.pid), 'C to take a ticket');
      writeFileSync(gate, '');
      expect(await Promise.all([holder.done, a.done, b.done, c.done])).toEqual([0, 0, 0, 0]);
      expect(readFileSync(log, 'utf8').trim().split('\n')).toEqual(['A', 'B', 'C']);
      expect(existsSync(lock), 'the last run released the lock').toBe(false);
      expect(readdirSync(queue), 'every run gave up its place in line').toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);

  it('a ticket left behind by a killed waiter is reclaimed, never a wedge in the line', () => {
    const dir = mkdtempSync(join(tmpdir(), 'geo-lock-'));
    const lock = join(dir, 'geo-suite.lock');
    const queue = `${lock}.queue`;
    mkdirSync(queue, { recursive: true });
    // Arrival time 1: ahead of every real waiter, for ever — unless its dead pid is noticed.
    const ghost = join(queue, `1.${deadPid()}`);
    writeFileSync(ghost, JSON.stringify({ pid: 1, label: 'killed waiter', at: 1 }));
    const env: NodeJS.ProcessEnv = { ...process.env, GEO_SUITE_LOCK_PATH: lock, GEO_SUITE_LOCK_POLL_MS: '25' };
    delete env.GEO_SUITE_LOCK_HELD;
    try {
      const r = spawnSync(process.execPath, [CLI, 'node', '-e', '0'], { env, timeout: 15_000 });
      expect(r.status, 'the next in line ran instead of waiting on a dead waiter').toBe(0);
      expect(existsSync(ghost), 'the dead waiter’s ticket was reclaimed').toBe(false);
      expect(existsSync(lock)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);

  it('the re-entry escape bypasses the queue entirely — a nested run takes no ticket', () => {
    const dir = mkdtempSync(join(tmpdir(), 'geo-lock-'));
    const lock = join(dir, 'geo-suite.lock');
    writeFileSync(lock, JSON.stringify({ pid: process.pid, label: 'parent', at: Date.now() }));
    const env = { ...process.env, GEO_SUITE_LOCK_PATH: lock, GEO_SUITE_LOCK_HELD: '1' };
    try {
      const r = spawnSync(process.execPath, [CLI, 'node', '-e', '0'], { env, timeout: 10_000 });
      expect(r.status).toBe(0);
      expect(existsSync(`${lock}.queue`), 'a nested run never joins the line').toBe(false);
      expect(JSON.parse(readFileSync(lock, 'utf8')).label, 'the parent’s lock is untouched').toBe('parent');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('#2736 — a run of a few named test files shares the machine (ADR-W-190)', () => {
  it('only `vitest run` over 1–8 named test files is light; a lane, a tier, a directory or a pattern is not', () => {
    expect(isLightCommand(['npx', 'vitest', 'run', 'src/a.test.ts'])).toBe(true);
    expect(isLightCommand(['npx', 'vitest', 'run', 'src/a.test.ts', 'src/b.test.tsx', '-t', 'name'])).toBe(true);
    expect(isLightCommand(['node', 'node_modules/vitest/vitest.mjs', 'run', 'src/a.test.ts'])).toBe(true);
    expect(isLightCommand(['npx', 'vitest', 'run', 'src-analytic'])).toBe(false);
    expect(isLightCommand(['npx', 'vitest', 'run'])).toBe(false);
    expect(isLightCommand(['npx', 'vitest', 'run', ...Array.from({ length: 9 }, (_, i) => `f${i}.test.ts`)])).toBe(false);
    expect(isLightCommand(['npm', 'run', 'test:fast'])).toBe(false);
    expect(isLightCommand(['npx', 'vitest', 'src/a.test.ts'])).toBe(false); // watch mode never exits
  });

  it('a light run is capped in workers, unless the caller set them', () => {
    expect(withWorkerCap(['npx', 'vitest', 'run', 'a.test.ts'], 4)).toEqual(['npx', 'vitest', 'run', 'a.test.ts', '--maxWorkers=4', '--minWorkers=1']);
    expect(withWorkerCap(['npx', 'vitest', 'run', 'a.test.ts', '--maxWorkers=2'], 4)).toEqual(['npx', 'vitest', 'run', 'a.test.ts', '--maxWorkers=2']);
  });

  it('two light runs are admitted together, and never overlap an exclusive run', async () => {
    // #2917: this once asserted that two busy-looping light runs OVERLAPPED in wall time. That is OS scheduling, not
    // the lock: under load the second process could be scheduled after the first had already finished. Every step is
    // now a handshake. A run logs its start and then holds until the test opens its gate; the test waits on what the
    // lock itself writes (a slot file, its own "waiting" line) or on a run's start line, never on a clock.
    const dir = mkdtempSync(join(tmpdir(), 'geo-lock-'));
    const lock = join(dir, 'geo-suite.lock');
    const log = join(dir, 'log.txt');
    const lightGate = join(dir, 'open-the-light-runs');
    const exclusiveGate = join(dir, 'open-the-exclusive-run');
    // A FILE, not `node -e`: the CLI spawns with a shell on Windows, which mangles quotes and `&&`.
    const gated = (gate: string) =>
      `import fs from 'node:fs';const id=process.argv.find(a=>a.endsWith('.test.ts'))??process.argv[2];` +
      `const say=(w)=>fs.appendFileSync(${JSON.stringify(log)},w+' '+id+String.fromCharCode(10));say('start');` +
      `const t=Date.now();while(!fs.existsSync(${JSON.stringify(gate)})){if(Date.now()-t>55000)process.exit(9);` +
      `Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,20);}say('end');`;
    // Named `vitest.mjs`, so the lock reads `node vitest.mjs run <id>.test.ts` as a LIGHT run.
    const fake = join(dir, 'vitest.mjs');
    writeFileSync(fake, gated(lightGate));
    const heavy = join(dir, 'heavy.mjs');
    writeFileSync(heavy, gated(exclusiveGate));
    const env: NodeJS.ProcessEnv = { ...process.env, GEO_SUITE_LOCK_PATH: lock, GEO_SUITE_LOCK_POLL_MS: '25', GEO_SUITE_LIGHT_SLOTS: '4' };
    delete env.GEO_SUITE_LOCK_HELD;
    const start = (args: string[]) => {
      const p = spawn(process.execPath, [CLI, ...args], { env, stdio: ['ignore', 'ignore', 'pipe'] });
      let said = '';
      p.stderr!.on('data', (d) => (said += String(d)));
      return { said: () => said, done: new Promise<number>((r) => p.on('exit', (c) => r(c ?? 1))) };
    };
    const lines = () => (existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter(Boolean) : []);
    const logged = (line: string) => lines().includes(line);
    const heldSlots = () => [0, 1, 2, 3].filter((i) => existsSync(`${lock}.light.${i}`)).length;
    try {
      // 1. Two light runs: neither can finish until the gate opens, so both starting means the second was ADMITTED
      //    while the first still held its slot. Neither takes the exclusive lock.
      const l1 = start(['node', fake, 'run', 'l1.test.ts']);
      const l2 = start(['node', fake, 'run', 'l2.test.ts']);
      await waitFor(() => logged('start l1.test.ts') && logged('start l2.test.ts'), 'both light runs to be admitted');
      expect(heldSlots(), 'each light run holds its own slot').toBe(2);
      expect(existsSync(lock), 'a light run never takes the exclusive lock').toBe(false);

      // 2. An exclusive run wins the lock, then waits for the light runs to drain: it does not start beside them.
      const ex = start(['node', heavy, 'EX']);
      await waitFor(() => /waiting for 2 light run\(s\) to finish first/.test(ex.said()), 'the exclusive run to wait on the light runs');
      expect(logged('start EX'), 'the exclusive run has not started while light runs are inside').toBe(false);

      // 3. Release the light runs: only then does the exclusive run start, with every slot already given back.
      writeFileSync(lightGate, '');
      await waitFor(() => logged('start EX'), 'the exclusive run to start once the light runs finished');
      expect(heldSlots(), 'every light slot was released before the exclusive run started').toBe(0);

      // 4. A light run arriving while the exclusive run holds the machine waits for it.
      const l3 = start(['node', fake, 'run', 'l3.test.ts']);
      await waitFor(() => /light run waiting — .* holds the machine/.test(l3.said()), 'a later light run to wait on the exclusive run');
      expect(logged('start l3.test.ts'), 'the later light run has not started beside the exclusive run').toBe(false);

      writeFileSync(exclusiveGate, '');
      expect(await Promise.all([l1.done, l2.done, ex.done, l3.done])).toEqual([0, 0, 0, 0]);
      const order = lines();
      expect(new Set(order.slice(0, 2))).toEqual(new Set(['start l1.test.ts', 'start l2.test.ts']));
      expect(new Set(order.slice(2, 4))).toEqual(new Set(['end l1.test.ts', 'end l2.test.ts']));
      expect(order.slice(4)).toEqual(['start EX', 'end EX', 'start l3.test.ts', 'end l3.test.ts']);
      expect(existsSync(lock)).toBe(false);
      expect(heldSlots(), 'every slot released').toBe(0);
    } finally {
      // On a failure, open both gates so no gated run outlives the test.
      for (const g of [lightGate, exclusiveGate]) if (existsSync(dir)) writeFileSync(g, '');
      rmSync(dir, { recursive: true, force: true, maxRetries: 5 });
    }
  }, 60_000);
});
