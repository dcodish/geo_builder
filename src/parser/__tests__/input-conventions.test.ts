/**
 * The 2026-07-26 log-triage batch — three input-convention fixes, all from prod utterances:
 *
 *  - #350 (ADR-403): the ACTIVE-VOICE extension «מאריכים את הצלע AB עד לנקודה D». The extension lane was
 *    gated on the NOUN («המשך»), so the textbook's verb register escalated to the LLM.
 *  - #352 (ADR-403 sibling): «BC בסיס» is an ORIENTATION wish, not a geometric given — guided, and the
 *    message now names the Rotate & align tool that actually does it.
 *  - #353: NOT a 2-D fix — the 2-D grammar already upper-cases labels itself, so «זוית abc» fails for an
 *    unrelated reason (#248: a valueless bare angle is not a construct here). The convention nudge ships
 *    in the 3-D app only, where lowercase labels genuinely fail. Documented by the assertions below.
 *  - #354: a containment with no container named, on a figure with 2+ circles, ASKS which one.
 */
import { describe, expect, it } from 'vitest';
import { classifyOutOfScope, parse } from '@/parser';

describe('#350 — the active-voice extension verb', () => {
  const NOUN = parse('D על המשך AB');

  it('the prod utterance lowers exactly like the noun form', () => {
    const r = parse('מאריכים את הצלע AB עד לנקודה D');
    expect(r.ok).toBe(true);
    expect(r).toEqual(NOUN); // same t / order / drawn continuation — one lowering, two spellings
  });

  for (const u of [
    'מאריכים את AB עד לנקודה D',
    'נאריך את הצלע AB עד לנקודה D',
    'מאריך את הקטע AB עד נקודה D',
    'האריכו את AB עד ל-D',
    'מאריכים את הצלע AB עד D',
    'extend AB to point D',
    'extend side AB to D',
    'extend the segment AB to D',
  ]) {
    it(`«${u}» parses to the extension`, () => {
      expect(parse(u), u).toEqual(NOUN);
    });
  }

  it('an EXISTING target point becomes an ordered collinearity (the noun form\'s branch)', () => {
    const ctx = { points: ['A', 'B', 'D'] };
    expect(parse('מאריכים את הצלע AB עד לנקודה D', ctx)).toEqual(parse('D על המשך AB', ctx));
  });

  it('an extension stated as a CUT is NOT claimed (it belongs to the cut lane)', () => {
    expect(parse('מאריכים את AB עד שהוא חותך את המעגל').ok).toBe(false);
  });

  it('"extend AB to B" is not an extension', () => {
    expect(parse('מאריכים את AB עד ל-B').ok).toBe(false);
  });

  it('the noun form still owns its own spelling — this rule bows out when «המשך» is present', () => {
    // Whatever the noun rule makes of it, the verb rule must not ALSO claim it (one lowering per spelling).
    // Asserted by equality with the noun rule's own output rather than a hard-coded shape, so this locks the
    // no-double-claim contract without endorsing that reading.
    expect(parse('מאריכים את AB עד להמשך CD')).toEqual(parse('B על המשך CD'));
  });

  it('BOTH Hebrew kaf forms are admitted (medial כ in מאריכים, final ך in מאריך)', () => {
    expect(parse('מאריך את AB עד לנקודה D')).toEqual(NOUN);
    expect(parse('מאריכים את AB עד לנקודה D')).toEqual(NOUN);
  });
});

describe('#352 — «BC בסיס» is an orientation wish, not a given', () => {
  for (const u of ['BC בסיס', 'הבסיס BC', 'הבסיס הוא BC', 'BC הוא הבסיס', 'BC is the base', 'the base is BC']) {
    it(`«${u}» → orientation guidance`, () => {
      expect(classifyOutOfScope(u)?.category, u).toBe('orientation');
    });
  }

  it('a trapezoid\'s BASES (a real geometric reference, #185) is not brushed off', () => {
    // «EL מקביל לבסיסים» parses, so it never reaches the classifier; assert the pattern itself is narrow
    expect(classifyOutOfScope('EL מקביל לבסיסים')?.category).not.toBe('orientation');
  });

  it('a construction that merely mentions a base is untouched', () => {
    expect(classifyOutOfScope('מנסרה ישרה שבסיסה משולש')?.category).not.toBe('orientation');
  });
});

describe('#353 — 2-D already accepts lowercase labels (the convention nudge belongs to 3-D only)', () => {
  // The triage row that motivated #353 was «זוית abc», which looked like a case problem. It is not: the
  // 2-D grammar upper-cases labels itself, so lowercase input parses. Asserted here so the finding cannot
  // silently rot — if any of these ever stops parsing, the case-insensitivity assumption broke.
  for (const u of ['ab=5', 'ab=cd', 'משולש abc', 'ריבוע abcd', 'זוית abc = 40', 'נקודה d על ab']) {
    it(`«${u}» parses as typed — case is not the 2-D problem`, () => {
      expect(parse(u).ok, u).toBe(true);
    });
  }

  it('«זוית abc» fails for a DIFFERENT reason — a valueless bare angle is not a 2-D construct (#248)', () => {
    // Both cases fail identically, which is the proof that case is not the issue.
    expect(parse('זוית abc').ok).toBe(false);
    expect(parse('זוית ABC').ok).toBe(false);
  });
});

describe('#354 — a containment with no container named, on 2+ circles, ASKS which one', () => {
  it('0 circles: builds (the container is introduced)', () => {
    const r = parse('מעגל מוכל', {});
    expect(r.ok).toBe(true);
    expect(r.ok && r.commands.map((c) => c.type)).toEqual(['circle', 'circle', 'set-circle-position']);
  });

  it('1 circle: builds (that circle is the container)', () => {
    const r = parse('מעגל מוכל', { circles: ['O'], points: ['O'] });
    expect(r.ok).toBe(true);
    expect(r.ok && r.commands.map((c) => c.type)).toEqual(['circle', 'set-circle-position']);
  });

  it('2+ circles: the ambiguous-container clarification, never a silent pick or an LLM guess', () => {
    const r = parse('מעגל מוכל', { circles: ['O', 'P'], points: ['O', 'P'] });
    expect(r).toEqual({ ok: false, reason: 'ambiguous-container', centers: ['O', 'P'] });
  });

  it('a NAMED container still builds with 2+ circles present', () => {
    const r = parse('מעגל מוכל בתוך מעגל O', { circles: ['O', 'P'], points: ['O', 'P'] });
    expect(r.ok).toBe(true);
  });
});
