/**
 * #2611 ([ADR-3D-414](../../docs/06b-decisions-3d.md#adr-3d-414)) — A CIRCLE REFERENCE OR MEMBERSHIP IS REFUSED IN THE
 * CIRCLE'S OWN WORDS, never the line's and never an id.
 *
 * Measured at e8e09077 before the fix (`useGeo3.submit`, Hebrew): «D על המעגל» on an empty canvas →
 * «הישר «circle» עדיין לא הוגדר. הגדירו אותו תחילה — למשל «ישר circle»»; «D על המעגל O» → the same with «circle-O»;
 * two circles + «D על המעגל» → the same; a cube vertex stated on a circumcircle it is off → «A' אינה על הישר».
 * The texts are the session's (ADR-W-174); their interpolated values are held to the student-text check by
 * `message-floor-2028.test.ts`. Every spelling a message teaches is submitted here (docs/17 §9).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import i18n3d from '../i18n';
import { errorText3 } from '../i18n/errorText3';
import { useGeo3, type StoreError3 } from '../store/store3';

const st = () => useGeo3.getState();
const run = (...lines: string[]) => {
  for (const l of lines) st().submit(l);
};
const text = (lang: 'he' | 'en') => {
  void i18n3d.changeLanguage(lang);
  return errorText3(i18n3d.t.bind(i18n3d) as never, st().lastError as NonNullable<StoreError3>);
};

beforeEach(() => useGeo3.setState({ facts: [], seed: 0, lastError: null, lastNotice: null, lastCreated: null } as never));

describe('#2611 — the refusal speaks of the circle', () => {
  const CASES: { lines: string[]; code: object; he: RegExp }[] = [
    // ADR-3D-420 (stage B): on an empty canvas the circle is now created; a letter over a drawn unlettered circle is what stays refused
    { lines: ['משולש ABC חסום במעגל', 'D על המעגל O'], code: { code: 'unknown-circle', name: 'O' }, he: /המעגל .?O.? עדיין לא הוגדר/ },
    { lines: ['משולש ABC חסום במעגל', 'מעגל חסום במשולש ABC', 'D על המעגל'], code: { code: 'unknown-circle', several: true }, he: /כמה מעגלים.*מגבלה של הכלי/ },
    { lines: ["קובייה ABCDA'B'C'D'", 'משולש ABC חסום במעגל', "A' על המעגל"], code: { code: 'not-on-circle', id: "A'" }, he: /אינה על המעגל/ },
  ];
  for (const c of CASES) {
    it(`«${c.lines.join(' · ')}» → ${JSON.stringify(c.code)}, worded as a circle, no id, no line`, () => {
      run(...c.lines);
      expect(st().lastError).toEqual(c.code);
      const he = text('he');
      expect(he).toMatch(c.he);
      expect(he).not.toMatch(/^הישר|«ישר|circle/);
      expect(text('en')).not.toMatch(/\bline\b(?! again)|circle-/);
      expect(st().facts).toHaveLength(c.lines.length - 1);
    });
  }

  it('several circles, one of them lettered by its centre: the next step names it, and that spelling builds', () => {
    run('A(0,0,0)', 'B(2,0,0)', 'C(0,2,0)', 'O(1,-1,0)', 'מעגל שמרכזו O משיק לישר AB בנקודה T', 'משולש ABC חסום במעגל');
    expect(st().lastError).toBeNull();
    st().submit('D על המעגל');
    expect(st().lastError).toEqual({ code: 'unknown-circle', several: true, centre: 'O', point: 'D' });
    const he = text('he');
    expect(he).toContain('על המעגל');
    // the taught spelling «הנקודה D על המעגל O» is accepted
    st().submit('הנקודה D על המעגל O');
    expect(st().lastError).toBeNull();
  });
});

describe('#2611 — every spelling a circle refusal teaches builds (docs/17 §9)', () => {
  it('noCircle teaches «משולש ABC חסום במעגל»: then «D על המעגל» builds', () => {
    run('משולש ABC חסום במעגל', 'D על המעגל');
    expect(st().lastError).toBeNull();
  });
  it('unknownCircle teaches «מעגל שמרכזו O משיק לישר AB בנקודה T»: then «D על המעגל O» builds', () => {
    run('מעגל שמרכזו O משיק לישר AB בנקודה T', 'D על המעגל O');
    expect(st().lastError).toBeNull();
    expect(st().facts).toHaveLength(2);
  });
});
