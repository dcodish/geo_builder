/**
 * #763 — the INDEPENDENCE discriminator: two whole constructs in one line are TAUGHT, not decomposed.
 *
 * Operator ruling (2026-08-19), after «שני מעגלים משיקים מבחוץ ואלכסון AB» drew two tangent circles
 * AND a floating segment as one green step: *"ask user to input one fact at a time and refuse to draw
 * this shape."* The grammar and its honesty gates were never at fault — the LLM fallback decomposed
 * the compound and built both halves. See `independence.ts` and ADR-460.
 *
 * THE TWO CONDITIONS the operator attached to approving "ship as built" (2026-08-24) are the last two
 * describes in this file, and they are the point of it:
 *   1. the four residual catalog false positives are recorded EXPLICITLY, with the argument for why
 *      each is unreachable — "a false positive that is invisible is indistinguishable from one nobody
 *      checked";
 *   2. the net FAILS if any of them becomes reachable, i.e. if the grammar stops parsing it.
 */
import { describe, expect, it } from 'vitest';
import { independentConstructs } from '../independence';
import { COMMAND_CATALOG, parse } from '@/parser';

/** The context the catalog's reference forms are written against (mirrors gate-false-positives). */
const CTX = { circles: ['O'], points: ['O'] };

describe('#763 — the reported compounds are taught, one fact at a time', () => {
  it.each([
    ['שני מעגלים משיקים מבחוץ ואלכסון AB', ['שני מעגלים משיקים מבחוץ', 'אלכסון AB']],
    ['משולש ABC וריבוע WERT', ['משולש ABC', 'ריבוע WERT']],
    ['two circles tangent externally with a chord AB', ['two circles tangent externally', 'a chord AB']],
    ['triangle ABC and square WERT', ['triangle ABC', 'square WERT']],
  ])('«%s» is split back to the student', (u, pieces) => {
    const m = independentConstructs(u);
    expect(m, `«${u}» must be caught`).not.toBeNull();
    expect(m!.category).toBe('split-statements');
    expect(m!.params!.first).toBe(pieces[0]);
    expect(m!.params!.second).toBe(pieces[1]);
  });
});

describe('#763 — a supported COMPOUND is one statement and must never be refused', () => {
  it.each([
    ['דלתון ABCD, AB=AD', 'a shared label makes it one statement (ADR-264 clause form)'],
    ['ריבוע ABCD, נקודה G על AD', 'the later clause CONSTRAINS the earlier'],
    ['מעגל O, נקודה A על המעגל', 'a definite BACK-REFERENCE, with no shared label'],
    ['מעגל שמרכזו O ורדיוסו r', 'the «ו» split leaves a fragment that cannot stand alone'],
    ['E נקודת החיתוך של AC ו-BD', 'the «ו» is inside one construct'],
    ['טרפז ABCD חסום במעגל', 'one construction'],
    ['circle through A, B, C', 'a comma LIST, not a clause boundary'],
  ])('«%s» is clean — %s', (u) => {
    expect(independentConstructs(u)).toBeNull();
  });

  it('a bare label run is a conjoined SUBJECT, not a standalone construct', () => {
    // "AB and CD are chords in circle O": one sentence about two chords. Without this, clause 1 («AB»)
    // parses as a segment and the line would be refused — the 5th false positive, and a different
    // family from the four below.
    expect(independentConstructs('AB and CD are chords in circle O')).toBeNull();
  });
});

/**
 * The catalog net — the measurement the plan pre-committed to, kept as a PERMANENT test rather than a
 * one-off. This is what turns "cannot fire today" into a maintained claim.
 */
describe('#763 — the catalog net (operator condition 1: the residual is recorded, not invisible)', () => {
  /**
   * The four supported catalog forms this check would refuse. All ONE family, twice, in two
   * languages: a RECIPROCAL relation («משיקים זה לזה» / "are tangent") spans the split point and
   * binds the two clauses, while both halves genuinely stand alone by every derived test available —
   * each parses, each builds from an empty figure, and their labels are disjoint (O vs P, M).
   *
   * Distinguishing them needs either a word list (the very thing this issue exists to retire) or a
   * real clause parser (a mechanism, wanting its own ADR — filed as follow-on debt). They are shipped
   * KNOWN because none of them can fire: see the next describe.
   */
  const KNOWN_FALSE_POSITIVES = [
    'מעגל O ומעגל P משיקים זה לזה בנקודה M',
    'מעגל O ומעגל P משיקים מבפנים בנקודה M',
    'circle O and circle P are tangent at M',
    'circle O and circle P are tangent internally at M',
  ];

  const flagged = COMMAND_CATALOG.filter((c) => c.supported)
    .flatMap((c) => [c.he, c.en])
    .filter((ex) => independentConstructs(ex) !== null);

  it('the whole supported catalog is clean EXCEPT the four recorded forms', () => {
    expect([...flagged].sort()).toEqual([...KNOWN_FALSE_POSITIVES].sort());
  });

  it('the net is not vacuous — it ran over the real catalog', () => {
    expect(COMMAND_CATALOG.filter((c) => c.supported).length * 2).toBeGreaterThan(200);
  });
});

describe('#763 — operator condition 2: the net FAILS if a residual becomes reachable', () => {
  /**
   * The safety argument in one assertion. This check runs only at the ESCALATION SEAM, which by
   * construction sees nothing the deterministic grammar accepted. So a form the grammar parses can
   * never reach it — the false positives exist in the FUNCTION, not in the PRODUCT.
   *
   * That argument rests entirely on the grammar continuing to parse these four. If a rule change ever
   * makes one of them fall through to the seam, the argument collapses AND this test goes red on the
   * same commit — which is precisely what the operator asked for when approving the residual.
   */
  it.each([
    ['מעגל O ומעגל P משיקים זה לזה בנקודה M'],
    ['מעגל O ומעגל P משיקים מבפנים בנקודה M'],
    ['circle O and circle P are tangent at M'],
    ['circle O and circle P are tangent internally at M'],
  ])('the grammar still parses «%s», so it never reaches the seam', (u) => {
    const r = parse(u, CTX as never);
    expect(
      r.ok && r.commands.length > 0,
      `«${u}» no longer parses deterministically — it can now REACH the independence check, which ` +
        `would refuse a supported catalog form. ADR-460's safety argument no longer holds: either ` +
        `restore the parse or replace the residual with the real clause-level guard.`,
    ).toBe(true);
  });
});
