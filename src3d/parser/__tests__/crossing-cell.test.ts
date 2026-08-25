/**
 * #755 (ADR-3D-164) — ONE rule owns the line∩plane crossing cell, and the whole matrix is reachable.
 *
 * The operator, 2026-08-19, prod: «G נקודת חיתוך של AC' עם מישור ADE» was refused (`not-understood`)
 * while the engine's `plane-cut` did it. Three rules split this cell and each generalised ONE side:
 * the named-line rule took any plane but only `ℓ`; the π-name rule took any segment but only `π`; the
 * point-run rule took a segment and a run but only in the verb frame with a mandatory «הישר». Their
 * union left exactly one square empty — segment × point-run in the NOUN frame — which is the common
 * case, because a student's crossing line is nearly always an edge or a diagonal of the solid and
 * their plane is nearly always three of its vertices.
 *
 * This is the CLASS test, not the instance: the operands are classified by `readOperand`, so the
 * assertion is over the whole product of {named line, segment} × {π-name, point run} × {verb, noun} ×
 * {he, en} × {either order}. A cell that stops being reachable fails here.
 */
import { describe, expect, it } from 'vitest';
import { parse3 } from '../parse3';

const cmds = (u: string) => {
  const r = parse3(u);
  if (!r.ok) throw new Error(`REFUSED (${r.reason}): ${u}`);
  return r.commands;
};
const types = (u: string) => cmds(u).map((c) => c.type);

/** Every phrasing of "P is where <lineish> meets <planeish>", in both frames, orders and languages. */
const phrasings = (lineTok: string, planeTok: string, id: string, planeNounHe: string, planeNounEn: string): string[] => [
  // verb frame, line first
  `${lineTok} חותך את ${planeNounHe}${planeTok} בנקודה ${id}`,
  `${lineTok} cuts plane ${planeTok} at ${id}`,
  // verb frame, plane first
  `${planeNounHe}${planeTok} חותך את ${lineTok} בנקודה ${id}`,
  `plane ${planeTok} cuts ${lineTok} at ${id}`,
  // noun frame, line first
  `${id} נקודת החיתוך של ${lineTok} עם ${planeNounHe}${planeTok}`,
  `${id} is the intersection of ${lineTok} with ${planeNounEn}${planeTok}`,
  // noun frame, plane first
  `${id} נקודת החיתוך של ${planeNounHe}${planeTok} עם ${lineTok}`,
  `${id} is the intersection of ${planeNounEn}${planeTok} with ${lineTok}`,
];

describe('#755 — the line∩plane crossing cell is total', () => {
  it('named line × π-name → line-plane-point, every frame/order/language', () => {
    for (const u of phrasings('ℓ1', 'π1', 'A', 'המישור ', 'plane ')) expect(types(u)).toEqual(['line-plane-point']);
  });

  it('named line × point run → the run is materialised first, then the crossing', () => {
    for (const u of phrasings('ℓ1', 'ACD', 'E', 'מישור ', 'plane ')) expect(types(u)).toEqual(['plane-through', 'line-plane-point']);
  });

  it('segment × π-name → plane-cut (the shipped V8-b lowering, unchanged)', () => {
    for (const u of phrasings('SA', 'π', 'E', 'המישור ', 'plane ')) expect(types(u)).toEqual(['plane-cut']);
  });

  // #780 (ADR-3D-165): this cell used to name a CARRIER LINE first — `line-through` + `line-plane-point`
  // — which drew a full unbounded line through an operand that was already an edge of the solid. The
  // operand's reading must not depend on how the student named the PLANE, so the segment side now takes
  // the same `plane-cut` lowering the π-name case above has always had: a reference, not a new object.
  it('segment × point run → the run is materialised, then the segment is CUT (no line minted)', () => {
    for (const u of phrasings("AC'", 'ADE', 'G', 'מישור ', 'plane '))
      expect(types(u)).toEqual(['plane-through', 'plane-cut']);
  });

  it("the operator's exact line, and the variants the report lists", () => {
    for (const u of [
      "G נקודת חיתוך של AC' עם מישור ADE",
      "G נקודת החיתוך של AC' עם מישור ADE",
      "G נקודת חיתוך של הקטע AC' עם המישור ADE",
      "G חיתוך המישור ADE עם AC'",
    ])
      expect(cmds(u)).toEqual([
        { type: 'plane-through', name: 'ADE', ids: ['A', 'D', 'E'] },
        { type: 'plane-cut', id: 'G', plane: 'ADE', a: 'A', b: "C'" },
      ]);
  });

  it('the noun is optional on the line side — the #333 form no longer needs «הישר»', () => {
    expect(types("הישר A'C חותך את המישור BC'D בנקודה K")).toEqual(['plane-through', 'plane-cut']);
    expect(types("A'C חותך את המישור BC'D בנקודה K")).toEqual(['plane-through', 'plane-cut']);
  });

  it('the shipped π-name lowerings are byte-for-byte what they were (V8-b)', () => {
    for (const u of ['המישור π חותך את SA בנקודה E', 'plane π cuts SA at E', 'E חיתוך המישור π עם SA', 'E is the intersection of plane π with SA'])
      expect(cmds(u)[0]).toEqual({ type: 'plane-cut', id: 'E', plane: 'π', a: 'S', b: 'A' });
  });

  it('a pair that is NOT line×plane is declined, so the sibling rules keep their cells', () => {
    // plane ∩ plane is the intersection-LINE rule's cell, and it still owns it
    expect(types('ישר החיתוך של מישור ABC עם מישור ABD')).toEqual(['plane-through', 'plane-through', 'plane-plane-line']);
    // segment ∩ segment belongs to the diagonal-crossing rule — this rule must not claim it
    const r = parse3('E נקודת החיתוך של AC ו-BD');
    if (r.ok) expect(r.commands.some((c) => c.type === 'line-plane-point' || c.type === 'plane-cut')).toBe(false);
  });
});
