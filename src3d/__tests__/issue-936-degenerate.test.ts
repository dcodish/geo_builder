/**
 * #936 ([ADR-3D-234](../../docs/06b-decisions-3d.md)) → #1860 ([ADR-3D-358](../../docs/06b-decisions-3d.md#adr-3d-358)) —
 * A SOLID WHOSE GIVENS FORCE IT FLAT.
 *
 * The operator, playing round #931's T12: *"the image collapsed to a 2d diagram."* «∠BAS = 40» + «∠DAS = 50» at a
 * right-angled corner puts the apex exactly in the base plane, because `cos²40° + cos²50° ≡ 1`. #936 (ruling
 * 2026-09-08) answered with a NOTICE. **Flipped in place by the ruling of 2026-10-07 on #1860** (*"we should refuse
 * this as well since it contradicts the pyramid statement"*; *"a flat figure is not a pyramid / prism / …"*): the
 * line that completes the flatness is REFUSED and the pyramid is never drawn flat. The notice is retired.
 *
 * What stays from #936, and is the part that matters: the boundary. A thin but real solid (41/50 and the near-miss
 * family) builds with no notice and no refusal, and no figure in the `fixtures3/` corpus is refused.
 */
import type { Seed3 } from '../engine/components3';
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { decideSubmit3, derive3, useGeo3, type Fact3 } from '../store/store3';
import { deserializeFigure3 } from '../store/figureFile3';
import { PIN_FIXES_SCALE, SOLID_THIN_RATIO, scalarPinRows3 } from '../engine/solve3';
import { resolveStats3 } from '../engine/evaluate';
import type { Construction3, Positions3, ScalarPin } from '../engine/types';
import type { Vec3 } from '../engine/vec3';
import he from '../i18n/locales/he.json';
import en from '../i18n/locales/en.json';

function run(lines: readonly string[], seed = 0) {
  let st: { facts: Fact3[]; seed: Seed3 } = { facts: [], seed };
  for (let i = 0; i < lines.length; i++) {
    const v = decideSubmit3(st, lines[i]);
    if (v.kind !== 'record') return { st, refusedAt: i, error: v.kind === 'refused' ? v.error : null };
    st = { facts: v.facts, seed: v.seed };
  }
  return { st, refusedAt: -1, error: null };
}
const builds = (lines: readonly string[]) => {
  const r = run(lines);
  expect(r.refusedAt, `«${lines[r.refusedAt]}» → ${JSON.stringify(r.error)}`).toBe(-1);
  const d = derive3(r.st.facts, r.st.seed);
  for (const f of r.st.facts) expect(d.status[f.id], f.utterance).toBe('ok');
  expect(d.notices.map((n) => n.kind as string), 'no flat-solid notice exists any more').not.toContain('solid-degenerate');
};
const refusedFlat = (lines: readonly string[]) => {
  const r = run(lines);
  expect(r.refusedAt, lines.join(' · ')).toBe(lines.length - 1);
  expect(r.error).toMatchObject({ code: 'polygon-collapsed', forced: true, solid: 'pyramid' });
};

describe('#936 → #1860 — the reported figure is refused, not drawn flat', () => {
  it('«פירמידה» + ∠BAS=40 + ∠DAS=50 is refused on its third line', () => {
    refusedFlat(['פירמידה SABCD שבסיסה ריבוע', 'זווית BAS = 40', 'זווית DAS = 50']);
  });

  it('the CLASS, not the instance: any complementary pair at the corner is refused', () => {
    for (const [a, b] of [
      [30, 60],
      [35, 55],
      [20, 70],
    ]) refusedFlat(['פירמידה SABCD שבסיסה ריבוע', `זווית BAS = ${a}`, `זווית DAS = ${b}`]);
  }, 60_000);
});

describe('#936 — the false-positive net (the one that matters)', () => {
  it('the SAME figure with non-complementary angles builds', () => {
    builds(['פירמידה SABCD שבסיסה ריבוע', 'זווית BAS = 50', 'זווית DAS = 60']);
  });

  it('ordinary solids build', () => {
    builds(['פירמידה SABCD שבסיסה ריבוע']);
    builds(["קובייה ABCDA'B'C'D'"]);
    builds(["תיבה ABCDA'B'C'D'"]);
    builds(['מנסרה ישרה משולשת ABC']);
  });

  it('a legitimately THIN solid is not a flat one — the boundary, measured', () => {
    // One degree off complementary is the nearest figure that is genuinely thin rather than collapsed (#936's
    // calibration: flatness 9.8e-2 against the degenerate case's 1.8e-3). If the judgement ever reaches it, a
    // student is refused a perfectly drawable pyramid — so this guards the band.
    builds(['פירמידה SABCD שבסיסה ריבוע', 'זווית BAS = 41', 'זווית DAS = 50']);
    for (const [a, b] of [
      [42, 50],
      [35, 56],
      [30, 61],
    ]) builds(['פירמידה SABCD שבסיסה ריבוע', `זווית BAS = ${a}`, `זווית DAS = ${b}`]);
  }, 60_000);

  it('the thin band is where the ADRs say it is', () => {
    expect(SOLID_THIN_RATIO).toBe(1e-2);
  });
});

describe('#936 — the fixtures3 corpus', () => {
  const DIR = join(__dirname, '..', '..', 'fixtures3');
  const files = existsSync(DIR) ? readdirSync(DIR).filter((f) => f.endsWith('.geo3.json')) : [];

  it('no corpus figure is refused as a flat solid', () => {
    expect(files.length).toBeGreaterThanOrEqual(3);
    const offenders: string[] = [];
    let solidsSeen = 0;
    for (const file of files) {
      const r = deserializeFigure3(readFileSync(join(DIR, file), 'utf8'));
      if (!r.ok) continue;
      const d = derive3(r.facts, r.seed);
      solidsSeen += d.construction.solids.length;
      for (const f of r.facts) {
        const s = d.status[f.id];
        if (typeof s === 'object' && s.code === 'polygon-collapsed' && s.solid) offenders.push(`${file}: «${f.utterance}»`);
      }
    }
    expect(solidsSeen, 'the sweep actually examined solids').toBeGreaterThan(0);
    expect(offenders).toEqual([]);
  });
});

describe('#1860 — i18n: the notice is retired in both languages', () => {
  it('no locale carries the flat-solid notice', () => {
    for (const j of [he, en]) {
      const n = (j as { notice: Record<string, unknown> }).notice;
      expect(n.solidDegenerate).toBeUndefined();
      expect(n.solidDegenerateBare).toBeUndefined();
      expect(n.cause).toBeUndefined();
    }
  });
});

/**
 * #2806 ([ADR-3D-462](../../docs/06b-decisions-3d.md#adr-3d-462)) — A SIMILARITY-INVARIANT RELATION IS SCALE-FREE IN THE
 * PIVOT. «ריבוע ABCD» · «הקודקוד A נמצא על ציר ה-x» was drawn at |AB| = 1.55e-6 with every line green, after a 3.8 s
 * seed sweep: one stated point turns the gauge scale into an unknown, and `length-rel` / `mag-rel` / `vec-eq` were raw
 * differences (degree 1 in the scale), so the solve met them by shrinking the whole figure to a point. Every
 * `PIN_FIXES_SCALE: false` row is now normalised by its operands; the table lock below holds the rule for every kind.
 */
const X_AXIS = 'הקודקוד A נמצא על ציר ה-x';
const runAt = (lines: readonly string[], seed: number) => {
  let st: { facts: Fact3[]; seed: Seed3 } = { facts: [], seed };
  let uncached = 0;
  for (let i = 0; i < lines.length; i++) {
    const before = resolveStats3.uncached;
    const v = decideSubmit3(st, lines[i]);
    uncached = resolveStats3.uncached - before;
    if (v.kind !== 'record') throw new Error(`«${lines[i]}» at seed ${seed} → ${JSON.stringify(v)}`);
    st = { facts: v.facts, seed: v.seed };
  }
  return { st, lastUncached: uncached };
};
const len = (p: Positions3, a: string, b: string) => {
  const u = p.get(a)!;
  const w = p.get(b)!;
  return Math.hypot(u.x - w.x, u.y - w.y, u.z - w.z);
};
const fullSize = (lines: readonly string[], seeds: number) => {
  for (let s = 0; s < seeds; s++) {
    const { st } = runAt(lines, s);
    const d = derive3(st.facts, st.seed);
    for (const f of st.facts) expect(d.status[f.id], `${f.utterance} @ seed ${s}`).toBe('ok');
    expect(len(d.positions, 'A', 'B'), `${lines.join(' · ')} @ seed ${s}`).toBeGreaterThanOrEqual(0.5);
  }
};

describe('#2806 — a length equality beside one stated point draws at full size', () => {
  it("the operator's report: a square with A on the x-axis, seeds 0–23, at once", () => {
    const sizes = new Set<string>();
    for (let s = 0; s < 24; s++) {
      const { st, lastUncached } = runAt(['ריבוע ABCD', X_AXIS], s);
      expect(st.seed, 'no requirement sweep: the store lands on the submit seed').toBe(s);
      expect(lastUncached, 'the axis line costs no seed sweep (a work count, not a clock)').toBeLessThanOrEqual(8);
      const d = derive3(st.facts, st.seed);
      for (const f of st.facts) expect(d.status[f.id], f.utterance).toBe('ok');
      const p = d.positions;
      const ab = len(p, 'A', 'B');
      expect(ab).toBeGreaterThanOrEqual(0.5);
      for (const [a, b] of [['B', 'C'], ['C', 'D'], ['D', 'A']]) expect(Math.abs(len(p, a, b) - ab)).toBeLessThan(1e-9);
      expect(Math.abs(len(p, 'A', 'C') - ab * Math.SQRT2)).toBeLessThan(1e-9);
      expect(Math.abs(p.get('A')!.y)).toBeLessThan(1e-9);
      expect(Math.abs(p.get('A')!.z)).toBeLessThan(1e-9);
      sizes.add(ab.toFixed(3));
    }
    expect(sizes.size, 'the unstated size is sampled (ADR-052)').toBeGreaterThan(4);
  }, 120_000);

  it('one «הציגו תצורה אחרת» press is cheap (≤ 4 uncached resolves) and changes the size', () => {
    const { st } = runAt(['ריבוע ABCD', X_AXIS], 0);
    useGeo3.setState({ facts: st.facts, seed: st.seed });
    const before = resolveStats3.uncached;
    useGeo3.getState().resample();
    expect(resolveStats3.uncached - before).toBeLessThanOrEqual(4);
    const next = useGeo3.getState().seed;
    expect(Math.abs(len(derive3(st.facts, next).positions, 'A', 'B') - len(derive3(st.facts, st.seed).positions, 'A', 'B'))).toBeGreaterThan(1e-3);
  });

  it('the class: every length-rel / mag-rel / vec-eq figure beside one stated point, seeds 0–7', () => {
    for (const lines of [
      ['ריבוע ABCD', 'הקודקוד A נמצא על ציר ה-z'],
      ['ריבוע ABCD', 'הקודקוד B נמצא על ציר ה-x'],
      ['ריבוע ABCD', 'A בראשית הצירים'],
      ['ריבוע ABCD', 'A(1,0,0)'],
      ['ריבוע ABCD', 'A(1,2,3)'],
      ['מעוין ABCD', X_AXIS],
      ['דלתון ABCD', X_AXIS],
      ['משולש שווה צלעות ABC', X_AXIS],
      ['משולש שווה שוקיים ABC', X_AXIS],
      ['משולש ABC', 'AB = AC', X_AXIS],
      ['משולש ABC', 'AB = 2AC', X_AXIS],
      ["תיבה ABCDA'B'C'D'", 'AB = BC', X_AXIS],
      ["מנסרה ABCA'B'C'", 'AB = AC', X_AXIS],
      ["תיבה ABCDA'B'C'D'", "נסמן: AB=u, AD=v, AA'=w", '|u|=|v|=|w|', X_AXIS],
      ['מרובע ABCD', 'וקטור DC = 2 וקטור AB', X_AXIS],
      ['מרובע ABCD', 'וקטור DC = וקטור AB', X_AXIS],
    ]) fullSize(lines, 8);
  }, 300_000);

  it('the controls stay as they are', () => {
    fullSize(['ריבוע ABCD', 'אורך AB = 4', X_AXIS], 4);
    fullSize(['ריבוע ABCD', X_AXIS, 'אורך AB = 4'], 4);
    for (const n of ['מלבן ABCD', 'מקבילית ABCD', 'טרפז ABCD', 'משולש ABC', "קובייה ABCDA'B'C'D'", "תיבה ABCDA'B'C'D'", 'פירמידה SABCD שבסיסה ריבוע'])
      fullSize([n, X_AXIS], 4);
    const { st } = runAt(['ריבוע ABCD', 'אורך AB = 4', X_AXIS], 0);
    expect(len(derive3(st.facts, st.seed).positions, 'A', 'B')).toBeCloseTo(4, 9);
  }, 120_000);
});

/**
 * THE TABLE LOCK (#2806): every kind `PIN_FIXES_SCALE` marks similarity-invariant has a residual row of degree 0 in the
 * scale: the row read on a figure is unchanged when that figure is doubled about the origin. It iterates the `Record`,
 * so a new kind with no entry is a compile error and a new raw-difference kind is a red test here. The positions miss
 * the relation on purpose: on a figure that MEETS it every row is 0 at both sizes, which would prove nothing.
 */
describe('#2806 — every similarity-invariant pin row is scale-free (the PIN_FIXES_SCALE lock)', () => {
  const box = () => derive3(run(["תיבה ABCDA'B'C'D'"]).st.facts, 0).construction;
  const pair = (from: string, to: string) => ({ kind: 'pair' as const, from, to });
  function fromFigure(lines: string[], kind: ScalarPin['kind']) {
    const c = derive3(run(lines).st.facts, 0).construction;
    const pin = c.scalarPins.find((p) => p.kind === kind);
    if (!pin) throw new Error(`«${lines.join(' · ')}» no longer lowers a ${kind} pin: pick another representative`);
    return { c, pin };
  }
  /** One representative per kind: a real figure's pin where one lowers it, else the pin written on a box. */
  const SOURCE: Partial<Record<ScalarPin['kind'], () => { c: Construction3; pin: ScalarPin } | 'exempt'>> = {
    // the joint rung's block: whether it fixes the scale is read off the pin's own `gauge` flag (`scalePinned`)
    'free-joint': () => 'exempt',
    'length-rel': () => fromFigure(["מקבילון ABCDA'B'C'D'", "E על AA'", 'AE = AB'], 'length-rel'),
    'vec-eq': () => fromFigure(['מרובע ABCD', 'וקטור DC = 2 וקטור AB'], 'vec-eq'),
    'mag-rel': () => fromFigure(["תיבה ABCDA'B'C'D'", "נסמן: AB=u, AD=v, AA'=w", '|u|=|v|=|w|'], 'mag-rel'),
    vangle: () => fromFigure(['משולש ABC', 'זווית ABC שווה 2α', 'α = 30'], 'vangle'),
    'seg-angle': () => fromFigure(["תיבה ABCDA'B'C'D'", "הזווית בין A'C לבין BC' היא 70"], 'seg-angle'),
    'seg-perp-plane': () => ({ c: box(), pin: { kind: 'seg-perp-plane', a: 'A', b: "C'", plane: ['A', 'B', 'C'] } }),
    'seg-par-plane': () => ({ c: box(), pin: { kind: 'seg-par-plane', a: 'A', b: "C'", plane: ['A', 'B', 'C'] } }),
    'cos-angle': () => fromFigure(['משולש DEF', 'המשולש ישר זווית'], 'cos-angle'),
    'dot-eq': () => ({ c: box(), pin: { kind: 'dot-eq', a: pair('A', 'B'), b: pair('A', "C'"), c: pair('B', 'C'), d: pair('A', 'D') } }),
    'cos-eq': () => ({ c: box(), pin: { kind: 'cos-eq', a: pair('A', 'B'), b: pair('A', "C'"), c: pair('B', 'C'), d: pair('A', 'D') } }),
    'bisector-dir': () => ({ c: box(), pin: { kind: 'bisector-dir', apex: 'A', a: 'B', b: 'D', tip: "C'" } }),
    concyclic: () => fromFigure(['מקבילית ABCD', 'ABCD חסום במעגל'], 'concyclic'),
    'line-plane-angle': () => ({ c: box(), pin: { kind: 'line-plane-angle', a: 'A', b: "C'", plane: ['A', 'B', 'C'], deg: 30 } }),
    mutual: () => fromFigure(['A(k,0,0)', 'B(4,0,0)', 'C(1,3,0)', 'D(3,3,0)', 'טרפז ABCD'], 'mutual'),
    'plane-rel': () => fromFigure(['המישור ABCD מקביל למישור EFGH'], 'plane-rel'),
  };
  /** The pin's rows on a fixed irregular placement of the construction's points, scaled by `k` about the origin. */
  const rowsAt = (c: Construction3, pin: ScalarPin, k: number) => {
    const place = new Map<string, Vec3>();
    [...c.points.keys()].sort().forEach((id, i) => {
      place.set(id, { x: 1.3 * Math.sin(1.7 * i + 0.4) + 0.2 * i, y: 1.1 * Math.cos(2.3 * i), z: 0.9 * Math.sin(0.9 * i + 1) });
    });
    const at = (id: string): Vec3 | null => {
      const p = place.get(id);
      return p ? { x: k * p.x, y: k * p.y, z: k * p.z } : null;
    };
    const out: number[] = [];
    scalarPinRows3({ ...c, scalarPins: [pin] }, at, out, { symAt: () => 1, riderAt: () => undefined });
    return out;
  };

  it('every kind marked false keeps its row when the figure doubles', () => {
    const bad: string[] = [];
    for (const kind of Object.keys(PIN_FIXES_SCALE) as ScalarPin['kind'][]) {
      if (PIN_FIXES_SCALE[kind]) continue;
      const make = SOURCE[kind];
      if (!make) throw new Error(`${kind} is similarity-invariant: give it a representative in SOURCE`);
      const src = make();
      if (src === 'exempt') continue;
      const r1 = rowsAt(src.c, src.pin, 1);
      const r2 = rowsAt(src.c, src.pin, 2);
      expect(r1.length, kind).toBeGreaterThan(0);
      expect(r1.includes(10), `${kind}: an operand did not resolve`).toBe(false);
      expect(r1.some((v) => Math.abs(v) > 1e-6), `${kind}: the placement must miss the relation`).toBe(true);
      if (r1.some((v, j) => Math.abs(v - r2[j]) > 1e-9 * Math.max(1, Math.abs(v)))) bad.push(`${kind}: ${r1.join(',')} → ${r2.join(',')}`);
    }
    expect(bad, 'a similarity-invariant pin must be normalised by its operands (ADR-3D-462)').toEqual([]);
  }, 60_000);

  it('the probe tells the two apart: a kind that fixes the scale changes its row', () => {
    const pin: ScalarPin = { kind: 'length', a: 'A', b: 'B', value: 4 };
    expect(Math.abs(rowsAt(box(), pin, 2)[0] - rowsAt(box(), pin, 1)[0])).toBeGreaterThan(1e-3);
  });
});
