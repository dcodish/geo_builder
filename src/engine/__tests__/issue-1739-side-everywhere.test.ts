/**
 * #1739 ([ADR-594](../../../docs/06-decisions.md#adr-594)) — A STATED SIDE HOLDS IN EVERY CONFIGURATION THE TOOL
 * OFFERS, not only at the seeds where the sampler happened to put the point on it.
 *
 * Root cause (the triage, measured on 4d6e3fd6 over seeds 0..100): a stated side (`point-circle-side`,
 * `point-polygon-side`, `points-line-side`) is a requirement record that only the VERIFIER read. The driven
 * solve, the 1-D root pick, the sampler (save ADR-511's circle-on-a-free-point case) and the knowledge pool
 * never looked at it, so whether a configuration honoured the side was down to the seed:
 *   (a) «משולש ABC · D בתוך המשולש ABC» — 94/101 seeds off-side; the second «הציגו תצורה אחרת» press said
 *       «אין תצורה אחרת — הצורה נקבעה» about a figure with 4 free DOF; 14 of 16 pool samples had D outside;
 *   (b) «… · BD=DC» — failed AT THE COMMIT SEED, the rescue moved A, B and C (the stability rule);
 *   (c) the #855 figure, its mirror and its other entry order; (d) a line side with a drive; (e) a bare line side.
 *
 * Fix: one definition (`sideShortfall`, 0 iff the verifier accepts) read at the four places that place a point.
 * Every test here CALLS the real path — replay / meetsRequirements / searchAnotherView / sharedSamples /
 * checkGivens — and never re-implements the predicate it guards.
 */
import { describe, expect, it } from 'vitest';
import { factsOf } from '../../__tests__/scenario-pipeline';
import { CONFIG_SEEDS, findValidConfig, meetsRequirements, replay, searchAnotherView, sharedSamples } from '../../replay/core';
import { sideRecordsOf, sideRequirementOf, sideShortfall } from '../requirements';
import { checkGivens } from '../verify';
import type { Command, Id, Vec } from '../types';
import type { ResolvedCircle } from '../evaluate';

const TRI = ['משולש ABC', 'D בתוך המשולש ABC'];
const MEMBERS: Record<string, string[]> = {
  'a — polygon side, nothing driven': TRI,
  'b — polygon side, then BD=DC': [...TRI, 'BD=DC'],
  'b′ — BD=DC, then the side': ['משולש ABC', 'BD=DC', 'D בתוך המשולש ABC'],
  'c — #855: AB=AC, then C inside': ['משולש ABC', 'מעגל', 'AB משיקה למעגל בנקודה B', 'AB=AC', 'C בתוך המעגל'],
  'c′ — #855, the side first': ['משולש ABC', 'מעגל', 'AB משיקה למעגל בנקודה B', 'C בתוך המעגל', 'AB=AC'],
  'c″ — #855 mirrored: C outside': ['משולש ABC', 'מעגל', 'AB משיקה למעגל בנקודה B', 'AB=AC', 'C מחוץ למעגל'],
  'd — line side with AC=AD': ['קטע AB', 'C ו-D בצדדים שונים של AB', 'AC=AD'],
  'e — a bare line side': ['קטע AB', 'C ו-D בצדדים שונים של AB'],
};
const insideABC = (pos: Map<Id, Vec>): boolean => {
  const [A, B, C, D] = ['A', 'B', 'C', 'D'].map((v) => pos.get(v)!);
  const s = (p: Vec, q: Vec, r: Vec) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
  const t = [s(A, B, D), s(B, C, D), s(C, A, D)];
  return t.every((x) => x === t[0]) && t[0] !== 0;
};

describe('#1739 — every member of the class meets its side at every configuration seed', () => {
  for (const [name, seq] of Object.entries(MEMBERS)) {
    it(name, () => {
      const facts = factsOf(seq);
      const bad: number[] = [];
      for (let s = 0; s < CONFIG_SEEDS; s++) {
        if (!meetsRequirements(facts, s) || replay(facts, s).violations.length) bad.push(s);
      }
      expect(bad, `seeds that miss (was e.g. a: 94/101, b: 26/101, c: 4/101, e: 45/101)`).toEqual([]);
    }, 300_000);
  }
});

describe('#1739 (a) — «הציגו תצורה אחרת» never claims a free figure is determined', () => {
  it('two presses both find another view (the second used to say «אין תצורה אחרת — הצורה נקבעה»)', () => {
    const facts = factsOf(TRI);
    const p1 = searchAnotherView(facts, 0);
    expect(p1, 'press 1').not.toBeNull();
    const p2 = searchAnotherView(p1!.facts, p1!.seed);
    expect(p2, 'press 2').not.toBeNull();
    expect(insideABC(replay(p2!.facts, p2!.seed).positions), 'and D is inside ABC in it').toBe(true);
  }, 120_000);

  it('the knowledge pool holds no sample with D off its stated side (was 14 of 16)', () => {
    const pool = sharedSamples(factsOf(TRI)).samples;
    expect(pool.length).toBeGreaterThanOrEqual(2);
    expect(pool.filter((p) => !insideABC(p)).length).toBe(0);
  }, 120_000);
});

describe('#1739 (b) — committing BD=DC never moves the triangle (stability)', () => {
  it('seed 0 meets its requirements as committed — no rescue — and A, B, C are byte-identical to before the line', () => {
    const before = replay(factsOf(TRI), 0).positions;
    const facts = factsOf([...TRI, 'BD=DC']);
    expect(meetsRequirements(facts, 0), 'the commit seed is valid (was: D thrown to (3, 9.21), outside)').toBe(true);
    expect(findValidConfig(facts, 0)?.seed, 'the view resolver keeps seed 0 (was: rescued to seed 1, A jumped)').toBe(0);
    const after = replay(facts, 0).positions;
    for (const v of ['A', 'B', 'C']) expect(after.get(v), v).toEqual(before.get(v));
    expect(insideABC(after)).toBe(true);
  }, 120_000);

  it('the pool holds no off-side sample (was 5 of 16)', () => {
    const pool = sharedSamples(factsOf([...TRI, 'BD=DC'])).samples;
    expect(pool.filter((p) => !insideABC(p)).length).toBe(0);
  }, 120_000);
});

describe('#1739 (c) — a figure that already honoured its side is untouched', () => {
  it('the #855 figure at seed 0 draws C exactly where it did (the steer is retry-only)', () => {
    const C = replay(factsOf(MEMBERS['c — #855: AB=AC, then C inside']), 0).positions.get('C')!;
    // measured on the pre-change base (#1600 tip dedbccae): C = (9.498, 0.031)
    expect(C.x).toBeCloseTo(9.498, 3);
    expect(C.y).toBeCloseTo(0.031, 3);
  });
});

describe('#1739 step 0 — one definition: sideShortfall is 0 exactly when the verifier accepts', () => {
  const cases: { cmd: Command; circles?: Map<Id, ResolvedCircle> }[] = [
    { cmd: { type: 'point-circle-side', id: 'P', circle: 'circle-O', side: 'inside' } as Command },
    { cmd: { type: 'point-circle-side', id: 'P', circle: 'circle-O', side: 'outside' } as Command },
    { cmd: { type: 'point-polygon-side', id: 'P', poly: ['A', 'B', 'C'], side: 'inside' } as Command },
    { cmd: { type: 'point-polygon-side', id: 'P', poly: ['A', 'B', 'C'], side: 'outside' } as Command },
    { cmd: { type: 'points-line-side', a: 'A', b: 'B', subjects: ['P', 'Q'], rel: 'different' } as Command },
    { cmd: { type: 'points-line-side', a: 'A', b: 'B', subjects: ['P', 'Q'], rel: 'same' } as Command },
  ];
  it('agrees with checkGivens on a grid of positions, boundaries included', () => {
    const circles = new Map<Id, ResolvedCircle>([['circle-O', { center: { x: 2, y: 1 }, r: 2 } as ResolvedCircle]]);
    let agree = 0;
    for (const { cmd } of cases) {
      for (let i = -12; i <= 12; i++) {
        for (let j = -12; j <= 12; j++) {
          const pos = new Map<Id, Vec>([
            ['A', { x: 0, y: 0 }],
            ['B', { x: 4, y: 0 }],
            ['C', { x: 1, y: 3 }],
            ['P', { x: i / 3, y: j / 3 }],
            ['Q', { x: 2 + j / 4, y: 1 - i / 4 }],
          ]);
          const verdict = checkGivens([cmd], pos, circles).length === 0;
          const req = sideRecordsOf({ objects: [], constraints: [], requirements: [sideRequirementOf(cmd)!] })[0];
          expect(sideShortfall(req, pos, circles) === 0, `${cmd.type} at (${i / 3}, ${j / 3})`).toBe(verdict);
          expect(sideShortfall(req, pos, circles)).toBeGreaterThanOrEqual(0);
          agree++;
        }
      }
    }
    expect(agree).toBe(cases.length * 625);
  });
});

