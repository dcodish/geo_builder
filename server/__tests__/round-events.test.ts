/**
 * #1853 (ADR-W-115) — the live round dashboard (tracking only): every actor in a round appends phase
 * events to one log, and the dashboard is a fold of that log.
 *
 * The fold is held directly (it is the page's whole content). The log is held through the REAL CLI in
 * real concurrent processes, because "agents in different worktrees all land in one log, whole lines,
 * nothing lost" is a property of processes and of the git common dir, not of a function.
 *
 * It lives in `server/__tests__/` for the `isolation.test.ts` reason: it runs in every per-product lane,
 * and this script belongs to no product.
 */
import { describe, expect, it } from 'vitest';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
// @ts-expect-error — plain-JS tooling module, deliberately not part of any product's type graph
import { ITEM_PHASES, ROUND_PHASES, fold, parseLog, statsLine, validateEvent } from '../../scripts/lib/round-core.mjs';
// @ts-expect-error — plain-JS tooling module
import { logPath } from '../../scripts/round-event.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CLI = join(ROOT, 'scripts', 'round-event.mjs');

type Ev = Record<string, unknown>;
let clock = Date.parse('2026-10-07T08:00:00Z');
const t = () => new Date((clock += 60_000)).toISOString();
const item = (key: string, phase: string, extra: Ev = {}): Ev => ({ t: t(), kind: 'item', item: key, phase, ...extra });
const round = (phase: string, extra: Ev = {}): Ev => ({ t: t(), kind: 'round', phase, ...extra });

describe('#1853 — the fold is the dashboard', () => {
  it('items keep composition order, and a later event never reorders them', () => {
    const s = fold([
      round('compose', { data: { title: 'fix-round 2026-10-07' } }),
      item('1801', 'queued', { data: { title: 'A', about: 'what A is', route: 'bug' } }),
      item('1805+1806', 'queued', { data: { title: 'B', route: 'feature' } }),
      item('1810', 'queued'),
      item('1810', 'fixing'),
      item('1801', 'gates'),
    ]);
    expect(s.items.map((i: { key: string }) => i.key)).toEqual(['1801', '1805+1806', '1810']);
    expect(s.items[1].issues).toEqual([1805, 1806]);
    expect(s.items[0]).toMatchObject({ title: 'A', about: 'what A is', route: 'bug', phase: 'gates' });
    expect(s.title).toBe('fix-round 2026-10-07');
  });

  it('the end-of-round report is a LINK the round hands over, not content the dashboard carries', () => {
    const s = fold([round('compose'), round('awaiting-play', { data: { reportUrl: 'https://claude.ai/artifact/x' } })]);
    expect(s.reportUrl).toBe('https://claude.ai/artifact/x');
    expect(Object.keys(s)).not.toContain('sheet');
    expect(validateEvent({ t: t(), kind: 'sheet', data: { cases: [] } })[0]).toMatch(/unknown kind «sheet»/);
  });

  it('`since` is when the item ENTERED its phase — a repeated phase with a new note does not reset it', () => {
    const first = item('1801', 'gates', { note: 'test:fast running' });
    const s = fold([item('1801', 'fixing'), first, item('1801', 'gates', { note: 'test:fast green, running own files' })]);
    expect(s.items[0].since).toBe(first.t);
    expect(s.items[0].timeline).toHaveLength(3);
  });

  it('reaching a round phase marks the ones it skipped, and stepping back clears the later ones', () => {
    const s1 = fold([round('compose'), round('batch')]);
    const at = (s: { phases: { id: string; at: string | null }[] }, id: string) => s.phases.find((p) => p.id === id)!.at;
    expect(at(s1, 'execute')).not.toBeNull(); // passed without announcing
    expect(s1.phase).toBe('batch');
    const s2 = fold([round('compose'), round('batch'), round('execute', { note: 'batch red — bisecting' })]);
    expect(at(s2, 'batch')).toBeNull();
    expect(s2.phase).toBe('execute');
  });

  it('counts and the stats line come from the same fold — the ledger and the page cannot disagree', () => {
    const s = fold([
      item('1', 'landed', { data: { sha: 'abc1234' } }),
      item('2', 'pr', { data: { pr: 1900 } }),
      item('3', 'escalated'),
      item('4', 'closed'),
      item('5', 'skipped'),
      item('6', 'fixing'),
    ]);
    expect(s.counts).toMatchObject({ total: 6, done: 5, landed: 1, pr: 1, escalated: 1, fixing: 1 });
    expect(statsLine(s)).toBe('stats: picked=6 landed=1 prs=1 escalated=1 skipped=2');
  });

  it('the feed is newest first and bounded; the log keeps everything', () => {
    const evs = Array.from({ length: 60 }, (_, i) => item(String(i + 1), 'queued'));
    const s = fold(evs);
    expect(s.feed).toHaveLength(40);
    expect(s.feed[0].item).toBe('60');
    expect(s.items).toHaveLength(60);
  });

  it('the stepper and the item pills are the declared vocabularies, in order', () => {
    expect(ROUND_PHASES.map((p: { id: string }) => p.id)).toEqual(['compose', 'execute', 'batch', 'land', 'playsheet', 'awaiting-play']);
    expect(ITEM_PHASES.filter((p: { terminal?: boolean }) => p.terminal).map((p: { id: string }) => p.id)).toEqual(['landed', 'pr', 'escalated', 'skipped', 'closed']);
  });
});

describe('#1853 — an event the page could not place is refused, not dropped', () => {
  it('a typo’d phase, a malformed key, an unknown field, an unknown kind', () => {
    expect(validateEvent(item('1801', 'fixed'))[0]).toMatch(/unknown item phase «fixed»/);
    expect(validateEvent(item('#1801', 'fixing'))[0]).toMatch(/item key/);
    expect(validateEvent(item('1801', 'fixing', { data: { sah: 'x' } }))[0]).toMatch(/unknown data field «sah»/);
    expect(validateEvent(item('1801', 'queued', { data: { route: 'patch' } }))[0]).toMatch(/route/);
    expect(validateEvent({ t: t(), kind: 'phase' })[0]).toMatch(/unknown kind/);
    expect(validateEvent(item('1801', 'fixing'))).toEqual([]);
  });

  it('a torn or foreign line in the log is counted and skipped, so the page still draws', () => {
    const good = JSON.stringify(item('1801', 'fixing'));
    const { events, rejected } = parseLog(`${good}\n{"t":"2026-10-07T08:00:00Z","kind":"item","ite\n${JSON.stringify({ x: 1 })}\n`);
    expect(events).toHaveLength(1);
    expect(rejected).toBe(2);
    expect(fold(events, { rejected }).rejected).toBe(2);
  });
});

describe('#1853 — the log in real processes', () => {
  it('lives in the git COMMON dir, so every worktree writes the same file', () => {
    const r = spawnSync('git', ['rev-parse', '--git-common-dir'], { cwd: ROOT, encoding: 'utf8' });
    const common = r.stdout.trim();
    const expected = join(isAbsolute(common) ? common : resolve(ROOT, common), 'geo-rounds', '1853.jsonl');
    const saved = process.env.GEO_ROUND_LOG_DIR;
    delete process.env.GEO_ROUND_LOG_DIR;
    try {
      expect(resolve(logPath(1853, ROOT))).toBe(resolve(expected));
    } finally {
      if (saved !== undefined) process.env.GEO_ROUND_LOG_DIR = saved;
    }
  });

  it('concurrent agents append whole lines and none is lost; the fold reads them all', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'geo-round-'));
    const env = { ...process.env, GEO_ROUND_LOG_DIR: dir };
    try {
      const agent = (key: string) =>
        new Promise<number>((res) => {
          // Each agent walks its item through the pipeline, twice over, as fast as it can.
          const script = ['remeasure', 'fixing', 'gates', 'ready', 'remeasure', 'fixing', 'gates', 'ready']
            .map((p) => `node ${JSON.stringify(CLI)} emit 7 item ${key} ${p} --note "agent ${key} at ${p}"`)
            .join(' && ');
          spawn(script, { env, shell: true, stdio: 'ignore' }).on('exit', (code) => res(code ?? 1));
        });
      const codes = await Promise.all(['101', '102', '103'].map(agent));
      expect(codes).toEqual([0, 0, 0]);
      const { events, rejected } = parseLog(readFileSync(join(dir, '7.jsonl'), 'utf8'));
      expect(rejected).toBe(0);
      expect(events).toHaveLength(24);
      const s = fold(events);
      expect(s.items.map((i: { phase: string }) => i.phase)).toEqual(['ready', 'ready', 'ready']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);

  it('a refused event fails the command and writes nothing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'geo-round-'));
    try {
      const r = spawnSync(process.execPath, [CLI, 'emit', '7', 'item', '101', 'fixed'], {
        env: { ...process.env, GEO_ROUND_LOG_DIR: dir },
        encoding: 'utf8',
      });
      expect(r.status).toBe(2);
      expect(r.stderr).toMatch(/unknown item phase «fixed»/);
      expect(existsSync(join(dir, '7.jsonl'))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('`state` folds the log the agents wrote; `page` titles the template for the round', () => {
    const dir = mkdtempSync(join(tmpdir(), 'geo-round-'));
    const env = { ...process.env, GEO_ROUND_LOG_DIR: dir };
    const run = (...a: string[]) => spawnSync(process.execPath, [CLI, ...a], { env, encoding: 'utf8' });
    try {
      expect(run('emit', '9', 'round', 'compose', '--data', '{"title":"t"}').status).toBe(0);
      expect(run('emit', '9', 'item', '1801', 'landed', '--data', '{"sha":"abc1234"}').status).toBe(0);
      const out = join(dir, 'state.json');
      const st = run('state', '9', '--out', out);
      expect(st.stdout).toMatch(/1\/1 items done · round compose · stats: picked=1 landed=1/);
      expect(JSON.parse(readFileSync(out, 'utf8')).items[0].sha).toBe('abc1234');
      const page = join(dir, 'page.html');
      expect(run('page', '9', '--out', page).status).toBe(0);
      const html = readFileSync(page, 'utf8');
      expect(html).toContain('<title>מעקב סבב #9</title>');
      expect(html).not.toContain('{{TITLE}}');
      // The artifact CSP blocks every other host silently — the template loads nothing external.
      expect(html).not.toMatch(/<script[^>]+src=|<link[^>]+href=/);
      // A page whose script does not parse publishes fine and shows only its empty state, forever.
      const script = html.match(/<script>([\s\S]*)<\/script>/)![1];
      expect(() => new Function(script)).not.toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
