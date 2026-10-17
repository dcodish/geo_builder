/**
 * #2210 ([ADR-704](../../../docs/06-decisions.md#adr-704)) — A DEFAULTED TANGENCY KIND YIELDS (operator ruling 2026-10-16,
 * ballot row `d2210-accept`: *"a later constraint overrides a default (ADR-052)"*; *"a stated containment («מוכל») forces
 * the internal kind on a later tangency"*).
 *
 * Measured on the #2209 tip (`0676a5a8`) through `decideDeterministic2D` → `commitVerdict` → `replay`: «המעגלים O ו-P
 * משיקים» · «המעגלים O ו-P משיקים מבפנים» drew external with the internal row red; with radii 5 and 2 the second line was
 * refused over-constrained; «מעגל P מוכל בתוך מעגל O» · «המעגלים O ו-P משיקים [בנקודה X]» drew external with the
 * containment row red; «…מוכל» · «…משיקים מבפנים» drew internal and STILL red (the containment check was strict).
 * Root cause: an unkinded line wrote `external: true`, indistinguishable from «מבחוץ», so the default asserted a given
 * nobody gave; and the containment check could never admit a touching inner circle.
 *
 * The model is mocked and must never be called.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { decideDeterministic2D } from '@/app/decideDeterministic';
import { commitVerdict } from '@/app/submitPipeline';
import { replay, useGeoStore } from '@/store/geoStore';
import { checkGivens } from '@/engine';
import type { AnyCommand, Command } from '@/engine';

const st = () => useGeoStore.getState();
const langOf = (line: string): 'he' | 'en' => (/[a-z]{3}/.test(line) ? 'en' : 'he');

async function submit(line: string) {
  const f = replay(st().facts, st().seed);
  const v = await decideDeterministic2D({ facts: st().facts, seed: st().seed, view: { construction: f.construction, positions: f.positions } } as never, line, langOf(line));
  commitVerdict(v, line);
  return v;
}

/** Plays every line; each must commit. Returns the last verdict's kind. */
async function playAll(lines: string[]) {
  st().clear();
  let kind = '';
  for (const line of lines) {
    kind = (await submit(line)).kind;
    expect(kind, `«${line}» commits`).toBe('commit');
  }
  return kind;
}

/** The kind of the figure's two circles (whatever their centres are called): EXT, INT or none. */
function kindOf(facts = st().facts, seed = st().seed) {
  const r = replay(facts, seed);
  const cs = [...r.circles.values()];
  expect(cs, 'two circles').toHaveLength(2);
  const [a, b] = cs;
  const d = Math.hypot(a.center.x - b.center.x, a.center.y - b.center.y);
  return { kind: Math.abs(d - (a.r + b.r)) < 1e-4 ? 'EXT' : Math.abs(d - Math.abs(a.r - b.r)) < 1e-4 ? 'INT' : 'none', r, d };
}

/** Internal at seeds 0–3, green, the given letters drawn, no coincidence, the model never called. */
function expectInternal(touch = 'M') {
  for (const seed of [0, 1, 2, 3]) {
    const k = kindOf(st().facts, seed);
    expect(k.kind, `seed ${seed}`).toBe('INT');
    expect(k.r.violations, `seed ${seed} green`).toEqual([]);
  }
  const f = replay(st().facts, st().seed);
  expect(f.positions.has(touch), `touch ${touch}`).toBe(true);
  expect(f.positions.has('T'), 'no second letter T').toBe(false);
  if (touch !== 'M') expect(f.positions.has('M'), 'no M beside X').toBe(false);
  expect(f.coincidences).toEqual([]);
  expect(llmParseMock).not.toHaveBeenCalled();
}

/** Over 24 seeds, how many draw the pair internally tangent and green (docs/17 §9: under ~20/24 is a finding). */
function wholeRate(): number {
  let n = 0;
  for (let seed = 0; seed < 24; seed++) {
    const k = kindOf(st().facts, seed);
    if (k.kind === 'INT' && k.r.violations.length === 0) n++;
  }
  return n;
}

beforeEach(() => llmParseMock.mockReset());

const PAIR = ['מעגל O', 'מעגל P'];
const PAIR_EN = ['circle O', 'circle P'];

describe('#2210 item 1 — a later stated kind decides a defaulted one', () => {
  it('B1 (the report): «…משיקים» · «…משיקים מבפנים» → internal, green, the touch still M', async () => {
    await playAll([...PAIR, 'המעגלים O ו-P משיקים', 'המעגלים O ו-P משיקים מבפנים']);
    expectInternal('M');
    expect(wholeRate()).toBeGreaterThanOrEqual(20);
  });
  it('the earlier tangency itself lowers internal in the fold (its command keeps `kindStated: false`)', async () => {
    await playAll([...PAIR, 'המעגלים O ו-P משיקים', 'המעגלים O ו-P משיקים מבפנים']);
    const cmds = st().facts.map((f) => f.cmd as AnyCommand).filter((c) => c.type === 'circles-tangent');
    expect(cmds).toEqual([
      { type: 'circles-tangent', circle1: 'circle-O', circle2: 'circle-P', at: 'M', external: true, kindStated: false },
      { type: 'circles-tangent', circle1: 'circle-O', circle2: 'circle-P', at: 'M', external: false },
    ]);
    const req = replay(st().facts, 0).construction.requirements?.filter((r) => r.kind === 'circle-position' && r.relation === 'tangent');
    expect(req?.every((r) => r.kind === 'circle-position' && r.relation === 'tangent' && r.external === false)).toBe(true);
  });
  it('B2: «…משיקים בנקודה X» · «…משיקים מבפנים» → internal at X', async () => {
    await playAll([...PAIR, 'המעגלים O ו-P משיקים בנקודה X', 'המעגלים O ו-P משיקים מבפנים']);
    expectInternal('X');
  });
  it('B3: «AB משיק משותף למעגלים O ו-P בנקודה X» · «…משיקים מבפנים» → internal at X', async () => {
    await playAll([...PAIR, 'AB משיק משותף למעגלים O ו-P בנקודה X', 'המעגלים O ו-P משיקים מבפנים']);
    expectInternal('X');
  });
  it('B4 (English): «…משיקים» · "circles O and P are internally tangent" → internal', async () => {
    await playAll([...PAIR, 'המעגלים O ו-P משיקים', 'circles O and P are internally tangent']);
    expectInternal('M');
  });
  it('B4 (English throughout)', async () => {
    await playAll([...PAIR_EN, 'circles O and P are tangent', 'circles O and P are internally tangent']);
    expectInternal('M');
  });
  it('B5 (the fresh pair): «שני מעגלים משיקים» · «המעגלים משיקים מבפנים» → internal', async () => {
    await playAll(['שני מעגלים משיקים', 'המעגלים משיקים מבפנים']);
    for (const seed of [0, 1, 2, 3]) {
      const k = kindOf(st().facts, seed);
      expect(k.kind, `seed ${seed}`).toBe('INT');
      expect(k.r.violations).toEqual([]);
    }
  });
  it('B6: radii 5 and 2 stated → builds with |OP| = 3 (was refused over-constrained)', async () => {
    await playAll(['מעגל O ברדיוס 5', 'מעגל P ברדיוס 2', 'המעגלים O ו-P משיקים', 'המעגלים O ו-P משיקים מבפנים']);
    expectInternal('M');
    expect(kindOf().d).toBeCloseTo(3, 6);
  });
  it('the circle-subject form «מעגל P משיק למעגל O מבפנים» decides it too', async () => {
    await playAll([...PAIR, 'המעגלים O ו-P משיקים', 'מעגל P משיק למעגל O מבפנים']);
    expectInternal('M');
  });
  it('entry order: the kind line first, then the plain line → internal (the plain line adds nothing)', async () => {
    await playAll([...PAIR, 'המעגלים O ו-P משיקים מבפנים']);
    expect((await submit('המעגלים O ו-P משיקים')).kind).toBe('noop');
    expectInternal('M');
  });
  it('untick or delete the later «מבפנים»: the circles are external again, green', async () => {
    await playAll([...PAIR, 'המעגלים O ו-P משיקים', 'המעגלים O ו-P משיקים מבפנים']);
    const facts = st().facts;
    const last = facts.length - 1;
    const unticked = facts.map((f, i) => (i === last ? { ...f, enabled: false } : f));
    for (const list of [unticked, facts.slice(0, last)]) {
      const k = kindOf(list, 0);
      expect(k.kind).toBe('EXT');
      expect(k.r.violations).toEqual([]);
    }
  });
});

describe('#2210 item 2 — a stated containment makes a defaulted tangency internal', () => {
  const CONT = [...PAIR, 'מעגל P מוכל בתוך מעגל O'];
  it('K1 (the report): «…מוכל…» · «המעגלים O ו-P משיקים בנקודה X» → P inside O touching at X, green', async () => {
    await playAll([...CONT, 'המעגלים O ו-P משיקים בנקודה X']);
    expectInternal('X');
    expect(wholeRate()).toBeGreaterThanOrEqual(20);
    const r = replay(st().facts, 0);
    expect(r.circles.get('circle-P')!.r, 'P is the inner circle').toBeLessThan(r.circles.get('circle-O')!.r);
  });
  it('K2: without the point → internal at M', async () => {
    await playAll([...CONT, 'המעגלים O ו-P משיקים']);
    expectInternal('M');
  });
  it('K3: «מעגל O» · «מעגל מוכל במעגל O» · «המעגלים משיקים» → internal', async () => {
    await playAll(['מעגל O', 'מעגל מוכל במעגל O', 'המעגלים משיקים']);
    for (const seed of [0, 1, 2, 3]) {
      const k = kindOf(st().facts, seed);
      expect(k.kind, `seed ${seed}`).toBe('INT');
      expect(k.r.violations).toEqual([]);
    }
  });
  it('K4: «…מוכל…» · «…משיקים מבפנים» → internal and green (the containment admits the touch)', async () => {
    await playAll([...CONT, 'המעגלים O ו-P משיקים מבפנים']);
    expectInternal('M');
  });
  it('K5 (the other order): «…משיקים» · «מעגל P מוכל בתוך מעגל O» → internal, green', async () => {
    await playAll([...PAIR, 'המעגלים O ו-P משיקים', 'מעגל P מוכל בתוך מעגל O']);
    expectInternal('M');
  });
});

describe('#2210 — controls', () => {
  it('C1: two explicit kinds that disagree stay the later line\'s contradiction, red', async () => {
    await playAll([...PAIR, 'המעגלים O ו-P משיקים מבפנים', 'המעגלים O ו-P משיקים מבחוץ']);
    expect(kindOf().r.violations.map((v) => v.relation)).toContain('tangent');
  });
  it('C2: «…משיקים» · «…משיקים מבחוץ» stays external, green, touch M', async () => {
    await playAll([...PAIR, 'המעגלים O ו-P משיקים', 'המעגלים O ו-P משיקים מבחוץ']);
    const k = kindOf();
    expect(k.kind).toBe('EXT');
    expect(k.r.violations).toEqual([]);
    expect(k.r.positions.has('M') && !k.r.positions.has('T')).toBe(true);
  });
  it('K6: «…מוכל…» · «…משיקים מבחוץ» stays red (an explicit kind is never overridden)', async () => {
    await playAll([...PAIR, 'מעגל P מוכל בתוך מעגל O', 'המעגלים O ו-P משיקים מבחוץ']);
    expect(kindOf().r.violations.map((v) => v.relation)).toContain('circle-contained');
  });
  it('a lone tangency stays external by default', async () => {
    await playAll([...PAIR, 'המעגלים O ו-P משיקים']);
    expect(kindOf().kind).toBe('EXT');
  });
  it('a tangency of ANOTHER pair does not decide this one', async () => {
    await playAll([...PAIR, 'מעגל Q', 'המעגלים O ו-P משיקים', 'המעגלים O ו-Q משיקים מבפנים']);
    const r = replay(st().facts, 0);
    const O = r.circles.get('circle-O')!, P = r.circles.get('circle-P')!;
    expect(Math.hypot(O.center.x - P.center.x, O.center.y - P.center.y)).toBeCloseTo(O.r + P.r, 4);
    expect(r.violations).toEqual([]);
  });
});

describe('#2210 — the verifier: containment is closed only beside an internal tangency', () => {
  const circles = new Map([
    ['circle-O', { center: { x: 0, y: 0 }, r: 5 }],
    ['circle-P', { center: { x: 3, y: 0 }, r: 2 }], // touching from inside: reach 5 = R
  ]) as never;
  const contained: Command = { type: 'set-circle-position', relation: 'contained', a: 'circle-O', b: 'circle-P' };
  const tangent = (external: boolean): Command => ({ type: 'circles-tangent', circle1: 'circle-P', circle2: 'circle-O', at: 'M', external });
  const relations = (cmds: Command[]) => checkGivens(cmds, new Map([['M', { x: 5, y: 0 }]]), circles).map((v) => v.relation);
  it('containment alone is strict: a touching inner circle is a violation', () => expect(relations([contained])).toContain('circle-contained'));
  it('beside an internal tangency (either pair order) it is closed', () => expect(relations([contained, tangent(false)])).toEqual([]));
  it('beside an external tangency it stays strict', () => expect(relations([contained, tangent(true)])).toContain('circle-contained'));
});
