/**
 * #813 (ADR-3D-181) — A FRAMELESS plane query says what it knows, and why no equation follows.
 *
 * The operator (2026-08-29): «קובייה ABCDA'B'C'D'», «|AB| = 4», «DB», «AB = u», «BC = v», «מישור DBB'D'»,
 * «AA' = w» — then asked «מישור DBB'D'» and got «לא נקבע על ידי הנתונים», while the same panel printed
 * «w מקביל למישור DBB'D'», «|DB| = 4√2», and the area query answered 16√2.
 *
 * The refusal of the EQUATION is right (no frame → the d-term is gauge, #315). The defect was one note
 * for two states — "no frame" and "genuinely undetermined" — and a lane that answered only one of a
 * plane's properties. Now: the frameless case has its own note, and the answer carries the plane's
 * seed-invariant properties through the panel's and the scalar lane's own derivations.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { answerQuery } from '../engine/queries';
import { derive3, useGeo3 } from '../store/store3';

function reset() {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
}
const submit = (u: string) => useGeo3.getState().submit(u);
const state = () => useGeo3.getState();
const ask = (text: string) => answerQuery(derive3(state().facts, state().seed).construction, text, state().seed);

const FIGURE = ["קובייה ABCDA'B'C'D'", '|AB| = 4', 'DB', 'AB = u', 'BC = v', "מישור DBB'D'", "AA' = w"];

describe('#813 — the operator’s cube', () => {
  beforeEach(reset);

  it('«מישור DBB\'D\'» answers the shape it knows, with the no-frame note — never «לא נקבע»', () => {
    FIGURE.forEach(submit);
    expect(state().lastError).toBeNull();
    const r = ask("מישור DBB'D'");
    expect(r.note).toBe('noFrame');
    expect(r.answer, JSON.stringify(r)).not.toBeNull();
    // the same numbers the scalar lane gives — one derivation, so the two cannot disagree
    const area = ask("שטח DBB'D'").answer!;
    const db = ask('|DB|').answer!;
    expect(r.answer).toContain(`S(DBB'D') = ${area}`);
    expect(r.answer).toContain(`|DB| = ${db}`);
    expect(r.answer).toContain("|BB'| = 4");
    // and the relation the panel prints inches above
    expect(r.answer).toMatch(/w ∥ DBB'D'/);
  });

  it('the equation is still refused frameless — and answers once the frame is stated', () => {
    FIGURE.forEach(submit);
    expect(ask("מישור DBB'D'").answer).not.toMatch(/[xyz]/);
    // ONE coordinate places the cube but leaves it free to rotate about A — the equation is then
    // genuinely undetermined and the FRAMED note says so (the two states now read differently)
    submit('A(0,0,0)');
    expect(state().lastError).toBeNull();
    const framed = ask("מישור DBB'D'");
    expect(framed.answer).toBeNull();
    expect(framed.note).toBe('undetermined');
    ['B(4,0,0)', 'D(0,4,0)'].forEach(submit);
    expect(state().lastError).toBeNull();
    const r = ask("מישור DBB'D'");
    expect(r.note).toBeUndefined();
    expect(r.answer, JSON.stringify(r)).toMatch(/x|y|z/);
    expect(r.answer).toBe('x + y - 4 = 0'); // the standard form (the parametric one rides only when its anchor/edges are stable — the mirror is still free here)
  });

  it('a bare run «מישור ABC» on a frameless cube reports the same way', () => {
    ["קובייה ABCDA'B'C'D'", '|AB| = 4'].forEach(submit);
    const r = ask('מישור ABC');
    expect(r.note).toBe('noFrame');
    expect(r.answer).toContain('S(ABC) = 8');
    expect(r.answer).toContain('|AB| = 4');
  });

  it('with NO scale either, the lengths drop and the note carries the reply alone', () => {
    ["קובייה ABCDA'B'C'D'"].forEach(submit);
    const r = ask('מישור ABC');
    expect(r.note).toBe('noFrame');
    expect(r.answer).toBeNull();
  });

  it('a genuinely under-determined plane in a FRAMED figure still says «לא נקבע»', () => {
    ["תיבה ABCDA'B'C'D'", 'A(0,0,0)', 'B(3,0,0)'].forEach(submit);
    const r = ask("מישור A'B'C'D'");
    expect(r.answer).toBeNull();
    expect(r.note).toBe('undetermined');
  });
});
