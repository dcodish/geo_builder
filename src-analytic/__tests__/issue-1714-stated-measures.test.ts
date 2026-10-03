/**
 * #1714 (ADR-AG-225) — WHAT THE STUDENT STATED IS WRITTEN ON THE FIGURE, as 2-D writes it.
 *
 * Operator, playing round #1709 T5: *"when an angle or segment are given, we need to put those values on the
 * segment or angle like the 2d tool does"*. Measured before: only a NUMERIC stated length reached the canvas;
 * every other stated measure drew nothing.
 *
 * Every case goes through the app's own path — `derive` → `buildScene` with `Derivation.stated` — at several seeds,
 * and asserts the TEXT the student typed and the SHAPE of the mark (through the shared checks of `shell/marks`,
 * docs/28 §5c). A derived value never becomes a canvas label (ADR-AG-016).
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { buildScene, type Scene } from '../render/scene';
import { arcFaults, kneeFaults, pointsOf, tickFaults } from '../../shell/__tests__/fixtures/mark-geometry-rows';
import type { MarkPt } from '../../shell/marks';

const SEEDS = [0, 1, 2, 3, 4, 5];
/** The bidi isolates `lbl` wraps a label in (#1191), removed so a case reads as the text the student sees. */
const strip = (s: string) => s.replace(/[⁦-⁩]/g, '');

function scene(lines: string[], seed = 0): { s: Scene; d: ReturnType<typeof derive> } {
  const d = derive(lines, seed);
  expect(d.faults, lines.join(' · ')).toEqual([]);
  return { s: buildScene(d.figure, d.box, 600, 400, { stated: d.stated }), d };
}
const labels = (s: Scene, kind?: string) => s.stated.labels.filter((l) => !kind || l.kind === kind).map((l) => strip(l.text));
const segLabels = (s: Scene) => s.segments.filter((x) => x.label).map((x) => `${x.key}=${strip(x.label!.text)}`);
/** A point of the drawn figure, in the scene's screen space. */
const screen = (s: Scene, id: string): MarkPt => {
  const p = s.points.find((q) => q.id === id)!;
  return { x: p.cx, y: p.cy };
};

describe('#1714 — angles: an arc at the vertex and the value the student stated', () => {
  it('«∢ABC = 30» → an arc at B and «30°», the arc sweeping the interior angle, at every seed', () => {
    for (const seed of SEEDS) {
      const { s } = scene(['משולש ABC', '∢ABC = 30'], seed);
      expect(labels(s, 'angle')).toEqual(['30°']);
      const arcs = s.stated.marks.filter((m) => m.kind === 'angle');
      expect(arcs).toHaveLength(1);
      expect(arcFaults(pointsOf(arcs[0].d), screen(s, 'B'), screen(s, 'A'), screen(s, 'C'), 1e-3)).toEqual([]);
    }
  });

  it('«∢ABC = α» → «α», the letter the student wrote', () => {
    const { s } = scene(['משולש ABC', '∢ABC = α']);
    expect(labels(s, 'angle')).toEqual(['α']);
  });

  it('«∢ABC = α» then «α = 30» → «30°», 2-D’s default once the letter is valued (measured: 2-D shows 30°)', () => {
    const { s } = scene(['משולש ABC', '∢ABC = α', 'α = 30']);
    expect(labels(s, 'angle')).toEqual(['30°']);
  });

  it('a trig given writes the ANGLE it fixes: «tan∢ABC = 2» → «63.43°», never «tan=2» (#1718/#1719 ruling)', () => {
    for (const seed of SEEDS) expect(labels(scene(['משולש ABC', 'tan∢ABC = 2'], seed).s, 'angle')).toEqual(['63.43°']);
    expect(labels(scene(['משולש ABC', 'tan∢ABC = -1']).s, 'angle')).toEqual(['135°']);
    expect(labels(scene(['משולש ABC', 'cos∢ABC = 0.5']).s, 'angle')).toEqual(['60°']);
  });

  it('«∢ABC = ∢ACB» → one equal ring at B and at C, no value', () => {
    const { s } = scene(['משולש ABC', '∢ABC = ∢ACB']);
    expect(s.stated.marks.map((m) => m.kind)).toEqual(['equal', 'equal']);
    expect(labels(s)).toEqual([]);
  });
});

describe('#1714 — right angles: a knee, never «90°»', () => {
  for (const line of ['זווית ABC ישרה', '∢ABC = 90', 'AB ⊥ BC']) {
    it(`«${line}» → a square knee at B, at every seed`, () => {
      for (const seed of SEEDS) {
        const { s } = scene(['משולש ABC', line], seed);
        const knees = s.stated.marks.filter((m) => m.kind === 'right');
        expect(knees, line).toHaveLength(1);
        expect(labels(s)).toEqual([]);
        expect(kneeFaults(pointsOf(knees[0].d), screen(s, 'B'), screen(s, 'A'), screen(s, 'C'), 1e-2)).toEqual([]);
      }
    });
  }

  it('«משולש ישר זווית ABC» → the knee sits where THIS configuration put the right angle, and moves with it', () => {
    const at = new Set<string>();
    for (const seed of [0, 1, 2]) {
      const { s } = scene(['משולש ישר זווית ABC'], seed);
      const knees = s.stated.marks.filter((m) => m.kind === 'right');
      expect(knees).toHaveLength(1);
      const corner = pointsOf(knees[0].d);
      const v = ['A', 'B', 'C'].find((id) => kneeFaults(corner, screen(s, id), ...(['A', 'B', 'C'].filter((o) => o !== id).map((o) => screen(s, o)) as [MarkPt, MarkPt]), 1e-2).length === 0);
      expect(v, `seed ${seed}`).toBeDefined();
      at.add(v!);
    }
    expect(at.size, '«הציגו תצורה אחרת» walks the seats').toBe(3);
  });

  it("a noun's DEFINITION draws no knees and no ticks: «מלבן ABCD», «מעוין ABCD» (2-D's rule)", () => {
    for (const noun of ['מלבן ABCD', 'מעוין ABCD', 'ריבוע ABCD']) {
      const { s } = scene([noun]);
      expect(s.stated.marks, noun).toEqual([]);
      expect(s.stated.ticks, noun).toEqual([]);
    }
  });
});

describe('#1714 — lengths: the student’s number or letter, on the segment', () => {
  it('«AB = 5» → «5»; «AB = 3a» → «3a» (juxtaposed, as the exam writes it); «AD = 12√a» → «12√a»', () => {
    expect(segLabels(scene(['משולש ABC', 'AB = 5']).s)).toEqual(['A|B=5']);
    expect(segLabels(scene(['משולש ABC', 'AB = 3a']).s)).toEqual(['A|B=3a']);
    expect(segLabels(scene(['משולש ABD', 'AD = 12√a']).s)).toEqual(['A|D=12√a']);
  });

  it('«AB = 3a» then «AB = 6» → the student’s later number on the segment', () => {
    // ADR-AG-218: «AB = 6» pins the letter; the latest statement of AB is the one written.
    const { d } = scene(['משולש ABC', 'AB = 3a', 'AB = 6']);
    expect(d.stated.lengths.map((l) => l.value)).toContainEqual({ num: 6 });
  });

  it('«AB = AC» → one tick across each, centred and perpendicular; no number', () => {
    for (const seed of SEEDS) {
      const { s } = scene(['משולש ABC', 'AB = AC'], seed);
      expect(segLabels(s)).toEqual([]);
      expect(s.stated.ticks).toHaveLength(2);
      const [ab, ac] = s.stated.ticks.map((t) => [{ x: t.x1, y: t.y1 }, { x: t.x2, y: t.y2 }] as [MarkPt, MarkPt]);
      expect(tickFaults([ab], screen(s, 'A'), screen(s, 'B'), 1, 5, 1e-6)).toEqual([]);
      expect(tickFaults([ac], screen(s, 'A'), screen(s, 'C'), 1, 5, 1e-6)).toEqual([]);
    }
  });

  it('two equality classes read as two: «AB = AC», «BD = CD» → 1 tick and 2 ticks', () => {
    const { d } = scene(['מרובע ABCD', 'AB = AD', 'CB = CD']);
    expect(d.stated.equalLengths.map((e) => `${e.a}${e.b}:${e.count}`)).toEqual(['AB:1', 'AD:1', 'CB:2', 'CD:2']);
  });

  it('a DERIVED length is never a canvas label — «AB = 10» · «AB = AC» writes 10 on AB only (ADR-AG-016)', () => {
    expect(segLabels(scene(['משולש ABC', 'AB = 10', 'AB = AC']).s)).toEqual(['A|B=10']);
    expect(segLabels(scene(['A(0,0)', 'B(6,0)', 'C(0,8)', 'משולש ABC']).s)).toEqual([]);
  });
});

describe('#1714 — areas and arcs', () => {
  it('«שטח המשולש ABC הוא 13» → «S=13» inside the triangle', () => {
    for (const seed of SEEDS) {
      const { s } = scene(['משולש ABC', 'שטח המשולש ABC הוא 13'], seed);
      expect(labels(s, 'area')).toEqual(['S=13']);
      const [a, b, c] = ['A', 'B', 'C'].map((id) => screen(s, id));
      const l = s.stated.labels.find((x) => x.kind === 'area')!;
      expect(l.x).toBeCloseTo((a.x + b.x + c.x) / 3, 6);
      expect(l.y).toBeCloseTo((a.y + b.y + c.y) / 3, 6);
    }
  });

  it('«⌢AC = 60°» → «60°» ON the arc, inside the circle — never at the centre (ADR-335)', () => {
    for (const seed of SEEDS) {
      const { s, d } = scene(['נתון מעגל שמרכזו O', 'A ו-C על המעגל', '⌢{AC} = 60°'], seed);
      expect(labels(s, 'arc')).toEqual(['60°']);
      const circle = d.figure.curves.find((c) => c.curve.kind === 'circle')!.curve as { cx: number; cy: number; r: number };
      const l = s.stated.labels.find((x) => x.kind === 'arc')!;
      const o = screen(s, 'O');
      const rPx = Math.hypot(screen(s, 'A').x - o.x, screen(s, 'A').y - o.y);
      const dist = Math.hypot(l.x - o.x, l.y - o.y);
      expect(dist).toBeLessThan(rPx);
      expect(dist).toBeGreaterThan(rPx * 0.5);
      expect(circle.r).toBeGreaterThan(0);
    }
  });
});
