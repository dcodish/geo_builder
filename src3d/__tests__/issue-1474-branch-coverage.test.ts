/**
 * #1474 (ADR-3D-283) — a value is knowledge across the parameter's ENUMERATED branches, never a seed
 * modulus; a crossing is offered by its own invariance.
 *
 * Figure B: m ∈ {−2, 0, 4}. The angle ℓ/π5 is 60° at m = −2 and 30° at m = 0 and m = 4, so it is NOT
 * knowledge. The ask lane's offsets (1013, 2027, 3041 — all ≡ 2 mod 3) reached only two of the three
 * branches, and at every seed ≡ 2 (mod 3) the two it saw agreed on 30° and it printed that as fact —
 * including on the student's second «הציגו תצורה אחרת».
 *
 * Every lock CALLS the lane (`answerQuery`, `dataView`, `verifyClaim`, `openCrossings3`,
 * `knowledgeSamples3`); none re-implements the gate.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { derive3, useGeo3 } from '../store/store3';
import { answerQuery, querySeeds3 } from '../engine/queries';
import { dataView, panelSeeds3 } from '../engine/dataView';
import { claimSeeds } from '../engine/claims';
import { knowledgeSamples3 } from '../engine/evaluate';
import { openCrossings3 } from '../engine/crossings3';

const reset = () => {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
};
const state = () => useGeo3.getState();
const build = (us: string[]) => {
  reset();
  for (const u of us) {
    state().submit(u);
    expect(state().lastError, `«${u}» builds`).toBeNull();
  }
};
const at = (seed: number) => derive3(state().facts, seed);
const ask = (q: string, seed: number) => answerQuery(at(seed).construction, q, seed).answer;
const SEEDS = Array.from({ length: 24 }, (_, i) => i);

/** Figure B — three branches, m ∈ {−2, 0, 4}. */
const FIG_B = ['הישר ℓ: x = (0,0,0) + t(1,m,1)', 'המישור π: mx + y + z + 2 = 0', 'הזווית בין הישר ℓ למישור π היא 30°', 'המישור π5: x - y = 0'];
/** Figure A — two branches, m = ±√2 (the title's case: the invariant answers). */
const FIG_A = ['הישר ℓ: x = (0,0,0) + t(m,1,1)', 'המישור π: mx - y - z + 3 = 0', 'הישר ℓ מקביל למישור π', 'המישור π2: z = 0', 'המישור π4: y = 0'];
/** Four branches, m ≈ {−3.58, −0.39, 0.39, 3.58} — the offsets missed index s+2 (mod 4) in ALL three lanes. */
const FIG_4 = ['הישר ℓ: x = (0,0,0) + t(1,m,1)', 'המישור π: mx + y + 2 = 0', 'הזווית בין הישר ℓ למישור π היא 30°'];

const BOX = ["תיבה ABCDA'B'C'D'", 'A(0,0,0)', 'B(4,0,0)', 'D(0,3,0)', "A'(0,0,2)", 'המישור π2: x = 1'];
const L2_PINNED = ['הישר ℓ2: x = (1,2,3) + t(m-2, m, m+2)', 'המישור π1: x + (m-2)y + (m-1)z - 5 = 0', 'הישר ℓ2 מקביל למישור π1'];

describe('#1474 — the ask lane and the panel never answer from a subset of the branches', () => {
  beforeEach(reset);

  it('P1 lock: figure B withholds the π5 angle at all 24 seeds (it was 30° at every seed ≡ 2 mod 3)', () => {
    build(FIG_B);
    for (const s of SEEDS) expect(ask('הזווית בין ℓ למישור π5', s), `seed ${s}`).toBeNull();
  });

  it('…and through the store, the student\'s way: «הציגו תצורה אחרת» ×3 never prints it', () => {
    build(FIG_B);
    for (let press = 0; press <= 3; press++) {
      const { seed } = state();
      expect(answerQuery(at(seed).construction, 'הזווית בין ℓ למישור π5', seed).answer, `after ${press} presses`).toBeNull();
      state().resample();
    }
  });

  it('figure B: the stated angle still prints at every seed, and m reads m = −2, m = 0, m = 4 (#1591)', () => {
    build(FIG_B);
    for (const s of SEEDS) expect(ask('הזווית בין ℓ למישור π', s), `seed ${s}`).toBe('30°');
    expect(ask('m', 0)).toBe('-2, m = 0, m = 4');
  });

  it('figure A (the title\'s case): an angle equal on both branches stays answered at every seed', () => {
    build(FIG_A);
    for (const s of SEEDS) {
      expect(ask('הזווית בין ℓ למישור π2', s), `seed ${s}`).toBe('30°');
      expect(ask('הזווית בין π למישור π2', s), `seed ${s}`).toBe('60°');
    }
  });

  it('the four-root figure: a value that differs across its branches is withheld at every seed', () => {
    build(FIG_4);
    // the angle ℓ/π5 (x − y = 0) varies with m — never one branch's number
    state().submit('המישור π5: x - y = 0');
    expect(state().lastError).toBeNull();
    for (const s of SEEDS) expect(ask('הזווית בין ℓ למישור π5', s), `seed ${s}`).toBeNull();
    for (const s of SEEDS) expect(ask('הזווית בין ℓ למישור π', s), `seed ${s}`).toBe('30°');
  });
});

describe('#1474 — structural: the knowledge sample IS the branch pool, for every lane\'s seed list', () => {
  beforeEach(reset);

  for (const [name, fig, n] of [['figure B', FIG_B, 3], ['the four-root figure', FIG_4, 4]] as const) {
    it(`${name}: every lane's samples cover all ${n} branches at seeds 0–23`, () => {
      build([...fig]);
      const c = at(0).construction;
      const pool = [...at(0).resolved.param!.branches].sort((a, b) => a - b);
      expect(pool).toHaveLength(n);
      for (const s of SEEDS) {
        for (const [lane, seeds] of [['ask', querySeeds3(s)], ['panel', panelSeeds3(s)], ['claims', claimSeeds(s)]] as const) {
          const covered = [...new Set(knowledgeSamples3(c, seeds).map((r) => r.param!.value))].sort((a, b) => a - b);
          expect(covered, `${lane} lane, seed ${s}`).toEqual(pool);
        }
      }
    });
  }

  it('a figure with no parameter resolves exactly the base seeds (no extra cost, no behaviour change)', () => {
    build(["תיבה ABCDA'B'C'D'"]);
    expect(knowledgeSamples3(at(0).construction, panelSeeds3(5))).toHaveLength(3);
  });

  it('the panel\'s m row reads the whole pool at every seed', () => {
    build(FIG_B);
    for (const s of SEEDS) expect(dataView(at(s).construction, s).params.find((p) => p.sym === 'm')?.text, `seed ${s}`).toBe('m = -2, m = 0, m = 4');
  });

  it('P1 lock, panel edition: a NAMED angle that differs across the branches prints no value (it read «α = 30°» at every seed ≡ 2 mod 3)', () => {
    build([...FIG_B, 'הזווית בין הישר ℓ למישור π5 היא α']);
    for (const s of SEEDS) expect(dataView(at(s).construction, s).relations.filter((r) => r.startsWith('α')), `seed ${s}`).toEqual([]);
  });

  it('…while a named angle that is the SAME on every branch still prints (ℓ/π is 30° at all three)', () => {
    build([...FIG_B, 'הזווית בין הישר ℓ למישור π היא β']);
    for (const s of SEEDS) expect(dataView(at(s).construction, s).relations, `seed ${s}`).toContain('β = 30°');
  });
});

describe('#1474 — crossings are offered by their OWN invariance, not by whether m is forced', () => {
  beforeEach(reset);
  const offers = (seed = 0) => {
    const d = at(seed);
    return openCrossings3(d.construction, d.resolved);
  };
  const boxDots = (ks: ReturnType<typeof offers>) => ks.filter((k) => k.plane === 'π2' && !k.line.startsWith('ℓ')).map((k) => k.line).sort();
  const EDGES = ['AB', "A'B'", 'CD', "C'D'"].sort();

  it('control: the box alone offers its four π2 crossings', () => {
    build(BOX);
    expect(boxDots(offers())).toEqual(EDGES);
  });

  it('an unrelated 2-root m-line no longer withdraws them (it was 0)', () => {
    build([...BOX, ...L2_PINNED]);
    for (const s of [0, 1, 2, 3]) {
      const ks = offers(s);
      expect(boxDots(ks), `seed ${s}`).toEqual(EDGES);
      // the only other offer is ℓ2 ∩ π2: ℓ2's anchor (1,2,3) lies on x = 1 for every m, so it is knowledge
      const extra = ks.filter((k) => k.line.startsWith('ℓ'));
      expect(extra.map((k) => `${k.line}|${k.plane}`), `seed ${s}`).toEqual(['ℓ2|π2']);
      expect(extra[0].point.x).toBeCloseTo(1, 9);
      expect(extra[0].point.y).toBeCloseTo(2, 9);
      expect(extra[0].point.z).toBeCloseTo(3, 9);
      // π1 carries m: every edge crossing of it moves between ±√2, and none is offered
      expect(ks.some((k) => k.plane === 'π1'), `seed ${s}`).toBe(false);
    }
  });

  it('…and the same with m UNPINNED (no ∥ given)', () => {
    build([...BOX, ...L2_PINNED.slice(0, 2)]);
    expect(boxDots(offers())).toEqual(EDGES);
    expect(offers().some((k) => k.plane === 'π1')).toBe(false);
  });

  it('(m,0,0)+t(1,0,0) ∩ x = 3 is (3,0,0) on every branch — offered under ±√2 (it was withheld)', () => {
    build(['הישר ℓ1: x = (m,0,0) + t(1,0,0)', 'המישור π2: x = 3', ...L2_PINNED]);
    const k = offers().find((o) => o.line === 'ℓ1' && o.plane === 'π2');
    expect(k).toBeDefined();
    expect(k!.point.x).toBeCloseTo(3, 9);
    expect(k!.point.y).toBeCloseTo(0, 9);
    expect(k!.point.z).toBeCloseTo(0, 9);
  });

  it('refusal: a crossing that MOVES with m is still not offered (the 2024-Q2 pair, m open)', () => {
    build(['הישר ℓ: x = (-1,5,-11) + t(m-1, 5-m, -2)', 'המישור π: 3x + my + (m+6)z + 4 = 0']);
    for (const s of [0, 1, 2, 3]) expect(offers(s), `seed ${s}`).toHaveLength(0);
  });

  it('refusal: a crossing that differs between the three branches of figure B is not offered', () => {
    build(FIG_B);
    // ℓ ∩ π5 is the origin on every branch (ℓ passes through it), so the only candidate is ℓ ∩ π,
    // which moves with m — nothing is offered
    expect(offers().filter((k) => k.plane === 'π')).toHaveLength(0);
  });

  it('import lock: crossings3 no longer asks the whole-figure proxy', () => {
    const src = readFileSync(join(__dirname, '..', 'engine', 'crossings3.ts'), 'utf8');
    expect(src.match(/^import .*paramIsKnowledge/m)).toBeNull();
  });
});
