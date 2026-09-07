/**
 * #919 (ADR-W-046 / ADR-CX-038) — a builder opens EMPTY; no product restores a session from browser storage.
 *
 * Measured at `38f7461` (2026-09-06): `src-complex/app/session.ts` re-submitted every line stored under
 * `localStorage['complex-proto-session']` on each page load — and the product switcher is a plain link,
 * so arriving from another tool was a page load. 2-D and 3-D never did this. Operator ruling 2026-09-06:
 * clean canvas always, one rule for every tool; FR-HS-4 withdrawn.
 *
 * Two locks: (1) a populated session key changes nothing at boot — the store imports empty; (2) no product
 * tree reads or writes a session key — the grep guard that keeps `src-analytic/` from inheriting the coin
 * flip. The file-load path (`hydrateSession`) is untouched and stays proven by `fixtures.test.ts`.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..');

describe('#919 — the complex builder opens empty', () => {
  it('a populated session key is ignored: the store imports with no lines', async () => {
    const stored = JSON.stringify({ app: 'complex', version: 1, lines: ['z = 1 + i'] });
    const store = new Map<string, string>([['complex-proto-session', stored]]);
    // a minimal Storage stand-in: the deleted seam read exactly this API; nothing may read it now
    let reads = 0;
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => { reads++; return store.get(k) ?? null; },
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
    };
    try {
      const { useComplexStore } = await import('../store/useComplexStore');
      expect(useComplexStore.getState().lines).toEqual([]);
      useComplexStore.getState().resetSession();
      expect(reads, 'nothing in the product reads browser storage at boot').toBe(0);
    } finally {
      delete (globalThis as { localStorage?: unknown }).localStorage;
    }
  });

  it('the restore seam is gone, not disabled', () => {
    expect(existsSync(join(ROOT, 'src-complex', 'app', 'session.ts'))).toBe(false);
  });
});

/** Every source file under the product trees (tests excluded — a test may legitimately mention a key). */
function sourceFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (name === '__tests__' || name === 'node_modules') continue;
    if (statSync(p).isDirectory()) out.push(...sourceFiles(p));
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

describe('#919 — no product tree persists or restores a session (FR-SL-5)', () => {
  it('no localStorage/sessionStorage session key in src/, src3d/, src-complex/, src-analytic/', () => {
    const offenders: string[] = [];
    for (const tree of ['src', 'src3d', 'src-complex', 'src-analytic']) {
      for (const file of sourceFiles(join(ROOT, tree))) {
        const text = readFileSync(file, 'utf8');
        // The 2-D About-dialog flag (`geo_intro_seen`) is a per-viewer UI convenience, not a session.
        const hits = text.match(/(?:localStorage|sessionStorage)\.(?:getItem|setItem)\(\s*['"`]([^'"`]*)['"`]/g) ?? [];
        for (const h of hits) if (/session|facts|lines/i.test(h)) offenders.push(`${file.slice(ROOT.length + 1)}: ${h}`);
      }
    }
    expect(offenders, 'a builder opens empty — durable work is an explicit save to a file').toEqual([]);
  });
});
