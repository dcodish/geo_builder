/**
 * S5 (#622) — the visualization layer, one gate per picture type.
 *
 * The operator's headline requirement for this product: *"I want the visualization part to be strong…
 * students should see the polar coordinates… and see how a series behaves."* Each describe below is one
 * of the pictures that requirement names, tested against a witness from the corpus reading in docs/27
 * rather than against an invented figure.
 *
 * The last describe is the slice's other gate: the polar/cartesian toggle and the `n` stepper are
 * DISPLAY state, and neither may reach the parser or the engine (ADR-CX-001 D3).
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { deriveLines } from '../../app/deriveLines';
import { CATALOG } from '../../parser/catalog';
import { useComplexStore } from '../../store/useComplexStore';
import { buildScene } from '../scene';

const near = (a: number, b: number, eps = 1e-9): boolean => Math.abs(a - b) <= eps;

/** Does the drawn path actually pass through this term? The spiral's whole honesty rests on it. */
const passesThrough = (path: readonly { re: number; im: number }[], z: { re: number; im: number }) =>
  path.some((p) => near(p.re, z.re, 1e-6) && near(p.im, z.im, 1e-6));

describe('TermSpiral — a geometric sequence is a spiral, and its degenerate cases are the exam cases', () => {
  it('|q| = 1 closes the spiral into a CIRCLE — the rotation orbit behind every roots-of-unity ask', () => {
    const d = deriveLines(['z1 = 1', 'z2 = i', 'z1, z2, z3 סדרה הנדסית']);
    const [spiral] = buildScene(d).spirals;
    expect(spiral.shape).toBe('circle');
    expect(spiral.stepLabel).toBe('q = 1·cis90°');
    expect(spiral.marks.map((m) => m.name)).toEqual(['z1', 'z2', 'z3']);
  });

  it('arg q = 0 collapses it to a RAY — the real geometric sequence the student already knows', () => {
    const d = deriveLines(['z1 = 1', 'z2 = 2', 'z1, z2, z3 סדרה הנדסית']);
    expect(buildScene(d).spirals[0].shape).toBe('ray');
  });

  it('otherwise it is a spiral: it turns AND stretches', () => {
    const d = deriveLines(['z1 = 1', 'z2 = 1+i', 'z1, z2, z3 סדרה הנדסית']);
    const [spiral] = buildScene(d).spirals;
    expect(spiral.shape).toBe('spiral');
    expect(spiral.stepLabel).toBe('q = 1.41·cis45°');
  });

  it('an ARITHMETIC sequence is a straight line — addition does not turn anything', () => {
    const d = deriveLines(['z1 = 1', 'z2 = 2+i', 'z1, z2, z3 סדרה חשבונית']);
    const [spiral] = buildScene(d).spirals;
    expect(spiral.shape).toBe('line');
    expect(spiral.stepLabel).toBe('d = 1+i');
  });

  it('the path passes through EVERY stated term, gaps included', () => {
    // «the first two terms … and the FIFTH term is z4» — the path crosses three multiplications
    // between z2 and z4, and it still has to arrive exactly on z4
    const d = deriveLines([
      'z1 = 1',
      'z2 = 2',
      'z1 ו-z2 הם שני האיברים הראשונים בסדרה הנדסית שבה האיבר החמישי הוא z4',
    ]);
    const [spiral] = buildScene(d).spirals;
    for (const m of spiral.marks) expect(passesThrough(spiral.path, m.z)).toBe(true);
    expect(spiral.marks.map((m) => m.z.re)).toEqual([1, 2, 16]);
  });

  it('a drawn spiral carries a mark for EVERY stated term — a partial spiral is a different sequence', () => {
    for (const lines of [
      ['z1 = 1', 'z2 = i', 'z1, z2, z3 סדרה הנדסית'],
      ['z1, z2, z3 סדרה הנדסית'], // nothing stated but the sentence: still three terms, all sampled
      ['z1 = 1', 'z2 = 2+i', 'z1, z2, z3 סדרה חשבונית'],
    ]) {
      const d = deriveLines(lines);
      for (const s of buildScene(d).spirals) {
        expect(s.marks).toHaveLength(3);
        for (const m of s.marks) expect(passesThrough(s.path, m.z)).toBe(true);
      }
    }
  });
});

describe('SumChain — the partial sums, head to tail', () => {
  it('lays each term on the end of the last one, starting from the origin', () => {
    const d = deriveLines(['z1 = 1', 'z2 = i', 'z1, z2, z3 סדרה הנדסית']);
    const [chain] = buildScene(d).chains;
    expect(chain.vertices).toHaveLength(4); // O, S₁, S₂, S₃
    expect(near(chain.vertices[1].re, 1)).toBe(true);
    expect(near(chain.vertices[2].re, 1) && near(chain.vertices[2].im, 1)).toBe(true);
  });

  it('|q| < 1 shows WHERE the infinite sum lands — convergence, as a point', () => {
    const d = deriveLines(['z1 = 1', 'z2 = 0.5', 'z1, z2, z3 סדרה הנדסית']);
    const [chain] = buildScene(d).chains;
    expect(chain.limit).not.toBeNull();
    expect(near(chain.limit!.re, 2, 1e-9)).toBe(true); // 1/(1 − ½)
  });

  it('a sum of zero CLOSES the chain — the cube roots of unity, seen rather than computed', () => {
    const d = deriveLines(['z1 = 1', 'z2 = 1cis120', 'z1, z2, z3 סדרה הנדסית']);
    const [chain] = buildScene(d).chains;
    expect(chain.closes).toBe(true);
  });

  it('no limit point when the sum diverges — nothing is drawn where nothing is', () => {
    const d = deriveLines(['z1 = 1', 'z2 = 2', 'z1, z2, z3 סדרה הנדסית']);
    expect(buildScene(d).chains[0].limit).toBeNull();
  });
});

describe('RotationArc — multiplication is a rotation and a stretch', () => {
  it('w = z1·z2 is drawn as the turn arg z2 and the stretch |z2|', () => {
    const d = deriveLines(['z1 = 2', 'z2 = 2cis30', 'w = z1*z2']);
    expect(d.rotations.map((r) => [r.from, r.to, r.byDeg, r.scale])).toEqual([['z1', 'w', 30, 2]]);
    const [arc] = buildScene(d).rotations;
    expect([arc.fromDeg, arc.toDeg]).toEqual([0, 30]);
    expect(arc.radius).toBeCloseTo(2, 9); // swept at the radius of the number being turned
    expect([arc.turnLabel, arc.scaleLabel]).toEqual(['30°', '×2']);
  });

  it('multiplying by i is a PURE rotation — a quarter turn, ×1', () => {
    const d = deriveLines(['z1 = 2', 'w = z1*i']);
    const [arc] = buildScene(d).rotations;
    expect([arc.turnLabel, arc.scaleLabel]).toEqual(['90°', '×1']);
  });

  it('the arc is measured off the DRAWN points, so it cannot disagree with them', () => {
    const d = deriveLines(['z1 = 2cis40', 'z2 = 3cis25', 'w = z1*z2']);
    const [arc] = buildScene(d).rotations;
    const w = d.points.find((p) => p.name === 'w')!;
    expect(arc.toDeg).toBeCloseTo(w.argumentDeg, 6);
  });
});

describe('ValueCycle — the finite ring of directions a power visits', () => {
  it('a sixth root of unity cycles with period 6, on the unit ring', () => {
    const d = deriveLines(['z^6 = 1'], 1); // configuration 2 of 6: cis60°
    const z = d.points[0];
    expect(z.reading).toBe('z = 1·cis60°');
    expect(z.cyclePeriod).toBe(6);
    const [cycle] = buildScene(d).cycles;
    expect(cycle.powers).toHaveLength(6);
    expect(near(Math.hypot(cycle.powers[5].re, cycle.powers[5].im), 1, 1e-9)).toBe(true);
    expect(near(cycle.powers[5].re, 1, 1e-9)).toBe(true); // z⁶ = 1, which is where the ring closes
  });

  it('the period is DECIDED, not measured: cis120° cycles in 3, cis180° in 2', () => {
    expect(deriveLines(['z^6 = 1'], 2).points[0].cyclePeriod).toBe(3);
    expect(deriveLines(['z^6 = 1'], 3).points[0].cyclePeriod).toBe(2);
  });

  it('a number that is not exactly on the unit circle has NO cycle — its powers walk away forever', () => {
    const d = deriveLines(['z1 = 1+i']);
    expect(d.points[0].cyclePeriod).toBeNull();
    expect(buildScene(d).cycles).toEqual([]);
  });

  it('the n stepper walks the cycle and comes back — n and n+period mark the same power', () => {
    const d = deriveLines(['z^6 = 1'], 1);
    expect(buildScene(d, { n: 1 }).cycles[0].current).toBe(0);
    expect(buildScene(d, { n: 3 }).cycles[0].current).toBe(2);
    expect(buildScene(d, { n: 7 }).cycles[0].current).toBe(0);
  });
});

describe('Region — inside, on, outside (the docs/27 §2b ד counting picture)', () => {
  it('places every plotted number against a stated polygon', () => {
    const d = deriveLines(['z1 = 4', 'z2 = 4i', 'w = 1+i', 'המשולש Oz1z2']);
    const [region] = buildScene(d).regions;
    expect(region.counts).toEqual({ in: 1, on: 2, out: 0 });
    expect(region.members.find((m) => m.name === 'w')!.where).toBe('in');
  });

  it('a vertex of the polygon is ON it, never a coin toss between in and out', () => {
    const d = deriveLines(['z1 = 4', 'z2 = 4i', 'המשולש Oz1z2']);
    const [region] = buildScene(d).regions;
    expect(region.members.every((m) => m.where === 'on')).toBe(true);
  });

  it('a number outside is counted as outside', () => {
    const d = deriveLines(['z1 = 4', 'z2 = 4i', 'w = 9+9i', 'המשולש Oz1z2']);
    expect(buildScene(d).regions[0].counts.out).toBe(1);
  });
});

/**
 * THE DISPLAY SEAM (ADR-CX-001 D3, the ADR-448 / ADR-3D-144 rule).
 *
 * A display transform must never reach the parser or the engine. The sibling products state this and
 * the sibling products have each broken it once, so it is asserted here over the WHOLE catalog rather
 * than on a chosen example: every specimen is entered under both views, through the real store, and
 * the accepted lines and the derived figure must be identical strings either way.
 */
describe('the polar/cartesian toggle is display-only, over the whole catalog', () => {
  beforeEach(() => {
    useComplexStore.setState({ lines: [], facts: [], freePos: {}, seed: 0, lastError: null });
    useComplexStore.getState().setEngine('v2');
  });

  const figureOf = (lines: readonly string[]): string => {
    const d = deriveLines(lines);
    return JSON.stringify({
      readings: d.points.map((p) => p.reading),
      objects: d.objects.map((o) => [o.kind, o.label]),
      sequences: d.sequences.map((s) => [s.kind, s.terms.map((t) => t.name)]),
      configCount: d.configCount,
      untranslated: d.untranslated.map((u) => u.src),
    });
  };

  const enteredUnder = (view: 'cart' | 'polar', line: string) => {
    const store = useComplexStore.getState();
    store.clearAll();
    store.setView(view);
    const accepted = useComplexStore.getState().addLine(line);
    const lines = useComplexStore.getState().lines;
    return { accepted, lines: [...lines], figure: figureOf(lines) };
  };

  it.each(CATALOG.flatMap((e) => [e.he, e.en]))('parse(%s) is the same under either view', (line) => {
    const cart = enteredUnder('cart', line);
    const polar = enteredUnder('polar', line);
    expect(polar.accepted).toBe(cart.accepted);
    expect(polar.lines).toEqual(cart.lines);
    expect(polar.figure).toBe(cart.figure);
  });

  it('toggling the view changes NOTHING but the view', () => {
    const store = useComplexStore.getState();
    store.clearAll();
    store.setView('cart');
    store.addLine('z1 = 3+4i');
    const before = useComplexStore.getState();
    const snapshot = JSON.stringify({ lines: before.lines, facts: before.facts, seed: before.seed });
    useComplexStore.getState().setView('polar');
    const after = useComplexStore.getState();
    expect(JSON.stringify({ lines: after.lines, facts: after.facts, seed: after.seed })).toBe(snapshot);
    expect(after.view).toBe('polar');
  });

  it('the n stepper moves the marker and nothing else', () => {
    const d = deriveLines(['z^6 = 1'], 1);
    const strip = (n: number) => {
      const s = buildScene(d, { n });
      return JSON.stringify({ ...s, cycles: s.cycles.map(({ current, ...rest }) => rest) });
    };
    expect(strip(5)).toBe(strip(1));
    expect(buildScene(d, { n: 5 }).cycles[0].current).not.toBe(
      buildScene(d, { n: 1 }).cycles[0].current,
    );
  });
});
