/**
 * #181 / ADR-3D-039 — lowercase point labels in LABEL POSITION parse like their uppercase twins.
 *
 * Prod (events-3d.jsonl, 2 users): `∠sdb` was refused; `הקודקוד c נמצא על החלק החיובי של ציר ה-x`
 * burned a paid LLM escalation — both pure casing differences the 2-D parser tolerates everywhere.
 * 3-D cannot take a blanket `/i` (axes x/y/z, parameters k/m/t, vector names u/v/w, R vs r are
 * CASE-SIGNIFICANT), so `normalize3` uplifts a lowercase run only where an ANCHOR proves it is a
 * label (the angle glyph/word, an explicit point/vertex noun) — the one chokepoint, never per-rule.
 *
 * #2823 ([ADR-3D-492](../../docs/06b-decisions-3d.md#adr-3d-492), ADR-W-203): the chokepoint moved to the store's submit
 * seam (`labelCaseFold3`, every builder's `shell/labelCase`), which writes the capital into the ROW and says so; the
 * grammar itself reads only capitals. These twins are read through it (`up3`).
 */
import { describe, expect, it } from 'vitest';
import { normalize3, parse3 } from '../parser/parse3';
import { labelCaseFold3, type Fact3 } from '../store/store3';
import { decideDeterministic3 } from '../app/decideDeterministic3';

/** #2823: the store's certain-label reading. */
const up3 = (u: string): string => labelCaseFold3(u, [])?.text ?? u;

const cmds = (u: string) => {
  const r = parse3(up3(u));
  if (!r.ok) throw new Error(`not parsed: ${u} → ${r.reason}`);
  return r.commands;
};

describe('#181 — anchored lowercase labels parse like their uppercase twins', () => {
  it('the exact prod utterance «∠sdb» parses to the same angle-mark as «∠SDB»', () => {
    expect(cmds('∠sdb')).toEqual(cmds('∠SDB'));
    expect(cmds('∠sdb')[0]).toMatchObject({ type: 'angle-mark', vertex: 'D', p: 'S', q: 'B' });
  });

  it('the angle WORD anchors too: «זווית sdb» ≡ «זווית SDB»', () => {
    expect(cmds('זווית sdb')).toEqual(cmds('זווית SDB'));
    expect(cmds('זוית sdb')).toEqual(cmds('זווית SDB')); // the single-vav spelling class (ADR-3D-032 Am.)
  });

  it('the exact prod utterance «הקודקוד c נמצא על החלק החיובי של ציר ה-x» — the label uplifts, the AXIS x stays', () => {
    expect(cmds('הקודקוד c נמצא על החלק החיובי של ציר ה-x')).toEqual(cmds('הקודקוד C נמצא על החלק החיובי של ציר ה-x'));
    expect(cmds('הקודקוד c נמצא על החלק החיובי של ציר ה-x')).toEqual([
      { type: 'point3', id: 'C', x: null, y: 0, z: 0 },
      { type: 'sign-given', id: 'C', axis: 'x', positive: true },
    ]);
  });

  it('a point-noun LIST uplifts every member: «הנקודות a ו-b» reads A, B', () => {
    expect(up3('הנקודות a ו-b')).toBe('הנקודות A ו-B');
  });

  it("primes survive the uplift: «הקודקוד c'» reads C'", () => {
    expect(up3("הקודקוד c'")).toBe("הקודקוד C'");
  });

  it('the English anchors mirror (function words never uplift)', () => {
    expect(up3('angle sdb')).toBe('angle SDB');
    expect(up3('point g')).toBe('point G');
    expect(up3('the angle of the planes')).toBe('the angle of the planes');
    expect(up3('the point of intersection')).toBe('the point of intersection');
  });
});

describe('#181 — NO THEFT: the case-significant lanes are untouched', () => {
  it('a lone axis letter after a point noun is the point (the operator, 2026-11-12, #2823) — and the grammar itself never reads it', () => {
    expect(up3('נקודה x')).toBe('נקודה X');
    expect(up3('הקודקוד z')).toBe('הקודקוד Z');
    expect(normalize3('נקודה x')).toBe('נקודה x');
  });

  it('vector naming keeps its lowercase name', () => {
    expect(cmds('נסמן: AB=u')).toEqual([
      { type: 'segment3', a: 'A', b: 'B' },
      { type: 'name-vector', name: 'u', from: 'A', to: 'B' },
    ]);
  });

  it('axis sign givens, figure parameters, and coord-sym points are byte-unchanged', () => {
    expect(cmds('שיעור ה-z של A שלילי')).toEqual([{ type: 'sign-given', id: 'A', axis: 'z', positive: false }]);
    expect(cmds('k הוא פרמטר חיובי')).toEqual([{ type: 'param-sign', sym: 'k', positive: true }]);
    expect(cmds('M(k,1,3)')).toEqual([{ type: 'point3', id: 'M', x: null, y: 1, z: 3, syms: ['k', null, null], srcs: ['k', '1', '3'] }]); // #2077: + the typed text
  });

  it('the vector-angle phrasing keeps w and u lowercase (no anchor precedes them)', () => {
    expect(up3('הזווית בין הוקטורים w ו-u')).toBe('הזווית בין הוקטורים w ו-u');
  });

  it('plane-angle English phrasing is untouched', () => {
    expect(cmds('the angle between the planes π1 and π2 is 45')).toEqual([{ type: 'plane-rel', rel: 'angle', deg: 45, a: { kind: 'plane-named', name: 'π1' }, b: { kind: 'plane-named', name: 'π2' } }]); // #1439: the plane-rel lowering
  });
});

describe('#2823 (ADR-3D-492) — the row shows the capitals, and a used letter keeps its meaning', () => {
  const decide = (facts: Fact3[], u: string) => decideDeterministic3({ facts, seed: 0 }, u);
  it('a certain slot records in capitals, flagged for the notice', () => {
    for (const [u, row] of [['∠sdb', '∠SDB'], ['נקודה x', null], ['תיבה abcd', 'תיבה ABCD']] as const) {
      const v = decide([], u);
      if (row === null) continue; // «נקודה X» alone is not a 3-D sentence; its fold is locked above
      expect(v.kind === 'record' ? [v.fact.utterance, v.cased] : v.kind, u).toEqual([row, true]);
    }
  });

  it('a parameter the figure already uses is never read as a point («נקודה k» after «k הוא פרמטר חיובי»)', () => {
    const facts = [{ id: 'k', utterance: 'k הוא פרמטר חיובי', cmds: cmds('k הוא פרמטר חיובי'), enabled: true }] as Fact3[];
    expect(labelCaseFold3('נקודה k', facts)).toBeNull();
    expect(labelCaseFold3('נקודה j', facts)?.text).toBe('נקודה J');
  });
});
