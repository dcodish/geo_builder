/**
 * #1854 ([ADR-3D-332](../../docs/06b-decisions-3d.md#adr-3d-332)) — THE FREE THIRD SIDE IS SAMPLED.
 *
 * «משולש ABC · AC = 8 · BC = 3» leaves AB free: any AB in (5, 11) satisfies both lengths. 3-D drew the
 * same near-degenerate sliver at every seed — measured on `main` @ 06fc51dd through `derive3`, AB = 5.000
 * (the degenerate |AC − BC|) at 18 of 24 seeds and 5.001–5.086 at the other six; through the student's own
 * door `decideSubmit3`, the open-figure walk committed seed 3 from seeds 0–3 and seed 194 from seeds 4–23,
 * so «הציגו תצורה אחרת» showed AB ≈ 5.05–5.09 (∠C ≈ 9°) and never an ordinary triangle. That is ADR-052
 * inverted: an unstated magnitude parked at an extreme of the admissible set instead of varying with the
 * seed. 2-D, measured at this tip over seeds 0–23, draws AB = 5.35–7.18 (∠C = 22°–64°) — the specification
 * (CLAUDE.md rule 7, `[2-D]`).
 *
 * ADR-3D-332 slides an accepted solution along its own null space toward the seed's sampled dims and then
 * RELEASES it on the givens' rows alone (`settleFreeDims`), so the anchor picks the configuration and never
 * decides whether the givens hold. These locks assert the SAMPLING, not that the figure builds: a fixed
 * default would pass "it builds" and fail every assertion below.
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit3, derive3, useGeo3, type Fact3 } from '../store/store3';

type St = { facts: Fact3[]; seed: number };
type P3 = { x: number; y: number; z: number };

const LINES = ['משולש ABC', 'AC = 8', 'BC = 3'] as const;
const SEEDS_24 = Array.from({ length: 24 }, (_, i) => i);
/** AB ∈ (|AC − BC|, AC + BC) = (5, 11) — the open admissible interval the two givens leave. */
const EDGES = [5, 11] as const;

const d3 = (a: P3, b: P3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/** Every line through the real submit door; returns the state it committed (seed included). */
function run(lines: readonly string[], seed: number): { st: St; refusedAt: number; kind: string } {
  let st: St = { facts: [], seed };
  for (let i = 0; i < lines.length; i++) {
    const v = decideSubmit3(st, lines[i]);
    if (v.kind !== 'record') return { st, refusedAt: i, kind: v.kind };
    st = { facts: v.facts, seed: v.seed };
  }
  return { st, refusedAt: -1, kind: 'record' };
}

/** The triangle's three sides at `(facts, seed)`, with ∠C — every fact must verify `ok`. */
function sides(facts: Fact3[], seed: number): { AB: number; AC: number; BC: number; angC: number } {
  const d = derive3(facts, seed);
  for (const f of facts) expect(d.status[f.id], `seed ${seed}: «${f.utterance}»`).toBe('ok');
  const [A, B, C] = ['A', 'B', 'C'].map((id) => {
    const p = d.positions.get(id);
    expect(p, `seed ${seed}: ${id} is placed`).toBeTruthy();
    return p!;
  });
  const [AB, AC, BC] = [d3(A, B), d3(A, C), d3(B, C)];
  return { AB, AC, BC, angC: (Math.acos((AC * AC + BC * BC - AB * AB) / (2 * AC * BC)) * 180) / Math.PI };
}

/** Each assertion a FREE magnitude must satisfy, applied to one run of AB values (one per configuration). */
function assertSampled(abs: readonly number[], where: string, minDistinct = 12): void {
  for (const [i, ab] of abs.entries()) {
    // not parked at an extreme: the whole defect was AB = 5.000, the degenerate |AC − BC|
    for (const e of EDGES) expect(Math.abs(ab - e), `${where}: seed ${i} sits on the edge ${e} (AB = ${ab})`).toBeGreaterThan(0.01);
    expect(ab, `${where}: seed ${i}`).toBeGreaterThan(EDGES[0]);
    expect(ab, `${where}: seed ${i}`).toBeLessThan(EDGES[1]);
  }
  // VARIES with the seed — a fixed default (or a value pinned to the edge) gives one value, not twelve
  const distinct = new Set(abs.map((v) => v.toFixed(2)));
  expect(distinct.size, `${where}: AB took ${distinct.size} distinct values over ${abs.length} configurations (${[...distinct].join(', ')})`).toBeGreaterThanOrEqual(minDistinct);
  // and it is an ORDINARY triangle, not a sliver: 2-D at this tip draws ∠C = 22°–64°
  expect(Math.min(...abs), `${where}: the thinnest configuration`).toBeGreaterThan(5.3);
}

describe('#1854 — «משולש ABC · AC = 8 · BC = 3»: AB is a free DOF, sampled per seed', () => {
  it('through derive3: AB varies over the open interval, never at an edge, and the givens hold exactly', () => {
    const r = run(LINES, 0);
    expect(r.refusedAt, `«${LINES[r.refusedAt]}» → ${r.kind}`).toBe(-1);
    const abs = SEEDS_24.map((s) => {
      const { AB, AC, BC } = sides(r.st.facts, s);
      // the STATED magnitudes are untouched by the slide — it is released on the givens' rows alone
      expect(AC, `seed ${s}: AC`).toBeCloseTo(8, 6);
      expect(BC, `seed ${s}: BC`).toBeCloseTo(3, 6);
      return AB;
    });
    assertSampled(abs, 'derive3');
  });

  it("through the student's door: the committed seed is the student's own, and AB is sampled there", () => {
    const abs = SEEDS_24.map((s) => {
      const r = run(LINES, s);
      expect(r.refusedAt, `seed ${s}: «${LINES[r.refusedAt]}» → ${r.kind}`).toBe(-1);
      // the open-figure walk (ADR-3D-310) has nothing left to rescue: no seed shows a collapsed face,
      // so the figure the student sees is the one their own seed samples (it committed 3 and 194 before)
      expect(r.st.seed, `seed ${s}: the committed seed`).toBe(s);
      return sides(r.st.facts, r.st.seed).AB;
    });
    assertSampled(abs, 'decideSubmit3');
  });

  it('«הציגו תצורה אחרת» re-samples AB: 12 presses, 12 different triangles', () => {
    useGeo3.setState({ facts: [], seed: 0, lastError: null });
    useGeo3.temporal.getState().clear();
    for (const u of LINES) useGeo3.getState().submit(u);
    expect(useGeo3.getState().lastError).toBeNull();
    const seen: number[] = [];
    for (let press = 0; press < 12; press++) {
      const st = useGeo3.getState();
      seen.push(sides(st.facts, st.seed).AB);
      st.resample();
    }
    // 12 presses, at least 10 different triangles — the defect showed ONE (AB ≈ 5.05) at every press
    assertSampled(seen, '«הציגו תצורה אחרת»', 10);
  });

  it('a determining given still overrides the sample: AB = 7 pins it at every seed', () => {
    for (const s of [0, 5, 13, 23]) {
      const r = run([...LINES, 'AB = 7'], s);
      expect(r.refusedAt, `seed ${s}: «${[...LINES, 'AB = 7'][r.refusedAt]}» → ${r.kind}`).toBe(-1);
      expect(sides(r.st.facts, r.st.seed).AB, `seed ${s}`).toBeCloseTo(7, 6);
    }
  });

  it('#1849 stands: the metric-forced flat triangle is still refused at every seed', () => {
    for (const s of SEEDS_24) {
      const r = run(['משולש ABC', 'AC = 8', 'BC = 3', 'AB = 5'], s);
      expect(r.refusedAt, `seed ${s}: 5 · 3 · 8 must be refused on its last line`).toBe(3);
    }
  });
});
