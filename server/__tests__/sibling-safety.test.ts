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
const { classifyChange } = (await import('../../scripts/check-sibling-safety.mjs')) as any;

const classify = (files: string[]) =>
  classifyChange(files) as { sibling: string[]; complex: string[]; shared: string[]; inert: string[] };

describe('sibling-safety classifier', () => {
  it('THE NEAR MISS: src-complex/ must not be swallowed by the src/ prefix', () => {
    const c = classify(['src-complex/value/angle.ts', 'src/engine/solve.ts']);
    expect(c.complex).toEqual(['src-complex/value/angle.ts']);
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
    expect(c.complex).toEqual([]);
  });

  it('claims the complex product tree and its entry points', () => {
    const c = classify(['src-complex/App.tsx', 'complex.html', 'vite.config.complex.ts']);
    expect(c.complex).toHaveLength(3);
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
    expect(c.complex).toEqual(['src-complex/value/rational.ts']);
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
    const all = [...c.sibling, ...c.complex, ...c.shared, ...c.inert];
    expect(all).toHaveLength(files.length);
    expect(new Set(all).size).toBe(files.length);
  });
});
