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
/** #905: the doc-gate workflow's coverage contract. */
const DOCS = JSON.parse(read('DOCS.json'));

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

/**
 * #905 — ci.yml's `paths-ignore` is WORKFLOW-level, so a change confined to those paths starts no
 * lane. Four of them are read by tests (two byte-match a document against a code table), so the
 * companion workflow must trigger on exactly what ci.yml declines. These assertions stop the two
 * files drifting apart, and stop an "uncovered" justification going quietly stale.
 */
describe('the doc-gate workflow covers what ci.yml ignores (#905)', () => {
  const docsYml = read(DOCS.ciPathCoverage.workflow);

  /** Globs listed under a `paths-ignore:` block. */
  const ignored = new Set<string>();
  for (const block of ci.matchAll(/paths-ignore:\s*\n((?:\s*-\s*'[^']*'\s*\n)+)/g)) {
    for (const g of block[1].matchAll(/-\s*'([^']*)'/g)) ignored.add(g[1]);
  }

  /** Globs listed under a plain `paths:` block (`paths-ignore:` does not match — no colon after). */
  const triggers = new Set<string>();
  for (const block of docsYml.matchAll(/\n\s*paths:\s*\n((?:\s*-\s*'[^']*'\s*\n)+)/g)) {
    for (const g of block[1].matchAll(/-\s*'([^']*)'/g)) triggers.add(g[1]);
  }

  it('parsed both path lists (the guard is not vacuous)', () => {
    expect(ignored.size, 'no paths-ignore globs parsed from ci.yml — its format changed').toBeGreaterThan(0);
    expect(triggers.size, 'no paths globs parsed from docs.yml — its format changed').toBeGreaterThan(0);
  });

  it('every ci.yml paths-ignore glob is covered or explicitly justified', () => {
    const uncovered = DOCS.ciPathCoverage.uncovered as Record<string, string>;
    const orphans = [...ignored].filter((g) => !triggers.has(g) && !(g in uncovered));
    expect(
      orphans,
      `these paths start NO workflow: ci.yml ignores them and ${DOCS.ciPathCoverage.workflow} does ` +
        `not trigger on them. Add each to that workflow's paths, or justify it in DOCS.json ` +
        `ciPathCoverage.uncovered.`,
    ).toEqual([]);
  });

  it('the doc-gate workflow runs the registry-driven runner, not a hardcoded list', () => {
    expect(
      docsYml,
      `${DOCS.ciPathCoverage.workflow} must invoke ${DOCS.ciPathCoverage.runner}; a vitest file list ` +
        `restated in YAML is the hand-kept copy DOCS.json exists to abolish.`,
    ).toContain(DOCS.ciPathCoverage.runner);
    expect(docsYml, 'the workflow should not name test files directly').not.toMatch(/vitest run \S/);
  });

  /**
   * The exemption list is pinned HERE, not merely justified in the registry, so a new exemption
   * cannot be granted by editing JSON alone — it needs a test edit, which is a diff a reviewer sees.
   * Same discipline as the grandfather lists in DOCS.json: exact, not "at most".
   *
   * A previous draft of this block tried to PROVE the justification instead ("no test reads deploy/")
   * by scanning for reads. That is not soundly decidable by static matching here: the dominant style
   * in this repo binds the path on one line and calls readFileSync on another, so the scan has real
   * false negatives — while immediately producing a false positive on sibling-safety.test.ts, which
   * passes 'deploy/x.conf' to its classifier as a literal fixture it never opens. A guard that is
   * neither sound nor complete would license more confidence than it earns, so it was dropped for
   * this narrower assertion, which is sound.
   *
   * Residual risk, stated rather than hidden: if a test later READS a path listed below, nothing
   * fails automatically. The exemption is one line and re-read whenever this list changes.
   */
  const REVIEWED_UNCOVERED = ['deploy/**'];

  it('the exemption list is exactly the reviewed one', () => {
    expect(
      Object.keys(DOCS.ciPathCoverage.uncovered as Record<string, string>).sort(),
      `DOCS.json ciPathCoverage.uncovered has changed. Exempting a path from BOTH workflows means ` +
        `no CI runs on a change confined to it — update REVIEWED_UNCOVERED here deliberately.`,
    ).toEqual([...REVIEWED_UNCOVERED].sort());
  });

  it('every exemption carries a reason', () => {
    const blank = Object.entries(DOCS.ciPathCoverage.uncovered as Record<string, string>)
      .filter(([, why]) => !why || why.trim().length < 20)
      .map(([g]) => g);
    expect(blank, 'an exemption without a stated reason is an oversight wearing a decision').toEqual([]);
  });
});
