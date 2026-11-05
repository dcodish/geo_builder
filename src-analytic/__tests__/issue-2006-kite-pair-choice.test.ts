/**
 * #2006 ([ADR-AG-406](../../docs/06c-decisions-analytic.md#adr-ag-406)) — a kite's equal pair is a CHOICE (W4), and its
 * main diagonal follows the chosen pair (ruling A).
 *
 * W4, 2026-10-08: *"«דלתון ABCD» in analytic: the equal pair is a choice, shown with 2-D's note and cycled as in 2-D.
 * «האלכסון הראשי» follows the chosen pair, which changes ADR-AG-037's fixed AC."*
 * Ruling A, 2026-10-13: *"the line y=2x is the main diagonal in every drawing; which letters lie on it changes with the
 * configuration … until the student states the pair (e.g. «AB = AD»), which fixes it"*; *"The same holds for «האלכסון
 * המשני»"*. Row name, 2026-10-13: the role name while open, the letters once fixed.
 *
 * Measured before (28dac0c3): the pair was fixed AB = AD, CB = CD, no note; «BA = BC» drew a rhombus; the diagonal was
 * always `line-AC`, named AC.
 */
import { describe, expect, it } from 'vitest';
import { curveRowName, panelKnowledge } from '../app/panelRows';
import { decideSubmit } from '../app/submit';
import { unstatedChoiceText } from '../app/unstatedChoice';
import { derive, type Derivation } from '../engine/derive';
import { unstatedChoices } from '../engine/unstatedChoices';
import { analyticI18n } from '../i18n';

const SEEDS = Array.from({ length: 24 }, (_, i) => i);
const KITE = 'דלתון ABCD';
const MAIN = 'משוואת האלכסון הראשי היא y=2x';
const SECONDARY = 'משוואת האלכסון המשני היא y=-x';
const he = analyticI18n.getFixedT('he');
const en = analyticI18n.getFixedT('en');
const plain = (s: string) => s.replace(/[⁦-⁩‎‏]/g, '');
const noteTexts = (lines: string[], seed = 0) =>
  unstatedChoices(derive(lines, seed)).map((c) => plain(unstatedChoiceText(c, (k, o) => he(k, o))));

/** The kite's axis in the drawn figure: the two vertices where the equal pairs meet. Null when it is not a kite. */
function axisOf(d: Derivation): 'AC' | 'BD' | null {
  const p = Object.fromEntries(d.figure.points.map((q) => [q.id, q]));
  const len = (a: string, b: string) => Math.hypot(p[a].x - p[b].x, p[a].y - p[b].y);
  const same = (x: number, y: number) => Math.abs(x - y) < 1e-5;
  const ac = same(len('A', 'B'), len('A', 'D')) && same(len('C', 'B'), len('C', 'D'));
  const bd = same(len('A', 'B'), len('B', 'C')) && same(len('A', 'D'), len('D', 'C'));
  return ac === bd ? null : ac ? 'AC' : 'BD';
}
/** The ring vertices on a curve, read off the drawn figure. */
function carried(d: Derivation, id: string): string {
  const l = d.figure.curves.find((c) => c.id === id)!.curve;
  if (l.kind !== 'line') throw new Error('not a line');
  const s = Math.hypot(l.a, l.b);
  return d.figure.points.filter((p) => Math.abs(l.a * p.x + l.b * p.y + l.c) / s < 1e-6).map((p) => p.id).join('');
}
const onlyCurve = (d: Derivation) => {
  expect(d.figure.curves).toHaveLength(1);
  return d.figure.curves[0].id;
};
const rowNames = (d: Derivation, t: typeof he = he) =>
  panelKnowledge(d).curves.map((row) => curveRowName(d.figure.curves.find((c) => c.id === row.id)!, row, (k) => t(k)));

describe('#2006 W4 — the pair is a choice, said and cycled', () => {
  it('«דלתון ABCD» draws both pairs across the seeds, always a whole kite, never a rhombus', () => {
    const axes = SEEDS.map((s) => axisOf(derive([KITE], s)));
    expect(axes.filter((a) => a === null)).toEqual([]);
    expect(new Set(axes)).toEqual(new Set(['AC', 'BD']));
  });

  it("shows 2-D's note, naming the drawn pair, at each of six seeds", () => {
    for (const s of [0, 1, 2, 3, 4, 5]) {
      const drawn = axisOf(derive([KITE], s)) === 'AC' ? 'AB = AD, CB = CD' : 'AB = BC, AD = DC';
      const pin = drawn.split(',')[0];
      expect(noteTexts([KITE], s)).toEqual([
        `הכלי לא יודע אילו צלעות שוות — כרגע מצוירות ${drawn}. כדי לקבוע כתבו למשל «${pin.replace(/ /g, "")}», או לחצו «הציגו תצורה אחרת».`,
      ]);
    }
  });

  it.each([
    ['AB = AD', 'AC'],
    ['AD = AB', 'AC'],
    ['CB = CD', 'AC'],
    ['BA = BC', 'BD'],
    ['DA = DC', 'BD'],
  ])('«%s» records, retires the note and pins the axis %s at every seed', (given, axis) => {
    expect(decideSubmit(given, [KITE], 0).kind).toBe('record');
    expect(noteTexts([KITE, given])).toEqual([]);
    for (const s of SEEDS) expect(axisOf(derive([KITE, given], s))).toBe(axis);
  });
});

describe('#2006 ruling A — the main diagonal follows the configuration', () => {
  it("the operator's sequence records and draws its line through the drawn axis at every seed, both axes occurring", () => {
    expect(decideSubmit(MAIN, [KITE], 0).kind).toBe('record');
    const seen = new Set<string>();
    for (const s of SEEDS) {
      const d = derive([KITE, MAIN], s);
      expect(d.faults).toEqual([]);
      const on = carried(d, onlyCurve(d));
      expect(on).toBe(axisOf(d));
      seen.add(on);
    }
    expect(seen).toEqual(new Set(['AC', 'BD']));
  });

  it('the note stays while the pair is open, and names the drawn pair', () => {
    for (const s of [0, 1, 2]) {
      const d = derive([KITE, MAIN], s);
      const drawn = axisOf(d) === 'AC' ? 'AB = AD, CB = CD' : 'AB = BC, AD = DC';
      expect(noteTexts([KITE, MAIN], s)[0]).toContain(drawn);
    }
  });

  it('the secondary diagonal is the other two vertices, at every seed', () => {
    for (const s of SEEDS) {
      const d = derive([KITE, SECONDARY], s);
      expect(carried(d, onlyCurve(d))).toBe(axisOf(d) === 'AC' ? 'BD' : 'AC');
    }
  });

  it('both diagonals share one cycle (the second sentence finds the seat the first rewrote)', () => {
    const lines = [KITE, MAIN, 'משוואת האלכסון המשני היא y=-x/2+1'];
    for (const s of SEEDS) {
      const d = derive(lines, s);
      expect(d.faults).toEqual([]);
      const axis = axisOf(d);
      const [main, second] = d.figure.curves;
      expect(carried(d, main.id)).toBe(axis);
      expect(carried(d, second.id)).toBe(axis === 'AC' ? 'BD' : 'AC');
    }
  });

  it('the pair stated AFTER the line fixes the letters and retires the note', () => {
    for (const [given, axis] of [['AB = AD', 'AC'], ['BA = BC', 'BD']]) {
      expect(noteTexts([KITE, MAIN, given])).toEqual([]);
      for (const s of SEEDS) {
        const d = derive([KITE, MAIN, given], s);
        expect(carried(d, onlyCurve(d))).toBe(axis);
        expect(axisOf(d)).toBe(axis);
      }
    }
  });

  it('the pair stated FIRST is the lettered twin, construction and all', () => {
    const role = derive([KITE, 'AB = AD', MAIN], 0);
    const lettered = derive([KITE, 'AB = AD', 'משוואת האלכסון AC היא y=2x'], 0);
    expect(JSON.stringify(role.construction)).toBe(JSON.stringify(lettered.construction));
    expect(onlyCurve(derive([KITE, 'BA = BC', MAIN], 0))).toBe('line-BD');
    expect(onlyCurve(derive([KITE, 'AB = AD', SECONDARY], 0))).toBe('line-BD');
  });

  it('the English sentence and the short Hebrew form read the same', () => {
    for (const line of ['the main diagonal is y=2x', 'האלכסון הראשי: y=2x']) {
      const d = derive([KITE, line], 0);
      expect(d.faults).toEqual([]);
      expect(carried(d, onlyCurve(d))).toBe(axisOf(d));
    }
  });

  it('the other equality after the pair adds nothing, and the stated pair draws no mark the noun did not', () => {
    expect(decideSubmit('CB = CD', [KITE, 'AB = AD'], 0).kind).toBe('already-known');
    const d = derive([KITE, 'AB = AD', 'A(1,7)'], 0);
    expect(d.stated.equalLengths).toEqual([]);
    // Every constraint after the collapse stays on its own line: the collapse moved them.
    const placed = derive([KITE, 'AB = AD', 'AB = 6'], 0);
    expect(placed.constraintLine.at(-1)).toBe(2);
  });

  it('the same sentence twice is already known', () => {
    expect(decideSubmit(MAIN, [KITE, MAIN], 0).kind).toBe('already-known');
  });

  it('a line the figure already has carries the role, and keeps its own name', () => {
    for (const s of SEEDS) {
      const d = derive(['l1: y=2x', KITE, MAIN], s);
      expect(d.faults).toEqual([]);
      expect(carried(d, 'line-l1')).toBe(axisOf(d));
    }
  });

  it.each(['מרובע ABCD', 'מקבילית ABCD', 'מעוין ABCD'])('%s keeps its refusal: the noun has no main diagonal', (noun) => {
    expect(derive([noun, MAIN], 0).faults.map((f) => f.code)).toEqual(['undistinguished-diagonal']);
  });
});

describe('#2006 — the row: the role name while open, the letters once fixed', () => {
  it('reads the role in Hebrew and in English while open', () => {
    const d = derive([KITE, MAIN], 0);
    expect(rowNames(d)).toEqual(['האלכסון הראשי']);
    expect(rowNames(d, en)).toEqual(['main diagonal']);
    const s = derive([KITE, SECONDARY], 0);
    expect(rowNames(s)).toEqual(['האלכסון המשני']);
    expect(rowNames(s, en)).toEqual(['secondary diagonal']);
  });

  it('reads the letters once a given fixes the pair, in either order', () => {
    expect(rowNames(derive([KITE, MAIN, 'AB = AD'], 0))).toEqual(['AC']);
    expect(rowNames(derive([KITE, MAIN, 'BA = BC'], 0))).toEqual(['BD']);
    expect(rowNames(derive([KITE, 'AB = AD', MAIN], 0))).toEqual(['AC']);
    expect(rowNames(derive([KITE, SECONDARY, 'AB = AD'], 0))).toEqual(['BD']);
  });

  it('never gives the role line a tool name or a letter name, so no slot resolves to it', () => {
    const line = derive([KITE, MAIN], 0).figure.curves[0];
    expect(line.label.name).toBe('');
    expect(line.id.startsWith('line-')).toBe(false);
  });

  it('keeps the equation in the row', () => {
    const d = derive([KITE, MAIN], 0);
    expect(panelKnowledge(d).curves[0].known).toMatchObject({ kind: 'line' });
  });
});

describe('#2006 — control figures stay whole', () => {
  it.each([[['דלתון ABCD חסום במעגל']], [['מעגל חסום בדלתון ABCD']]])('%j is a whole kite at 24 seeds', (lines) => {
    for (const s of SEEDS) {
      const d = derive(lines, s);
      expect(d.faults).toEqual([]);
      expect(axisOf(d)).not.toBeNull();
    }
  });
});
