/**
 * #574 ([ADR-447](../../../docs/06-decisions.md#adr-447)) — anonymous ids never reach a rendered
 * string raw. Exercised on the OPERATOR'S figure (the #566/#572 fixture): the incircle machinery's
 * `@ctr-P` / `@f-XY` ids are exactly what leaked into the coincidence notice.
 */
import { describe, expect, it } from 'vitest';
import { anonPointDescriptor, isAnonymousId, visibleCoincidences } from '../pointDescriptions';
import { deserializeFigure } from '@/store/figureFile';
import { replay } from '@/store/geoStore';
import raw from '../../__tests__/fixtures/issue-572-load-collapse.geo.json?raw';

const construction = (() => {
  const r = deserializeFigure(raw);
  if (!r.ok) throw new Error('fixture must deserialize');
  return replay(r.file.facts, r.file.seed).construction;
})();

describe('#574 — anonPointDescriptor', () => {
  it("the incircle's feet describe as TOUCH points (a foot from a circle's centre IS its tangency)", () => {
    for (const [id, seg] of [
      ['@f-CA', 'CA'],
      ['@f-AB', 'AB'],
      ['@f-BC', 'BC'],
    ] as const) {
      expect(anonPointDescriptor(id, construction), id).toEqual({ key: 'describe.touchOn', params: { seg } });
    }
  });

  it('the anonymous incentre describes as the circle centre', () => {
    expect(anonPointDescriptor('@ctr-P', construction)).toEqual({ key: 'describe.circleCentre' });
  });

  it('a student-named id renders as itself (null — no description substituted)', () => {
    for (const id of ['O', 'A', 'B', 'C']) expect(anonPointDescriptor(id, construction), id).toBeNull();
  });

  it('an unknown anonymous id still never leaks — the helper-point fallback', () => {
    expect(anonPointDescriptor('@zz-unknown', construction)).toEqual({ key: 'describe.helperPoint' });
    expect(anonPointDescriptor('~hidden', construction)).toEqual({ key: 'describe.helperPoint' });
  });
});

describe('#581 (ADR-447 Am. 1) — a coincidence with an ANONYMOUS member is not shown at all', () => {
  it("the operator ruling's case — the #566 pair O + @f-CA renders NOTHING", () => {
    expect(visibleCoincidences([['O', '@f-CA']])).toEqual([]);
  });

  it('the predicate: any machinery-minted member hides the pair; a student-named pair stays', () => {
    expect(visibleCoincidences([['~helper', 'B']])).toEqual([]);
    expect(
      visibleCoincidences([
        ['O', 'M'],
        ['A', '@ctr-P'],
      ])
    ).toEqual([['O', 'M']]);
    expect(isAnonymousId('O')).toBe(false);
    expect(isAnonymousId('@f-CA')).toBe(true);
    expect(isAnonymousId('~h')).toBe(true);
  });
});
