/**
 * «גובה הפירמידה 4» — THE HEIGHT NOUN TAKES A VALUE (#1448, ADR-3D-270).
 *
 * External review, relayed 2026-09-27: every one-sentence spelling was «not understood» while the
 * two-line form («SO גובה הפירמידה» then «SO = 4») worked — a two-spellings bug. The phrase now
 * carries its value: the apex-less forms chain the length claim at APPLY (the foot's letter is
 * minted there), the named forms lower to the same two commands the two-line spelling always was.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { derive3, useGeo3 } from '../store/store3';

const reset = () => {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
};
const submit = (u: string) => useGeo3.getState().submit(u);
const heightLen = () => {
  const d = derive3(useGeo3.getState().facts, useGeo3.getState().seed);
  const pos = d.resolved.positions;
  const s = pos.get('S')!;
  // The foot: the minted point on the base plane straight under S — read it as the nearest
  // non-base-vertex point to S's vertical, i.e. measure |S−foot| as the min over minted points.
  const base = ['A', 'B', 'C', 'D'];
  let best = Infinity;
  for (const [id, p] of pos) {
    if (id === 'S' || base.includes(id)) continue;
    best = Math.min(best, Math.hypot(s.x - p.x, s.y - p.y, s.z - p.z));
  }
  return best;
};

beforeEach(reset);

describe('#1448 — every spelling of the issue table states height 4', () => {
  it.each([
    'גובה הפירמידה 4',
    'גובה הפירמידה הוא 4',
    'גובה הפירמידה = 4',
    'הגובה הוא 4',
    'the height of the pyramid is 4',
  ])('«%s» (apex-less) builds with |apex−foot| = 4', (line) => {
    submit('פירמידה ישרה SABCD');
    submit(line);
    expect(useGeo3.getState().lastError).toBeNull();
    expect(heightLen()).toBeCloseTo(4, 4);
  });

  it.each([
    ['SO גובה הפירמידה, SO = 4'],
    ['SO גובה הפירמידה ואורכו 4'],
    ['גובה הפירמידה SO = 4'],
  ])('«%s» (named) builds with |SO| = 4', (line) => {
    submit('פירמידה ישרה SABCD');
    submit(line);
    expect(useGeo3.getState().lastError).toBeNull();
    const d = derive3(useGeo3.getState().facts, useGeo3.getState().seed);
    const s = d.resolved.positions.get('S')!;
    const o = d.resolved.positions.get('O')!;
    expect(Math.hypot(s.x - o.x, s.y - o.y, s.z - o.z)).toBeCloseTo(4, 4);
  });

  it('the value-less spellings keep their prior behaviour — «SO גובה הפירמידה» then «SO = 4»', () => {
    submit('פירמידה ישרה SABCD');
    submit('SO גובה הפירמידה');
    submit('SO = 4');
    const d = derive3(useGeo3.getState().facts, useGeo3.getState().seed);
    const s = d.resolved.positions.get('S')!;
    const o = d.resolved.positions.get('O')!;
    expect(Math.hypot(s.x - o.x, s.y - o.y, s.z - o.z)).toBeCloseTo(4, 4);
  });

  it('a bare «הגובה» without a value stays guidance — never a guessed construct (#467)', () => {
    submit('פירמידה ישרה SABCD');
    const before = useGeo3.getState().facts.length;
    submit('הגובה');
    expect(useGeo3.getState().facts.length).toBe(before); // nothing recorded
  });
});
