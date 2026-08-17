/**
 * The duplicate-retirement teeth (#661 scope 4 / ADR-W-021): `products.json` is the ONE copy of the
 * product roster, and the two hand-maintained copies that used to drift — ci.yml's path classifier
 * and the docs/22 §9 registry table — are ASSERTED against it.
 *
 * The drift this kills was LIVE at landing: §9's table had no complex column at all while complex
 * was shipped and deployed (found by writing this test). Static YAML/Markdown cannot read JSON, so
 * the copies remain physically present — these assertions make forgetting one impossible: builder
 * N+1 added to products.json fails here until ci.yml carries its classifier pattern, lane and
 * build, and §9 carries its column.
 *
 * Lives in server/__tests__ so it runs in EVERY per-product lane (the isolation.test.ts precedent).
 */
import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '..', '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const { products } = JSON.parse(read('products.json')) as {
  products: { id: string; tree: string; url: string; buildTarget: string }[];
};
const ci = read('.github/workflows/ci.yml');
const doc22 = read('docs/22-workflow.md');

describe('registry consistency — the hand-kept copies cannot drift silently', () => {
  it('reads a non-empty registry (the guard is not vacuous)', () => {
    expect(products.length).toBeGreaterThan(1);
  });

  it.each(products)('ci.yml classifies, tests and builds $tree', (p) => {
    expect(ci, `ci.yml's classifier has no pattern for ${p.tree}/`).toContain(`${p.tree}/*`);
    expect(ci, `no CI lane runs ${p.tree}/'s tests`).toContain(`vitest run ${p.tree}/`);
    expect(ci, `no CI lane builds via npm run ${p.buildTarget}`).toContain(`npm run ${p.buildTarget}`);
  });

  it.each(products)('docs/22 §9 carries $id (tree + prod path)', (p) => {
    expect(doc22, `docs/22 §9 does not name ${p.tree}/`).toContain(`${p.tree}/`);
    expect(doc22, `docs/22 §9 does not name ${p.url}`).toContain(p.url);
  });
});
