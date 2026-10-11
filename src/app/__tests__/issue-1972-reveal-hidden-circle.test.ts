/**
 * #1972 ([ADR-624](../../../docs/06-decisions.md#adr-624)) — AN INSCRIPTION THAT REUSES A HIDDEN CIRCLE
 * REVEALS IT, INSTEAD OF ANSWERING «זה כבר קיים באיור» ABOUT A CIRCLE THAT IS NOWHERE ON THE CANVAS.
 *
 * Operator, playing round #1959's sheet: *"once i have a pentagon (but this might be true for other shapes
 * too), writing מחומש ABCDE חסום במעגל gives an error saying this already exists."*
 *
 * Measured on `main` @ 06fc51dd through `decideDeterministic2D` → `commitVerdict` (the App's door): after
 * «מחומש משוכלל ABCDE» — whose lowering builds the circumcircle as a HIDDEN scaffold (ADR-610's one scaffold
 * emitter) — the line «מחומש ABCDE חסום במעגל» answered «זה כבר קיים באיור — אין מה להוסיף.» with NO circle on
 * the screen, and the class was wider than the report: the hexagon, the octagon, the English spelling, the
 * regular-inscribed spelling, and the 3-/4-gon «בר חסימה» → «חסום במעגל» pair all did the same, while
 * «משולש ABC בר חסימה» · «מרובע ABCD חסום במעגל» COMMITTED green with its circle still hidden.
 *
 * Root cause: both existing-circle readers of the inscribe lowering (`reusedInscribeCircle`,
 * `boundInscribeCircle`) correctly refuse to mint a second circle on a centre the figure already has — and
 * reused a HIDDEN one silently, so the lowering dropped the one thing the sentence added. The submit gate
 * then read "this produced nothing" correctly and said so. Fix: ONE predicate (`revealReusedCircle`) emits
 * ADR-291's existing `show-circle` whenever the sentence says the circle is drawn and the circle it reuses is
 * one the figure hides — consulted by every inscribe branch that reuses a circle, so the reveal cannot exist
 * for one spelling and be missing in another.
 *
 * The ruling (2026-10-09, #1891): *"Show the circle."* The scaffold IS the circumcircle being asked for —
 * one circle, one id, one drawing.
 *
 * The model is mocked and must never be called.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { decideDeterministic2D } from '@/app/decideDeterministic';
import { commitVerdict } from '@/app/submitPipeline';
import { replay, useGeoStore } from '@/store/geoStore';
import { buildParseCtx, parse } from '@/parser';
import { applyCommand, emptyConstruction, type Construction } from '@/engine';
import { clearReplayCaches } from '@/replay/core';

const st = () => useGeoStore.getState();

type Fig = ReturnType<typeof replay>;
const circleOf = (fig: Fig, id = 'circle-O') =>
  fig.construction.objects.find((o) => o.kind === 'circle' && o.id === id) as undefined | { id: string; center: string; hidden?: boolean };
const circleCount = (fig: Fig) => fig.construction.objects.filter((o) => o.kind === 'circle').length;
const allStepsOk = (fig: Fig) => {
  for (const [id, s] of Object.entries(fig.status)) expect(s, `status of step ${id}`).toBe('ok');
  expect(fig.lastError).toBeNull();
};

/** Type each line as the App does, and report the LAST line's verdict with the figure it left. */
async function play(lines: string[]) {
  st().clear();
  let last = { kind: '', note: undefined as undefined | { key?: string; explain?: string } };
  for (const line of lines) {
    const d = replay(st().facts, st().seed);
    const v = (await decideDeterministic2D({ facts: st().facts, seed: st().seed, view: { construction: d.construction, positions: d.positions } } as never, line, 'he')) as never as {
      kind: string;
      note?: { key?: string; explain?: string };
    };
    last = { kind: v.kind, note: v.note };
    if (v.kind !== 'store-op') commitVerdict(v as never, line);
  }
  return { ...last, fig: replay(st().facts, st().seed) };
}

/** What the inscribe line lowers to, against the figure the prefix builds. */
function lower(prefix: string[], line: string) {
  st().clear();
  for (const p of prefix) {
    const d = replay(st().facts, st().seed);
    const r = parse(p, buildParseCtx(d.construction, d.positions));
    if (!r.ok) throw new Error(`«${p}» did not parse`);
    const group = `g${st().facts.length}`;
    for (const c of r.commands) st().execute(c, p, group);
  }
  const d = replay(st().facts, st().seed);
  const r = parse(line, buildParseCtx(d.construction, d.positions));
  if (!r.ok) throw new Error(`«${line}» did not parse`);
  return r.commands;
}

beforeEach(() => {
  llmParseMock.mockReset();
  st().clear();
});

describe('#1972 — the operator’s sequence: the stated circle is DRAWN, never «כבר קיים» with nothing on screen', () => {
  it('«מחומש משוכלל ABCDE» · «מחומש ABCDE חסום במעגל» commits and the circle is drawn', async () => {
    const { kind, note, fig } = await play(['מחומש משוכלל ABCDE', 'מחומש ABCDE חסום במעגל']);
    expect(kind, 'the second line is accepted, not answered «already there»').toBe('commit');
    expect(note?.key).not.toBe('input.alreadyDrawn');
    expect(circleOf(fig)?.hidden, 'circle-O is DRAWN').toBeFalsy();
    expect(circleCount(fig), 'one circle — the scaffold revealed, never a second one minted').toBe(1);
    allStepsOk(fig);
    // every vertex still rides it, one radius from the centre
    const o = fig.positions.get('@ctr-O')!;
    const rs = ['A', 'B', 'C', 'D', 'E'].map((id) => Math.hypot(fig.positions.get(id)!.x - o.x, fig.positions.get(id)!.y - o.y));
    for (const r of rs) expect(r).toBeCloseTo(rs[0], 6);
  });

  it.each([
    [['מחומש משוכלל ABCDE', 'מחומש ABCDE חסום במעגל'], ['A', 'B', 'C', 'D', 'E']],
    [['משושה משוכלל ABCDEF', 'משושה ABCDEF חסום במעגל'], ['A', 'B', 'C', 'D', 'E', 'F']],
    [['מתומן משוכלל ABCDEFGH', 'מתומן ABCDEFGH חסום במעגל'], ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']],
    [['regular pentagon ABCDE', 'pentagon ABCDE inscribed in a circle'], ['A', 'B', 'C', 'D', 'E']],
    [['מחומש משוכלל ABCDE', 'מחומש משוכלל ABCDE חסום במעגל'], ['A', 'B', 'C', 'D', 'E']],
    [['מחומש משוכלל ABCDE', 'regular pentagon ABCDE inscribed in a circle'], ['A', 'B', 'C', 'D', 'E']],
    // the 3-/4-gon path's own reuse branch — the same defect, not an n-gon speciality
    [['משולש ABC בר חסימה', 'משולש ABC חסום במעגל'], ['A', 'B', 'C']],
    [['מרובע ABCD בר חסימה', 'מרובע ABCD חסום במעגל'], ['A', 'B', 'C', 'D']],
    // the BOUND branch: a vertex the line adds, so the line committed — green, with its circle still hidden
    [['משולש ABC בר חסימה', 'מרובע ABCD חסום במעגל'], ['A', 'B', 'C', 'D']],
  ])('%s — the circle the figure was hiding is drawn', async (lines, vertices) => {
    const { kind, fig } = await play(lines as string[]);
    expect(kind).toBe('commit');
    expect(circleOf(fig)?.hidden, 'the circle is DRAWN').toBeFalsy();
    expect(circleCount(fig), 'exactly one circle').toBe(1);
    allStepsOk(fig);
    const o = fig.positions.get('@ctr-O')!;
    const rs = (vertices as string[]).map((id) => Math.hypot(fig.positions.get(id)!.x - o.x, fig.positions.get(id)!.y - o.y));
    for (const r of rs) expect(r).toBeCloseTo(rs[0], 5);
  });

  it('the reveal does not reach back: the step BEFORE it still shows the circle hidden, warm memo and cold', async () => {
    // A reveal used to un-hide the circle object IN PLACE, and `applyCommand` copies the object ARRAY and
    // not its elements — so the mutation reached the construction the step was derived from, including the
    // one the replay/fold memo (ADR-280) holds for an earlier PREFIX of the same facts. Undo, a deleted row
    // and every prefix replay then showed a circle the fact list does not draw. Measured on ADR-291's own
    // path at HEAD, and this is the cheapest place to keep it fixed.
    st().clear();
    const d0 = replay(st().facts, st().seed);
    const v0 = (await decideDeterministic2D({ facts: st().facts, seed: st().seed, view: { construction: d0.construction, positions: d0.positions } } as never, 'מחומש משוכלל ABCDE', 'he')) as never as { kind: string };
    commitVerdict(v0 as never, 'מחומש משוכלל ABCDE');
    const prefix = st().facts.map((f) => ({ ...f }));
    expect(circleOf(replay(prefix, st().seed))?.hidden, 'the scaffold circle starts hidden').toBe(true);
    const d1 = replay(st().facts, st().seed);
    const v1 = (await decideDeterministic2D({ facts: st().facts, seed: st().seed, view: { construction: d1.construction, positions: d1.positions } } as never, 'מחומש ABCDE חסום במעגל', 'he')) as never as { kind: string };
    commitVerdict(v1 as never, 'מחומש ABCDE חסום במעגל');
    expect(circleOf(replay(st().facts, st().seed))?.hidden, 'the circle is now drawn').toBeFalsy();
    // the WARM replay of the earlier prefix — what undo and a deleted row show
    expect(circleOf(replay(prefix, st().seed))?.hidden, 'the step before the reveal still hides it (warm)').toBe(true);
    clearReplayCaches();
    expect(circleOf(replay(prefix.map((f) => ({ ...f })), st().seed))?.hidden, 'and cold').toBe(true);
  });

  it.each([
    [{ type: 'show-circle', id: 'circle-O' } as const, 'hidden' as const],
    [{ type: 'name-center', center: '@ctr-O' } as const, 'autoCenter' as const],
  ])('applyCommand(%s) reveals in the RESULT and leaves its input untouched', (cmd, flag) => {
    // The property the fix restores, at the chokepoint: `applyCommand` is pure over its input, and a
    // display reveal was the one place that was not — it dropped the flag with `delete o.<flag>` over an
    // array copy whose ELEMENTS were shared with `prev`. Both reveals are asserted here because they are
    // one class and one helper (`revealCircles`); the `name-center` command is spelled with the centre's
    // real id, which is what `apply` matches (the parser spells the student's token — ADR-342).
    const base = applyCommand(emptyConstruction(), { type: 'circle', id: 'circle-O', center: '@ctr-O', radius: 5, hidden: true, autoCenter: true } as never);
    const circ = (c: Construction) => c.objects.find((o) => o.id === 'circle-O') as unknown as Record<string, unknown>;
    expect(circ(base)[flag], 'the flag starts set').toBe(true);
    const after = applyCommand(base, cmd as never);
    expect(circ(after)[flag], 'the reveal drops it in the RESULT').toBeUndefined();
    expect(circ(base)[flag], 'and the construction it was given is untouched').toBe(true);
  });

  it('revealing moves nothing — the figure the student already had is untouched (stability)', async () => {
    const before = await play(['מחומש משוכלל ABCDE']);
    const was = new Map([...before.fig.positions].map(([id, p]) => [id, { ...p }]));
    const after = await play(['מחומש משוכלל ABCDE', 'מחומש ABCDE חסום במעגל']);
    for (const [id, p] of was) {
      const q = after.fig.positions.get(id);
      expect(q, `${id} survives`).toBeDefined();
      expect(Math.hypot(q!.x - p.x, q!.y - p.y), `${id} did not jump`).toBeLessThan(1e-6);
    }
  });
});

describe('#1972 — the honest «כבר קיים» is untouched', () => {
  it.each([
    // the circle is already ON the canvas: a pentagon on a visible circle really is already drawn
    [['מחומש משוכלל ABCDE חסום במעגל', 'מחומש ABCDE חסום במעגל'], false],
    [['מחומש ABCDE חסום במעגל', 'מחומש ABCDE חסום במעגל'], false],
    // the SAME line a third time, after the reveal: now there is nothing left to add
    [['מחומש משוכלל ABCDE', 'מחומש ABCDE חסום במעגל', 'מחומש ABCDE חסום במעגל'], false],
    // «בר חסימה» asks for the circle NOT to be drawn — the concyclicity already holds, so «כבר קיים» is true
    [['מחומש משוכלל ABCDE', 'מחומש ABCDE בר חסימה'], true],
    [['מחומש משוכלל ABCDE', 'pentagon ABCDE is cyclic'], true],
  ])('%s answers «זה כבר קיים באיור» and adds no row', async (lines, stillHidden) => {
    const { kind, note, fig } = await play(lines as string[]);
    expect(kind).toBe('noop');
    expect(note?.key).toBe('input.alreadyDrawn');
    expect(!!circleOf(fig)?.hidden, `the circle's visibility is unchanged (hidden=${stillHidden})`).toBe(stillHidden);
    expect(circleCount(fig)).toBe(1);
  });

  it('a plain n-gon then its inscription is unchanged — it already worked (R1)', async () => {
    const { kind, fig } = await play(['מחומש ABCDE', 'מחומש ABCDE חסום במעגל']);
    expect(kind).toBe('commit');
    expect(circleOf(fig)?.hidden).toBeFalsy();
    expect(circleCount(fig)).toBe(1);
    allStepsOk(fig);
  });
});

describe('#1972 — the lowering: one reveal, no second circle, and silence where silence is honest', () => {
  it.each([
    [['מחומש משוכלל ABCDE'], 'מחומש ABCDE חסום במעגל'],
    [['משושה משוכלל ABCDEF'], 'משושה ABCDEF חסום במעגל'],
    [['regular pentagon ABCDE'], 'pentagon ABCDE inscribed in a circle'],
    [['משולש ABC בר חסימה'], 'משולש ABC חסום במעגל'],
    [['מרובע ABCD בר חסימה'], 'מרובע ABCD חסום במעגל'],
    [['משולש ABC בר חסימה'], 'מרובע ABCD חסום במעגל'],
  ])('%s · «%s» lowers to exactly ONE show-circle and no new circle', (prefix, line) => {
    const cmds = lower(prefix as string[], line);
    expect(cmds.filter((c) => c.type === 'show-circle')).toEqual([{ type: 'show-circle', id: 'circle-O' }]);
    expect(cmds.filter((c) => c.type === 'circle' || c.type === 'circumcircle' || c.type === 'circle-through'), 'no second circle is minted').toEqual([]);
  });

  it.each([
    // nothing to reveal: the circle is already drawn
    [['מחומש ABCDE חסום במעגל'], 'מחומש ABCDE חסום במעגל'],
    [['מחומש משוכלל ABCDE חסום במעגל'], 'מחומש ABCDE חסום במעגל'],
    // the sentence asks for the circle NOT to be drawn
    [['מחומש משוכלל ABCDE'], 'מחומש ABCDE בר חסימה'],
    [['משולש ABC בר חסימה'], 'משולש ABC בר חסימה'],
    // a circle the figure draws PART of is SEEN: «חסום במעגל» binds to the drawn half and never completes
    // the circle (ADR-422/ADR-423, #429/#430 — "all references to the circle need to be to the drawn half").
    // Without this exclusion the semicircle figure grew a full circle, which only the #1395 parity goldens caught.
    [['חצי מעגל'], 'משולש CDE חסום במעגל'],
    [['רבע מעגל'], 'משולש CDE חסום במעגל'],
    [['גזרה OAB'], 'משולש CDE חסום במעגל'],
  ])('%s · «%s» emits NO show-circle', (prefix, line) => {
    expect(lower(prefix as string[], line).filter((c) => c.type === 'show-circle')).toEqual([]);
  });

  it('a semicircle stays a semicircle: «חצי מעגל» · «משולש CDE חסום במעגל» keeps the one HIDDEN circle and its arc', async () => {
    const { kind, fig } = await play(['חצי מעגל', 'משולש CDE חסום במעגל']);
    expect(kind).toBe('commit');
    expect(circleCount(fig), 'still one circle — ADR-422, no invented sibling').toBe(1);
    expect(circleOf(fig)?.hidden, 'and it is still the hidden full circle behind the drawn arc').toBe(true);
    expect(fig.construction.objects.some((o) => o.kind === 'arc'), 'the drawn half is still the arc').toBe(true);
  });

  it('the model is never called', () => {
    expect(llmParseMock).not.toHaveBeenCalled();
  });
});
