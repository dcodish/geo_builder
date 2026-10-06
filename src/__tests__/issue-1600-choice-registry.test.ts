/**
 * #1600 ([ADR-593](../../docs/06-decisions.md#adr-593)) — AN UNSTATED DISCRETE CHOICE IS REACHABLE ONLY IF IT IS
 * REGISTERED: «הציגו תצורה אחרת» reaches exactly the configurations the status line counts.
 *
 * Measured on main 4d6e3fd6 / 9d1b0b1f (the triage's probe lines — the ADR-556 sweep found them, there is no
 * operator utterance):
 * - arm A: «הישר BC פוגש את מעגל A בנקודה E» with B off the circle printed «✓ נקבע במלואו» and BE = 1.621 /
 *   CE = 6.621 as definite; the other crossing gives 2.621 / 2.379 and the button returned null. `branchCount`
 *   answered 1 for every `avoid`, though `evaluate` (ADR-470) treats a non-crossing `avoid` as a branch pick.
 * - arm B: an equilateral triangle / a square erected on an edge beside existing geometry — the side was
 *   recomputed at every fold and stored nowhere, so nothing could cycle it («✓ נקבע במלואו», button null).
 * - arm C: two independent circle∩circle crossings — «יש 4 תצורות», and the button walked 2 of them for ever.
 *
 * The class lock: for every member, the shapes the button reaches = the count the status shows.
 */
import { describe, expect, it } from 'vitest';
import { factsOf } from './scenario-pipeline';
import {
  admissibleRewrites,
  choiceRescue,
  computeValues,
  configurationAxes,
  figureDeterminacy,
  findValidConfig,
  firstSatisfyingSeed,
  meetsRequirements,
  replay,
  searchAnotherView,
  sharedSamples,
  type Fact,
} from '@/replay/core';
import { figureStatus } from '@/app/figureStatus';
import { branchCount, crossingChoice, freeDofCount, type Id, type Vec } from '@/engine';

const TRI = ['משולש ABC', 'AB=4, BC=5, AC=6'];
const A_1600 = [...TRI, 'מעגל A ברדיוס 4.5', 'הישר BC פוגש את מעגל A בנקודה E'];
const M1 = [...TRI, 'מעגל A ברדיוס 3.98', 'BC חותך את מעגל A בנקודה E'];
const B_1600 = ['ריבוע ABCD', 'משולש שווה צלעות ABE'];
const M2 = [...TRI, 'ריבוע ABDE'];
const M3 = [...TRI, 'משולש שווה צלעות ABD'];
const M9 = ['ריבוע ABCD', 'משולש ABE', 'AE=BE', 'AE=AB'];
const M4 = ['משולש ABC', 'AB=6, BC=5, AC=7', 'מעגל A ברדיוס 4', 'מעגל B ברדיוס 5', 'G חיתוך מעגל A ומעגל B', 'מעגל C ברדיוס 3', 'H חיתוך מעגל B ומעגל C'];

const d = (p: Vec, q: Vec) => Math.hypot(p.x - q.x, p.y - q.y);
/** A similarity-invariant shape signature over the lettered points. */
function shapeSig(facts: Fact[], seed: number): string {
  const f = replay(facts, seed);
  const ids = [...f.positions.keys()].filter((id) => /^[A-Z]$/.test(id)).sort();
  const ds: number[] = [];
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) ds.push(d(f.positions.get(ids[i])!, f.positions.get(ids[j])!));
  const m = Math.max(...ds);
  return ds.map((x) => (x / m).toFixed(3)).join(',');
}
/** Press the button `presses` times from the default view; every view it shows must meet the requirements. */
function reached(facts: Fact[], presses = 8): { shapes: Set<string>; views: { facts: Fact[]; seed: number }[] } {
  let cur = { facts, seed: firstSatisfyingSeed(facts) };
  const shapes = new Set([shapeSig(cur.facts, cur.seed)]);
  const views = [cur];
  for (let k = 0; k < presses; k++) {
    const next = searchAnotherView(cur.facts, cur.seed, undefined, Number.POSITIVE_INFINITY);
    if (!next) break;
    expect(meetsRequirements(next.facts, next.seed), 'a press never shows a view that breaks a given').toBe(true);
    cur = next;
    views.push(cur);
    shapes.add(shapeSig(cur.facts, cur.seed));
  }
  return { shapes, views };
}
const statusOf = (facts: Fact[]) => figureStatus(facts.length, freeDofCount(replay(facts).construction), figureDeterminacy(sharedSamples(facts)));
const lengths = (facts: Fact[]) => new Map(computeValues(facts).rows.filter((r) => r.kind === 'length').map((r) => [r.label, r.value as number]));
const kinds = (facts: Fact[]) => configurationAxes(facts, replay(facts).construction).map((a) => a.kind);

describe('#1600 arm A — a crossing whose `avoid` is not a crossing is a choice', () => {
  it('the shared selection: an `avoid` ON a root determines the pick; one OFF the roots leaves both', () => {
    const sols = [{ x: 0, y: 0 }, { x: 2, y: 0 }];
    const p = (avoid: Id | undefined) => ({ kind: 'circle-circle', id: 'P', circle1: 'c1', circle2: 'c2', branch: 0, ...(avoid ? { avoid } : {}) }) as Parameters<typeof crossingChoice>[0];
    expect(crossingChoice(p('Q'), sols, new Map([['Q', { x: 0, y: 0 }]]))!.among.length, 'Q is a crossing → "the other one"').toBe(1);
    expect(crossingChoice(p('Q'), sols, new Map([['Q', { x: 0, y: 0 }]]))!.pick).toEqual({ x: 2, y: 0 });
    expect(crossingChoice(p('Q'), sols, new Map([['Q', { x: 1, y: 5 }]]))!.among.length, 'Q is not a crossing → a branch pick').toBe(2);
    expect(crossingChoice(p(undefined), sols, new Map())!.among.length).toBe(2);
  });

  it('1600a: two configurations, BE and CE withheld, and the button reaches the other crossing', () => {
    const facts = factsOf(A_1600);
    expect(branchCount(replay(facts).construction, 'E'), 'B is off the circle, so `avoid: B` decides nothing').toBe(2);
    expect(statusOf(facts)).toEqual({ key: 'actions.dofConfigs', n: 2 });
    const v = lengths(facts);
    expect(v.has('BE') || v.has('CE'), `no definite BE/CE while two figures exist: ${[...v.keys()]}`).toBe(false);
    expect(v.get('BC'), 'the givens still print').toBeCloseTo(5, 6);
    const { shapes, views } = reached(facts, 3);
    expect(shapes.size).toBe(2);
    const be = views.map((w) => { const f = replay(w.facts, w.seed); return d(f.positions.get('B')!, f.positions.get('E')!); });
    expect(be.some((x) => Math.abs(x - 1.621) < 1e-3) && be.some((x) => Math.abs(x - 2.621) < 1e-3), `both crossings: ${be}`).toBe(true);
  }, 120_000);

  it('m1 (segment form, both roots inside BC): two configurations, BE withheld, both reached', () => {
    const facts = factsOf(M1);
    expect(statusOf(facts)).toEqual({ key: 'actions.dofConfigs', n: 2 });
    expect(lengths(facts).has('BE')).toBe(false);
    expect(reached(facts, 3).shapes.size).toBe(2);
  }, 120_000);
});

describe('#1600 arm B — the side of an edge-built shape is a stored, cyclable choice', () => {
  it('1600b: recorded, two configurations, both sides reached', () => {
    const facts = factsOf(B_1600);
    const c = replay(facts).construction;
    expect(c.sideChoices, 'the composition recorded its choice').toEqual([{ type: 'triangle', ids: ['A', 'B', 'E'], toward: false }]);
    expect(kinds(facts)).toEqual(['side']);
    expect(statusOf(facts)).toEqual({ key: 'actions.dofConfigs', n: 2 });
    const { shapes, views } = reached(facts, 3);
    expect(shapes.size).toBe(2);
    const sides = views.map((w) => {
      const f = replay(w.facts, w.seed);
      const [A, B, C, E] = ['A', 'B', 'C', 'E'].map((k) => f.positions.get(k)!);
      const s = (p: Vec) => Math.sign((B.x - A.x) * (p.y - A.y) - (B.y - A.y) * (p.x - A.x));
      return s(E) === s(C) ? 'inside' : 'outside';
    });
    expect(sides[0], 'the default stays away from the square').toBe('outside');
    expect(sides).toContain('inside');
  }, 120_000);

  it.each([
    ['m2 (a square on a fixed triangle’s side)', M2],
    ['m3 (an equilateral triangle on a fixed triangle’s side)', M3],
    ['m9 (the side drawn first, the sizes given later)', M9],
  ])('%s: two configurations, both reached', (_name, lines) => {
    const facts = factsOf(lines);
    expect(statusOf(facts)).toEqual({ key: 'actions.dofConfigs', n: 2 });
    expect(reached(facts, 3).shapes.size).toBe(2);
  }, 120_000);

  it('the stored side is optional data: a saved figure without it is the away default, and it survives a JSON round-trip', () => {
    const facts = factsOf(B_1600);
    const toward = facts.map((f) => (f.cmd.type === 'triangle' ? ({ ...f, cmd: { ...f.cmd, edgeSide: 'toward' } } as Fact) : f));
    const clone = JSON.parse(JSON.stringify(toward)) as Fact[];
    expect(replay(clone).construction.sideChoices?.[0].toward).toBe(true);
    expect(shapeSig(clone, 0)).toBe(shapeSig(toward, 0));
    expect(shapeSig(facts, 0), 'the two sides are different figures').not.toBe(shapeSig(toward, 0));
  }, 120_000);

  it('a mirror-only composition (nothing off the edge) and a stacking second square record no side choice', () => {
    expect(replay(factsOf(['AB=6', 'משולש שווה צלעות ABC'])).construction.sideChoices, 'the two sides are congruent').toBeUndefined();
    const stacked = factsOf(['ריבוע ABCD', 'ריבוע DCEF']);
    expect(replay(stacked).construction.sideChoices, 'the inner side stacks onto the square — not a choice').toBeUndefined();
  }, 120_000);

  it.each([
    ['outside, typed after the triangle', [...B_1600, 'E מחוץ לריבוע ABCD'], 'outside'],
    ['inside, typed after the triangle', [...B_1600, 'E בתוך הריבוע ABCD'], 'inside'],
  ])('a STATED side wins (%s): one configuration, every press keeps it', (_n, lines, want) => {
    const facts = factsOf(lines as string[]);
    const { views } = reached(facts, 3);
    for (const w of views) {
      const f = replay(w.facts, w.seed);
      const [A, B, C, E] = ['A', 'B', 'C', 'E'].map((k) => f.positions.get(k)!);
      const s = (p: Vec) => Math.sign((B.x - A.x) * (p.y - A.y) - (B.y - A.y) * (p.x - A.x));
      expect(s(E) === s(C) ? 'inside' : 'outside').toBe(want);
    }
    expect(statusOf(facts)?.key).toBe('actions.determined');
  }, 120_000);

  it('a default side the stated side contradicts is CURED by the rescue tier, never kept', () => {
    // The triage's inverted-default measurement: a stated «מחוץ» does not pull E out of the inside basin.
    const facts = factsOf([...B_1600, 'E מחוץ לריבוע ABCD']).map((f) =>
      f.cmd.type === 'triangle' ? ({ ...f, cmd: { ...f.cmd, edgeSide: 'toward' } } as Fact) : f,
    );
    expect(meetsRequirements(facts, 0), 'the inside basin violates the stated side').toBe(false);
    // the shared rescue tier (findValidConfig's choice tier and the submit gate's curable test) flips the side
    const cured = choiceRescue(facts, Number.POSITIVE_INFINITY);
    expect(cured, 'the side axis cures it').not.toBeNull();
    expect(cured!.facts.find((f) => f.cmd.type === 'triangle')!.cmd).not.toHaveProperty('edgeSide');
    expect(meetsRequirements(cured!.facts, cured!.seed)).toBe(true);
    // and the display search never keeps a view that breaks the stated side (here an earlier seed tier may win)
    const found = findValidConfig(facts, 0, Number.POSITIVE_INFINITY);
    expect(found && meetsRequirements(found.facts, found.seed)).toBe(true);
  }, 120_000);
});

describe('#1600 arm C — the button walks every axis', () => {
  it('m4: two independent crossings — four configurations, four shapes within four presses', () => {
    const facts = factsOf(M4);
    expect(kinds(facts)).toEqual(['branch', 'branch']);
    expect(statusOf(facts)).toEqual({ key: 'actions.dofConfigs', n: 4 });
    expect(reached(facts, 4).shapes.size).toBe(4);
  }, 120_000);

  it('the pool and the button read ONE registry: the rewrites are the axes’ product', () => {
    const facts = factsOf(M4);
    const c = replay(facts, firstSatisfyingSeed(facts)).construction;
    expect(admissibleRewrites(facts, c)!.length).toBe(4);
  }, 120_000);
});

describe('#1600 — the class property: shapes the button reaches = the count the status shows', () => {
  it.each([
    ['1600a', A_1600],
    ['m1', M1],
    ['1600b', B_1600],
    ['m2', M2],
    ['m3', M3],
    ['m9', M9],
    ['m4', M4],
  ])('%s', (_n, lines) => {
    const facts = factsOf(lines);
    const st = statusOf(facts);
    const n = st?.key === 'actions.dofConfigs' ? (st as { n: number }).n : 1;
    expect(reached(facts, n + 2).shapes.size).toBe(n);
  }, 120_000);
});
