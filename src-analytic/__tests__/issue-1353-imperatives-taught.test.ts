/**
 * NON-CANONICAL INPUT IS TAUGHT, NEVER SILENTLY ACCEPTED — #1353, slice (e) of #778
 * ([ADR-W-030](../../docs/06w-decisions-workspace.md#adr-w-030)).
 *
 * The operator's ruling: *"I don't want the tool to support the wrong text input because it teaches
 * them wrong."* Measured before this shipped: 42 of the 1,470 wrapper × catalog pairs were accepted by
 * the grammar, and where their referents existed they COMMITTED — so the imperative was recorded as
 * the student's own sentence and read back from the fact list.
 *
 * ## These cases CALL the decision — they do not reproduce it
 *
 * Every assertion goes through {@link decideSubmit}, the same function `App.tsx` calls, and the
 * catalog and the verb lexicon are IMPORTED rather than copied. So a new catalog entry and a new verb
 * are both covered the moment they are added, and a change to the submit path either keeps this green
 * or breaks it — it cannot leave it testing a path that no longer exists (the #1102 lesson, restated
 * in `app/submit.ts`'s own docblock, and the memory note *locks must call, not reproduce*).
 */
import { describe, it, expect } from 'vitest';
import { decideSubmit } from '../app/submit';
import { parseLine } from '../parser/parseAnalytic';
import { COMMAND_CATALOG_ANALYTIC } from '../parser/catalogAnalytic';
import { IMPERATIVE_VERBS_HE, IMPERATIVE_VERBS_EN, imperativeCandidates } from '../parser/scopeAnalytic';

const HE = COMMAND_CATALOG_ANALYTIC.map((c) => c.he);
const EN = COMMAND_CATALOG_ANALYTIC.map((c) => c.en);

/**
 * A figure in which the ratio sentence has its referents. «C מחלקת את AB ביחס 3:2» needs an A and a
 * B; with neither, the whole family is refused before teaching arises — which is its own case below.
 */
const AB = ['נקודה A(0,0)', 'נקודה B(10,0)'];

describe('#1353 — an imperative wrapper is taught, never committed', () => {
  /**
   * THE PROPERTY, over the WHOLE catalog rather than a sample, and in both an empty and a populated
   * figure.
   *
   * The catalog is the coverage map, so "no catalog line prefixed with an imperative commands" is the
   * honest form of this promise — #778 states it in exactly those words. A sample would have missed
   * the 42, which were two lines out of seventy.
   */
  it('no catalog line, in either language, commands when an imperative is put in front of it', () => {
    const committed: string[] = [];
    for (const context of [[], AB] as const) {
      for (const [verbs, lines] of [[IMPERATIVE_VERBS_HE, HE], [IMPERATIVE_VERBS_EN, EN]] as const) {
        for (const verb of verbs) {
          for (const line of lines) {
            const v = decideSubmit(`${verb} ${line}`, context, 0);
            if (v.kind === 'record' || v.kind === 'already-known' || v.kind === 'already-follows') {
              committed.push(`[${context.length}] ${verb} ${line} -> ${v.kind}`);
            }
          }
        }
      }
    }
    expect(committed, 'an imperative wrapper must never reach the fact list').toEqual([]);
  });

  /**
   * The forms that used to build now TEACH — not merely stop building. A refusal here would be its
   * own regression: the tool understood the sentence perfectly and would be pretending not to.
   */
  it('the forms that used to build silently now teach the textbook sentence', () => {
    const cases = [
      ['הוסף C מחלקת את AB ביחס 3:2', 'C מחלקת את AB ביחס 3:2'],
      ['סמן C מחלקת את AB ביחס 3:2', 'C מחלקת את AB ביחס 3:2'],
      ['תצייר לי C מחלקת את AB ביחס 3:2', 'C מחלקת את AB ביחס 3:2'],
      ['add C divides AB in ratio 3:2', 'C divides AB in ratio 3:2'],
    ] as const;
    for (const [typed, taught] of cases) {
      const v = decideSubmit(typed, AB, 0);
      expect(v.kind, typed).toBe('teach');
      if (v.kind !== 'teach') continue;
      expect(v.canonical, typed).toBe(taught);
      expect(typed.startsWith(v.verb), "the verb quoted back is the student's own word").toBe(true);
    }
  });

  /**
   * THE TRAP THIS FEATURE MUST NOT SET — found by walking the case, not by reasoning about it.
   *
   * The first cut gated the lesson on `parseLine` alone. On an empty canvas «C מחלקת את AB ביחס 3:2»
   * PARSES and the fold then refuses it (`unknown-reference`: no A, no B). So the tool pre-filled a
   * sentence, told the student to press Enter, and refused them for pressing Enter — strictly worse
   * than the silent acceptance the feature exists to remove.
   *
   * The promise is therefore about the WHOLE gate, not the grammar: what is taught is what this same
   * function would record, in this figure, now.
   */
  it('what it teaches, the very next Enter ACCEPTS — the whole gate, not just the parser', () => {
    const v = decideSubmit('הוסף C מחלקת את AB ביחס 3:2', AB, 0);
    expect(v.kind).toBe('teach');
    if (v.kind !== 'teach') return;
    expect(decideSubmit(v.canonical, AB, 0).kind, 'the pre-filled sentence must be accepted').toBe('record');
  });

  it('and where the sentence would NOT be accepted, nothing is taught — the honest refusal stands', () => {
    const v = decideSubmit('הוסף C מחלקת את AB ביחס 3:2', [], 0);
    expect(v.kind).toBe('refused');
    if (v.kind !== 'refused') return;
    expect(v.error.key, 'the student hears the real problem: A and B do not exist').toBe('unknown-reference');
  });

  /**
   * The same property at catalog scale, in both figures — so it covers whatever teaching actually
   * happens without having to predict which lines have their referents.
   */
  it('every sentence it teaches is one the gate accepts', () => {
    const bad: string[] = [];
    for (const context of [[], AB] as const) {
      for (const verb of IMPERATIVE_VERBS_HE) {
        for (const line of HE) {
          const v = decideSubmit(`${verb} ${line}`, context, 0);
          if (v.kind !== 'teach') continue;
          if (!parseLine(v.canonical).ok) bad.push(`unparsable: ${verb} ${line} -> ${v.canonical}`);
          if (decideSubmit(v.canonical, context, 0).kind !== 'record') bad.push(`unaccepted: ${verb} ${line} -> ${v.canonical}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  /**
   * A sentence that merely OPENS with a verb-like word, and has no real sentence underneath, is left
   * completely alone — it takes the ordinary path, which for `not-handled` is the LLM seam. Without
   * this the register would dismember input it does not understand.
   */
  it('a wrapper with nothing parsable under it is untouched', () => {
    for (const raw of ['הוסף', 'הוסף בבקשה', 'צייר משהו יפה', 'draw something nice', 'הצג נתונים']) {
      expect(decideSubmit(raw, AB, 0).kind, raw).not.toBe('teach');
    }
  });

  /** A bare, unwrapped catalog line is unaffected — the control, and the thing that must not regress. */
  it('an ordinary catalog line still records', () => {
    for (const line of ['נקודה A(2,3)', 'נתון מעגל I שמשוואתו (x-3)^2+(y-4)^2=9']) {
      expect(decideSubmit(line, [], 0).kind, line).toBe('record');
    }
  });

  describe('the candidate reader', () => {
    it('offers the tightest reading first, and keeps the looser one as a fallback', () => {
      expect(imperativeCandidates('תצייר לי משולש ABC')).toEqual([
        { verb: 'תצייר', remainder: 'משולש ABC' },
        { verb: 'תצייר', remainder: 'לי משולש ABC' },
      ]);
      expect(imperativeCandidates('draw me a triangle ABC')).toEqual([
        { verb: 'draw', remainder: 'triangle ABC' },
        { verb: 'draw', remainder: 'me a triangle ABC' },
      ]);
    });

    it('a bare verb states nothing to teach', () => {
      expect(imperativeCandidates('הוסף')).toEqual([]);
      expect(imperativeCandidates('add')).toEqual([]);
    });

    it('a sentence that does not open with a verb is not a wrapper', () => {
      expect(imperativeCandidates('משולש ABC')).toEqual([]);
      expect(imperativeCandidates('נקודה A(2,3)')).toEqual([]);
    });
  });
});
