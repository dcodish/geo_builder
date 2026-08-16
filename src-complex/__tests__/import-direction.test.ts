/**
 * The layer order of `src-complex/`, enforced rather than described.
 *
 *     value <- model <- solve <- replay <- store
 *     parser -> (model types only)      app -> parser, replay      scene <- replay      render <- scene
 *
 * 2-D shipped without this guard and grew a 2,717-line store holding `computeFold` — the replay engine
 * living inside the UI state (docs/23; extracted by slice S1.2 into `src/replay/` with an
 * import-direction test that is the model for this one). The extraction was expensive; the guard is
 * free, so it lands with the first layer rather than after the fourth.
 *
 * The test is written for the WHOLE ladder even though only the lower layers exist: a directory that
 * is not there yet is skipped, and the non-vacuity assertion below proves the ones that are there were
 * actually scanned.
 */
import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '..');

/**
 * Each layer may import only from itself and the layers listed. Absent directories are skipped.
 *
 * `engine` is the RETIRING prototype monolith (fact model + evaluation + solving + presentation in one
 * file), kept here so the guard describes the tree that exists rather than only the one being built.
 * Its three allowances below are exactly the edges present today — no more — so the cutover (S7, #624)
 * deletes the directory and these four entries together, and nothing new may attach to it meanwhile.
 */
const LEGACY = 'engine';

const MAY_IMPORT: Record<string, readonly string[]> = {
  value: [],
  model: ['value'],
  solve: ['value', 'model'],
  // `replay -> engine` is the S3 BRIDGE and nothing else: `derive2` reads the prototype parser's own
  // fact types so the new engine can be played through the existing input box, rather than a second
  // parser being written ahead of S4's span accounting (ADR-CX-009). It is one import of two TYPES,
  // it is deleted with `bridgeFacts` when S4 lands, and it is listed here so it stays that small.
  // `replay -> formulas` is the S6 surfacing seam: the fold publishes WHICH sheet formulas the figure
  // uses, so the canvas and the panel read one list rather than each detecting its own (#653's class).
  replay: ['value', 'model', 'solve', 'formulas', LEGACY],
  store: ['value', 'model', 'solve', 'replay', 'parser', LEGACY],
  scene: ['value', 'model', 'solve', 'replay'],
  render: ['value', 'scene', LEGACY],
  parser: ['value', 'model', LEGACY],
  // `app` is the ONLY layer that may compose the parser with replay: parser names what the student
  // said, replay folds constraints into a figure, and neither may reach for the other. The guard
  // caught `deriveLines` living in replay/ and was right to.
  app: ['value', 'model', 'solve', 'replay', 'store', 'parser'],
  formulas: ['value', 'model'],
  [LEGACY]: [],
};

const sourcesIn = (dir: string): string[] => {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return [];
  const out: string[] = [];
  const walk = (d: string): void => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        if (e.name !== '__tests__' && e.name !== '__snapshots__') walk(p);
      } else if (/\.tsx?$/.test(e.name)) out.push(p);
    }
  };
  walk(abs);
  return out;
};

/** Every module specifier in a file, from static imports, type imports and re-exports alike. */
const specifiersOf = (file: string): string[] => {
  const text = fs.readFileSync(file, 'utf8');
  const out: string[] = [];
  for (const m of text.matchAll(/(?:^|\n)\s*(?:import|export)\b[^;\n]*?from\s+['"]([^'"]+)['"]/g)) out.push(m[1]);
  for (const m of text.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) out.push(m[1]);
  return out;
};

describe('src-complex layer direction', () => {
  const present = Object.keys(MAY_IMPORT).filter((d) => sourcesIn(d).length > 0);

  it('scanned at least one layer (the guard is not vacuous)', () => {
    expect(present.length, 'no layer directories found — the tree layout changed').toBeGreaterThan(0);
    expect(present).toContain('value');
  });

  it.each(present)('%s imports only from the layers below it', (layer) => {
    const allowed = new Set([layer, ...MAY_IMPORT[layer]]);
    const violations: string[] = [];
    for (const file of sourcesIn(layer)) {
      for (const spec of specifiersOf(file)) {
        if (!spec.startsWith('.')) continue; // packages are handled by the boundaries manifest
        const target = path.resolve(path.dirname(file), spec);
        const rel = path.relative(ROOT, target).split(path.sep)[0];
        // a specifier that stays inside the layer resolves to the layer's own directory
        if (rel === layer || allowed.has(rel)) continue;
        violations.push(`${path.relative(ROOT, file)} -> ${spec}`);
      }
    }
    expect(
      violations,
      `${layer}/ may import only from [${[...allowed].join(', ')}]. An upward import here is the ` +
        `defect 2-D paid to extract later — move the shared piece down a layer instead.`,
    ).toEqual([]);
  });

  it('value/ is the bottom: it imports nothing outside itself', () => {
    const files = sourcesIn('value');
    expect(files.length).toBeGreaterThan(3);
    const outside = files.flatMap((f) =>
      specifiersOf(f)
        .filter((s) => s.startsWith('.'))
        .filter((s) => !path.resolve(path.dirname(f), s).startsWith(path.join(ROOT, 'value')))
        .map((s) => `${path.relative(ROOT, f)} -> ${s}`),
    );
    expect(outside, 'the value layer is the ground field; nothing above it may leak in').toEqual([]);
  });
});
