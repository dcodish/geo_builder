/**
 * #2340 (ADR-3D-373) — ONE STATED COORDINATE ANCHORS ONE AXIS, NOT THREE.
 *
 * The operator (round #2304, T32, 2026-10-17), on «תיבה ABCDA'B'C'D'» · «X_B=3»: *"why is A at (?, 0,0) -
 * no one defined that"*. And «z_A=2» printed «A(0, 0, 2)» as a fact. The knowledge gate opened on
 * `c.pins.length > 0`, a whole-figure flag, so the two translation axes a component pin does not anchor
 * stayed at the canonical gauge (A at the origin), read seed-stable, and printed — the frozen gauge is one
 * drawing's sample, which the 2026-07-09 rule says is not knowledge.
 *
 * The fix asks `translationAnchoredAxes3` per axis; every translation-dependent surface reads it (the point
 * rows, `pointComps` → the ask lane, a plane's d-term, the parametric anchor). The FIGURE is not changed:
 * nothing is newly sampled, and the drawn positions are asserted below to sit where they always did.
 */
import { describe, expect, it } from 'vitest';
import { dataView } from '../engine/dataView';
import { planeOffsetAnchored3 } from '../engine/dataView';
import { translationAnchoredAxes3, translationKnown3 } from '../engine/evaluate';
import { answerQuery } from '../engine/queries';
import { decideSubmit3, derive3, type Fact3 } from '../store/store3';

type St = { facts: Fact3[]; seed: number };
const BOX = "תיבה ABCDA'B'C'D'";
const CUBE = "קובייה ABCDA'B'C'D'";
const PYRAMID = 'פירמידה ABCDS';

function build(lines: readonly string[]): St {
  let st: St = { facts: [], seed: 0 };
  for (const l of lines) {
    const v = decideSubmit3(st, l);
    if (v.kind !== 'record') throw new Error(`«${l}» did not record: ${JSON.stringify(v)}`);
    st = { facts: v.facts, seed: v.seed };
  }
  return st;
}
const panel = (st: St, seed = st.seed) => dataView(derive3(st.facts, seed).construction, seed);
const ask = (st: St, q: string) => answerQuery(derive3(st.facts, st.seed).construction, q, st.seed);
const SEEDS = [0, 1, 7];

describe('#2340 — the operator’s T32 sequence', () => {
  for (const line of ['X_B=3', 'x_B=3']) {
    it(`«${BOX}» · «${line}»: A gets no row and no label; B still reads (3, ?, ?)`, () => {
      const st = build([BOX, line]);
      for (const seed of SEEDS) {
        const p = panel(st, seed);
        expect(p.points, `seed ${seed}`).toEqual(['B(3, ?, ?)']);
        expect(p.pointCoords.A, `seed ${seed}`).toBeUndefined();
        expect(p.pointComps.A, `seed ${seed}`).toBeUndefined();
        expect(p.pointCoords.B).toEqual({ text: '(3, ?, ?)', kind: 'partial' });
      }
    });
  }

  it('«z_A=2»: A reads (?, ?, 2), never (0, 0, 2); «x_A» is undetermined, «z_A» answers 2', () => {
    const st = build([BOX, 'z_A=2']);
    for (const seed of SEEDS) expect(panel(st, seed).points, `seed ${seed}`).toEqual(['A(?, ?, 2)']);
    expect(ask(st, 'x_A')).toMatchObject({ answer: null, note: 'undetermined' });
    expect(ask(st, 'y_A')).toMatchObject({ answer: null, note: 'undetermined' });
    expect(ask(st, 'z_A').answer).toBe('2');
    expect(ask(st, 'A').answer).toBe('(?, ?, 2)');
  });

  it('the FIGURE is unchanged: A is still drawn at the canonical gauge on the unanchored axes', () => {
    const st = build([BOX, 'X_B=3']);
    for (const seed of SEEDS) {
      const d = derive3(st.facts, seed);
      const a = d.positions.get('A')!;
      expect(a.y).toBe(0);
      expect(a.z).toBe(0);
      expect(d.positions.get('B')!.x).toBeCloseTo(3, 9);
    }
  });
});

describe('#2340 — the class: every component pin, every solid', () => {
  const CASES: { solid: string; line: string; id: string; axis: 'x' | 'y' | 'z'; value: string }[] = [];
  for (const solid of [BOX, CUBE, PYRAMID]) {
    CASES.push({ solid, line: 'X_B=3', id: 'B', axis: 'x', value: '3' });
    CASES.push({ solid, line: 'x_B=3', id: 'B', axis: 'x', value: '3' });
    CASES.push({ solid, line: 'z_A=2', id: 'A', axis: 'z', value: '2' });
    CASES.push({ solid, line: 'y_C=-1', id: 'C', axis: 'y', value: '-1' });
  }
  it.each(CASES)('$solid · $line: only the stated axis is anchored, and only it prints', ({ solid, line, id, axis, value }) => {
    const st = build([solid, line]);
    const c = derive3(st.facts, st.seed).construction;
    expect([...translationAnchoredAxes3(c)]).toEqual([axis]);
    expect(translationKnown3(c)).toBe(false);
    for (const seed of SEEDS) {
      const p = panel(st, seed);
      // the stated point: its own axis, every other axis open
      const comps = (['x', 'y', 'z'] as const).map((ax) => (ax === axis ? value : '?'));
      expect(p.pointComps[id], `${id} at seed ${seed}`).toEqual(comps);
      // no OTHER point prints a frozen-gauge coordinate
      for (const [other, cs] of Object.entries(p.pointComps)) {
        if (other === id) continue;
        cs.forEach((v, i) => expect(['x', 'y', 'z'][i] === axis || v === '?', `${other}(${cs.join(', ')}) at seed ${seed}`).toBe(true));
      }
    }
  });

  it('«D(3, p, 0)» on a cube: the named-but-unvalued y anchors nothing — A loses its frozen y, D keeps its letter', () => {
    const st = build([CUBE, 'D(3,p,0)']);
    const c = derive3(st.facts, st.seed).construction;
    expect([...translationAnchoredAxes3(c)].sort()).toEqual(['x', 'z']);
    const p = panel(st);
    expect(p.points).toContain('D(3, p, 0)');
    expect(p.pointComps.A?.[1] ?? '?').toBe('?');
  });

  it('three component pins on three axes anchor the whole translation', () => {
    const st = build([BOX, 'x_A=1', 'y_A=2', 'z_A=3']);
    expect(translationKnown3(derive3(st.facts, st.seed).construction)).toBe(true);
    expect(panel(st).points).toContain('A(1, 2, 3)');
  });
});

describe('#2340 — a plane equation: its d-term needs the axes along its normal', () => {
  // orientation and size pinned by the three edge vectors; translation anchored on z only
  const FIG = [BOX, 'AB=(1,0,0)', 'AD=(0,1,0)', "AA'=(0,0,2)", 'z_A=2', 'מישור ABCD', "מישור ABB'A'"];

  it('the base (normal z, z anchored) prints «z − 2 = 0»; the side (normal y, y not anchored) does not', () => {
    const st = build(FIG);
    const p = panel(st);
    expect(p.planes).toEqual(['ABCD: z - 2 = 0']); // no parametric form: its anchor is a full point
    expect(p.points).toContain('A(?, ?, 2)');
    expect(p.points).toContain("A'(?, ?, 4)");
    expect(ask(st, 'מישור ABCD')).toMatchObject({ answer: 'z - 2 = 0' });
    expect(ask(st, 'מישור ABCD').rows).toBeUndefined();
    expect(ask(st, "מישור ABB'A'").note).toBe('noFrame');
  });

  it('control — a full point A(0,0,2) prints every plane and both forms, as before', () => {
    const st = build([...FIG.slice(0, 4), 'A(0,0,2)', ...FIG.slice(5)]);
    const p = panel(st);
    expect(p.planes).toEqual(expect.arrayContaining(['ABCD: z - 2 = 0', "ABB'A': y = 0"]));
    expect(p.planes.some((r) => r.startsWith('ABCD: π'))).toBe(true);
    expect(p.points).toContain('A(0, 0, 2)');
    expect(ask(st, "מישור ABB'A'").answer).toBe('y = 0');
  });

  it('planeOffsetAnchored3 is the normal-vs-axes rule', () => {
    const z = new Set(['z'] as const);
    expect(planeOffsetAnchored3({ x: 0, y: 0, z: 1 }, z)).toBe(true);
    expect(planeOffsetAnchored3({ x: 0, y: 1, z: 0 }, z)).toBe(false);
    expect(planeOffsetAnchored3({ x: 0.6, y: 0, z: 0.8 }, z)).toBe(false);
    expect(planeOffsetAnchored3({ x: 0.6, y: 0, z: 0.8 }, new Set(['x', 'z'] as const))).toBe(true);
  });
});

describe('#2340 — controls: a fully anchored figure is unchanged', () => {
  it('«A(0,0,0)» on a box: A(0, 0, 0) is a fact', () => {
    const st = build([BOX, 'A(0,0,0)']);
    expect(panel(st).points).toEqual(['A(0, 0, 0)']);
    expect(ask(st, 'x_A').answer).toBe('0');
  });
  // («A(1,2,3)» then «תיבה ABCDA'B'C'D'» is refused already-defined on main, unchanged by this fix — so the
  // control states the coordinate point beside the box instead)
  it('a box beside a stated point «E(1,2,3)»: E(1, 2, 3) is a fact, all three axes anchored', () => {
    const st = build([BOX, 'E(1,2,3)']);
    expect(translationKnown3(derive3(st.facts, st.seed).construction)).toBe(true);
    expect(panel(st).points).toContain('E(1, 2, 3)');
  });
  it('a bare box prints no coordinate at all', () => {
    expect(panel(build([BOX])).points).toEqual([]);
  });
});
