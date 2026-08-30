/**
 * #803 (ADR-3D-180) — PIN-DRIVEN PLACEMENT IS KNOWLEDGE, AND ITS LEFTOVER FREEDOM IS SAMPLED.
 *
 * The operator's prism (2026-08-27, the #801 exercise continued): three vector injections pin k = 2
 * and the shape; two line equations («משוואת הישר AC», «משוואת הישר BC») lower to eight plane pins
 * that DRIVE the placement absolutely. Every vertex was identical to three decimals at every seed —
 * and «מישור A'B'C'» (the exam's own part ב) answered «לא נקבע על ידי הנתונים».
 *
 * The gate (`translationKnown3`, #639) opened for {stated absolute position, sampled placement,
 * nothing gauge-placed} — an enumeration one member short: placement DRIVEN by absolute pins.
 * Opening it alone would not have been sound: a cube with ONE vertex on a line settled at the same
 * position at every seed (the slide along the line was frozen wherever the drive stopped), and a
 * frozen unstated position reads as perfectly stable. So the fix has two halves that only work
 * together — the gate asks the funnel's own question (sampled, driven, or nothing to hide), and the
 * resolver SAMPLES a driven placement's leftover translation (stage 5, the slide probe).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { dataView } from '../engine/dataView';
import { freeDofCount3, translationKnown3 } from '../engine/evaluate';
import { answerQuery } from '../engine/queries';
import { derive3, useGeo3, type Fact3 } from '../store/store3';
import { parse3 } from '../parser/parse3';

function reset() {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
}
const submit = (u: string) => useGeo3.getState().submit(u);
const state = () => useGeo3.getState();

const facts = (us: string[]): Fact3[] =>
  us.map((u, i) => {
    const p = parse3(u);
    if (!p.ok) throw new Error(`parse failed: ${u}`);
    return { id: `f${i}`, utterance: u, cmds: p.commands, enabled: true };
  });
const allOk = (d: ReturnType<typeof derive3>) => Object.values(d.status).every((s) => s === 'ok');

const PRISM = [
  "מנסרה ישרה משולשת ABCA'B'C'",
  "AA'=(k-1,k-7,k+1)",
  'AC=(k+1,0,k-3)',
  'AB=(k-1,k,3)',
  'משוואת הישר AC היא x=(8,-1,-1)+t(3,0,-1)',
  'משוואת הישר BC היא x=(4,0,2)+m(2,-2,-4)',
];
// the exam's answer for A', B', C' = (3,−6,4), (4,−4,7), (6,−6,3): x − 5y + 3z − 45 = 0
const EXAM_PLANE = 'x - 5y + 3z - 45 = 0';

describe('#803 — the operator’s prism: a pin-driven placement answers', () => {
  beforeEach(reset);

  it('every vertex is seed-invariant, the gate is open, and the DOF cue reads 0', () => {
    const fs = facts(PRISM);
    const d0 = derive3(fs, 0);
    expect(allOk(d0), JSON.stringify(d0.status)).toBe(true);
    expect(d0.construction.pins.length, 'no stated position anywhere').toBe(0);
    expect(translationKnown3(d0.construction)).toBe(true);
    expect(freeDofCount3(d0.construction, d0.resolved)).toBe(0);
    for (const seed of [1, 2, 1013, 2027]) {
      const d = derive3(fs, seed);
      for (const id of ['A', 'B', 'C', "A'", "B'", "C'"]) {
        const p = d.positions.get(id)!;
        const q = d0.positions.get(id)!;
        expect(p.x, `${id} seed ${seed}`).toBeCloseTo(q.x, 3);
        expect(p.y, `${id} seed ${seed}`).toBeCloseTo(q.y, 3);
        expect(p.z, `${id} seed ${seed}`).toBeCloseTo(q.z, 3);
      }
    }
    const A = d0.positions.get('A')!;
    expect([A.x, A.y, A.z].map((v) => +v.toFixed(3))).toEqual([2, -1, 1]);
  });

  it('«מישור A\'B\'C\'» answers the exam’s plane (both representations), and «מישור ABC» and «A» answer too', () => {
    PRISM.forEach(submit);
    expect(state().lastError).toBeNull();
    const c = derive3(state().facts, state().seed).construction;
    const top = answerQuery(c, "מישור A'B'C'", state().seed);
    expect(top.answer, JSON.stringify(top)).not.toBeNull();
    expect(top.answer!.replace(/\s/g, '')).toContain(EXAM_PLANE.replace(/\s/g, ''));
    expect(top.answer, 'the parametric form rides along').toContain('|');
    expect(answerQuery(c, 'מישור ABC', state().seed).answer).not.toBeNull();
    const a = answerQuery(c, 'A', state().seed);
    expect(a.answer).toBe('A(2, -1, 1)');
  });

  it('the panel and the canvas labels open with the same gate — the coordinates block is populated', () => {
    PRISM.forEach(submit);
    const c = derive3(state().facts, state().seed).construction;
    const panel = dataView(c, state().seed);
    expect(panel.points).toContain('A(2, -1, 1)');
    expect(panel.points).toContain("C'(6, -6, 3)");
    expect(panel.pointCoords['A']?.text, 'the canvas label reads the same entry').toBe('(2, -1, 1)');
  });
});

describe('#803 — soundness: an UNDER-determined driven placement prints nothing it does not know', () => {
  beforeEach(reset);

  it('a cube with ONE vertex on an absolute line slides along it per seed — the free coordinate is «?»', () => {
    const fs = facts(["קובייה ABCDA'B'C'D'", 'x=(1,2,3)+t(1,0,0)', 'A על הישר ℓ']);
    const xs = new Set<string>();
    for (const seed of [0, 1, 2, 3]) {
      const d = derive3(fs, seed);
      expect(allOk(d), `seed ${seed}: ${JSON.stringify(d.status)}`).toBe(true);
      const A = d.positions.get('A')!;
      expect(A.y, `seed ${seed}: still on the line`).toBeCloseTo(2, 6);
      expect(A.z, `seed ${seed}`).toBeCloseTo(3, 6);
      xs.add(A.x.toFixed(2));
    }
    expect(xs.size, `A.x by seed: ${[...xs].join(', ')} — the slide is SAMPLED, never frozen`).toBeGreaterThan(1);
    const c = derive3(fs, 0).construction;
    expect(translationKnown3(c), 'the gate opens (driven) — stability decides per component').toBe(true);
    const A = dataView(c, 0).pointCoords['A'];
    // the components the line fixes are knowledge; the slide is not
    expect(A?.text ?? '').not.toMatch(/^\(-?\d/);
    expect(A?.text ?? '?').toContain('2, 3');
    expect(answerQuery(c, "מישור ABC", 0).answer, 'a face plane of a sliding cube is not knowledge').toBeNull();
  });

  it('a cube with ONE vertex on an equation plane slides within it — nothing prints', () => {
    const fs = facts(["קובייה ABCDA'B'C'D'", 'מישור π: x+y+z-6=0', 'A על המישור π']);
    const seen = new Set<string>();
    for (const seed of [0, 1, 2, 3]) {
      const d = derive3(fs, seed);
      expect(allOk(d), `seed ${seed}`).toBe(true);
      const A = d.positions.get('A')!;
      expect(A.x + A.y + A.z, `seed ${seed}: A stays on π`).toBeCloseTo(6, 6);
      seen.add(`${A.x.toFixed(2)},${A.y.toFixed(2)}`);
    }
    expect(seen.size).toBeGreaterThan(1);
    const panel = dataView(derive3(fs, 0).construction, 0);
    expect(panel.points.filter((t) => /^[A-D]'?\(-?\d/.test(t)), 'no vertex coordinate is asserted').toEqual([]);
  });

  it('a placement FROZEN for a figure-internal reason stays silent (the #611 rule is untouched)', () => {
    // a membership on a POINT-RUN plane with an absolute line elsewhere: not sampled, not driven absolute
    const fs = facts(["קובייה ABCDA'B'C'D'", 'x=(1,2,3)+t(1,0,0)', 'E אמצע AB', 'E על המישור ABC']);
    const c = derive3(fs, 0).construction;
    expect(c.pins.length).toBe(0);
    expect(translationKnown3(c)).toBe(false);
  });

  it('a stated sign survives the slide (transactional, like stage 4)', () => {
    const fs = facts(["קובייה ABCDA'B'C'D'", 'x=(1,2,3)+t(1,0,0)', 'A על הישר ℓ', 'שיעור ה-x של A הוא חיובי']);
    for (const seed of [0, 1, 2, 3, 4, 5]) {
      const d = derive3(fs, seed);
      expect(allOk(d), `seed ${seed}: ${JSON.stringify(d.status)}`).toBe(true);
      expect(d.positions.get('A')!.x, `seed ${seed}`).toBeGreaterThan(0);
    }
  });
});
