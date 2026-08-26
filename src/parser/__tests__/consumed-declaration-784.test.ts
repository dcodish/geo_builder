/**
 * #784 + #785 (ADR-462) — the lowering DECLARES what it consumed, and the gate ASKS.
 *
 * Both gates answered *"is everything the student stated accounted for?"* by pattern-matching the
 * lowering's OUTPUT: a stated number had to appear literally among the payloads, a stated verb had to
 * produce a command from that verb's token family. That question is wrong for every lowering that
 * TRANSFORMS what it read, and four operator-reported, fixed, CORPUS-LOCKED constructions were being
 * refused at the commit seam and escalated to the paid LLM because of it:
 *
 *   prefix «שני מעגלים O1 ו O2 משיקים מבחוץ»
 *     היקף מעגל O1 הוא 6      → set-radius value:0.9549   droppedGivenNumbers [6]  ✗
 *   prefix «משולש ABC»
 *     GE קטע אמצעים מקביל ל AB → midpoint, midpoint, segment   droppedGivenVerbs [מקביל]  ✗
 *   prefix «מלבן ABCD»
 *     AB ו- AD משיקים למעגל O  → bisector, point-on-line, foot, foot, circle-through  [משיק] ✗
 *   prefix «משולש ABC חסום במעגל» + «מנקודה D יוצא משיק למעגל בנקודה B»
 *     המשך CA נפגש עם המשיק בנקודה D → set-line              droppedGivenVerbs [משיק]  ✗
 *
 * Every figure was drawn CORRECTLY — the scenarios assert exactly that. Only the commit seam refused.
 * The «6π» spelling escaped the numeric gate, and escaped it by an exemption for the SYMBOL rather than
 * because the class was handled: the ordinary plain-number circumference was the broken one.
 */
import { describe, expect, it } from 'vitest';
import { droppedGivenNumbers, droppedGivenVerbs, parse } from '@/parser';
import { ctxOf } from '../../__tests__/scenarios-corpus';
import { useGeoStore } from '@/store/geoStore';
import { honestyGateReport } from '@/app/honestyGates';
import type { AnyCommand } from '@/engine';

/** Build a prefix the way submit does, then parse one more line against it. */
function afterPrefix(prefix: string[], utterance: string): { cmds: AnyCommand[]; utterance: string } {
  useGeoStore.getState().clear();
  for (const u of prefix) {
    const r = parse(u, ctxOf(useGeoStore.getState().facts));
    expect(r.ok, `prefix step must parse: «${u}»`).toBe(true);
    if (!r.ok) continue;
    useGeoStore.getState().executeMany(r.commands, u);
  }
  const r = parse(utterance, ctxOf(useGeoStore.getState().facts));
  expect(r.ok, `«${utterance}» must parse — this is a GATE question, not a grammar one`).toBe(true);
  useGeoStore.getState().clear();
  return { cmds: r.ok ? r.commands : [], utterance };
}

describe('#784 — a DERIVED magnitude is accounted by declaration, not by hunting for the literal', () => {
  const PREFIX = ['שני מעגלים O1 ו O2 משיקים מבחוץ'];

  it.each(['היקף מעגל O1 הוא 6', 'היקף מעגל O1 הוא 6pi', 'היקף מעגל O1 הוא 6π'])(
    'the gate is clean on «%s» — all three lower identically well',
    (u) => {
      const { cmds } = afterPrefix(PREFIX, u);
      expect(droppedGivenNumbers(u, cmds)).toEqual([]);
    },
  );

  it('the lowering carries the number the STUDENT wrote, not the value it derived', () => {
    const { cmds } = afterPrefix(PREFIX, 'היקף מעגל O1 הוא 6');
    const radius = cmds.find((c) => c.type === 'set-radius');
    expect(radius?.consumed?.numbers).toEqual([6]);
    // …and the derived radius is genuinely a different number, which is the whole difficulty.
    expect((radius as { value: number }).value).toBeCloseTo(6 / (2 * Math.PI), 6);
  });

  it('the multiset discipline survives — a declaration pays for ONE occurrence (ADR-437)', () => {
    // A declared 6 must not vouch for a second, unrelated 6 elsewhere in the sentence.
    const cmds: AnyCommand[] = [{ type: 'set-radius', circle: 'circle-O1', value: 0.95, consumed: { numbers: [6] } }];
    expect(droppedGivenNumbers('היקף מעגל O1 הוא 6', cmds)).toEqual([]);
    expect(droppedGivenNumbers('היקף מעגל O1 הוא 6 ורדיוס מעגל O2 הוא 6', cmds)).toEqual([6]);
  });
});

describe('#785 — a verb encoded STRUCTURALLY is evidence, because the rule says so', () => {
  it('the midsegment theorem IS the parallelism («מקביל» is not dropped)', () => {
    const { cmds, utterance } = afterPrefix(['משולש ABC'], 'GE קטע אמצעים מקביל ל AB');
    expect(droppedGivenVerbs(utterance, cmds)).toEqual([]);
    // No `parallel` command is emitted — emitting one would double-state a relation the figure forces.
    expect(cmds.some((c) => c.type === 'set-parallel')).toBe(false);
    expect(cmds.every((c) => c.consumed?.verbs?.includes('מקביל/parallel'))).toBe(true);
  });

  it('the corner-tangent lowering encodes tangency as equal perpendicular distances', () => {
    const { cmds, utterance } = afterPrefix(['מלבן ABCD'], 'AB ו- AD משיקים למעגל O');
    expect(droppedGivenVerbs(utterance, cmds)).toEqual([]);
    // #226's structural pass covers foot + point-on-circle; this shape is foot + circle-through.
    expect(cmds.some((c) => c.type === 'circle-through')).toBe(true);
  });

  it('a REFERENCED tangent is consumed too — the word points at ink already drawn', () => {
    const { cmds, utterance } = afterPrefix(
      ['משולש ABC חסום במעגל', 'מנקודה D יוצא משיק למעגל בנקודה B'],
      'המשך CA נפגש עם המשיק בנקודה D',
    );
    expect(droppedGivenVerbs(utterance, cmds)).toEqual([]);
    expect(cmds).toHaveLength(1); // the whole lowering is one set-line — nothing mints a tangency token
  });

  it('the gate has NOT been blunted: a verb with no evidence and no declaration still trips', () => {
    // The point of the mechanism is that only a rule that ACTUALLY encoded the verb may claim it.
    expect(droppedGivenVerbs('AB משיק למעגל O', [{ type: 'segment', a: 'A', b: 'B' }])).toEqual(['משיק/tangent']);
    expect(droppedGivenVerbs('AB מקביל ל CD', [{ type: 'segment', a: 'A', b: 'B' }])).toEqual(['מקביל/parallel']);
  });

  it('a declaration does not bypass the #226 OPERAND accounting', () => {
    // A lowering that declares tangency but references the WRONG labels must still read as dropped:
    // the declaration says "I encoded this verb", not "stop checking".
    const cmds: AnyCommand[] = [{ type: 'set-line', points: ['X', 'Y', 'Z'], consumed: { verbs: ['משיק/tangent'] } }];
    expect(droppedGivenVerbs('AB משיק למעגל O', cmds)).toEqual(['משיק/tangent']);
  });
});

describe('#784/#785 — the WHOLE battery clears, which is what the commit seam actually asks', () => {
  // The two gates passing is necessary and not sufficient: `runSubmit` and `commitEdit` ask
  // `honestyGateReport` (#782, ADR-461), which also runs span accounting (ADR-453). A number the
  // numeric gate now forgives could still be an unaccounted SPAN, and the student would see the same
  // refusal from one gate over. So the end-to-end claim is asserted end-to-end.
  it.each([
    [['שני מעגלים O1 ו O2 משיקים מבחוץ'], 'היקף מעגל O1 הוא 6'],
    [['שני מעגלים O1 ו O2 משיקים מבחוץ'], 'היקף מעגל O1 הוא 6π'],
    [['משולש ABC'], 'GE קטע אמצעים מקביל ל AB'],
    [['מלבן ABCD'], 'AB ו- AD משיקים למעגל O'],
    [['משולש ABC חסום במעגל', 'מנקודה D יוצא משיק למעגל בנקודה B'], 'המשך CA נפגש עם המשיק בנקודה D'],
  ])('the seam commits «%s» → «%s»', (prefix, utterance) => {
    useGeoStore.getState().clear();
    for (const u of prefix) {
      const r = parse(u, ctxOf(useGeoStore.getState().facts));
      expect(r.ok, `prefix step must parse: «${u}»`).toBe(true);
      if (r.ok) useGeoStore.getState().executeMany(r.commands, u);
    }
    const ctx = ctxOf(useGeoStore.getState().facts);
    const r = parse(utterance, ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const gates = honestyGateReport(utterance, r.commands, ctx);
    expect(gates.clean, `left unread: ${JSON.stringify(gates.items)}`).toBe(true);
    useGeoStore.getState().clear();
  });
});
