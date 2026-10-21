/**
 * #2031 (ADR-AG-273) — A STATED POLYGON AREA IS WRITTEN ON THE CANVAS, whichever way the student stated it.
 *
 * Measured at `6096b643`: «משולש ABC» · «נסמן את שטח ABC ב-S» drew no area label. The class was wider: a stated area
 * has two constraint representations — the copula's `area` and the measure equation's `length-eq` with one area term
 * («שטח ABC = 12», and the label form, restated as «שטח ABC = S») — and the stated-measure layer read only the first.
 * A copula value that is a lone letter printed «S=S», and an area stated twice printed two labels.
 *
 * 2-D is the drawing reference (ADR-W-118 B1), measured at `6096b643` through `decideDeterministic2D` + `replay`:
 * «S» for a letter, one label for an area stated twice. A numeric value keeps analytic's ruled «S=…» (ADR-W-118 B9).
 *
 * Every row runs the app's own path — `decideSubmit` per line, then `derive` → `buildScene` — at seeds 0–3.
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit } from '../app/submit';
import { derive } from '../engine/derive';
import { buildScene, type Scene } from '../render/scene';

const SEEDS = [0, 1, 2, 3];
/** The bidi isolates `lbl` wraps a label in (#1191), removed so a case reads as the text the student sees. */
const strip = (s: string) => s.replace(/[⁦-⁩]/g, '');

function build(lines: string[], seed: number): Scene {
  const accepted: string[] = [];
  for (const line of lines) {
    const v = decideSubmit(line, accepted, seed);
    expect(v.kind, `${line} is recorded`).toBe('record');
    accepted.push(line);
  }
  const d = derive(accepted, seed);
  expect(d.faults, lines.join(' · ')).toEqual([]);
  return buildScene(d.figure, d.box, 600, 400, { stated: d.stated });
}
const areaLabels = (s: Scene) => s.stated.labels.filter((l) => l.kind === 'area');

function inRing(p: { x: number; y: number }, ring: ReadonlyArray<{ x: number; y: number }>): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const a = ring[i];
    const b = ring[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
const ringOf = (s: Scene, ids: string[]) => ids.map((id) => {
  const p = s.points.find((q) => q.id === id)!;
  return { x: p.cx, y: p.cy };
});

/** Exactly the labels `want`, at every seed; with `ring`, the (single) label sits inside that polygon. */
function expectAreaLabels(lines: string[], want: string[], ring?: string[]): void {
  for (const seed of SEEDS) {
    const s = build(lines, seed);
    const got = areaLabels(s);
    expect(got.map((l) => strip(l.text)), `${lines.join(' · ')} @${seed}`).toEqual(want);
    if (ring) expect(inRing(got[0], ringOf(s, ring)), `label inside ${ring.join('')} @${seed}`).toBe(true);
  }
}

describe('#2031 — the operator’s lines', () => {
  it('«משולש ABC» · «נסמן את שטח ABC ב-S» → one label, «S», inside the triangle', () => {
    expectAreaLabels(['משולש ABC', 'נסמן את שטח ABC ב-S'], ['S'], ['A', 'B', 'C']);
  });
});

describe('#2031 — the class: every spelling of a stated area', () => {
  it('the label form in its other spellings → «S»', () => {
    expectAreaLabels(['משולש ABC', 'נסמן את שטח המשולש ABC ב-S'], ['S'], ['A', 'B', 'C']);
    expectAreaLabels(['משולש ABC', 'denote the area of ABC by S'], ['S'], ['A', 'B', 'C']);
    expectAreaLabels(['ריבוע ABCD', 'נסמן את שטח הריבוע ABCD ב-S'], ['S'], ['A', 'B', 'C', 'D']);
  });

  it('a lone letter through the copula is the letter alone: «שטח המשולש ABC הוא S» → «S», never «S=S»', () => {
    expectAreaLabels(['משולש ABC', 'שטח המשולש ABC הוא S'], ['S']);
  });

  it('a lone letter through «=» → the letter: «שטח ABC = S» → «S», «שטח ABC = t» → «t»', () => {
    // re-based by #2440 (ADR-AG-325 Am. 1, *"area letter only capital S"*): «שטח ABC = T» is now refused
    // capital-magnitude (issue-2427-capital-size), so the lone-letter row reads S and a lowercase letter
    expectAreaLabels(['משולש ABC', 'שטח ABC = S'], ['S']);
    expectAreaLabels(['משולש ABC', 'שטח ABC = t'], ['t']);
  });

  it('a number or an expression through «=» keeps the ruled «S=…» form', () => {
    expectAreaLabels(['משולש ABC', 'שטח ABC = 12'], ['S=12'], ['A', 'B', 'C']);
    expectAreaLabels(['משולש ABC', 'שטח המשולש ABC = 12'], ['S=12']);
    expectAreaLabels(['משולש ABC', 'שטח ABC = 2a'], ['S=2a']);
  });

  it('an area stated twice is ONE label, and the number wins — in either representation', () => {
    expectAreaLabels(['משולש ABC', 'שטח המשולש ABC הוא S', 'שטח המשולש ABC הוא 12'], ['S=12']);
    expectAreaLabels(['משולש ABC', 'נסמן את שטח ABC ב-S', 'שטח ABC = 12'], ['S=12']);
  });
});

describe('#2031 — unchanged rows', () => {
  it('«שטח ABC הוא 6» → «S=6»', () => {
    expectAreaLabels(['משולש ABC', 'שטח ABC הוא 6'], ['S=6']);
  });

  it('an area RELATION is not a value: a ratio of two areas, and an area against a length, draw no area label', () => {
    expectAreaLabels(['משולש ABC', 'D על AB', 'E על AC', 'שטח ADE = 0.25 שטח ABC'], []);
    expectAreaLabels(['משולש ABC', 'D על AB', 'E על AC', 'שטח ABC גדול פי 3 משטח ADE'], []);
    expectAreaLabels(['משולש ABC', 'שטח ABC = 2AB'], []);
  });

  it('a length equation still reads as before: «AB = 5» labels the side, «AB = AC» ticks it', () => {
    const s = build(['משולש ABC', 'AB = 5', 'AB = AC'], 0);
    expect(areaLabels(s)).toEqual([]);
    expect(s.segments.filter((x) => x.label).map((x) => strip(x.label!.text))).toContain('5');
    expect(s.stated.ticks.length).toBeGreaterThan(0);
  });
});
