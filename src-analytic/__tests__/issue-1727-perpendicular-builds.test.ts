/**
 * #1727 (ADR-AG-229) — a perpendicular named IN FULL («האנך מ-A ל-BC») is BUILT when the figure has none, and is the
 * one referred to when the figure has it. Operator ruling, 2026-10-03: *"1727 - yes"* — amending ADR-AG-207's
 * reference-only rule.
 *
 * Every lock CALLS the real path (`decideSubmit`, `derive`) and asserts GEOMETRY at several seeds against the closed
 * forms of `engine/derived.ts`, and the "never duplicated" half by counting the figure's points and pieces.
 */
import { describe, expect, it } from 'vitest';
import { derive, type Derivation } from '../engine/derive';
import { footOn, orthocentre } from '../engine/derived';
import { decideSubmit } from '../app/submit';

const SEEDS = [0, 1, 2, 3, 4, 5, 6, 7];
type P = { x: number; y: number };
const TRI = 'משולש ABC';

const pt = (d: Derivation, id: string): P => {
  const p = d.figure.points.find((q) => q.id === id);
  if (!p) throw new Error(`no point ${id} — points: ${d.figure.points.map((q) => q.id).join(' ')}`);
  return p;
};
const sub = (p: P, q: P): P => ({ x: p.x - q.x, y: p.y - q.y });
const dot = (u: P, v: P) => u.x * v.x + u.y * v.y;
const dist = (p: P, q: P) => Math.hypot(p.x - q.x, p.y - q.y);
const scaleOf = (d: Derivation) => Math.max(1, ...d.figure.points.map((p) => Math.hypot(p.x, p.y)));

function verdict(steps: readonly string[]): string {
  const lines: string[] = [];
  let last = '';
  for (const line of steps) {
    const v = decideSubmit(line, lines, 0);
    if (v.kind === 'record') lines.push(v.line);
    last = v.kind === 'refused' ? `refused:${v.error.key}` : v.kind;
  }
  return last;
}
function built(steps: readonly string[], seed: number): Derivation {
  expect(verdict(steps), steps.join(' · ')).toBe('record');
  const d = derive(steps, seed);
  expect(d.faults, `${steps.join(' · ')} @${seed}: ${JSON.stringify(d.faults)}`).toEqual([]);
  return d;
}
const ids = (d: Derivation) => d.figure.points.map((p) => p.id).sort();
const pieces = (d: Derivation) => d.figure.segments.map((s) => s.id).filter((id) => id.startsWith('seg-')).sort();
/** E is on the perpendicular from A to BC: AE ⟂ BC. */
const onAltitudeA = (d: Derivation, e: P) => Math.abs(dot(sub(e, pt(d, 'A')), sub(pt(d, 'C'), pt(d, 'B')))) / scaleOf(d) ** 2;

describe('#1727 — built when the figure has none', () => {
  it('«E על האנך מ-A ל-BC» on a bare triangle draws the perpendicular, its foot H on BC, and E on it — at 8 seeds', () => {
    for (const seed of SEEDS) {
      const d = built([TRI, 'E על האנך מ-A ל-BC'], seed);
      expect(ids(d)).toEqual(['A', 'B', 'C', 'E', 'H']);
      expect(pieces(d)).toEqual(['seg-AH']);
      expect(dist(pt(d, 'H'), footOn(pt(d, 'A'), pt(d, 'B'), pt(d, 'C'))!) / scaleOf(d)).toBeLessThan(1e-6);
      expect(onAltitudeA(d, pt(d, 'E'))).toBeLessThan(1e-6);
      expect(d.minted.map((m) => m.id)).toEqual(['H']);
    }
  });

  it('as an operand of the meet frame (ADR-AG-224): «האנך מ-A ל-BC והתיכון מ-B נפגשים בנקודה E»', () => {
    for (const seed of SEEDS) {
      const d = built([TRI, 'האנך מ-A ל-BC והתיכון מ-B נפגשים בנקודה E'], seed);
      const [a, b, c, e] = ['A', 'B', 'C', 'E'].map((id) => pt(d, id));
      expect(onAltitudeA(d, e)).toBeLessThan(1e-6);
      const m = { x: (a.x + c.x) / 2, y: (a.y + c.y) / 2 };
      expect(Math.abs((e.x - b.x) * (m.y - b.y) - (e.y - b.y) * (m.x - b.x)) / scaleOf(d) ** 2).toBeLessThan(1e-6);
    }
  });

  it('two undrawn perpendiculars meet at the orthocentre', () => {
    for (const seed of SEEDS) {
      const d = built([TRI, 'האנך מ-A ל-BC והאנך מ-B ל-AC נחתכים בנקודה E'], seed);
      expect(dist(pt(d, 'E'), orthocentre(pt(d, 'A'), pt(d, 'B'), pt(d, 'C'))!) / scaleOf(d)).toBeLessThan(1e-5);
      expect(pieces(d)).toHaveLength(2);
    }
  });

  it('onto an axis: «E על האנך מהנקודה B לציר ה-x» with B(1,14)', () => {
    const d = built(['B(1,14)', 'E על האנך מהנקודה B לציר ה-x'], 0);
    expect(pt(d, 'E').x).toBeCloseTo(1, 6);
    expect(pt(d, 'H').x).toBeCloseTo(1, 9);
    expect(pt(d, 'H').y).toBeCloseTo(0, 9);
  });
});

describe('#1727 — one already drawn is the one referred to, never duplicated', () => {
  const CASES: Array<[string, string[], string[]]> = [
    ['the same perpendicular drawn before', ['האנך מ-A ל-BC'], ['A', 'B', 'C', 'E', 'H']],
    ['a foot the student named («D רגל האנך»)', ['D רגל האנך מ-A ל-BC'], ['A', 'B', 'C', 'D', 'E']],
    ['an altitude from the vertex («הגובה מ-A»)', ['הגובה מ-A'], ['A', 'B', 'C', 'E', 'H']],
    ['an altitude whose foot the student named («AD גובה לצלע BC»)', ['AD גובה לצלע BC'], ['A', 'B', 'C', 'D', 'E']],
  ];
  it.each(CASES)('%s', (_, before, points) => {
    for (const seed of [0, 3, 6]) {
      const d = built([TRI, ...before, 'E על האנך מ-A ל-BC'], seed);
      expect(ids(d)).toEqual(points);
      expect(onAltitudeA(d, pt(d, 'E'))).toBeLessThan(1e-6);
      expect(d.minted.filter((m) => m.index === 2)).toEqual([]); // the reference names no new point
    }
  });
});

describe('#1727 — a perpendicular crossed with its own line meets it at its foot', () => {
  it('«E נקודת החיתוך של האנך מ-A ל-BC עם הישר BC» and the meet frame name the foot E — one point, one name', () => {
    for (const line of ['E נקודת החיתוך של האנך מ-A ל-BC עם הישר BC', 'האנך מ-A ל-BC והישר BC נפגשים בנקודה E']) {
      const d = built([TRI, line], 0);
      expect(ids(d)).toEqual(['A', 'B', 'C', 'E']);
      expect(dist(pt(d, 'E'), footOn(pt(d, 'A'), pt(d, 'B'), pt(d, 'C'))!) / scaleOf(d)).toBeLessThan(1e-6);
    }
  });
  it('after the perpendicular is drawn, that sentence is the second-name refusal, naming the foot', () => {
    expect(verdict([TRI, 'האנך מ-A ל-BC', 'E נקודת החיתוך של האנך מ-A ל-BC עם הישר BC'])).toBe('refused:already-named');
  });
});

describe('#1727 — what stays a reference', () => {
  it('bare «האנך» and «האנך מ-B» describe no object: none drawn is still `ambiguous-shape`', () => {
    expect(verdict([TRI, 'E על האנך'])).toBe('refused:ambiguous-shape');
    expect(verdict([TRI, 'E על האנך מ-B'])).toBe('refused:ambiguous-shape');
  });
  it('a perpendicular from a point of the line onto it is not built', () => {
    expect(verdict([TRI, 'E על האנך מ-A ל-AB'])).toBe('refused:ambiguous-shape');
  });
  it('the perpendicular as its own sentence is unchanged (corpus 5/5 «האנך מהנקודה B לציר ה-x»)', () => {
    const d = built(['B(1,14)', 'האנך מהנקודה B לציר ה-x'], 0);
    expect(ids(d)).toEqual(['B', 'H']);
  });
});
