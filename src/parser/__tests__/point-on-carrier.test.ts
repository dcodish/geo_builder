/**
 * A point ON a NAMED carrier — "E על מיתר AC" / "E on chord AC" / "E על הצלע AC" / "E on segment AC".
 *
 * Regression for the operator-reported "E על מיתר AC was not-understood". The point-on rules required
 * the carrier's two labels to come immediately after על/on, so a descriptor noun (chord/side/segment/
 * diagonal, He or En) between the connector and the labels made them miss — and with a circle in
 * context the `chord`/`segment` carrier-defining rule grabbed the bare "AC" run and silently dropped
 * the named rider point. A shared CARRIER_NOUN set now lets the point-on rules skip the noun, and the
 * carrier-defining rules bail on a "<point> on <carrier> AB" utterance.
 */
import { describe, it, expect } from 'vitest';
import { parse } from '@/parser';

// ADR-250: the stated carrier is DRAWN too — the batch is [segment, point-on-segment].
const onSeg = (id: string, a: string, b: string) => [
  { type: 'segment', a, b },
  { type: 'point-on-segment', id, a, b },
];

describe('point on a named carrier', () => {
  it.each([
    ['E על מיתר AC'],
    ['נקודה E על מיתר AC'],
    ['E על הצלע AC'],
    ['E על הקטע AC'],
    ['E על האלכסון AC'],
    ['E on chord AC'],
    ['E on segment AC'],
    ['E on diagonal AC'],
    ['E on the chord AC'],
  ])('%s → E on segment AC (carrier noun skipped, E kept)', (utterance) => {
    const r = parse(utterance);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.commands).toEqual(onSeg('E', 'A', 'C'));
  });

  it('with a circle in context the chord endpoints land ON the circle and E rides the chord', () => {
    const r = parse('E על מיתר AC', { circles: ['O'], points: ['A', 'C'] });
    expect(r.ok).toBe(true);
    if (r.ok)
      expect(r.commands).toEqual([
        { type: 'point-on-circle', id: 'A', circle: 'circle-O' },
        { type: 'point-on-circle', id: 'C', circle: 'circle-O' },
        { type: 'segment', a: 'A', b: 'C' }, // the stated chord is drawn (ADR-250)
        { type: 'point-on-segment', id: 'E', a: 'A', b: 'C' },
      ]);
  });

  it('still parses a bare carrier DEFINITION (no "on") as the carrier itself', () => {
    for (const u of ['קטע AC', 'segment AC', 'אלכסון AC']) {
      const r = parse(u);
      expect(r.ok, u).toBe(true);
      if (r.ok) expect(r.commands, u).toEqual([{ type: 'segment', a: 'A', b: 'C' }]);
    }
  });
});
