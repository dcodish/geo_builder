/**
 * #2208 ([ADR-669](../../../docs/06-decisions.md#adr-669)) — «משיק» WITH A CIRCLE SUBJECT IS THE VERB: «מעגל P משיק
 * למעגל O מבפנים» makes the two circles internally tangent, never a common tangent line AB.
 *
 * Measured at `ef78f15c` through `decideDeterministic2D` → `commitVerdict` → `replay`: the report lowered to
 * `common-tangent AB kind=internal` + segment AB, the circles left NOT tangent, all green; «…מבפנים בנקודה X» drew
 * them EXTERNALLY tangent plus a tangent line at X; after «המעגלים O ו-P משיקים מבפנים» the same sentence was refused
 * «no more tangents». Root cause: `commonTangent`'s #212 trigger read a kind word on a singular «משיק» as the noun
 * "a common tangent" whatever its subject; with a circle subject it is the verb, and the kind is the circles'.
 *
 * The model is mocked and must never be called.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { decideDeterministic2D } from '@/app/decideDeterministic';
import { commitVerdict } from '@/app/submitPipeline';
import { replay, useGeoStore } from '@/store/geoStore';
import type { AnyCommand } from '@/engine';

const st = () => useGeoStore.getState();

async function play(pre: string[], last: string, lang: 'he' | 'en' = 'he') {
  st().clear();
  const submit = async (line: string) => {
    const f = replay(st().facts, st().seed);
    const v = await decideDeterministic2D({ facts: st().facts, seed: st().seed, view: { construction: f.construction, positions: f.positions } } as never, line, lang);
    commitVerdict(v, line);
    return v;
  };
  for (const line of pre) expect((await submit(line)).kind, `«${line}» commits`).toBe('commit');
  const before = new Map(replay(st().facts, st().seed).positions);
  const n0 = st().facts.length;
  const v = await submit(last);
  const added = st().facts.slice(n0).map((f) => f.cmd as AnyCommand);
  return { kind: v.kind, added, before };
}

/** The tangency kind of circles O and P as drawn at `seed`: EXT |OP| = r₁+r₂, INT |OP| = |r₁−r₂|. */
function kindAt(seed: number, a = 'O', b = 'P') {
  const r = replay(st().facts, seed);
  const ca = r.positions.get(a)!, cb = r.positions.get(b)!;
  const ra = r.circles.get(`circle-${a}`)!.r, rb = r.circles.get(`circle-${b}`)!.r;
  const d = Math.hypot(ca.x - cb.x, ca.y - cb.y);
  const kind = Math.abs(d - (ra + rb)) < 1e-4 ? 'EXT' : Math.abs(d - Math.abs(ra - rb)) < 1e-4 ? 'INT' : 'none';
  return { kind, r };
}

const types = (cmds: AnyCommand[]) => cmds.map((c) => c.type);

/** The pass for a circle-subject tangency: exactly `circles-tangent` of the kind, drawn so at seeds 0–3, nothing else. */
function expectTangency(r: { kind: string; added: AnyCommand[] }, kind: 'INT' | 'EXT', at?: string) {
  expect(r.kind).toBe('commit');
  const ct = r.added.filter((c) => c.type === 'circles-tangent') as Extract<AnyCommand, { type: 'circles-tangent' }>[];
  expect(ct, 'one circles-tangent').toHaveLength(1);
  expect(ct[0].external).toBe(kind === 'EXT');
  if (at) expect(ct[0].at).toBe(at);
  expect(types(r.added), 'no common tangent, segment or tangent line').not.toEqual(expect.arrayContaining(['common-tangent']));
  expect(types(r.added)).not.toEqual(expect.arrayContaining(['segment']));
  expect(types(r.added)).not.toEqual(expect.arrayContaining(['tangent']));
  for (const seed of [0, 1, 2, 3]) {
    const k = kindAt(seed);
    expect(k.kind, `seed ${seed}`).toBe(kind);
    expect(k.r.violations, `seed ${seed} green`).toEqual([]);
    expect(k.r.lastError).toBeNull();
  }
  expect(llmParseMock).not.toHaveBeenCalled();
}

beforeEach(() => llmParseMock.mockReset());

const PAIR = ['מעגל O', 'מעגל P'];
const PAIR_EN = ['circle O', 'circle P'];

describe('#2208 — a circle subject with a kind word: the circles are tangent', () => {
  const INTERNAL = [
    'מעגל P משיק למעגל O מבפנים', // the report
    'מעגל P משיק מבפנים למעגל O',
    'מעגל P משיק למעגל O פנימית',
    'המעגל P משיק למעגל O מבפנים',
    'מעגל O משיק למעגל P מבפנים', // the other subject
    'מעגל P משיק פנימי למעגל O',
    'למעגל O משיק מעגל P מבפנים', // the inversion
  ];
  for (const line of INTERNAL)
    it(`«${line}» → internally tangent`, async () => {
      const r = await play(PAIR, line);
      expectTangency(r, 'INT');
      // Stability: the figure is the one the 2-D reference spelling draws. A tangency of two free circles moves one
      // of them (the `circles-tangent` device seats the OBJECT circle), so "both unmoved" is not satisfiable — the
      // measured bar is that the Hebrew verb moves exactly what the English twin moves, and nothing else.
      const ours = replay(st().facts, st().seed).positions;
      const subj = /[OP]/.exec(line)![0]; // the first-named circle is `circle1`, the one the device leaves in place
      const obj = subj === 'O' ? 'P' : 'O';
      await play(PAIR_EN, `circle ${subj} is internally tangent to circle ${obj}`, 'en');
      const twin = replay(st().facts, st().seed).positions;
      for (const id of ['O', 'P']) expect(Math.hypot(ours.get(id)!.x - twin.get(id)!.x, ours.get(id)!.y - twin.get(id)!.y), id).toBeLessThan(1e-9);
      const S0 = r.before.get(subj)!;
      expect(Math.hypot(S0.x - ours.get(subj)!.x, S0.y - ours.get(subj)!.y), `the first-named ${subj} stays put`).toBeLessThan(1e-9);
    });

  for (const line of ['מעגל P משיק למעגל O מבחוץ', 'מעגל P משיק מבחוץ למעגל O', 'מעגל P משיק למעגל O חיצונית'])
    it(`«${line}» → externally tangent`, async () => expectTangency(await play(PAIR, line), 'EXT'));

  it('English: "circle P is an internal tangent to circle O" → internally tangent', async () =>
    expectTangency(await play(PAIR_EN, 'circle P is an internal tangent to circle O', 'en'), 'INT'));
  it('English: "circle P is an external tangent to circle O" → externally tangent', async () =>
    expectTangency(await play(PAIR_EN, 'circle P is an external tangent to circle O', 'en'), 'EXT'));

  it('stated radii: «מעגל O ברדיוס 5» · «מעגל P ברדיוס 2» · the report → |OP| = 3', async () => {
    const r = await play(['מעגל O ברדיוס 5', 'מעגל P ברדיוס 2'], 'מעגל P משיק למעגל O מבפנים');
    expectTangency(r, 'INT');
    const f = replay(st().facts, 0);
    const O = f.positions.get('O')!, P = f.positions.get('P')!;
    expect(Math.hypot(O.x - P.x, O.y - P.y)).toBeCloseTo(3, 6);
  });

  it('an empty figure: the report introduces both circles, internally tangent', async () =>
    expectTangency(await play([], 'מעגל P משיק למעגל O מבפנים'), 'INT'));
});

describe('#2208 — at a named point: the kind stated, no tangent line', () => {
  for (const line of ['מעגל P משיק למעגל O מבפנים בנקודה X', 'מעגל P משיק מבפנים למעגל O בנקודה X'])
    it(`«${line}» → internally tangent at X`, async () => expectTangency(await play(PAIR, line), 'INT', 'X'));
  it('«מעגל P משיק למעגל O מבחוץ בנקודה X» → externally tangent at X, no tangent line', async () =>
    expectTangency(await play(PAIR, 'מעגל P משיק למעגל O מבחוץ בנקודה X'), 'EXT', 'X'));
  it('an empty figure: «מעגל P משיק למעגל O מבפנים בנקודה X» → internally tangent at X', async () =>
    expectTangency(await play([], 'מעגל P משיק למעגל O מבפנים בנקודה X'), 'INT', 'X'));
});

describe('#2208 — restatements (moved, the 2-D reading of the same statement)', () => {
  // #2209 (ADR-703): a restatement lowers onto the stated tangency, so it is the «כבר קיים» no-op — nothing added
  // (no segment AB, no second touch), the kind kept
  const expectRestated = (r: { kind: string; added: AnyCommand[] }, kind: 'EXT' | 'INT') => {
    expect(r.kind).toBe('noop');
    expect(r.added).toEqual([]);
    expect(kindAt(0).kind).toBe(kind);
    expect(kindAt(0).r.violations).toEqual([]);
  };
  it('after «…משיקים מבפנים» the report is accepted, still internal (was refused «no more tangents»)', async () =>
    expectRestated(await play([...PAIR, 'המעגלים O ו-P משיקים מבפנים'], 'מעגל P משיק למעגל O מבפנים'), 'INT'));
  // #2210 (ADR-704): «מבחוץ» over a defaulted kind states it, so the line is recorded — still one circles-tangent, no AB
  it('after «…משיקים» «…מבחוץ» draws no segment AB', async () =>
    expectTangency(await play([...PAIR, 'המעגלים O ו-P משיקים'], 'מעגל P משיק למעגל O מבחוץ'), 'EXT'));
  it('after «…זרים» the report draws the circles tangent and the disjoint row reads red', async () => {
    const r = await play([...PAIR, 'המעגלים O ו-P זרים'], 'מעגל P משיק למעגל O מבפנים');
    expect(r.kind).toBe('commit');
    expect(types(r.added)).toEqual(['circles-tangent']);
    const k = kindAt(0);
    expect(k.kind).toBe('INT');
    expect(k.r.violations.map((v) => v.relation)).toEqual(['circles-disjoint']);
  });
});

describe('#2208 — controls (unchanged at ef78f15c)', () => {
  const COMMON = [
    'AB משיק פנימי למעגלים O ו-P',
    'AB משיק חיצוני לשני המעגלים',
    'AB משיק מבחוץ לשני המעגלים',
    'הישר AB משיק מבפנים למעגלים O ו-P',
    'הקטע AB משיק מבחוץ למעגלים O ו-P',
    'AB משיק משותף חיצוני למעגלים O ו-P',
  ];
  for (const line of COMMON)
    it(`a line subject «${line}» → still a common tangent`, async () => {
      const r = await play(PAIR, line);
      expect(r.kind).toBe('commit');
      expect(types(r.added)).toContain('common-tangent');
      expect(types(r.added)).not.toContain('circles-tangent');
    });
  for (const [line, lang] of [['AB is an internal tangent of circles O and P', 'en'], ['circle O and circle P have a common tangent AB', 'en']] as const)
    it(`English «${line}» → still a common tangent`, async () => {
      const r = await play(PAIR_EN, line, lang);
      expect(types(r.added)).toContain('common-tangent');
    });
  for (const line of ['מעגל O משיק לישר AB מבחוץ', 'מעגל P משיק לישר AB', 'AB משיק מבפנים למעגל O'])
    it(`a circle and a line «${line}» → still a tangent line`, async () => {
      const r = await play(PAIR, line);
      expect(r.kind).toBe('commit');
      expect(types(r.added)).toContain('tangent');
      expect(types(r.added)).not.toContain('circles-tangent');
      expect(types(r.added)).not.toContain('common-tangent');
    });
  for (const [line, ext] of [['המעגלים O ו-P משיקים מבפנים', false], ['מעגל O ומעגל P משיקים מבפנים', false], ['המעגלים O ו-P משיקים בנקודה X', true]] as const)
    it(`the plural form «${line}» → circles-tangent external=${ext}`, async () => {
      const r = await play(PAIR, line);
      const ct = r.added.find((c) => c.type === 'circles-tangent') as Extract<AnyCommand, { type: 'circles-tangent' }>;
      expect(ct.external).toBe(ext);
    });
  for (const [line, ext] of [['circle P is internally tangent to circle O', false], ['circle P is externally tangent to circle O at X', true]] as const)
    it(`English «${line}» → circles-tangent external=${ext}`, async () => {
      const r = await play(PAIR_EN, line, 'en');
      const ct = r.added.find((c) => c.type === 'circles-tangent') as Extract<AnyCommand, { type: 'circles-tangent' }>;
      expect(ct.external).toBe(ext);
    });
  // #2211: a circle subject OUTSIDE the named pair is not this mechanism — pinned as today, re-based knowingly by #2211.
  it('K4 (#2211): «מעגל Q משיק מבחוץ למעגלים O ו-P» keeps today\'s common tangent of O and P', async () => {
    const r = await play([...PAIR, 'מעגל Q'], 'מעגל Q משיק מבחוץ למעגלים O ו-P');
    expect(types(r.added)).toContain('common-tangent');
  });
});
