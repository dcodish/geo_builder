/**
 * Unit test for the sibling-safety classifier (`scripts/check-sibling-safety.mjs`).
 *
 * It lives in `server/__tests__/` for the `isolation.test.ts` / `test-tiers.test.ts` reason: those
 * tests run in EVERY per-product lane, and this script belongs to no product — it exists to protect
 * the products from each other.
 *
 * The classifier is the half of the guard that can be wrong quietly. The builds it runs either pass or
 * fail loudly; a prefix table that mis-sorts one path fails OPEN — it would wave through exactly the
 * edit it exists to catch. So the near-misses are asserted, not the happy path.
 */
import { describe, expect, it } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { classifyChange, productOf, PRODUCTS } = (await import('../../scripts/check-sibling-safety.mjs')) as any;

type Buckets = { own: string[]; sibling: string[]; shared: string[]; inert: string[] };
/** Default viewpoint stays `complex` — the one the guard shipped with (#846 made it a parameter). */
const classify = (files: string[], product = 'complex') => classifyChange(files, product) as Buckets;

describe('sibling-safety classifier', () => {
  it('THE NEAR MISS: src-complex/ must not be swallowed by the src/ prefix', () => {
    const c = classify(['src-complex/value/angle.ts', 'src/engine/solve.ts']);
    expect(c.own).toEqual(['src-complex/value/angle.ts']);
    expect(c.sibling).toEqual(['src/engine/solve.ts']);
  });

  it('claims each sibling product tree and its entry points', () => {
    const c = classify([
      'src/App.tsx',
      'src3d/App3.tsx',
      'index.html',
      '3d.html',
      'vite.config.ts',
      'vite.config.3d.ts',
      'fixtures/a.geo.json',
      'fixtures3/b.geo3.json',
    ]);
    expect(c.sibling).toHaveLength(8);
    expect(c.own).toEqual([]);
  });

  it('claims the complex product tree and its entry points', () => {
    const c = classify(['src-complex/App.tsx', 'complex.html', 'vite.config.complex.ts']);
    expect(c.own).toHaveLength(3);
    expect(c.sibling).toEqual([]);
  });

  it('treats the compiled-by-everyone surface as shared, not inert', () => {
    const c = classify(['tsconfig.json', 'package.json', 'server/parseHandler.ts', 'BOUNDARIES.json', 'shell/tokens.ts']);
    expect(c.shared).toHaveLength(5);
    expect(c.sibling).toEqual([]);
  });

  it('docs and decision records are inert — no product loads them', () => {
    const c = classify(['docs/06d-decisions-complex.md', 'CLAUDE.md', '.claude/memory/MEMORY.md', 'deploy/x.conf']);
    expect(c.inert).toHaveLength(4);
    expect(c.shared).toEqual([]);
  });

  it('an UNRECOGNISED path is shared, never assumed safe', () => {
    // unknown-by-default must mean "check it" — the ci.yml classifier's rule, same reasoning
    const c = classify(['some-new-top-level-thing.ts', 'newdir/file.ts']);
    expect(c.shared).toEqual(['some-new-top-level-thing.ts', 'newdir/file.ts']);
    expect(c.inert).toEqual([]);
  });

  it('normalises Windows separators, because that is what git status yields here', () => {
    const c = classify(['src3d\\engine\\solve3.ts', 'src-complex\\value\\rational.ts']);
    expect(c.sibling).toEqual(['src3d/engine/solve3.ts']);
    expect(c.own).toEqual(['src-complex/value/rational.ts']);
  });

  it('partitions totally — every input lands in exactly one bucket', () => {
    const files = [
      'src/a.ts',
      'src3d/b.ts',
      'src-complex/c.ts',
      'server/d.ts',
      'docs/e.md',
      'mystery.txt',
    ];
    const c = classify(files);
    const all = [...c.sibling, ...c.own, ...c.shared, ...c.inert];
    expect(all).toHaveLength(files.length);
    expect(new Set(all).size).toBe(files.length);
  });
});

describe('#846 — the viewpoint is a PARAMETER, so every lane can run the guard', () => {
  it('the SAME file is `own` to its product and `sibling` to the others', () => {
    // Before #846 this was hard-coded to the complex viewpoint, so pointing the guard at a 2-D branch
    // would have refused every legitimate src/ edit — which is why only test-complex ever ran it.
    expect(classify(['src/engine/solve.ts'], '2d').own).toEqual(['src/engine/solve.ts']);
    expect(classify(['src/engine/solve.ts'], '3d').sibling).toEqual(['src/engine/solve.ts']);
    expect(classify(['src/engine/solve.ts'], 'complex').sibling).toEqual(['src/engine/solve.ts']);
  });

  it('a 2-D slice sees BOTH other products as siblings', () => {
    const c = classify(['src/a.ts', 'src3d/b.ts', 'src-complex/c.ts'], '2d');
    expect(c.own).toEqual(['src/a.ts']);
    expect(c.sibling).toEqual(['src3d/b.ts', 'src-complex/c.ts']);
  });

  it('every registered product is a usable viewpoint, and each owns its own tree', () => {
    for (const [id, { prefixes }] of Object.entries(PRODUCTS) as [string, { prefixes: string[] }][]) {
      const sample = prefixes.map((p) => (p.endsWith('/') ? `${p}sample.ts` : p));
      const c = classify(sample, id);
      expect(c.own, `${id} owns its whole tree`).toHaveLength(sample.length);
      expect(c.sibling, `${id} sees none of its own files as sibling`).toEqual([]);
    }
  });

  it('productOf resolves by LONGEST prefix, not by list order', () => {
    // the structural replacement for the old "order matters" comment: src-complex/ beats src/
    expect(productOf('src-complex/value/angle.ts')).toBe('complex');
    expect(productOf('src/engine/solve.ts')).toBe('2d');
    expect(productOf('src3d/engine/solve3.ts')).toBe('3d');
    expect(productOf('server/parseHandler.ts')).toBeUndefined();
  });

  it('an unknown viewpoint THROWS rather than silently classifying everything as sibling', () => {
    expect(() => classify(['src/a.ts'], 'analytic')).toThrow(/unknown --product/);
  });

  it('partitions totally under EVERY viewpoint', () => {
    const files = ['src/a.ts', 'src3d/b.ts', 'src-complex/c.ts', 'server/d.ts', 'docs/e.md', 'mystery.txt'];
    for (const id of Object.keys(PRODUCTS)) {
      const c = classify(files, id);
      const all = [...c.own, ...c.sibling, ...c.shared, ...c.inert];
      expect(all, id).toHaveLength(files.length);
      expect(new Set(all).size, id).toBe(files.length);
    }
  });
});
