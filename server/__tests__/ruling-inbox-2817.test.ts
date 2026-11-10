/**
 * #2817 (ADR-W-202) — the Rulings Inbox's item builder. Held through the REAL CLI: what the session
 * writes to the page's database is exactly the files this script emits, so the test reads those files.
 *
 * Lives in `server/__tests__/` for the `isolation.test.ts` reason (round-events.test.ts): tooling that
 * belongs to no product runs in every lane.
 */
import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CLI = join(ROOT, 'scripts', 'ruling-inbox', 'build-items.mjs');
const run = (args: string[]) => spawnSync(process.execPath, [CLI, ...args], { cwd: ROOT, encoding: 'utf8' });

function withTmp<T>(fn: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), 'inbox-2817-'));
  try { return fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}

const decision = (over: Record<string, unknown> = {}) => ({
  id: 'd-9999', issue: 9999, product: '3d', title: 'Which part moves?', symptom: 'A student types X and sees Y.',
  options: [{ key: 'a', label: 'The top', detail: 'd', cost: 'c', forecloses: 'f' }, { key: 'b', label: 'All', detail: 'd', cost: 'c', forecloses: 'f' }],
  recommended: 'a', rank: 1, ...over,
});

describe('#2817 — the Rulings Inbox item builder', () => {
  it('a decision file becomes one items/<id> document per decision, open, with its options and recommendation, plus a batch of set writes', () => {
    withTmp((dir) => {
      const f = join(dir, 'decisions.json');
      writeFileSync(f, JSON.stringify({ items: [decision()] }));
      const r = run(['--out', join(dir, 'out'), '--decisions', f]);
      expect(r.status, r.stderr).toBe(0);
      const doc = JSON.parse(readFileSync(join(dir, 'out', 'items', 'd-9999.json'), 'utf8'));
      expect(doc).toMatchObject({ kind: 'decision', status: 'open', issue: 9999, recommended: 'a' });
      expect(doc.options).toHaveLength(2);
      expect(doc.id).toBeUndefined(); // the id is the document's own id, never a field
      const batch = JSON.parse(readFileSync(join(dir, 'out', 'batch.json'), 'utf8'));
      expect(batch).toEqual([expect.objectContaining({ op: 'set', collection: 'items', doc_id: 'd-9999' })]);
    });
  });

  it('a recommendation that is not one of the options is refused — the page would show a recommendation he cannot pick', () => {
    withTmp((dir) => {
      const f = join(dir, 'decisions.json');
      writeFileSync(f, JSON.stringify({ items: [decision({ recommended: 'c' })] }));
      const r = run(['--out', join(dir, 'out'), '--decisions', f]);
      expect(r.status).not.toBe(0);
      expect(r.stderr).toMatch(/recommended "c" is not an option/);
    });
  });

  it('every pending spot audit becomes a test item pointing at the LIVE site, since he answers away from the home PC', () => {
    withTmp((dir) => {
      const r = run(['--out', join(dir, 'out'), '--audits']);
      expect(r.status, r.stderr).toBe(0);
      const pending = JSON.parse(readFileSync(join(ROOT, 'scripts/playsheets/spot-audits.json'), 'utf8')).pending;
      const files = readdirSync(join(dir, 'out', 'items'));
      expect(files).toHaveLength(pending.length);
      for (const f of files) {
        const doc = JSON.parse(readFileSync(join(dir, 'out', 'items', f), 'utf8'));
        expect(doc).toMatchObject({ kind: 'test', testClass: 'audit', status: 'open' });
        expect(doc.server).toMatch(/^https:\/\/themathbible\.com\/(geo|3d|analytic|complex)-builder\/$/);
        expect(doc.lines.length).toBeGreaterThan(0);
        expect(doc.audit).toMatch(/^[\w.-]+:[A-Z]\d+$/); // what `playsheet:close --audit` takes back
      }
    });
  });

  it('a screenshot with no uploaded asset url fails the build instead of shipping a broken image', () => {
    withTmp((dir) => {
      const pending = JSON.parse(readFileSync(join(ROOT, 'scripts/playsheets/spot-audits.json'), 'utf8')).pending;
      if (!pending.length) return;
      const p = pending[0];
      const shots = join(dir, 'shots'); mkdirSync(shots);
      writeFileSync(join(shots, `${p.sheet}_${p.id}-01-built.png`.replace(/[^A-Za-z0-9_.-]/g, '-')), '');
      writeFileSync(join(dir, 'assets.json'), '{}');
      const r = run(['--out', join(dir, 'out'), '--audits', '--shots', shots, '--assets', join(dir, 'assets.json')]);
      expect(r.status).not.toBe(0);
      expect(r.stderr).toMatch(/has no uploaded asset url/);
    });
  });

  it('meta/status carries the stop limits ADR-W-201 set: 10 🎮 cases and 24 hours', () => {
    withTmp((dir) => {
      const r = run(['--out', join(dir, 'out'), '--meta', '{"state":"idle"}']);
      expect(r.status, r.stderr).toBe(0);
      const meta = JSON.parse(readFileSync(join(dir, 'out', 'meta', 'status.json'), 'utf8'));
      expect(meta).toMatchObject({ state: 'idle', playLimit: 10, hoursLimit: 24 });
      expect(typeof meta.lastSync).toBe('string');
    });
  });
});
