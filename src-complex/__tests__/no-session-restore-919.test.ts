/**
 * #919 (ADR-W-046 / ADR-CX-038), as AMENDED by #1238 (ADR-W-068) — a builder opens EMPTY; a stored
 * session may be OFFERED, never restored on its own.
 *
 * Measured at `38f7461` (2026-09-06): `src-complex/app/session.ts` re-submitted every line stored under
 * `localStorage['complex-proto-session']` on each page load — and the product switcher is a plain link,
 * so arriving from another tool was a page load. 2-D and 3-D never did this. Operator ruling 2026-09-06:
 * clean canvas always, one rule for every tool; FR-HS-4 withdrawn.
 *
 * The 2026-09-21 amendment un-withdraws FR-HS-4 in its OFFER form: persistence exists again, and the
 * banner asks. "Clean canvas always" is unchanged — what this file guards moves from *"no tree touches
 * browser storage"* to *"no tree RESTORES without being asked"*, which is the property the ruling is
 * actually about. Three locks, each narrowed rather than dropped:
 *
 *  1. importing a product's store — or its session module — reads NOTHING, even with a populated key,
 *     so no boot path can restore;
 *  2. the deleted seam stays deleted (a restore that runs itself is not coming back);
 *  3. browser storage is touched through ONE module, `shell/session/persist`, and never directly from
 *     a product tree — so there is exactly one place where this rule can be broken next time.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..');

describe('#919/#1238 — no builder restores a session at boot', () => {
  it('a populated session key is ignored on import: the store, and the session module, read nothing', async () => {
    const stored = JSON.stringify({ v: 1, savedAt: new Date().toISOString(), payload: '{"app":"complex-builder","version":1,"lines":["z = 1 + i"]}' });
    const store = new Map<string, string>([
      ['complex-proto-session', stored], // the DEAD key — nothing may resurrect it
      ['complex-builder:session', stored], // the live one — read only when the student asks
    ]);
    let reads = 0;
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => {
        reads++;
        return store.get(k) ?? null;
      },
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    };
    try {
      const { useComplexStore } = await import('../store/useComplexStore');
      // Importing the OFFER module must be as inert as importing the store: the read happens in the
      // app's mount effect, and only to decide whether to show a banner.
      const offer = await import('../app/sessionPersistCx');
      expect(useComplexStore.getState().lines).toEqual([]);
      expect(reads, 'nothing in the product reads browser storage at IMPORT').toBe(0);

      // And the offer, when it IS asked for, reports rather than restores.
      const found = offer.offeredSessionCx();
      expect(reads, 'offeredSession reads — that is its job').toBeGreaterThan(0);
      expect(found?.payload, 'it reports what could be restored').toContain('z = 1 + i');
      expect(useComplexStore.getState().lines, 'and restores nothing by itself').toEqual([]);
    } finally {
      delete (globalThis as { localStorage?: unknown }).localStorage;
    }
  });

  it('the auto-restore seam is gone, not disabled', () => {
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

describe('#1238 — session storage has exactly ONE door', () => {
  it('no product tree reads or writes a session key directly — they go through shell/session/persist', () => {
    const offenders: string[] = [];
    for (const tree of ['src', 'src3d', 'src-complex', 'src-analytic']) {
      for (const file of sourceFiles(join(ROOT, tree))) {
        const text = readFileSync(file, 'utf8');
        // The 2-D About-dialog flag (`geo_intro_seen`) is a per-viewer UI convenience, not a session.
        const hits = text.match(/(?:localStorage|sessionStorage)\.(?:getItem|setItem)\(\s*['"`]([^'"`]*)['"`]/g) ?? [];
        for (const h of hits) if (/session|facts|lines/i.test(h)) offenders.push(`${file.slice(ROOT.length + 1)}: ${h}`);
      }
    }
    expect(offenders, 'a session is stored through the shell seam, which is where the offer rule lives').toEqual([]);
  });

  it('and inside shell/, only the seam itself touches storage', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(join(ROOT, 'shell'))) {
      if (file.endsWith(join('session', 'persist.ts'))) continue;
      if (/(?:localStorage|sessionStorage)\s*\./.test(readFileSync(file, 'utf8'))) offenders.push(file.slice(ROOT.length + 1));
    }
    expect(offenders, 'one door — shell/session/persist.ts').toEqual([]);
  });
});
