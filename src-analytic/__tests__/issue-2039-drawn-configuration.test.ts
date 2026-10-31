/**
 * #2039 step 1 · #2633 — THE CONFIGURATION DRAWN IS THE CONFIGURATION RECORDED
 * ([ADR-AG-358](../../docs/06c-decisions-analytic.md#adr-ag-358)).
 *
 * Operator, 2026-10-13 on #2039 (*"the outcome follows 2-D"*): a given that constrains the drawn figure resizes it in
 * place. Measured at `fb94d176`: «משולש ABC» + «AB = 5» moved an earlier point by up to 16.93 at the 8 of 24 seeds whose
 * display walk (`drawableAt`'s spread preference) had drawn a LATER configuration than the session's seed — the line was
 * solved from the seed the student never saw, and a different triangle replaced the one on the screen.
 *
 * The configuration is named by its box too (#2633's measured warning): configuration 0's walk evaluates the seeds after it
 * NARROW (ADR-AG-324), so a bare seed number re-derived the landed sample in the wide box — the same sample re-scaled, which
 * is also what «הציגו תצורה אחרת» offered as "another" configuration (#2633, the operator on #1166: *"we need to give the
 * user different options and not similar options"*).
 *
 * Every lock calls `derive`, `decideSubmit`, `anotherConfiguration` or the store; none re-implements the walk.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { drawnSampleOf, sameSeed, seedNumber, type Seed } from '../engine/evaluate';
import { decideSubmit, commitRecord } from '../app/submit';
import { anotherConfiguration } from '../app/another';
import { cleanSeed, useAnalyticStore } from '../store/useAnalyticStore';
import sectorFixture from './fixtures/issue-2039-sector-resize.analytic.json';
import sameSampleFixture from './fixtures/issue-2633-same-sample-offer.analytic.json';

type D = ReturnType<typeof derive>;
const SEEDS = Array.from({ length: 24 }, (_, i) => i);
/** The largest distance any point of `a` moved in `b`. */
const maxMove = (a: D, b: D) =>
  Math.max(0, ...a.figure.points.map((p) => {
    const q = b.figure.points.find((x) => x.id === p.id);
    return q ? Math.hypot(p.x - q.x, p.y - q.y) : 0;
  }));
/** #2039's rows (its plan's tables), He and En. */
const ROWS: Array<[string[], string]> = [
  [['גזרה AOB'], 'OA = 6'],
  [['משולש ABC'], 'AB = 5'],
  [['משולש ABC'], 'זווית A = 50'],
  [['משולש ABC'], 'AB = AC'],
  [['משולש ABC', 'D על BC'], 'AB = 5'],
  [['משולש ABC', 'AB = 5'], 'זווית A = 50'],
  [['triangle ABC'], 'AB = 5'],
];
const walked = (d: D, s: number) => !sameSeed(d.configuration, s);

describe('#2039 step 1 — derive names the configuration it drew', () => {
  it('re-deriving at the drawn configuration draws the same figure (every row, 24 seeds)', () => {
    let walks = 0;
    for (const [base] of ROWS) {
      for (const s of SEEDS) {
        const d = derive(base, s);
        if (walked(d, s)) walks += 1;
        expect(maxMove(d, derive(base, d.configuration)), `${base.join(' · ')} @${s}`).toBeLessThan(1e-9);
      }
    }
    // the class is live: the walk lands elsewhere on a good share of these seeds
    expect(walks).toBeGreaterThan(20);
  });

  it('the box rides with it: configuration 0 walking to a later sample keeps the narrow box (#2633\'s warning)', () => {
    const lines = ['משולש ABC', 'A(2,-5)'];
    const d = derive(lines, 0);
    expect(d.configuration.seed).not.toBe(0);
    expect(d.configuration.wide).toBe(false);
    // the bare number would re-derive the sample wide: a different (re-scaled) picture
    expect(maxMove(d, derive(lines, d.configuration.seed))).toBeGreaterThan(0.1);
    expect(maxMove(d, derive(lines, d.configuration))).toBeLessThan(1e-9);
  });

  it('a line is solved from the configuration on the screen: a walked seed jumps no more than the seeds that did not walk', () => {
    for (const [base, add] of ROWS) {
      let still = 0;
      const moved: number[] = [];
      for (const s of SEEDS) {
        const d = derive(base, s);
        const next = derive([...base, add], d.configuration);
        const m = maxMove(d, next);
        if (walked(d, s)) moved.push(m);
        else still = Math.max(still, m);
      }
      // At fb94d176 the walked seeds jumped up to 16.93 against 3.71 for the others («משולש ABC» + «AB = 5»).
      for (const m of moved) expect(m, `${base.join(' · ')} + ${add}`).toBeLessThanOrEqual(Math.max(still, 1e-9) * 1.5 + 1e-9);
    }
  });

  it('the operator\'s example «גזרה AOB» → «OA = 6» keeps the sector at every seed (no configuration swap)', () => {
    for (const s of SEEDS) {
      const d = derive(['גזרה AOB'], s);
      const next = derive(['גזרה AOB', 'OA = 6'], d.configuration);
      expect(next.faults, `@${s}`).toEqual([]);
      expect(maxMove(d, next), `@${s}`).toBeLessThan(8);
    }
  });
});

describe('#2039 step 1 — the submit path decides on, and records, the configuration drawn', () => {
  beforeEach(() => {
    useAnalyticStore.getState().clearAll();
    useAnalyticStore.temporal.getState().clear();
  });

  it('decideSubmit\'s record carries the configuration the trial drew, starting from the one on the screen', () => {
    // seed 3 of «משולש ABC» walks (measured): the trial starts where the canvas drew, not at 3
    const lines = ['משולש ABC'];
    const s = SEEDS.find((k) => walked(derive(lines, k), k))!;
    const current = derive(lines, s);
    const v = decideSubmit('AB = 5', lines, s, current);
    expect(v.kind).toBe('record');
    if (v.kind !== 'record') return;
    const expected = derive([...lines, 'AB = 5'], current.configuration).configuration;
    expect(sameSeed(v.configuration!, expected)).toBe(true);
  });

  it('a commit records the drawn configuration in the same set: one undo entry, and undo shows the same picture', () => {
    const st = () => useAnalyticStore.getState();
    const lines = ['משולש ABC'];
    const s = SEEDS.find((k) => walked(derive(lines, k), k))!;
    st().restore({ lines, seed: s });
    useAnalyticStore.temporal.getState().clear();
    const before = derive(st().lines, st().seed);
    const v = decideSubmit('AB = 5', st().lines, st().seed, before);
    if (v.kind !== 'record') throw new Error(v.kind);
    commitRecord(v, st().recordLine, (k) => k);
    const after = derive(st().lines, st().seed);
    // the store holds what is drawn: re-deriving there is a fixed point
    expect(sameSeed(st().seed, after.configuration)).toBe(true);
    expect(useAnalyticStore.temporal.getState().pastStates.length).toBe(1);
    st().undo();
    expect(maxMove(before, derive(st().lines, st().seed))).toBeLessThan(1e-9);
    st().redo();
    expect(maxMove(after, derive(st().lines, st().seed))).toBeLessThan(1e-9);
  });

  it('a saved file keeps the box, and loads it back; a hand-edited one cannot inject anything else', () => {
    const st = () => useAnalyticStore.getState();
    const lines = ['משולש ABC', 'A(2,-5)'];
    const drawn = derive(lines, 0).configuration;
    st().restore({ lines, seed: drawn });
    const saved = JSON.parse(JSON.stringify(st().serialize()));
    expect(sameSeed(cleanSeed(saved.seed), drawn)).toBe(true);
    expect(maxMove(derive(lines, 0), derive(lines, cleanSeed(saved.seed)))).toBeLessThan(1e-9);
    // a plain number stays a plain number, and junk is configuration 0
    expect(cleanSeed(5)).toBe(5);
    expect(cleanSeed({ seed: 4, reach: 1, wide: true })).toBe(4);
    expect(cleanSeed({ seed: 'x' })).toBe(0);
    expect(cleanSeed({ seed: 2, reach: 3, wide: false })).toBe(2);
    expect(cleanSeed(-1)).toBe(0);
  });
});

describe('#2633 — «הציגו תצורה אחרת» never offers the sample on the screen re-scaled', () => {
  /** #1166's fingerprint: pairwise distances of the named points over their mean. */
  const fingerprint = (d: D, ids: string[]) => {
    const pts = ids.map((id) => d.figure.points.find((p) => p.id === id)!);
    const ds: number[] = [];
    for (let i = 0; i < pts.length; i += 1) for (let j = i + 1; j < pts.length; j += 1) ds.push(Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y));
    const mean = ds.reduce((a, b) => a + b, 0) / ds.length;
    return ds.map((v) => v / mean);
  };
  const offers = (lines: string[], n: number): D[] => {
    const out: D[] = [];
    let seed: Seed = 0;
    for (let k = 0; k < n; k += 1) {
      const d = derive(lines, seed);
      out.push(d);
      const next = anotherConfiguration(lines, seed);
      if (!next.found) break;
      seed = next.seed;
    }
    return out;
  };
  for (const lines of [['משולש ABC', 'A(2,-5)'], ['משולש ABC', 'A(20,-50)'], ['A(2,-5)', 'B(4,1)', 'נקודה C', 'משולש ABC']]) {
    it(`${lines.join(' · ')}: no two successive offers draw the same sample`, () => {
      const os = offers(lines, 6);
      expect(os.length).toBe(6);
      for (let i = 1; i < os.length; i += 1) {
        expect(drawnSampleOf(os[i].figure), `offers ${i - 1} and ${i}`).not.toBe(drawnSampleOf(os[i - 1].figure));
      }
    });
  }
  it('«משולש ABC · A(2,-5)» and «… A(20,-50)»: the first press shows a triangle of another shape (#1166\'s bar)', () => {
    for (const lines of [['משולש ABC', 'A(2,-5)'], ['משולש ABC', 'A(20,-50)']]) {
      const [a, b] = offers(lines, 2);
      const fa = fingerprint(a, ['A', 'B', 'C']);
      const fb = fingerprint(b, ['A', 'B', 'C']);
      expect(Math.max(...fa.map((v, k) => Math.abs(v - fb[k]))), lines.join(' · ')).toBeGreaterThan(0.03);
    }
  });
  it('the first drawing is unchanged: seed 0 still opens on the narrow-box sample ADR-AG-324 drew', () => {
    const d = derive(['משולש ABC', 'A(2,-5)'], 0);
    const B = d.figure.points.find((p) => p.id === 'B')!;
    // measured at fb94d176, offer 0: B(0.46, −10.72)
    expect(B.x).toBeCloseTo(0.46, 1);
    expect(B.y).toBeCloseTo(-10.72, 1);
    expect(seedNumber(d.configuration)).toBe(3);
  });
});

describe('the operators\' sequences as fixtures (standing rule 4)', () => {
  it('«גזרה AOB» · «OA = 6» builds with no fault, and the saved configuration draws it again', () => {
    const d = derive(sectorFixture.lines, sectorFixture.seed);
    expect(d.faults).toEqual([]);
    expect(maxMove(d, derive(sectorFixture.lines, d.configuration))).toBeLessThan(1e-9);
  });
  it('«משולש ABC» · «A(2,-5)»: the first «הציגו תצורה אחרת» draws another sample', () => {
    const d = derive(sameSampleFixture.lines, sameSampleFixture.seed);
    expect(d.faults).toEqual([]);
    const next = anotherConfiguration(sameSampleFixture.lines, d.configuration);
    expect(next.found).toBe(true);
    expect(drawnSampleOf(derive(sameSampleFixture.lines, next.seed).figure)).not.toBe(drawnSampleOf(d.figure));
  });
});
