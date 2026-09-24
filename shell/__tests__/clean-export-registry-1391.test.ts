/**
 * #1391 — FR-EX-3's lock set is REGISTRY-DRIVEN: every builder that exports an image carries a
 * clean-export lock.
 *
 * Analytic shipped its image export (#1378) with no clean-export lock, and «הורידו תמונה» carried the
 * dashed crossing-offer rings into the download. The requirement said "in every builder", but the
 * locks were three hand-named files, and a fourth builder's absence was invisible. This test derives
 * the list from `products.json`, the one roster: a builder whose tree uses the shared rasteriser
 * (`shell/export/svgToPng`) must have a `clean-export.test.tsx` somewhere in its tree. A fifth builder
 * cannot repeat #1391 by forgetting to write one.
 *
 * Reading product files from a test is the `seam-registry.test.ts` pattern. `shell/` SOURCE still
 * imports no product.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const registry = JSON.parse(readFileSync(path.join(ROOT, 'products.json'), 'utf8')) as {
  products: { id: string; tree: string; enabled: boolean }[];
};

/** Every file under `dir`, skipping dependencies and build output. */
function filesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('dist')) continue;
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) out.push(...filesUnder(p));
    else out.push(p);
  }
  return out;
}

const builders = registry.products.filter((p) => p.enabled);

describe('#1391 — every builder that exports an image has a clean-export lock (FR-EX-3)', () => {
  it('the roster is read, not assumed (the net is not empty)', () => {
    expect(builders.length).toBeGreaterThanOrEqual(4);
  });

  for (const b of builders) {
    it(`${b.id} (${b.tree}/)`, () => {
      const files = filesUnder(path.join(ROOT, b.tree));
      const exportsImage = files.some(
        (f) => /\.(ts|tsx)$/.test(f) && !/__tests__/.test(f) && readFileSync(f, 'utf8').includes('export/svgToPng'),
      );
      if (!exportsImage) return; // no image export, so FR-EX-3 does not reach it
      const locks = files.filter((f) => path.basename(f) === 'clean-export.test.tsx');
      expect(locks, `${b.tree}/ exports an image but has no clean-export.test.tsx`).not.toEqual([]);
    });
  }
});
