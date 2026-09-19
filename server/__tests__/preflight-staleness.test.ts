/**
 * #1213 — THE PREFLIGHT MAY NOT SAY «MATCHES» ABOUT A BUILD IT CANNOT VOUCH FOR.
 *
 * Found by running T12 of round #1200's own play sheet, against the preflight shipped that same day by
 * #1130 / ADR-W-058:
 *
 * ```
 * proxy (dist-server/proxy.mjs)    DIFFERS — push required
 * 2-D bundle (dist)                MATCHES live     ← false
 * 3-D / complex / analytic         MATCHES live     ← false
 * ```
 *
 * `main` carried an undeployed round. The local bundles matched the live ones because **both were
 * stale**: `dist/index.html` was a day older than `src/app/roleReadings.ts`, and rebuilding 2-D changed
 * its bundle hash immediately. The comparison was true and meaningless.
 *
 * The proxy is rebuilt every run, so its answer is always current; the static bundles were read off disk
 * as found. #1130's own plan said the live hash is compared against the **freshly built** one — the word
 * carrying the guarantee is the one the implementation dropped.
 *
 * That is the class ADR-W-058 exists for, reintroduced inside its own tool: **a check whose answer
 * depends on someone having remembered to build first is not a check.**
 *
 * These call the real decisions (`scripts/preflight-targets.mjs`), which were split out of the script
 * precisely so a test could reach them without running a preflight — importing that script would ssh.
 */
import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — a plain .mjs build script, deliberately untyped (the deploy-preflight guard does the same)
import { PRODUCTS, isStale, newestSource } from '../../scripts/preflight-targets.mjs';

/** A throwaway tree: one source dir and one dist, with times we set deliberately. */
function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'preflight-'));
  mkdirSync(join(root, 'srcx'), { recursive: true });
  mkdirSync(join(root, 'srcx', '__tests__'), { recursive: true });
  writeFileSync(join(root, 'srcx', 'app.ts'), 'export const a = 1;');
  writeFileSync(join(root, 'srcx', '__tests__', 'app.test.ts'), 'export const t = 1;');
  return root;
}
const setTime = (p: string, seconds: number) => utimesSync(p, seconds, seconds);

describe('#1213 — a stale build cannot be reported as current', () => {
  it('a bundle older than its source is STALE', () => {
    const root = fixture();
    setTime(resolve(root, 'srcx', 'app.ts'), 2000);
    expect(isStale(1000 * 1000, newestSource(root, ['srcx']))).toBe(true);
  });

  it('a bundle built AFTER its last source change is not stale', () => {
    const root = fixture();
    setTime(resolve(root, 'srcx', 'app.ts'), 1000);
    expect(isStale(3000 * 1000, newestSource(root, ['srcx']))).toBe(false);
  });

  it('NOT BUILT is not the same verdict as STALE', () => {
    /**
     * They send the operator to two different actions, and conflating them would tell someone to
     * rebuild an artifact that has never been built at all.
     */
    const root = fixture();
    expect(isStale(0, newestSource(root, ['srcx']))).toBe(false);
  });

  it('TEST files are not sources — they never ship in a bundle', () => {
    const root = fixture();
    setTime(resolve(root, 'srcx', 'app.ts'), 1000);
    setTime(resolve(root, 'srcx', '__tests__', 'app.test.ts'), 9000);
    // The newest file in the tree is a test; it must not make the bundle look stale.
    expect(newestSource(root, ['srcx'])).toBe(1000 * 1000);
  });

  it('a tree that does not exist is not a source of staleness', () => {
    expect(newestSource(fixture(), ['no-such-tree'])).toBe(0);
  });

  it('EVERY product declares the trees it is built from, and shell is in all of them', () => {
    /**
     * The shared tree is why one edit can stale all four bundles at once, and a product that forgot to
     * declare it would go quietly un-checked — which is this defect in a new place.
     */
    expect(PRODUCTS).toHaveLength(4);
    for (const p of PRODUCTS) {
      expect(p.src.length, `${p.name} declares no sources`).toBeGreaterThan(0);
      expect(p.src, `${p.name} does not list shell/`).toContain('shell');
      expect(p.dist).toBeTruthy();
      expect(p.live).toContain('/httpdocs/');
    }
  });
});
