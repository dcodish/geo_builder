/**
 * #970 (ADR-500) — `angleArms` becomes the reader it was declared to be.
 *
 * #831/ADR-468 made `angleArms` "the one place that answers WHICH angle is being named", so that a rule
 * decides only what its VALUE means and a third value kind cannot reopen the hole by forgetting to copy
 * a lane. **Two rules never migrated.** `angleAcuteness` and `boundOperand` kept hand-copies of the
 * triple and single-vertex lanes, so the guarantee was stated and not true — and #967 paid for it: a new
 * naming mode (an angle addressed by its two SIDES) went into `angleArms` and was inherited free by the
 * value lanes, then had to be pasted into both copies by hand.
 *
 * The cost of leaving it: a FOURTH naming mode would have to be copied three times, and whichever copy
 * was forgotten reproduces #831's defect exactly — one spelling that works for a value and not for a
 * bound, with nothing failing loudly.
 *
 * **The migration was measured, not assumed** (the issue required this). A 498-case differential over
 * naming × tail × context plus every angle line in the catalog: **132 cells changed, 0 real regressions**.
 * - 115 — a refusal got BETTER: `not-handled` (escalate to the paid model) → a named clarification.
 * - 16 — the single-vertex acuteness form now draws its arms, as the triple form always did and as the
 *   rule's own docstring already claimed. Idempotent, and the arms exist already in that lane.
 * - 1 — «זווית A B קהה», two spaced labels: the copy took the FIRST and silently ignored the second;
 *   `angleArms` requires exactly one and escalates. More honest, and not a real spelling.
 */
import { describe, it, expect } from 'vitest';
import { parse } from '../index';

const TRI = { neighbors: { A: ['B', 'C'], B: ['A', 'C'], C: ['A', 'B'] } };
/** A carries THREE arms — «זווית A» names one of several angles, so it must ASK, never pick. */
const FAN = { neighbors: { A: ['B', 'C', 'D'], B: ['A', 'C'], C: ['A', 'B'] } };

const res = (u: string, ctx: object = TRI) => parse(u, ctx);
const cmds = (u: string, ctx: object = TRI) => {
  const r = parse(u, ctx);
  if (!r.ok) throw new Error(`expected «${u}» to parse, got ${r.reason}`);
  return r.commands;
};
const kinds = (u: string, ctx: object = TRI) => cmds(u, ctx).map((c) => c.type);

describe('#970 — every naming mode resolves identically through all THREE call sites', () => {
  // The property the chokepoint exists to have, asserted directly: one naming mode, three consumers
  // (value, acuteness, bound), same angle. If a fourth mode is ever added to `angleArms`, adding a row
  // here must be all it takes — and if someone re-copies a lane, one of these columns will drift.
  it.each([
    ['triple', 'זווית ABC', 'B', 'A', 'C'],
    ['single vertex', 'זוית A', 'A', 'B', 'C'],
    ['segment pair (#967)', 'הזווית בין BD ל-BA', 'B', 'D', 'A'],
  ])('%s — value, acuteness and bound name the same angle', (_l, naming, vertex, ray1, ray2) => {
    const value = cmds(`${naming} = 40`, TRI).find((c) => c.type === 'set-angle') as never;
    expect(value).toMatchObject({ vertex, ray1, ray2 });

    const acute = cmds(`${naming} קהה`, TRI).find((c) => c.type === 'set-angle-acuteness') as never;
    expect(acute).toMatchObject({ vertex, ray1, ray2 });

    const bound = cmds(`${naming} גדולה מ-40`, TRI).find((c) => c.type === 'set-angle-bound') as never;
    expect(bound).toMatchObject({ vertex, ray1, ray2 });
  });

  it('the acuteness form draws its arms in EVERY naming mode', () => {
    // Was true for the triple lane and false for the single-vertex lane, though the rule's docstring
    // claimed it for both. Unifying the reader unified this too; the commands are idempotent.
    for (const naming of ['זווית ABC', 'זוית A', 'הזווית בין BD ל-BA']) {
      expect(kinds(`${naming} חדה`, TRI).filter((t) => t === 'segment'), naming).toHaveLength(2);
    }
  });
});

describe('#970 — a refusal reaches the bound and acuteness lanes too', () => {
  it('a DISJOINT segment pair is refused BY NAME in all three lanes, not escalated', () => {
    // Before the migration the value lane refused by name («angle-sides-disjoint») while the bound and
    // acuteness lanes escalated to the paid model — the same sentence answered two ways depending on
    // which rule happened to read it. `boundOperand`'s return type had no channel for a refusal at all,
    // which is why it needed a signature change rather than a regex.
    for (const u of [
      'הזווית בין BD ל-CA היא 40',
      'הזווית בין BD ל-CA קהה',
      'הזווית בין BD ל-CA גדולה מ-40',
      'הזווית בין BD ל-CA בין 40 ל-60',
      'הזווית בין BD ל-CA > 40',
    ]) {
      const r = res(u) as { ok: boolean; reason?: string; s1?: string; s2?: string };
      expect(r.ok, u).toBe(false);
      // The clarify surfaces as the result's `reason`, carrying the two segment names back to the student.
      expect(r.reason, u).toBe('angle-sides-disjoint');
      expect([r.s1, r.s2], u).toEqual(['BD', 'CA']);
    }
  });

  it('an AMBIGUOUS single vertex ASKS in all three lanes (ADR-490 — an ask beats a paid guess)', () => {
    // A has three arms, so «זווית A» names one of several angles. The copies escalated; the shared
    // reader asks for the three-letter form, which already builds.
    for (const u of ['זווית A = 40', 'זווית A קהה', 'זווית A גדולה מ-40']) {
      const r = res(u, FAN) as { ok: boolean; reason?: string; vertex?: string };
      expect(r.ok, u).toBe(false);
      expect(r.reason, u).toBe('ambiguous-angle');
      expect(r.vertex, u).toBe('A'); // it names the vertex it cannot resolve, so the ask is specific
    }
  });

  it('two spaced labels no longer resolve to the FIRST one', () => {
    // The copies used `labelRun(_, 1)`, which returns the first label even when others are present, so
    // «זווית A B קהה» built an acuteness at A and silently dropped B. `angleArms` requires exactly one
    // label and escalates instead — the honest answer for a statement naming two things.
    expect(res('זווית A B קהה').ok).toBe(false);
  });
});

describe('#970 — the lanes that must NOT have changed', () => {
  it('the ordinary bound, length and variable forms are untouched', () => {
    expect(kinds('זווית ABC גדולה מ-40')).toContain('set-angle-bound');
    expect(kinds('|AB| > 5')).toContain('set-length-bound');
    expect(kinds('α > 40')).toContain('measure-bound');
    expect(kinds('AB בין 5 ל-9')).toContain('set-length-bound');
    expect(kinds('40 < זווית ABC < 60')).toContain('set-angle-bound');
  });

  it('a two-sided range still carries both ends, in either notation', () => {
    const g = cmds('זווית ABC בין 40 ל-60').find((c) => c.type === 'set-angle-bound') as never;
    expect(g).toMatchObject({ min: 40, max: 60 });
    const s = cmds('40 < זווית ABC < 60').find((c) => c.type === 'set-angle-bound') as never;
    expect(s).toMatchObject({ min: 40, max: 60 });
  });

  it('an empty window is still deferred, not silently no-opped', () => {
    expect(res('60 < זווית ABC < 40').ok).toBe(false);
  });

  it('the acuteness verdict itself is unchanged', () => {
    expect(cmds('זווית ABC קהה').find((c) => c.type === 'set-angle-acuteness')).toMatchObject({ obtuse: true });
    expect(cmds('זווית ABC חדה').find((c) => c.type === 'set-angle-acuteness')).toMatchObject({ obtuse: false });
    expect(cmds('angle ABC is obtuse').find((c) => c.type === 'set-angle-acuteness')).toMatchObject({ obtuse: true });
  });
});
