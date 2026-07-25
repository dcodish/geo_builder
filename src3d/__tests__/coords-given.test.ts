/**
 * Issue #316 / ADR-3D-075 — «D=(8,10,-12)» ≡ «D(8,10,-12)»: the `=` sign must not turn a GIVEN
 * into a refused claim (docs/17 §2.3 — one statement, one semantics; the engine decides HOW).
 *
 * Operator (2026-07-25, reproducing the exam part ג): the book's D(8,10,-12) typed as D=(8,10,-12)
 * refused «הטענה לא מתקיימת בציור» although it is the determining given (S = 3D − 2B = (18,12,−18),
 * the book answer). On an UNDER-DETERMINED figure a coords-eq claim on an existing point now lowers
 * to the pivot pin (the length-eq M1 twin, V7 T2); on a DETERMINED figure it falls through to the
 * claim lane, so the V2 verify-your-answer register (claim-refuted) is preserved.
 */
import { describe, expect, it } from 'vitest';
import { parse3 } from '../parser/parse3';
import { derive3, type Fact3 } from '../store/store3';
import { resolve3 } from '../engine/evaluate';

function build(utts: string[]): Fact3[] {
  return utts.map((u, i) => {
    const r = parse3(u);
    expect(r.ok, `parse: ${u}`).toBe(true);
    return { id: `f${i}`, utterance: u, cmds: r.ok ? r.commands : [], enabled: true };
  });
}

const EXAM = [
  'פירמידה משולשת ABCS',
  'SD=(2/3)SB',
  'F אמצע SC',
  'BC=v',
  'SB=u',
  'FE=u/6-v/6',
  'DE',
  'DE=(0,2,0)',
  'BA=(6,0,6)',
  'B(3,9,-9)',
];

describe('#316 — a coords statement on an under-determined point DRIVES (both spellings)', () => {
  for (const form of ['D=(8,10,-12)', 'D(8,10,-12)']) {
    it(`${form} pins D and determines S = (18, 12, −18), the book answer`, () => {
      const d = derive3(build([...EXAM, form]), 0);
      for (const [id, st] of Object.entries(d.status)) expect(st, id).toBe('ok');
      for (const seed of [0, 1013]) {
        const pos = resolve3(d.construction, seed).positions;
        const S = pos.get('S')!;
        expect(S.x).toBeCloseTo(18, 4);
        expect(S.y).toBeCloseTo(12, 4);
        expect(S.z).toBeCloseTo(-18, 4);
      }
    });
  }

  it('on the now-DETERMINED figure a WRONG coords claim still refuses via the claim lane (the V2 register preserved)', () => {
    const facts = build([...EXAM, 'D=(8,10,-12)', 'A=(1,1,1)']); // A is (9,9,-3) — the claim is false
    const d = derive3(facts, 0);
    const last = facts[facts.length - 1];
    expect(d.status[last.id]).not.toBe('ok');
  });
});
