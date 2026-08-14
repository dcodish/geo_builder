/**
 * #529 ([ADR-3D-145](../../docs/06b-decisions-3d.md)) — «המרחק מ X ל-Y» is the same fact as
 * «המרחק בין X ל-Y», and must lower byte-identically. The class: a rule spelling ONE form of a
 * subject students write in several (#494/#513 siblings), whose cost is a silent paid-LLM
 * escalation per use.
 */
import { describe, expect, it } from 'vitest';
import { parse3 } from '../parser/parse3';

const same = (a: string, b: string) => {
  const pa = parse3(a);
  const pb = parse3(b);
  expect(pa.ok, `«${a}»`).toBe(true);
  expect(pb.ok, `«${b}»`).toBe(true);
  if (pa.ok && pb.ok) expect(JSON.stringify(pb.commands), `«${b}» ≡ «${a}»`).toBe(JSON.stringify(pa.commands));
};

describe('#529 — the מ…ל framing lowers byte-identically to בין…ל', () => {
  it('point → named plane (the prod row)', () => {
    same('המרחק בין A למישור π2 הוא 5', 'המרחק מ A למישור π2 הוא 5');
  });
  it('point → point-run plane', () => {
    same('המרחק בין D למישור ABC הוא 6', 'המרחק מ D למישור ABC הוא 6');
  });
  it('point → line', () => {
    same('המרחק בין D לישר AB הוא 5', 'המרחק מ D לישר AB הוא 5');
  });
  it('segment → segment', () => {
    same('המרחק בין AB לבין CD הוא 3', 'המרחק מ AB ל-CD הוא 3');
  });
  it('the dashed spelling too («מ-A»)', () => {
    same('המרחק בין A למישור π2 הוא 5', 'המרחק מ-A למישור π2 הוא 5');
  });
  it('the En mirror already owned from/to — asserted so the pair can never diverge', () => {
    same('the distance between D and plane ABC is 6', 'the distance from D to plane ABC is 6');
  });
});
