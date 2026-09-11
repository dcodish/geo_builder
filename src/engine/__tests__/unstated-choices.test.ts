/**
 * #973 ([ADR-502](../../../docs/06-decisions.md#adr-502)): a choice the tool makes for an UNSTATED given is
 * SAID, for as long as it is unstated.
 *
 * The engine was already right — ADR-138 leaves "which pair is equal" free and cyclable — but nothing told
 * the student, so one drawing with one visibly equal pair read as the tool asserting it. `unstatedChoices`
 * derives, per figure, every such choice from the enabled facts. Locks in BOTH directions, per the plan:
 * present for each of the four ruled rows; absent for each pinned form; absent for the plain trapezoid (the
 * ruled scope — widening it is a deliberate flip); follows the variant cycle; disappears when the pinning
 * fact is added and returns when that fact is disabled.
 */
import { describe, expect, it } from 'vitest';
import { parse } from '@/parser/parse';
import { buildParseCtx } from '@/parser/context';
import { replay } from '@/replay/core';
import { withVariant } from '@/engine';
import type { Fact } from '@/replay/core';
import { unstatedChoices, UNSTATED_CHOICE_KINDS } from '@/engine/shapeVariants';

/** Facts through the real parse path, context threaded per step (the dof-vacuous.test.ts pattern). */
function factsFrom(steps: string[]): Fact[] {
  const facts: Fact[] = [];
  for (const [gi, u] of steps.entries()) {
    const { construction, positions } = replay(facts, 0);
    const r = parse(u, buildParseCtx(construction, positions));
    if (!r.ok) throw new Error(`no parse: ${u}`);
    for (const cmd of r.commands) facts.push({ id: `g${gi}.${facts.length}`, utterance: u, group: `g${gi}`, cmd, enabled: true });
  }
  return facts;
}
const segs = (pairs: [[string, string], [string, string]][]) => pairs.map((p) => p.map((s) => s.join('')).join('='));

describe('#973 — the four ruled rows are SAID', () => {
  it('«משולש שווה שוקיים ABC»: which vertex is the apex — drawn AB = AC', () => {
    const ch = unstatedChoices(factsFrom(['משולש שווה שוקיים ABC']));
    expect(ch).toHaveLength(1);
    expect(ch[0].kind).toBe('equal-pair');
    if (ch[0].kind !== 'equal-pair') return;
    expect(ch[0].shape).toBe('isosceles');
    expect(segs(ch[0].pairs)).toEqual(['AB=AC']);
  });

  it('«דלתון ABCD»: which diagonal is the axis — drawn AB = AD and CB = CD', () => {
    const ch = unstatedChoices(factsFrom(['דלתון ABCD']));
    expect(ch).toHaveLength(1);
    expect(ch[0].kind).toBe('equal-pair');
    if (ch[0].kind !== 'equal-pair') return;
    expect(ch[0].shape).toBe('kite');
    expect(segs(ch[0].pairs)).toEqual(['AB=AD', 'CB=CD']);
  });

  it('a base-less midsegment: which side the free end rides — E on AC, so DE ∥ BC', () => {
    const ch = unstatedChoices(factsFrom(['משולש ABC', 'קטע אמצעים DE במשולש ABC']));
    expect(ch).toHaveLength(1);
    expect(ch[0].kind).toBe('free-endpoint');
    if (ch[0].kind !== 'free-endpoint') return;
    expect(ch[0].point).toBe('E');
    expect(ch[0].side.join('')).toBe('AC');
    expect(ch[0].parallelTo.join('')).toBe('BC');
  });

  it('«טרפז שווה שוקיים ABCD»: the ASSUMED parallel pair AB ∥ DC, legs AD and BC', () => {
    const ch = unstatedChoices(factsFrom(['טרפז שווה שוקיים ABCD']));
    expect(ch).toHaveLength(1);
    expect(ch[0].kind).toBe('parallel-pair');
    if (ch[0].kind !== 'parallel-pair') return;
    expect(ch[0].parallel.map((s) => s.join(''))).toEqual(['AB', 'DC']);
    expect(ch[0].legs.map((s) => s.join(''))).toEqual(['AD', 'BC']);
  });

  it('the kind list the i18n net walks is complete and non-empty', () => {
    expect(UNSTATED_CHOICE_KINDS).toEqual(['equal-pair', 'parallel-pair', 'free-endpoint']);
  });
});

describe('#973 — pinned forms say NOTHING (the choice is the student’s now)', () => {
  it('«משולש שווה שוקיים ABC (AB=AC)» — the parenthesised pin', () => {
    expect(unstatedChoices(factsFrom(['משולש שווה שוקיים ABC (AB=AC)']))).toEqual([]);
  });
  it('«משולש שווה שוקיים ABC» then «AB=BC» — a later equality pins a DIFFERENT apex', () => {
    expect(unstatedChoices(factsFrom(['משולש שווה שוקיים ABC', 'AB=BC']))).toEqual([]);
  });
  it('«דלתון ABCD» then «AB=AD»', () => {
    expect(unstatedChoices(factsFrom(['דלתון ABCD', 'AB=AD']))).toEqual([]);
  });
  it('a midsegment whose free end was placed: «E על AC»', () => {
    expect(unstatedChoices(factsFrom(['משולש ABC', 'קטע אמצעים DE במשולש ABC', 'E על AC']))).toEqual([]);
  });
  it('«טרפז שווה שוקיים ABCD» then «AB מקביל ל-DC»', () => {
    expect(unstatedChoices(factsFrom(['טרפז שווה שוקיים ABCD', 'AB מקביל ל-DC']))).toEqual([]);
  });
  it('the ruled scope: a plain «טרפז ABCD» assumes the same pair and gets NO note (widening this is a deliberate flip)', () => {
    expect(unstatedChoices(factsFrom(['טרפז ABCD']))).toEqual([]);
  });
  it('a plain triangle, a square, an equilateral triangle: no choice to name', () => {
    expect(unstatedChoices(factsFrom(['משולש ABC']))).toEqual([]);
    expect(unstatedChoices(factsFrom(['ריבוע ABCD']))).toEqual([]);
    expect(unstatedChoices(factsFrom(['משולש שווה צלעות ABC']))).toEqual([]);
  });
});

describe('#973 — the note is DERIVED, so it follows the figure', () => {
  it('«הציגו תצורה אחרת» moves the drawn pair: variant 1 of the isosceles reads AB = BC', () => {
    const facts = factsFrom(['משולש שווה שוקיים ABC']);
    const cycled = facts.map((f) => (f.cmd.type === 'shape-variant' ? { ...f, cmd: withVariant(f.cmd, 1) } : f));
    const ch = unstatedChoices(cycled);
    expect(ch).toHaveLength(1);
    if (ch[0].kind !== 'equal-pair') return;
    expect(segs(ch[0].pairs)).toEqual(['AB=BC']);
  });

  it('adding the pinning fact removes the note; disabling it brings the note back', () => {
    const facts = factsFrom(['משולש שווה שוקיים ABC', 'AB=AC']);
    expect(unstatedChoices(facts)).toEqual([]);
    const disabled = facts.map((f) => (f.cmd.type === 'set-equal' ? { ...f, enabled: false } : f));
    expect(unstatedChoices(disabled)).toHaveLength(1);
  });

  it('a disabled shape fact carries no note', () => {
    const facts = factsFrom(['דלתון ABCD']).map((f) => ({ ...f, enabled: false }));
    expect(unstatedChoices(facts)).toEqual([]);
  });

  it('the note is keyed to the fact that made the choice', () => {
    const facts = factsFrom(['משולש ABC', 'קטע אמצעים DE במשולש ABC']);
    const ch = unstatedChoices(facts);
    const owner = facts.find((f) => f.id === ch[0].factId)!;
    expect(owner.cmd.type).toBe('shape-variant');
  });
});
