/**
 * #968 — HEBREW-LETTER vertex labels: «מלבן אבגד».
 *
 * Israeli textbooks name vertices א-ב-ג-ד where this tool names them A-B-C-D, so a student reaching for
 * the Hebrew alphabet is following their book rather than making a mistake. In prod (log-triage
 * 2026-09-10) the sentence logged **`not-understood`** — the paid LLM fallback failed too — so that
 * session produced nothing at all.
 *
 * Operator ruling (2026-09-10): *"should be rejected with notice to user to use uppercase english
 * letters."* So this is a NUDGE, not alphabet support — the direct sibling of #779's
 * `upperCasedLabelCandidate`, one alphabet over, and proof-based in the same way: the caller re-parses
 * the transliterated candidate and shows the note ONLY if it really parses, so a genuine gap still
 * escalates and nothing is ever committed on the student's behalf.
 *
 * The interesting half is telling a LABEL from a WORD, since every construct noun is Hebrew letters too.
 * The rule is the alphabet RANGE: labels come from א-ט (⇒ A-I), the way Latin ones come from A-H, while
 * the geometry nouns essentially all carry a later letter. These tests pin both directions, because a
 * false positive here would rewrite a student's ordinary Hebrew sentence.
 */
import { describe, it, expect } from 'vitest';
import { hebrewLabelCandidate, parse } from '../index';

/** The pipeline's own gate: a candidate is only ever SHOWN when it parses (submitPipeline, #779/#968). */
const wouldNudge = (u: string): string | null => {
  const c = hebrewLabelCandidate(u);
  if (!c) return null;
  const r = parse(c, {});
  return r.ok && r.commands.length > 0 ? c : null;
};

describe('#968 — Hebrew-letter vertex labels are rejected with a Latin-letter nudge', () => {
  it.each([
    ['מלבן אבגד', 'מלבן ABCD'],
    ['משולש אבג', 'משולש ABC'],
    ['אלכסון בד', 'אלכסון BD'],
    ['מרובע אבגד', 'מרובע ABCD'],
  ])('%s → suggests %s', (input, corrected) => {
    expect(wouldNudge(input)).toBe(corrected);
  });

  it('transliterates positionally — א=A … ט=I, so a hexagon keeps its order', () => {
    expect(hebrewLabelCandidate('משושה אבגדהו')).toBe('משושה ABCDEF');
  });

  it('folds a FINAL form to its medial letter before reading the position', () => {
    // ך/ם/ן/ף/ץ sit at the end of the code block, so an unfolded read would place them past ת — the
    // lexicon's ADR-3D-035 final-letter trap, one layer down.
    expect(hebrewLabelCandidate('אבגד')).toBe('ABCD');
    expect(hebrewLabelCandidate('מלבן')).toBeNull(); // ends in ן, and מ is out of range — still a word
  });

  it('strips a leading «ל» so «לבא» reads as "to BA"', () => {
    expect(hebrewLabelCandidate('זוית בין בד לבא היא 30')).toBe('זוית בין BD ל-BA היא 30');
  });

  it('prefers the UNSTRIPPED reading — «בד» is the label BD, not ב + ד', () => {
    expect(hebrewLabelCandidate('אלכסון בד')).toBe('אלכסון BD');
  });

  // The whole prod utterance. Its transliteration is #968's job and is asserted here; whether the
  // RESULT parses is #967's (the «בין … ל…» angle form), so the two land the student's sentence together.
  it('transliterates the operator’s exact prod line', () => {
    expect(hebrewLabelCandidate('מלבן אבגד , אלכסון בד , זוית בין בד לבא היא 30°')).toBe(
      'מלבן ABCD , אלכסון BD , זוית בין BD ל-BA היא 30°',
    );
  });

  describe('an ordinary Hebrew sentence is NEVER rewritten', () => {
    // This is the risk in the change: every construct noun is made of the same letters as a label.
    it.each([
      'מלבן ABCD',
      'משולש ABC שווה שוקיים',
      'ריבוע שצלעו 4',
      'נקודה D על AB',
      'מעגל שמרכזו O',
      'הזווית בין BD ל-BA היא 30',
      'AB מאונך ל-CD',
      'נתון מעגל',
      'חוצה זווית ABC',
      'טרפז ישר-זווית ABCD',
      'הוסף אמצע צלע AB',
    ])('%s is left alone', (u) => {
      expect(hebrewLabelCandidate(u)).toBeNull();
    });

    it('«שווה» survives — the reason the particle set is «ל» only', () => {
      // With ב/ה/ו/מ/ש/כ also stripped, «שווה» became «ש-FFE» and cost the nudge on any sentence
      // carrying that very common word. Measured, and the reason the rule is narrow.
      expect(hebrewLabelCandidate('שווה')).toBeNull();
      expect(hebrewLabelCandidate('משולש ABC שווה שוקיים')).toBeNull();
    });

    it('a NEUTRAL word is excluded outright, belt and braces', () => {
      expect(hebrewLabelCandidate('היא')).toBeNull();
      expect(hebrewLabelCandidate('של')).toBeNull();
      expect(hebrewLabelCandidate('הוא')).toBeNull();
    });
  });

  describe('the nudge is PROOF-based — it never fires on a guess', () => {
    it('says nothing when the transliterated sentence does not parse', () => {
      // A Hebrew-letter run inside something the grammar cannot read is still a genuine gap, and must
      // keep escalating rather than being answered with a confident wrong suggestion.
      expect(wouldNudge('אבגד זהזה זהזה')).toBeNull();
    });

    it('an English sentence is untouched', () => {
      expect(hebrewLabelCandidate('rectangle ABCD')).toBeNull();
    });
  });
});
