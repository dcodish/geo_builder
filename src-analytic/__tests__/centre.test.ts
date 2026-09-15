/**
 * A CIRCLE MARKS ITS CENTRE (#1024).
 *
 * Operator, 2026-09-15: *"we need to draw the center. in analytical geo the center is always
 * important."* Every corpus question that names a circle names its centre («ומרכזו בנקודה K»), and
 * it is the one point of a circle a student always draws by hand.
 *
 * Asserted in the SCENE rather than in the engine: the centre was already computed, already printed
 * in the data panel, and simply never drawn — so a test at the engine layer would have passed before
 * the fix (#1066's lesson).
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { knownCurve } from '../engine/evaluate';
import { buildScene } from '../render/scene';

const scene = (lines: string[], gated = true) => {
  const d = derive(lines, 0);
  return buildScene(
    d.figure,
    d.box,
    600,
    600,
    gated ? { curveKnown: (id) => knownCurve(d.construction, id) !== null } : {},
  );
};

describe('#1024 — the centre is marked, and labelled only when it is knowledge', () => {
  it('marks and labels a circle whose centre the givens fix', () => {
    const s = scene(['נתון מעגל I שמשוואתו (x-3)^2+(y-4)^2=9']);
    expect(s.curves).toHaveLength(1);
    expect(s.curves[0].centre?.label).toBe('(3, 4)');
  });

  it('marks a circle whose centre RIDES A PARAMETER — and says no number', () => {
    /**
     * The honesty half, and the reason the mark and the label are two different questions.
     * «(x-a)^2+(y-4)^2=9» has a centre at every configuration — that is what the mark says — but its
     * position is one sample's accident, and printing it would assert a magnitude the question never
     * gave (ADR-052, ADR-AG-003 §2). The panel shows the same restraint on the same figure.
     */
    const s = scene(['(x-a)^2+(y-4)^2=9']);
    expect(s.curves[0].centre).toBeDefined();
    expect(s.curves[0].centre?.label).toBeUndefined();
  });

  it('never labels when the caller supplies no gate at all', () => {
    // A renderer cannot ask whether a value is knowledge — that needs the construction across
    // several configurations. Without the gate the honest answer is the mark alone, never a number.
    expect(scene(['(x-3)^2+(y-4)^2=9'], false).curves[0].centre?.label).toBeUndefined();
  });

  it('gives a line no centre, because a line has none', () => {
    expect(scene(['y=2x']).curves[0].centre).toBeUndefined();
  });

  it('owns no letter — the centre is not an object in the figure', () => {
    /**
     * A decomposition never spends a student's letter (the ADR-297 class): minting `O` for the
     * centre would take a name the student is about to use and put it in the M1 id space.
     */
    const d = derive(['נתון מעגל I שמשוואתו (x-3)^2+(y-4)^2=9'], 0);
    expect(d.construction.objects.map((o) => o.id)).toEqual(['circle-I']);
    expect(d.figure.points).toEqual([]);
  });

  it('draws no centre for a CARRIER circle, which is not drawn at all (#1076)', () => {
    const s = scene(['נקודה B על המעגל שמשוואתו x^2+y^2=25']);
    expect(s.curves).toHaveLength(0);
  });
});
