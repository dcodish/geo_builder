/**
 * «מעגל O» NAMES THE CENTRE (#1059).
 *
 * Operator ruling, 2026-09-15: *"«מעגל O» means the center letter is O"*, settling the ambiguity
 * ADR-AG-005 D6 left open — the corpus names circles with Roman numerals («מעגל I») and uses any
 * other letter for the centre, and one sentence shape carried both readings.
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { knownCurve } from '../engine/evaluate';
import { buildScene } from '../render/scene';

const at = (lines: string[]) => {
  const d = derive(lines, 0);
  return { d, p: Object.fromEntries(d.figure.points.map((q) => [q.id, q])) };
};

describe('#1059 — a letter after «מעגל» is the CENTRE', () => {
  it('places the named point at the circle’s centre', () => {
    const { d, p } = at(['נתון מעגל O שמשוואתו (x-3)^2+(y-5)^2=25']);
    expect(d.faults).toEqual([]);
    expect([p.O.x, p.O.y]).toEqual([3, 5]);
  });

  it('leaves the CIRCLE anonymous, so the letter means one thing', () => {
    // The circle keeps the content-derived id a bare equation would give it. That is not a detail:
    // naming the curve `O` as well would put one letter on two objects in the M1 id space.
    const { d } = at(['נתון מעגל O שמשוואתו (x-3)^2+(y-5)^2=25']);
    const curves = d.construction.objects.filter((o) => o.kind === 'curve');
    expect(curves).toHaveLength(1);
    expect(curves[0].id).not.toBe('O');
    expect(d.construction.objects.find((o) => o.id === 'O')?.kind).toBe('derived');
  });

  it('is a point the student can then talk about', () => {
    const { d, p } = at(['נתון מעגל O שמשוואתו (x-3)^2+(y-5)^2=25', 'A(3,0)', 'AO = 5']);
    expect(d.faults).toEqual([]);
    expect(Math.hypot(p.A.x - p.O.x, p.A.y - p.O.y)).toBeCloseTo(5, 6);
  });

  it('keeps the NUMERAL naming the circle — ADR-AG-005 D6 intact', () => {
    const { d } = at(['נתון מעגל I שמשוואתו (x-3)^2+(y-4)^2=9']);
    expect(d.faults).toEqual([]);
    expect(d.construction.objects.map((o) => o.id)).toEqual(['circle-I']);
    // And no centre point: the student named no letter for it. #1024 draws the mark without minting.
    expect(d.figure.points).toEqual([]);
  });

  it('still reports a genuinely malformed equation — the case that must not be lost', () => {
    // #1068's discriminator, and the reason «tail contains Hebrew» rather than «tail contains =».
    expect(derive(['נתון מעגל O שמשוואתו x^2+y^2='], 0).faults.map((f) => f.code)).toEqual([
      'bad-equation',
    ]);
  });

  it('reads the English form the same way', () => {
    const { d, p } = at(['the circle K whose equation is (x-1)^2+(y-2)^2=9']);
    expect(d.faults).toEqual([]);
    expect([p.K.x, p.K.y]).toEqual([1, 2]);
    expect(derive(['circle I: x^2+y^2=9'], 0).construction.objects.map((o) => o.id)).toEqual([
      'circle-I',
    ]);
  });

  it('says so when the curve has no centre to be', () => {
    // «מעגל M שמשוואתו y=2x» fits a LINE, which has no centre. The point is then vacant in a figure
    // with no freedom left, which is exactly #1058's reportable case — reached here without a new
    // message, because the mechanism was already right.
    expect(derive(['נתון מעגל M שמשוואתו y=2x'], 0).faults.map((f) => f.code)).toEqual([
      'does-not-exist',
    ]);
  });
});

/**
 * #1089 — the centre the student NAMED carries its value, not just its letter.
 *
 * Operator, 2026-09-16 (T36): *"the O should show the values. now it only shows O"*, on the figure
 * #1086 had just changed. #1086 was right that two labels must not overlap at one place and wrong
 * about which of them carries the value: the mark went quiet and the number went with it.
 *
 * The root cause was one blanket line in `provenanceOf` — *"a derived point's position comes from
 * its parents, never from givens about itself"* — written when every derived rule had POINT parents.
 * `circle-centre` is the one whose parent is a CURVE, and a curve written out in full is READ, not
 * solved.
 */
describe('#1089 — a curve-parented derived point inherits the curve’s provenance', () => {
  it('a literal circle fixes its named centre, and the figure says so', () => {
    const d = derive(['נתון מעגל O שמשוואתו (x-3)^2+(y-5)^2=25'], 0);
    expect(d.faults).toEqual([]);
    expect(d.figure.provenance.O).toEqual({ x: { known: true, value: 3 }, y: { known: true, value: 5 } });
  });

  it('a PARAMETRIC circle does not — an unstated magnitude prints no number (ADR-052)', () => {
    const d = derive(['נתון מעגל O שמשוואתו (x-a)^2+(y-5)^2=25'], 0);
    expect(d.faults).toEqual([]);
    /**
     * BOTH components stay open, and that is deliberately conservative rather than exact: `a` moves
     * only the x, so a per-component answer would say «O(x_O, 5)». Attributing a free symbol to one
     * coordinate of a FITTED centre needs the algebra the fit throws away, and the honesty invariant
     * forbids printing a value that is not known — it does not require printing every value that is.
     * Under-claiming here is safe; over-claiming would put a sampled number on the canvas.
     */
    expect(d.figure.provenance.O).toEqual({ x: { known: false }, y: { known: false } });
  });

  it('a derived point over FREE VERTICES stays open — the rule the blanket line was written for', () => {
    const d = derive(['משולש ABC', 'G מפגש התיכונים במשולש ABC'], 0);
    expect(d.figure.provenance.G).toEqual({ x: { known: false }, y: { known: false } });
  });

  it('and at the RENDER layer: ONE label, carrying both pieces', () => {
    // The #1086 lesson — verify where the operator looks. The point prints its coordinates and the
    // centre mark prints nothing, so nothing can overlap and nothing is withheld.
    const d = derive(['נתון מעגל O שמשוואתו (x-3)^2+(y-5)^2=25'], 0);
    const scene = buildScene(d.figure, d.box, 600, 600, {
      curveKnown: (id) => knownCurve(d.construction, id) !== null,
    });
    expect(scene.curves[0].centre?.label).toBeUndefined();
    const o = scene.points.find((p) => p.id === 'O')!;
    expect(o.coords?.map((c) => c.text)).toEqual(['3', '5']);
  });
});
