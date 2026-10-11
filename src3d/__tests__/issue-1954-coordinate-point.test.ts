/**
 * #1954 ([ADR-3D-330](../../docs/06b-decisions-3d.md#adr-3d-330)) — A POINT WITH TWO COORDINATES IS THE
 * ANALYTIC BUILDER'S SENTENCE.
 *
 * Operator report, 2026-10-09 (playing round #1940): *"on 3d tool, when i enter A(0,0) I get an error.
 * I should be sent to the analytics tool."* Measured before: «A(0,0)», «A = (1, 2)» and «נקודה A(1,2)»
 * all answered the generic «לא הצלחתי להבין את הנתון (בגרסה זו: …)» AFTER a paid model call, because
 * 3-D's guidance register had no wrong-tool family for a planar coordinate.
 *
 * The lock has three halves: the MESSAGE the student reads; the line answered BEFORE the model, adding
 * nothing; and the ARITY as the decision — «A(0,0,0)» and every other 3-D coordinate sentence untouched.
 * That the sentence is 2-D's BYTE FOR BYTE (ADR-W-118 B1) is held in
 * `shell/__tests__/coordinate-point-parity-1954.test.ts`, which reads both locale files off disk.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import i18n3d from '../i18n';
import { classifyGuidance3 } from '../parser/scope3';
import { decideDeterministic3 } from '../app/decideDeterministic3';
import { useGeo3 } from '../store/store3';

const EMPTY = { facts: [], seed: 0 };
const strip = (s: string) => s.replace(/[⁦-⁩‎‏]/g, '');

/** Every spelling of a point in the PLANE the operator's report and 2-D's rule cover. */
const PLANAR = [
  'A(0,0)',
  'A = (1, 2)',
  'נקודה A(1,2)',
  'הנקודה E נמצאת ב-(-1,7)',
  'A ב-(0,0)',
  'A(2;10)', // the Israeli semicolon
  'A = 3,4',
  'point A at 0,0',
  'E=(-1,7)',
];

/** 3-D's OWN coordinate sentences — the arity is the whole decision. */
const SPATIAL = ['A(0,0,0)', 'B(2,15,-8)', 'B(2t,t,k)', 'A = 0,0,0', 'y = 2x + 1', 'מישור x+2y-2z+28=0', "הישר ℓ: x=(8,-1,-1)+t(k+1,0,k-3)"];

beforeEach(() => {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
});

describe('#1954 — the message is 2-D’s, word for word', () => {
  // The byte-for-byte comparison with 2-D's string lives in
  // `shell/__tests__/coordinate-point-parity-1954.test.ts`: a product tree may not import another
  // (`BOUNDARIES.json`), so the cross-builder half is read off disk there. Here is the sentence itself.
  it('it renders as the sentence the student reads, naming the analytic tool and its spelling', () => {
    const text = strip(i18n3d.t('scope.coordinate-point') as string);
    expect(text).toBe(
      'מיקום נקודה לפי שיעורים נעשה בכלי «גאומטריה אנליטית» — לחצו עליו בראש המסך. שם כותבים E(-1,7). כאן תארו את הצורה עצמה — למשל «משולש ABC» או «נקודה D על AB».',
    );
    expect(strip(i18n3d.getFixedT('en')('scope.coordinate-point') as string)).toContain('"Analytic Geometry"');
  });
});

describe('#1954 — every planar spelling is answered before the model, and adds nothing', () => {
  it.each(PLANAR)('«%s»', (line) => {
    expect(classifyGuidance3(line)?.category, line).toBe('coordinate-point');
    const v = decideDeterministic3(EMPTY, line);
    expect(v.kind, line).toBe('guided');
    if (v.kind !== 'guided' || v.register !== 'scope') return;
    expect(v.tag).toBe('scope:coordinate-point');
    expect(v.match.messageKey).toBe('scope.coordinate-point');
    // answered on purpose: the verdict never reaches the model (App3 shows the note instead)
    useGeo3.getState().submit(line);
    expect(useGeo3.getState().facts).toEqual([]);
  });
});

describe('#1954 — the arity is the decision: 3-D’s own coordinates are untouched', () => {
  it.each(SPATIAL)('«%s» is not steered away', (line) => {
    expect(classifyGuidance3(line), line).toBeNull();
  });

  it('«A(0,0,0)» still builds, and a 2-coordinate point never minted a point either way', () => {
    useGeo3.getState().submit('A(0,0,0)');
    expect(useGeo3.getState().lastError).toBeNull();
    expect(useGeo3.getState().facts.map((f) => f.utterance)).toEqual(['A(0,0,0)']);
  });

  it('a coordinate component that divides keeps its OWN guidance (#509), not this one', () => {
    expect(classifyGuidance3('C(p/2, 1, 0)')?.category).toBe('component-arithmetic');
  });
});
