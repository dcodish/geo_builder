/**
 * #1231 (ADR-AG-110) — a cevian's apex may not lie on the side it is drawn to.
 *
 * Operator report, 2026-09-19 (screenshot): the tool ACCEPTED «BD תיכון לצלע AB» and drew it. `B` is
 * an endpoint of `AB`, so no median from `B` to `AB` exists. Measured before the fix, `|BD|` was
 * exactly `|AB|/2` at every seed with `faults: []` — the segment drawn as a *median* was the second
 * half of the side it was supposedly drawn to, and the tool asserted the figure was correct.
 *
 * The rule validated only the SIDE's internal well-formedness (`u === v`) and then emitted
 * unconditionally: it checked the letters of one operand and never the relation between the two,
 * which is the part «תיכון»/«גובה» actually asserts.
 *
 * THE LOCK IS A TABLE OVER THE CLASS — `{תיכון, גובה} × {median, altitude} × {apex=u, apex=v,
 * apex=foot, foot=u, foot=v}` — not the reported cell, and it CALLS `parseLine` rather than
 * re-implementing the predicate ([ADR-W-053](../../docs/06w-decisions-workspace.md)).
 *
 * The NEGATIVE control is the lock that matters: the gate must not have eaten the feature.
 */
import { describe, expect, it } from 'vitest';
import { parseLine } from '../parser/parseAnalytic';

const outcome = (line: string): string => {
  const r = parseLine(line);
  return r.ok ? 'ok' : r.code;
};

describe('ADR-AG-110 — the role’s own incidence is checked (#1231)', () => {
  // ── the five degenerate shapes, both roles, both locales ──
  it.each([
    // apex is an endpoint of the side
    ['he median apex=u', 'BD תיכון לצלע AB'],
    ['he median apex=v', 'AD תיכון לצלע AB'],
    ['he altitude apex=u', 'BD גובה לצלע AB'],
    ['he altitude apex=v', 'AD גובה לצלע AB'],
    ['en median apex=u', 'BD is the median to side AB'],
    ['en altitude apex=u', 'BD is the altitude to side AB'],
    // apex IS the foot — a zero-length cevian
    ['he median apex=foot', 'AA תיכון לצלע BC'],
    ['he altitude apex=foot', 'AA גובה לצלע BC'],
    ['en median apex=foot', 'AA is the median to side BC'],
    ['en altitude apex=foot', 'AA is the altitude to side BC'],
    // the foot is an endpoint of the side — left to the solver's `unsatisfiable` before, refused here
    ['he median foot=u', 'AB תיכון לצלע BC'],
    ['he median foot=v', 'AC תיכון לצלע BC'],
    ['he altitude foot=u', 'AB גובה לצלע BC'],
    ['he altitude foot=v', 'AC גובה לצלע BC'],
    ['en median foot=u', 'AB is the median to side BC'],
    // the ב-prefixed and «נתון»-prefixed spellings ride the same rule and must not slip past it
    ['he given-prefixed', 'נתון BD תיכון לצלע AB'],
    ['he with triangle tail', 'BD תיכון לצלע AB במשולש ABC'],
  ])('%s is refused as degenerate-role', (_name, line) => {
    expect(outcome(line as string)).toBe('degenerate-role');
  });

  /**
   * The code is its OWN, not `repeated-vertex`. Nothing repeats inside a run in the rows above —
   * «AB» is a good side and «BD» a good segment — so telling the student "the same letter appears
   * twice" would send them to fix a run that is already correct. «AD תיכון לצלע BB» is the sentence
   * that genuinely repeats, and it keeps its own answer.
   */
  it('a genuinely repeated run still gets repeated-vertex', () => {
    expect(outcome('AD תיכון לצלע BB')).toBe('repeated-vertex');
  });

  /**
   * A refusal, never `null`. `null` routes a sentence this rule clearly matched to the LLM seam,
   * which #1039/#1042 ruled against in this tree: a rule that matched owes the student an answer.
   */
  it('a matched sentence is never sent to the not-handled seam', () => {
    expect(outcome('BD תיכון לצלע AB')).not.toBe('not-handled');
  });

  // ── THE NEGATIVE CONTROL: the gate has not eaten the feature ──
  it.each([
    ['he median', 'AD תיכון לצלע BC'],
    ['he altitude', 'AD גובה לצלע BC'],
    ['en median', 'AD is the median to side BC'],
    ['en altitude', 'AD is the altitude to side BC'],
    ['he given-prefixed', 'נתון AD תיכון לצלע BC'],
    ['he with triangle tail', 'AD תיכון לצלע BC במשולש ABC'],
  ])('%s still builds', (_name, line) => {
    expect(outcome(line as string)).toBe('ok');
  });

  /**
   * The remedy the refusal message teaches must actually WORK — a message that names a spelling
   * which returns the same refusal is worse than none (the #1156/#1183 lesson). The Hebrew message
   * teaches «AD תיכון לצלע BC»; it is asserted here, driven, not read.
   */
  it('the spelling the refusal message teaches builds', () => {
    const r = parseLine('AD תיכון לצלע BC');
    expect(r.ok).toBe(true);
    if (r.ok) {
      // and it lowers to the full conjunction ADR-AG-109 established — incidence AND the role
      const kinds = r.facts.flatMap((f) => ('k' in f && f.k ? [(f.k as { t: string }).t] : []));
      expect(kinds).toContain('on-line-2pt');
      expect(kinds).toContain('midpoint');
    }
  });

  /**
   * #1232's conjunction must survive: an altitude still lowers to the incidence AND the
   * perpendicularity, never one of them. A gate added to this rule is exactly the kind of edit that
   * would quietly drop a leg.
   */
  it('the altitude still lowers to both halves of its definition', () => {
    const r = parseLine('AD גובה לצלע BC');
    expect(r.ok).toBe(true);
    if (r.ok) {
      const kinds = r.facts.flatMap((f) => ('k' in f && f.k ? [(f.k as { t: string }).t] : []));
      expect(kinds).toContain('on-line-2pt');
      expect(kinds).toContain('perpendicular');
    }
  });
});
