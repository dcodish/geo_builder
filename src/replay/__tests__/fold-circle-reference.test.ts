/**
 * #2083 ([ADR-646](../../../docs/06-decisions.md#adr-646)) — A SIZELESS CIRCLE STATEMENT IS A REFERENCE, NOT A RESIZE.
 *
 * THE fold rule (`foldCommand`, ADR-011 / ADR-578) resized a re-stated standalone circle in place whatever the
 * command said about size, so a `circle O … freeRadius` (or `ifAbsent`) re-emitted by a sentence that only
 * NAMES the circle («המעגלים O ו-P נחתכים בנקודות X ו-Y») replaced the student's «מעגל O ברדיוס 3». When the
 * circle was defined inside a bigger step (an inscribed triangle, an incircle, a through-circle) the fold
 * appended instead and `applyCommand`'s `circle` case overwrote the radius spec. Both seams now read one
 * predicate (`isSizelessCircle`); only a stated radius re-states a circle's size.
 */
import { describe, expect, it } from 'vitest';
import { foldCommand, type Fact } from '@/replay/core';
import { applyCommand } from '@/engine/apply';
import { circleDefinedBy, isSizelessCircle, referencesCircle } from '@/engine/lower';
import type { AnyCommand, Command, Construction, GeoObject } from '@/engine';

let n = 0;
const mint = (cmd: AnyCommand): Fact => ({ id: `f${n++}`, cmd, enabled: true, group: `g${n}` }) as Fact;
const fact = (cmd: AnyCommand, group?: string, enabled = true): Fact => ({ id: `f${n++}`, cmd, enabled, group: group ?? `g${n}` }) as Fact;

const stated: Command = { type: 'circle', id: 'circle-O', center: 'O', radius: 3 };
const free: Command = { type: 'circle', id: 'circle-O', center: 'O', radius: 5, freeRadius: true };
const ensure: Command = { type: 'circle', id: 'circle-O', center: 'O', radius: 5, freeRadius: true, ifAbsent: true };
const ensureOnly: Command = { type: 'circle', id: 'circle-O', center: 'O', radius: 5, ifAbsent: true };

describe('#2083 — the predicate', () => {
  it('a stated radius states a size; freeRadius / ifAbsent do not', () => {
    expect(isSizelessCircle(stated)).toBe(false);
    expect(isSizelessCircle(free)).toBe(true);
    expect(isSizelessCircle(ensure)).toBe(true);
    expect(isSizelessCircle(ensureOnly)).toBe(true);
    expect(isSizelessCircle({ type: 'circle-through', id: 'circle-O', center: 'O', through: 'A' })).toBe(false);
  });
  it('the three circle-defining kinds name their circle', () => {
    expect(circleDefinedBy(stated)).toEqual({ id: 'circle-O', center: 'O' });
    expect(circleDefinedBy({ type: 'circle-through', id: 'circle-O', center: 'O', through: 'A' })?.id).toBe('circle-O');
    expect(circleDefinedBy({ type: 'circumcircle', id: 'circle-O', center: 'O', a: 'A', b: 'B', c: 'C' } as Command)?.id).toBe('circle-O');
    expect(circleDefinedBy({ type: 'free-point', id: 'A', x: 0, y: 0 })).toBeNull();
  });
});

describe('#2083 — foldCommand: a sizeless restatement leaves the list unchanged', () => {
  it.each([['freeRadius', free], ['freeRadius + ifAbsent', ensure], ['ifAbsent', ensureOnly]])('standalone stated circle, %s → same array', (_n, cmd) => {
    const facts = [fact(stated)];
    expect(foldCommand(facts, cmd, mint)).toBe(facts);
  });

  it('a circle inside a bigger step (inscribed triangle) → same array, never appended', () => {
    const facts = [
      fact(stated, 'tri'),
      fact({ type: 'point-on-circle', id: 'A', circle: 'circle-O', theta: 1 } as Command, 'tri'),
      fact({ type: 'triangle', ids: ['A', 'B', 'C'] } as Command, 'tri'),
    ];
    expect(foldCommand(facts, free, mint)).toBe(facts);
  });

  it('a through-circle (incircle / «שעובר דרך A») and a circumcircle are referenced too', () => {
    for (const def of [
      { type: 'circle-through', id: 'circle-O', center: 'O', through: 'A' },
      { type: 'circumcircle', id: 'circle-O', center: 'O', a: 'A', b: 'B', c: 'C' },
    ] as Command[]) {
      const facts = [fact(def)];
      expect(foldCommand(facts, free, mint)).toBe(facts);
    }
  });

  // #2119 (ADR-683): a second, DIFFERENT stated radius is two statements — appended, so the letter system refuses it
  // naming the first (operator ruling 2026-10-15). It used to resize in place (ADR-011's "a re-stated circle resizes").
  it('a different stated radius is appended, never an in-place resize', () => {
    const facts = [fact(stated)];
    const out = foldCommand(facts, { ...stated, radius: 4 }, mint);
    expect(out).toHaveLength(2);
    expect((out[0].cmd as { radius: number }).radius).toBe((stated as { radius: number }).radius);
  });

  // #2480 (ADR-757): a later line never rewrites a committed row — the size is the later line's own fact, and the
  // engine's upsert (ADR-011) gives the circle that size. Only within ONE batch does the in-place resize remain.
  it('a size given to a committed sizeless circle is appended; the earlier fact is untouched (ADR-757)', () => {
    const facts = [fact(free)];
    const out = foldCommand(facts, { ...stated, radius: 4 }, mint);
    expect(out).toHaveLength(2);
    expect(out[0]).toBe(facts[0]);
    expect((out[1].cmd as { radius: number }).radius).toBe(4);
  });
  it('within one batch a size given to the sizeless circle it just added still resizes it in place (ADR-011)', () => {
    const facts = [fact(free)];
    const out = foldCommand(facts, { ...stated, radius: 4 }, mint, undefined, 0);
    expect(out).toHaveLength(1);
    expect((out[0].cmd as { radius: number }).radius).toBe(4);
  });

  it('a sizeless circle with no defining fact is created (appended)', () => {
    const facts = [fact({ type: 'free-point', id: 'A', x: 0, y: 0 })];
    expect(foldCommand(facts, free, mint)).toHaveLength(2);
  });

  it('a free circle naming ANOTHER centre still states the centre (not a reference); an ensure-exists never does', () => {
    const anon: Command = { type: 'circle', id: 'circle-O', center: '@ctr-O', radius: 5, freeRadius: true, autoCenter: true };
    const facts = [fact(anon)];
    expect(referencesCircle(free, { id: 'circle-O', center: '@ctr-O' })).toBe(false);
    expect(foldCommand(facts, free, mint)).not.toBe(facts);
    expect(referencesCircle(ensureOnly, { id: 'circle-O', center: '@ctr-O' })).toBe(true);
    expect(foldCommand(facts, ensureOnly, mint)).toBe(facts);
  });

  // The step-aside reading (resolveBinds) is locked at the real door: src/__tests__/issue-1673-hidden-centre.test.ts
  // («AB קוטר» · «מעגל O» declares a NEW circle O).

  it('an UNTICKED definition is not a reference target: the old in-place rule stands', () => {
    const facts = [fact(stated, undefined, false)];
    const out = foldCommand(facts, free, mint);
    expect(out).not.toBe(facts);
  });
});

describe('#2083 — applyCommand: a sizeless circle never overwrites an existing circle', () => {
  const empty: Construction = { objects: [], constraints: [] };
  const circ = (c: Construction) => c.objects.find((o) => o.kind === 'circle' && o.id === 'circle-O') as Extract<GeoObject, { kind: 'circle' }>;

  it.each([['freeRadius', free], ['ifAbsent', ensureOnly]])('stated radius kept under %s', (_n, cmd) => {
    const c = applyCommand(applyCommand(empty, stated), cmd);
    expect(circ(c).radius).toEqual({ via: 'length', value: 3 });
  });

  it('a through-point kept', () => {
    const base = applyCommand(applyCommand(empty, { type: 'free-point', id: 'A', x: 3, y: 0 }), { type: 'circle-through', id: 'circle-O', center: 'O', through: 'A' });
    expect(circ(applyCommand(base, free)).radius).toEqual({ via: 'through', point: 'A' });
  });

  it('a stated radius still replaces (ADR-011)', () => {
    const c = applyCommand(applyCommand(empty, stated), { ...stated, radius: 4 });
    expect(circ(c).radius).toEqual({ via: 'length', value: 4 });
  });
});
