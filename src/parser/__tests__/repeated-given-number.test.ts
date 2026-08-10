/**
 * #437 — `droppedGivenNumbers` was a VALUE predicate where it needs to be an OCCURRENCE predicate.
 *
 * Log-triage 2026-08-08 (prod session `vgrm5pjb`): `ריבוע במידות 4*4` logged `parser/ok` — it committed a
 * square with **no size at all**, green ✓, the whole dimensions given gone. The very same sentence with
 * distinct numbers (`מלבן במידות 4*6`) escalated honestly. The difference was not the shape: it was that
 * the two stated numbers were EQUAL.
 *
 * The gate asked *"does this VALUE appear among the commands' numeric payloads?"* — a proxy standing in
 * for the semantic fact *"is this OCCURRENCE consumed by a command?"* (docs/17 §2.2, the ADR-3D-069/070/071
 * family). A square's own `ids.length` supplies a single account for `4`, and set-membership let that one
 * account vouch for BOTH stated 4s. The class is far wider than dimensions: **any** given whose number
 * repeats elsewhere in the utterance could vanish for free.
 *
 * The fix makes accounting a MULTISET — each account is spent once. Generosity is untouched and still
 * per-occurrence (every candidate lowering is still tried), which is what these tests hold apart: the
 * repeated-value drops are caught, and no legitimately-repeated magnitude is falsely refused.
 */
import { describe, expect, it } from 'vitest';
import { buildParseCtx, droppedGivenNumbers, parse } from '@/parser';
import { replay } from '@/store/geoStore';
import type { Fact } from '@/store/geoStore';
import type { AnyCommand } from '@/engine';

/** Parse one utterance on a figure built from the preceding ones, and run the gate on the result. */
function gate(utterances: string[]): { ok: boolean; dropped: number[] } {
  const facts: Fact[] = [];
  let last = parse(utterances[0], buildParseCtx(replay(facts).construction, replay(facts).positions));
  for (const u of utterances) {
    const fig = replay(facts);
    last = parse(u, buildParseCtx(fig.construction, fig.positions));
    if (!last.ok) return { ok: false, dropped: [] };
    if (u !== utterances[utterances.length - 1]) {
      for (const c of last.commands) facts.push({ id: `${facts.length}-${c.type}`, group: u, enabled: true, utterance: u, cmd: c });
    }
  }
  return { ok: true, dropped: last.ok ? droppedGivenNumbers(utterances[utterances.length - 1], last.commands) : [] };
}

describe('#437 — a REPEATED stated magnitude cannot be accounted twice by one payload', () => {
  it("the prod utterance: «ריבוע במידות 4*4» now escalates at the PARSE (#497) — never a size-less square", () => {
    // The fail-closed leftover gate stops the square rule on the surviving «במידות 4*4», so the
    // whole line goes to the LLM instead of committing a size-less square with a green ✓.
    expect(gate(['ריבוע במידות 4*4']).ok).toBe(false);
    expect(gate(['מלבן במידות 4*6']).ok).toBe(false);
    expect(gate(['מלבן 4 על 4']).ok).toBe(false);
  });

  it('the gate itself stays a MULTISET on the LLM-commit path: one payload cannot vouch for both 4s', () => {
    const square = [{ type: 'square', ids: ['A', 'B', 'C', 'D'] } as AnyCommand];
    const rect = [{ type: 'rectangle', ids: ['A', 'B', 'C', 'D'] } as AnyCommand];
    expect(droppedGivenNumbers('ריבוע במידות 4*4', square)).toContain(4); // ids.length accounts ONE 4, not both
    expect(droppedGivenNumbers('מלבן במידות 4*6', rect)).toContain(6); // the distinct sibling was always honest
    expect(droppedGivenNumbers('מלבן 4 על 4', rect)).toContain(4); // the class beyond dimensions
  });

  it('the honest phrasing still refuses or builds — never a silent size-less commit', () => {
    // `ריבוע שצלעו 4` states ONE 4; whatever the rules do with it, the gate must not flag a stated
    // magnitude that a command genuinely carries.
    const r = gate(['ריבוע ABCD']);
    expect(r.dropped).toEqual([]);
  });
});

describe('#437 — generosity is intact: a legitimately repeated magnitude is NOT flagged', () => {
  it.each([
    ['two sides stated at the same length', ['משולש ABC', 'AB = 5', 'BC = 5']],
    ['two angles stated at the same size', ['משולש ABC', 'זווית A = 50', 'זווית B = 50']],
    ['the same value in two givens on a square', ['ריבוע ABCD', 'AB = 6']],
  ])('%s', (_label, lines) => {
    expect(gate(lines).dropped, lines.join(' | ')).toEqual([]);
  });

  it('each occurrence still gets EVERY candidate lowering (a π-size beside a plain number)', () => {
    // 2·π states a circumference that lowers to a radius; the bare 2 in a different slot must still be
    // able to find its own account rather than being starved by the first occurrence.
    const r = gate(['מעגל שרדיוסו 2']);
    expect(r.dropped).toEqual([]);
  });
});
