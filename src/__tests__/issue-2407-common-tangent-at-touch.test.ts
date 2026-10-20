/**
 * #2407 + #2406 ([ADR-740](../../docs/06-decisions.md#adr-740)) — A COMMON TANGENT THROUGH THE CIRCLES' TOUCH POINT IS THE
 * TANGENT AT IT (operator ruling 2026-10-20 on #2385: *"it draws the wrong line and says its impossible… we need this
 * fixed in this session for 2d"*; scope: *"the ruled case is an existing letter that is the circles' touch point"*).
 *
 * Measured at `3cae7f25` through `decideDeterministic2D` → `commitVerdict` → `replay`, model mocked:
 *  - the operator's four lines committed green with FOUR circles (M and N new beside the drawn pair) and AB cutting the
 *    drawn pair at T; with lettered circles, «… לשני המעגלים», «T על הישר AB» and «TB …» were refused over-constrained;
 *    «פנימי», an internally tangent pair, and a named touch after «T על AB» went to the AI;
 *  - «המשיק העובר בנקודה המשותפת לשני המעגלים» (#2406) drew a two-touch tangent through neither touch, green.
 * Root causes: R1 the presupposed pair's letters were not a reference (no ADR-347 `implied` tag); R2 nothing asked
 * whether the line's own letters reach the touch; R2' the touch-role lexicon was a closed list; R3 the capacity and
 * role exits lowered onto circle 1 only and dropped the letters.
 *
 * Every tangency below is computed HERE from the resolved circles and the drawn letters (never the engine's line).
 * The model is mocked and must never be called.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { decideDeterministic2D } from '@/app/decideDeterministic';
import { commitVerdict } from '@/app/submitPipeline';
import { replay, useGeoStore } from '@/store/geoStore';
import { buildParseCtx } from '@/parser';
import { variantCountOf } from '@/engine/variants';
import type { AnyCommand, Vec } from '@/engine';

const st = () => useGeoStore.getState();
type Verdict = Awaited<ReturnType<typeof decideDeterministic2D>>;

async function submit(line: string): Promise<Verdict> {
  const f = replay(st().facts, st().seed);
  const v = await decideDeterministic2D({ facts: st().facts, seed: st().seed, view: { construction: f.construction, positions: f.positions } } as never, line, /[a-z]{3}/.test(line) ? 'en' : 'he');
  commitVerdict(v, line);
  return v;
}

/** Commit every line but the last; return the last line's verdict, the facts before it, and its new commands. */
async function play(lines: string[]) {
  st().clear();
  for (const line of lines.slice(0, -1)) expect((await submit(line)).kind, `«${line}» commits`).toBe('commit');
  const before = st().facts.slice();
  const v = await submit(lines[lines.length - 1]);
  return { v, before, added: st().facts.slice(before.length).map((f) => f.cmd as AnyCommand) };
}

const distToLine = (p: Vec, a: Vec, d: Vec) => Math.abs((p.x - a.x) * d.y - (p.y - a.y) * d.x) / Math.hypot(d.x, d.y);

/** The drawn common tangent at the touch: the line through the named letters (else `tan-T`), tangent to BOTH circles. */
function expectTangentAt(touch: string, letters: [string, string] | null, seed = st().seed) {
  const r = replay(st().facts, seed);
  expect(r.lastError, `seed ${seed}`).toBeNull();
  expect(r.violations, `seed ${seed} green`).toEqual([]);
  const circles = [...r.circles.values()];
  expect(circles.length, 'exactly the two drawn circles').toBe(2);
  const T = r.positions.get(touch)!;
  let a: Vec, d: Vec;
  if (letters) {
    a = r.positions.get(letters[0])!;
    const b = r.positions.get(letters[1])!;
    d = { x: b.x - a.x, y: b.y - a.y };
    expect(Math.hypot(d.x, d.y), `${letters.join('')} is a line`).toBeGreaterThan(1e-6);
  } else {
    const c = circles[0];
    a = T;
    d = { x: -(T.y - c.center.y), y: T.x - c.center.x };
  }
  for (const c of circles) expect(Math.abs(distToLine(c.center, a, d) - c.r), `seed ${seed}: tangent to the circle at (${c.center.x.toFixed(2)},${c.center.y.toFixed(2)})`).toBeLessThan(1e-6);
  expect(distToLine(T, a, d), `seed ${seed}: through ${touch}`).toBeLessThan(1e-6);
  expect(r.construction.objects.some((o) => o.kind === 'line' && o.id === `tan-${touch}`), `tan-${touch} drawn`).toBe(true);
  return r;
}

beforeEach(() => llmParseMock.mockReset());

const PAIR_U = ['שני מעגלים', 'המעגלים משיקים בנקודה T'];
const PAIR_N = ['מעגל M', 'מעגל N', 'המעגלים משיקים בנקודה T'];
const PAIR_N_INT = ['מעגל M', 'מעגל N', 'המעגלים משיקים מבפנים בנקודה T'];
const OP = ['מעגל O', 'מעגל P', 'המעגלים משיקים בנקודה T'];

describe('#2407 — the line\'s own letters reach the touch: the tangent AT T', () => {
  const ROWS: [string, string[], [string, string] | null][] = [
    ['H1 the operator\'s exact four lines', [...PAIR_U, 'T על AB', 'AB משיק משותף למעגלים M ו-N'], ['A', 'B']],
    ['H2 «… לשני המעגלים»', [...PAIR_U, 'T על AB', 'AB משיק משותף לשני המעגלים'], ['A', 'B']],
    ['H3 lettered circles', [...PAIR_N, 'T על AB', 'AB משיק משותף למעגלים M ו-N'], ['A', 'B']],
    ['H4 «ישר AB» · «T על הישר AB»', [...PAIR_N, 'ישר AB', 'T על הישר AB', 'AB משיק משותף למעגלים M ו-N'], ['A', 'B']],
    ['H6 «פנימי» (the touch tangent\'s own kind)', [...PAIR_N, 'T על AB', 'AB משיק משותף פנימי למעגלים M ו-N'], ['A', 'B']],
    ['H7 internally tangent circles', [...PAIR_N_INT, 'T על AB', 'AB משיק משותף למעגלים M ו-N'], ['A', 'B']],
    ['H8 internally tangent, unnamed, «לשני המעגלים»', ['שני מעגלים', 'המעגלים משיקים מבפנים בנקודה T', 'T על AB', 'AB משיק משותף לשני המעגלים'], ['A', 'B']],
    ['H9 «TB …» (T a letter of the line, B fresh)', [...PAIR_N, 'TB משיק משותף למעגלים M ו-N'], ['T', 'B']],
    ['H12 the named touch after «T על AB»', [...PAIR_N, 'T על AB', 'AB משיק משותף למעגלים M ו-N בנקודה T'], ['A', 'B']],
  ];
  for (const [name, lines, letters] of ROWS)
    it(`${name} → the tangent at T, green, tangent to both circles at seeds 0–3`, async () => {
      const { v } = await play(lines);
      expect(v.kind).toBe('commit');
      for (const seed of [0, 1, 2, 3]) expectTangentAt('T', letters, seed);
      expect(llmParseMock).not.toHaveBeenCalled();
    });

  it('H1 binds M and N to the drawn pair (two circles, named M and N) — ADR-347 / ADR-565 d7', async () => {
    await play([...PAIR_U, 'T על AB', 'AB משיק משותף למעגלים M ו-N']);
    const r = replay(st().facts, st().seed);
    expect([...r.circles.keys()].sort()).toEqual(['circle-M', 'circle-N']);
  });

  it('H8 with letters: a non-interchangeable unnamed pair asks which circle is M (the existing question), never two more circles', async () => {
    const { v } = await play(['שני מעגלים', 'המעגלים משיקים מבפנים בנקודה T', 'T על AB', 'AB משיק משותף למעגלים M ו-N']);
    expect(v.kind).toBe('refuse');
    expect(JSON.stringify(v)).toContain('input.unknownCircle');
    expect(replay(st().facts, st().seed).circles.size).toBe(2);
  });

  for (const [name, lines] of [
    ['H1', [...PAIR_U, 'T על AB', 'AB משיק משותף למעגלים M ו-N']],
    ['H3', [...PAIR_N, 'T על AB', 'AB משיק משותף למעגלים M ו-N']],
    ['H4', [...PAIR_N, 'ישר AB', 'T על הישר AB', 'AB משיק משותף למעגלים M ו-N']],
    ['H7', [...PAIR_N_INT, 'T על AB', 'AB משיק משותף למעגלים M ו-N']],
  ] as const)
    it(`${name}: stability — the centres, T and both radii unmoved by the line; |TA|, |TB| and the order kept (the shown configuration)`, async () => {
      const { before } = await play([...lines]);
      // the configuration the student is looking at (a structural edit keeps seed 0, ADR-484); a sampled seed draws
      // a different sample once the line adds structure, so it is not a stability witness
      for (const seed of [st().seed]) {
        const r0 = replay(before, seed);
        const r1 = replay(st().facts, seed);
        const centres = [...r0.circles.values()].map((c) => c.center);
        const centres1 = [...r1.circles.values()].map((c) => c.center);
        centres.forEach((c, i) => expect(Math.hypot(c.x - centres1[i].x, c.y - centres1[i].y), `seed ${seed} centre ${i}`).toBeLessThan(1e-6));
        const radii0 = [...r0.circles.values()].map((c) => c.r).sort();
        const radii1 = [...r1.circles.values()].map((c) => c.r).sort();
        radii0.forEach((x, i) => expect(Math.abs(x - radii1[i]), `seed ${seed} radius ${i}`).toBeLessThan(1e-6));
        const [T0, T1] = [r0.positions.get('T')!, r1.positions.get('T')!];
        expect(Math.hypot(T0.x - T1.x, T0.y - T1.y), `seed ${seed} T`).toBeLessThan(1e-6);
        const len = (r: typeof r0, p: string) => Math.hypot(r.positions.get(p)!.x - r.positions.get('T')!.x, r.positions.get(p)!.y - r.positions.get('T')!.y);
        for (const p of ['A', 'B']) expect(Math.abs(len(r0, p) - len(r1, p)), `seed ${seed} |T${p}|`).toBeLessThan(1e-6);
        // the order along the line: T between A and B exactly when it was
        const between = (r: typeof r0) => {
          const [A, B, T] = ['A', 'B', 'T'].map((k) => r.positions.get(k)!);
          return (A.x - T.x) * (B.x - T.x) + (A.y - T.y) * (B.y - T.y) < 0;
        };
        expect(between(r1), `seed ${seed} order`).toBe(between(r0));
      }
    });

  it('the `at` record has ONE configuration and asks no kind or distinctness of itself', async () => {
    const { added } = await play([...PAIR_N, 'T על AB', 'AB משיק משותף למעגלים M ו-N']);
    const rec = added.find((c) => c.type === 'common-tangent')!;
    expect(rec).toMatchObject({ type: 'common-tangent', a: 'A', b: 'B', at: 'T' });
    expect('kind' in rec || 'avoid' in rec).toBe(false);
    expect(variantCountOf(rec)).toBe(1);
  });

  it('a later «משיק משותף» takes a two-touch tangent, never a second tangent at T', async () => {
    await play([...PAIR_N, 'T על AB', 'AB משיק משותף למעגלים M ו-N']);
    const v = await submit('CD משיק משותף למעגלים M ו-N');
    expect(v.kind).toBe('commit');
    const r = replay(st().facts, st().seed);
    expect(r.violations).toEqual([]);
    expect(r.construction.objects.filter((o) => o.kind === 'line' && o.id.startsWith('tan-')).map((o) => o.id)).toEqual(['tan-T']);
    const [C, D] = [r.positions.get('C')!, r.positions.get('D')!];
    for (const c of r.circles.values()) expect(Math.abs(distToLine(c.center, C, { x: D.x - C.x, y: D.y - C.y }) - c.r)).toBeLessThan(1e-6);
    expect(distToLine(r.positions.get('T')!, C, { x: D.x - C.x, y: D.y - C.y }), 'CD is not the tangent at T').toBeGreaterThan(1e-3);
  });

  it('`collinearWith` reads «T על AB» from the construction (semantic)', async () => {
    await play([...PAIR_N, 'T על AB', 'נקודה Z']);
    const f = replay(st().facts, st().seed);
    const ctx = buildParseCtx(f.construction, f.positions);
    expect(ctx.collinearWith?.T).toEqual([['A', 'B']]);
  });
});

describe('#2406 — the touch by its ROLE: «העובר בנקודה המשותפת…» is the tangent at the touch', () => {
  const ROWS: [string, string[], [string, string] | null, string][] = [
    ['H13 #2406\'s four lines', [...OP, 'המשיק העובר בנקודה המשותפת לשני המעגלים'], null, 'T'],
    ['H13 with the circles named', [...OP, 'המשיק העובר בנקודה המשותפת למעגלים O ו-P'], null, 'T'],
    ['H14 English', [...OP, 'the tangent through the common point of the two circles'], null, 'T'],
    ['H14 «AB משיק העובר בנקודה המשותפת…» (fresh letters)', [...OP, 'AB משיק העובר בנקודה המשותפת לשני המעגלים'], ['A', 'B'], 'T'],
    ['H15 the touch auto-named', ['מעגל O', 'מעגל P', 'המעגלים משיקים', 'המשיק העובר בנקודה המשותפת לשני המעגלים'], null, 'M'],
    ['H16 internally tangent', ['מעגל O', 'מעגל P', 'המעגלים משיקים מבפנים בנקודה T', 'המשיק העובר בנקודה המשותפת לשני המעגלים'], null, 'T'],
    ['H17 «המשיק המשותף בנקודת ההשקה» (#197 Am. 5)', [...OP, 'המשיק המשותף בנקודת ההשקה'], null, 'T'],
  ];
  for (const [name, lines, letters, touch] of ROWS)
    it(`${name} → the tangent at ${touch}, green`, async () => {
      const { v } = await play(lines);
      expect(v.kind).toBe('commit');
      for (const seed of [0, 1, 2, 3]) expectTangentAt(touch, letters, seed);
      expect(llmParseMock).not.toHaveBeenCalled();
    });
});

describe('#2407 R3 — the capacity exit drops nothing: lettered circles build the touch tangent', () => {
  it('H18 internally tangent, «משיק משותף למעגלים M ו-N» → the tangent at T', async () => {
    expect((await play([...PAIR_N_INT, 'משיק משותף למעגלים M ו-N'])).v.kind).toBe('commit');
    expectTangentAt('T', null);
  });
  it('H18 internally tangent, «AB משיק משותף למעגלים M ו-N» → the tangent at T with A, B on it', async () => {
    expect((await play([...PAIR_N_INT, 'AB משיק משותף למעגלים M ו-N'])).v.kind).toBe('commit');
    expectTangentAt('T', ['A', 'B']);
  });
  it('H19 the third common tangent of touching circles → the tangent at T', async () => {
    expect((await play([...PAIR_N, 'AB משיק משותף למעגלים M ו-N', 'CD משיק משותף למעגלים M ו-N', 'משיק משותף למעגלים M ו-N'])).v.kind).toBe('commit');
    const r = replay(st().facts, st().seed);
    expect(r.violations).toEqual([]);
    expect(r.construction.objects.some((o) => o.kind === 'line' && o.id === 'tan-T')).toBe(true);
  });
});

describe('#2407 — refusals and escalations stay honest', () => {
  // H5 («… חיצוני …» through an external touch, refused exactly as at 3cae7f25) is the scenario
  // `common-tangent-external-through-touch-refused-2407` (scenarios-corpus-4.ts): its refusal costs ~23 s, paid once.
  it('the common-point phrase on CROSSING circles escalates whole — never a tangent drawn', async () => {
    const { v, added } = await play(['מעגל O', 'מעגל P', 'המעגלים O ו-P נחתכים בנקודות C ו-D', 'המשיק העובר בנקודה המשותפת לשני המעגלים']);
    expect(v.kind).not.toBe('commit');
    expect(added).toEqual([]);
  });
});

describe('#2407 — controls unchanged', () => {
  it('C1 disjoint circles: AB and CD are two distinct two-touch tangents', async () => {
    await play(['שני מעגלים זרים', 'AB משיק משותף לשני המעגלים', 'CD משיק משותף לשני המעגלים']);
    const r = replay(st().facts, st().seed);
    expect(r.violations).toEqual([]);
    for (const [p, q] of [['A', 'B'], ['C', 'D']]) {
      const [P, Q] = [r.positions.get(p)!, r.positions.get(q)!];
      for (const c of r.circles.values()) expect(Math.abs(distToLine(c.center, P, { x: Q.x - P.x, y: Q.y - P.y }) - c.r)).toBeLessThan(1e-6);
    }
    expect(r.construction.objects.some((o) => o.kind === 'line' && o.id.startsWith('tan-'))).toBe(false);
  });
  for (const [name, lines] of [
    ['C2 free A, B beside a touching pair', [...PAIR_N, 'נקודה A', 'נקודה B', 'AB משיק משותף למעגלים M ו-N']],
    ['C3 free A, B beside apart circles', ['שני מעגלים זרים', 'נקודה A', 'נקודה B', 'AB משיק משותף לשני המעגלים']],
    ['C4 fresh letters beside a touching pair', [...PAIR_N, 'AB משיק משותף למעגלים M ו-N']],
  ] as const)
    it(`${name}: A and B pulled onto the circles as the two touches (two-touch tangent)`, async () => {
      const { added } = await play([...lines]);
      expect(added.some((c) => c.type === 'common-tangent' && c.at === undefined)).toBe(true);
      const r = replay(st().facts, st().seed);
      expect(r.violations).toEqual([]);
      const cs = [...r.circles.values()];
      const onSome = (p: string) => cs.some((c) => Math.abs(Math.hypot(r.positions.get(p)!.x - c.center.x, r.positions.get(p)!.y - c.center.y) - c.r) < 1e-6);
      expect(onSome('A') && onSome('B')).toBe(true);
    });
  it('C5 a one-letter reference still binds the first drawn circle', async () => {
    await play([...PAIR_U, 'רדיוס מעגל M הוא 3']);
    expect(replay(st().facts, st().seed).circles.has('circle-M')).toBe(true);
  });
  for (const [name, pre] of [['H10', PAIR_N], ['H11', PAIR_N_INT]] as const)
    it(`${name} the named-touch form with fresh letters lowers as before (memberships, tan-T, two markers)`, async () => {
      const { added } = await play([...pre, 'AB משיק משותף למעגלים M ו-N בנקודה T']);
      expect(added.map((c) => [c.type, 'id' in c ? c.id : '']).filter(([t]) => t !== 'name-by-use')).toEqual([
        ['point-on-circle', 'T'],
        ['point-on-circle', 'T'],
        ['tangent', 'tan-T'],
        ['point-on-line', 'A'],
        ['point-on-line', 'B'],
      ]);
      expectTangentAt('T', ['A', 'B']);
    });
  it('on an empty figure «AB משיק משותף למעגלים M ו-N» still creates its two circles', async () => {
    st().clear();
    expect((await submit('AB משיק משותף למעגלים M ו-N')).kind).toBe('commit');
    expect([...replay(st().facts, st().seed).circles.keys()].sort()).toEqual(['circle-M', 'circle-N']);
  });
});
