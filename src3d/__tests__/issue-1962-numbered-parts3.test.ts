/**
 * #1962 ([ADR-3D-331](../../docs/06b-decisions-3d.md#adr-3d-331)) — ONE NUMBERED LIST FROM (1), in 3-D too.
 *
 * Operator ruling, 2026-10-10 (asked as the cross-tool question [ADR-W-122] requires, not inherited):
 * *option A — port it to 3-D and analytic.* 2-D has read one list from (1) since [ADR-611](../../docs/06-decisions.md#adr-611)
 * / #1957; 3-D carried the PRE-ADR-611 prose («כתבו קודם «משולש ABC», ואחר כך בשורה נפרדת «∠ABC = 90°».»)
 * plus a second key whose tail was numbered from a hard-coded 3.
 *
 * **Measured at pickup, and it corrects the issue's record.** The second key was already UNREACHABLE: 3-D
 * reads no compound line (#1679), so `unreadParts3` locates ONE clause and `cut.parts` is always
 * `[read-prefix, tail]` — `rest` was always empty and `err.rightAngleVertexMore` never rendered. The
 * issue's own example, «משולש ABC ישר זווית ב-B ו-AB = 4», is `not-understood` in 3-D (it goes to the
 * model), not a list beginning at (3). What a student DID see was the prose wording while 2-D showed the
 * ruled list — the ADR-W-118 B1 divergence — and that is what this closes, along with the dead key and its
 * offset. The FORMAT of the continuation is locked here at the unit level so it is already right the day
 * 3-D learns to read a compound line.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import he from '../i18n/locales/he.json';
import en from '../i18n/locales/en.json';
import i18n3d from '../i18n';
import { errorText3 } from '../i18n/errorText3';
import { decideSubmit3, useGeo3 } from '../store/store3';
import { lostPart3 } from '../store/unreadParts3';
import type { PartsCut } from '../../shell/readExtent';

type T = (k: string, o?: Record<string, unknown>) => string;
const render = (lng: string, err: Parameters<typeof errorText3>[1]) =>
  (errorText3(i18n3d.getFixedT(lng) as T, err) ?? '').replace(/[⁦-⁩‎‏]/g, '');

const EMPTY = { facts: [], seed: 0 };
let n = 0;
const id = () => `f${(n += 1)}`;

/** A cut with `parts` the student typed and a right-triangle lowering — the shape `lostPart3` reads. */
const cutOf = (parts: string[], ids: string[], vertex: string): PartsCut<string> => ({
  parts,
  lost: [parts[1]],
  cuts: [
    {
      part: 0,
      tail: parts[1],
      lowering: JSON.stringify([
        { type: 'solid', kind: 'polygon3', ids },
        { type: 'cos-angle', cos: 0, origin: 'shape', a: vertex },
      ]),
    },
  ],
});

beforeEach(() => {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
});

describe('#1962 — the taught pair is items (1) and (2) of one list', () => {
  it('«משולש ABC ישר זווית ב-B» reads one numbered list from (1), with no «ואחר כך»', () => {
    const v = decideSubmit3(EMPTY, 'משולש ABC ישר זווית ב-B', id);
    expect(v.kind).toBe('refused');
    if (v.kind !== 'refused') return;
    expect(v.error).toEqual({ code: 'right-angle-vertex', triangle: 'ABC', angle: 'ABC', more: '' });
    const text = render('he', v.error);
    expect(text).toBe('בכל שורה נתון אחד — כך הכלי יוכל לבנות ולאמת כל נתון בנפרד. כתבו בשורות נפרדות: (1) משולש ABC  (2) ∠ABC = 90°');
    expect(text).toContain('(1)');
    expect(text).toContain('(2)');
    expect(text).not.toContain('ואחר כך');
    expect(text).not.toContain('כתבו קודם');
    expect(render('en', v.error)).toBe(
      'One given per line — that way the tool can build and verify each one separately. Write them on separate lines: (1) triangle ABC  (2) ∠ABC = 90°',
    );
  });

  it('the plain parts branch already numbers from (1), and still does', () => {
    const v = decideSubmit3(EMPTY, 'משולש ABC שווה שוקיים ב-B', id);
    expect(v.kind === 'refused' && v.error).toEqual({ code: 'split-statements', all: '(1) משולש ABC שווה שוקיים  (2) ב-B' });
  });
});

describe('#1962 — the second key and its hard-coded offset are GONE', () => {
  it('no locale carries `rightAngleVertexMore` any more (the proof the format changed deliberately)', () => {
    expect((he.err as Record<string, unknown>).rightAngleVertexMore).toBeUndefined();
    expect((en.err as Record<string, unknown>).rightAngleVertexMore).toBeUndefined();
  });

  it('`rightAngleVertex` carries the list and the `{{more}}` continuation, in both locales', () => {
    for (const locale of [he, en]) {
      const s = (locale.err as unknown as Record<string, string>).rightAngleVertex;
      expect(s).toContain('(1)');
      expect(s).toContain('(2)');
      expect(s).toContain('{{more}}');
      expect(s).not.toContain('{{rest}}');
    }
  });
});

describe('#1962 — the continuation format, held at the unit level', () => {
  // Since #2088 (ADR-3D-370) a real compound reaches these cuts (issue-2088-compound-taught3.test.ts); the
  // unit rows hold the format alone: three parts continue to (3), four to (4), two end at (2).
  it('a three-part line continues the SAME list at (3)', () => {
    const p = lostPart3(cutOf(['משולש ABC ישר זווית', 'ב-B', 'AB = 4'], ['A', 'B', 'C'], 'B'));
    expect(p).toEqual({ code: 'right-angle-vertex', triangle: 'ABC', angle: 'ABC', more: '  (3) AB = 4' });
    expect(render('he', p)).toBe(
      'בכל שורה נתון אחד — כך הכלי יוכל לבנות ולאמת כל נתון בנפרד. כתבו בשורות נפרדות: (1) משולש ABC  (2) ∠ABC = 90°  (3) AB = 4',
    );
    expect(render('he', p)).not.toContain('ואחר כך');
  });

  it('a four-part line continues to (4)', () => {
    const p = lostPart3(cutOf(['משולש ABC ישר זווית', 'ב-B', 'AB = 4', 'BC = 3'], ['A', 'B', 'C'], 'B'));
    expect(p).toEqual({ code: 'right-angle-vertex', triangle: 'ABC', angle: 'ABC', more: '  (3) AB = 4  (4) BC = 3' });
  });

  it('a two-part line ends at (2) — no empty continuation on screen', () => {
    const p = lostPart3(cutOf(['משולש ABC ישר זווית', 'ב-B'], ['A', 'B', 'C'], 'B'));
    expect(p).toEqual({ code: 'right-angle-vertex', triangle: 'ABC', angle: 'ABC', more: '' });
  });

  it('a taught pair that does NOT open the line falls to the plain list, so no part is mis-numbered', () => {
    const cut = cutOf(['AB = 4', 'משולש ABC ישר זווית', 'ב-B'], ['A', 'B', 'C'], 'B');
    const p = lostPart3({ ...cut, cuts: [{ ...cut.cuts[0], part: 1, tail: 'ב-B' }] });
    expect(p).toEqual({ code: 'split-statements', all: '(1) AB = 4  (2) משולש ABC ישר זווית  (3) ב-B' });
  });
});

describe('#1962 — the issue’s own example, measured', () => {
  it('«משולש ABC ישר זווית ב-B ו-AB = 4» now reaches this message, continued at (3) (#2088, ADR-3D-370)', () => {
    // The planned tripwire: this row asserted `not-understood` until 3-D refused the compound with its note. #2088
    // (operator ruling 2026-10-14, «carrying the trailing givens») cuts the failed line into clauses, so the
    // continuation ADR-3D-331 built is reachable — and the numbering is the ruled one, 2-D's byte for byte.
    const v = decideSubmit3(EMPTY, 'משולש ABC ישר זווית ב-B ו-AB = 4', id);
    expect(v.kind === 'refused' && v.error).toEqual({ code: 'right-angle-vertex', triangle: 'ABC', angle: 'ABC', more: '  (3) AB = 4' });
    if (v.kind !== 'refused') return;
    expect(render('he', v.error)).toBe(
      'בכל שורה נתון אחד — כך הכלי יוכל לבנות ולאמת כל נתון בנפרד. כתבו בשורות נפרדות: (1) משולש ABC  (2) ∠ABC = 90°  (3) AB = 4',
    );
    expect(render('en', v.error)).toBe(
      'One given per line — that way the tool can build and verify each one separately. Write them on separate lines: (1) triangle ABC  (2) ∠ABC = 90°  (3) AB = 4',
    );
  });
});
