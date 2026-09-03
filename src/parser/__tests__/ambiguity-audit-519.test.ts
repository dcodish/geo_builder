/**
 * #519 — the recognized-ambiguity audit (the #516 class in 2-D).
 *
 * The 3-D #516 fix ([ADR-3D-131](../../../docs/06b-decisions-3d.md)) established the rule: *a statement
 * the parser recognizes as ambiguous must surface a typed refusal — a decline to `not-handled` hands the
 * ambiguity to the LLM lane, whose job is to guess.* This file is the 2-D audit of that class, and the
 * lock on its outcome.
 *
 * The four sites the issue named all DECLINE CORRECTLY — which shape or circle is meant is the
 * student's to say (ADR-052), and each rule says so in its own comment. What was wrong is where the
 * utterance went next. Acting as the oracle (standing rule 2 — no live call), the reading an LLM would
 * plausibly return parses AND COMMITS: «רדיוס המעגל O הוא 5», «אלכסוני ABCD נחתכים בנקודה M» and
 * «E אמצע AB» all build. So the guess reaches the figure as fact, on a pick the student never made.
 *
 * The verdicts, measured and locked below:
 *
 * | site | verdict |
 * | --- | --- |
 * | `circleForRef` / `existingCircleRef` (the two circle sites) | **routed** — `ambiguousCircleAsk` already asked, but its gate was an ALLOWLIST of five construct keywords, so every other circle-consuming construct escaped it |
 * | `trapezoidMidsegment` (parallelogram: two base pairs) | **leaked** → now asks WHICH BASE PAIR |
 * | the diagonals rule (2+ candidate quads) | **leaked** → now asks WHICH SHAPE |
 *
 * And one structural finding that made a leak unreachable rather than merely unlisted: a rule's `stop`
 * broke the parse loop before the last-resort asks could run, so a typed clarification that existed was
 * never returned.
 */
import { describe, it, expect } from 'vitest';
import { factsOf, ctxOf } from '../../__tests__/scenario-pipeline';
import { parse } from '..';
import { replay } from '../../store/geoStore';

/** Parse `line` against the figure built by `prefix`, through the real pipeline. */
const after = (prefix: string[], line: string) => parse(line, ctxOf(factsOf(prefix)));
const reasonOf = (r: ReturnType<typeof parse>) => (r.ok ? `ok:${r.commands.map((c) => c.type).join(',')}` : r.reason);

const TWO_CIRCLES = ['מעגל', 'מעגל'];

describe('#519 — a recognized ambiguity asks; it never reaches the guessing lane', () => {
  describe('the circle sites — the gate was an allowlist, not a rule', () => {
    // Every one of these reached `not-handled` (the LLM lane) before the fix EXCEPT the five that
    // happened to be in the keyword list. The list is the defect docs/17 names: an enumeration.
    const CONSUMING = [
      'נקודה P על המעגל',
      'AB משיק למעגל',
      'AB מיתר במעגל',
      'AB קוטר במעגל',
      'קשת AB במעגל',
      'רדיוס המעגל הוא 5', // ← was: → LLM
      'רדיוס המעגל הוא R', // ← was: → LLM
      'נקודה P בתוך המעגל', // ← was: → LLM
      'נקודה P מחוץ למעגל', // ← was: → LLM
      'AB חותך את המעגל בנקודה D', // ← was: → LLM, and unreachable behind a `stop`
    ];
    it.each(CONSUMING)('«%s» beside two unnamed circles ASKS which', (line) => {
      expect(reasonOf(after(TWO_CIRCLES, line))).toBe('ambiguous-circle-ref');
    });

    it('names the candidate circles, so the question can be answered', () => {
      const r = after(TWO_CIRCLES, 'רדיוס המעגל הוא 5');
      expect(r.ok).toBe(false);
      if (!r.ok && r.reason === 'ambiguous-circle-ref') expect(r.centers).toEqual(['O', 'P']);
    });

    it('and does NOT fire when the student said which — a named circle still builds', () => {
      expect(after(TWO_CIRCLES, 'רדיוס המעגל O הוא 5').ok).toBe(true);
    });

    it('nor with a single circle, where «the circle» is determined (ADR-029)', () => {
      expect(after(['מעגל'], 'רדיוס המעגל הוא 5').ok).toBe(true);
    });

    it('nor with NO circle, where the reference introduces one (ADR-376)', () => {
      expect(after(['משולש ABC'], 'נקודה P על המעגל').ok).toBe(true);
    });
  });

  describe('the shape sites', () => {
    it('two declared trapezoids: «האלכסונים נחתכים» asks WHICH SHAPE', () => {
      const r = after(['טרפז ABCD', 'טרפז EFGH'], 'האלכסונים נחתכים בנקודה M');
      expect(reasonOf(r)).toBe('ambiguous-shape');
      if (!r.ok && r.reason === 'ambiguous-shape') expect(r.shapes).toEqual(['ABCD', 'EFGH']);
    });

    it('two quads of DIFFERENT kinds, bare «האלכסונים» — still ambiguous', () => {
      expect(reasonOf(after(['טרפז ABCD', 'מקבילית EFGH'], 'האלכסונים נחתכים בנקודה M'))).toBe('ambiguous-shape');
    });

    it('a parallelogram has TWO base pairs: «קטע אמצעים» asks which pair', () => {
      const r = after(['מקבילית ABCD'], 'קטע אמצעים');
      expect(reasonOf(r)).toBe('ambiguous-shape');
      if (!r.ok && r.reason === 'ambiguous-shape') expect(r.shapes).toEqual(['AB∥DC', 'BC∥AD']);
    });

    it('a TRAPEZOID has one base pair — the midsegment is determined and still builds', () => {
      expect(after(['טרפז ABCD'], 'קטע אמצעים בטרפז ABCD').ok).toBe(true);
    });

    it('naming the shape answers the question — it builds', () => {
      expect(after(['טרפז ABCD', 'טרפז EFGH'], 'אלכסוני ABCD נחתכים בנקודה M').ok).toBe(true);
    });

    it('a single quad is NOT ambiguous — one candidate still builds', () => {
      expect(after(['טרפז ABCD'], 'האלכסונים נחתכים בנקודה M').ok).toBe(true);
    });

    it('an ABSENT shape stays `shape-not-found` — a missing referent is not an ambiguity', () => {
      expect(reasonOf(after(['משולש ABC'], 'אלכסוני הטרפז נחתכים בנקודה M'))).toBe('shape-not-found');
    });
  });

  describe('the structural finding — a `stop` must not outrank a typed question', () => {
    it('«AB חותך את המעגל» stops in lineLineIntersection, and the ask still answers', () => {
      // `lineLineIntersection` returns 'stop' on «חותך», which used to break the rule loop before the
      // last-resort asks (which sit at its end) could run. A guess was preferred to a question purely
      // because of rule ORDER.
      expect(reasonOf(after(TWO_CIRCLES, 'AB חותך את המעגל בנקודה D'))).toBe('ambiguous-circle-ref');
    });

    it('a `stop` with no ask to offer still escalates, unchanged', () => {
      // nothing ambiguous here — no circle, no candidate shapes; the stop must still reach the LLM
      expect(reasonOf(after(['משולש ABC'], 'AB חותך את הדבר המוזר בנקודה D'))).toBe('not-handled');
    });
  });

  describe('the oracle check (standing rule 2) — why the leaks mattered', () => {
    // The readings an LLM would plausibly emit for the leaked utterances. Each PARSES and COMMITS, so
    // before this fix a tool-made pick reached the figure as a stated fact.
    it.each([
      [TWO_CIRCLES, 'רדיוס המעגל O הוא 5'],
      [['מקבילית ABCD'], 'E אמצע AB'],
      [['טרפז ABCD', 'טרפז EFGH'], 'אלכסוני ABCD נחתכים בנקודה M'],
    ])('a guessed reading of %j — «%s» — builds, which is why the guess had to be prevented', (prefix, line) => {
      expect(after(prefix as string[], line).ok).toBe(true);
      const d = replay(factsOf([...(prefix as string[]), line]), 0);
      expect(Object.values(d.status).every((v) => v === 'ok')).toBe(true);
    });
  });
});
