/**
 * #943 — a refusal names the STATEMENT the student made, not only the engine's fragment.
 *
 * CLAUDE.md's honesty invariant: *"Error messages name the conflicting statement, never internal
 * state."* Before this, «לא ניתן: הנתון D מתלכדת עם הנקודה שנבנתה לה סותר נתון קודם» named neither
 * the sentence the student had just typed nor the given it conflicted with — so the three remedies it
 * offers were all guesses. The operator ruled half A (2026-09-08): echo the student's own sentence
 * now; naming the CONFLICTING earlier given needs constraint→fact provenance and stays open.
 *
 * The tests below lock four things:
 *  1. the end-to-end path on the operator's exact sequence — real parse → replay → the real Hebrew
 *     locale — so the message actually contains «D = חיתוך AB ו-BC»;
 *  2. the fallback — a fact with no recorded utterance renders TODAY's string, byte-identical, and
 *     never an empty «» or the word `undefined`;
 *  3. the CLASS ratchet — every pattern flagged `saysSubject` has a `_said` variant in BOTH locales;
 *  4. the AUDIT — the templates deliberately NOT swept (their subject is already a letter the student
 *     typed) are unchanged even when a sentence is available.
 */
import { describe, expect, it } from 'vitest';
import i18n from '@/i18n';
import he from '@/i18n/locales/he.json';
import en from '@/i18n/locales/en.json';
import { humanizeError, SAID_SUBJECT_KEYS, type Translate } from '@/i18n/humanizeError';
import { utteranceForError } from '@/app/errorSubject';
import type { Fact, FactStatus } from '@/replay/core';
import { factsOf, replayFacts } from '@/__tests__/scenario-pipeline';
import { stripFormatControls } from '../../../shell/bidi';

const t: Translate = (k, o) => i18n.t(k, o) as string;

/** The app wraps LTR runs in bidi ISOLATES so an RTL sentence lays out correctly (#751/ADR-W-029 —
 *  a display transform, which is why the store strips it back out of a fact's utterance). Assert on
 *  the text the student reads, not on the isolate marks. */
const read = (s: string) => stripFormatControls(s);

const OVER = 'over-constrained: D coincides with its constructed target cannot hold';

describe('#943 — the refusal quotes the student’s own sentence', () => {
  it('the operator’s sequence: the message names «D = חיתוך AB ו-BC»', () => {
    const steps = ['משולש ABC', 'זוית B ישרה', 'ריבוע DEFG חסום במשולש ABC', 'D = חיתוך AB ו-BC'];
    const facts = factsOf(steps);
    const fig = replayFacts(facts);

    // The premise: it still refuses, and the refusal is still the over-constrained shape.
    expect(fig.lastError, 'the figure still refuses — this fix is about what it SAYS').toMatch(/over-constrained/);

    // The link ADR-398 guarantees: the banner's error is some enabled fact's status, and that fact is
    // the LAST step — not one of the three that built fine.
    const said = utteranceForError(facts, fig.status, fig.lastError);
    expect(said, 'the owning fact is found, and it is the sentence the student just typed').toBe('D = חיתוך AB ו-BC');

    const msg = read(humanizeError(fig.lastError, t, said));
    expect(msg, 'the student’s sentence is the subject').toContain('D = חיתוך AB ו-BC');
    expect(msg, 'the engine fragment survives as the reason, not the headline').toContain('סותר נתון קודם');
    expect(msg, 'the i18n key resolved').not.toContain('errors.');
  });

  it('no utterance ⇒ today’s message, byte-identical — never an empty «» or `undefined`', () => {
    const before = humanizeError(OVER, t);
    for (const said of [undefined, '', '   ']) {
      const out = humanizeError(OVER, t, said);
      expect(out, `said=${JSON.stringify(said)} falls back`).toBe(before);
    }
    expect(before).not.toContain('undefined');
    expect(before).not.toContain('«»');
  });

  it('utteranceForError: only an ENABLED fact that owns this very error, and only a real sentence', () => {
    const status: Record<string, FactStatus> = { a: 'ok', b: OVER, c: OVER, d: OVER };
    const f = (id: string, utterance: string | undefined, enabled = true): Fact =>
      ({ id, utterance, enabled, cmd: { type: 'triangle', ids: ['A', 'B', 'C'] } } as unknown as Fact);

    expect(utteranceForError([f('a', 'משולש ABC'), f('b', 'D = חיתוך AB ו-BC')], status, OVER)).toBe('D = חיתוך AB ו-BC');
    // a muted row is not the student's live statement
    expect(utteranceForError([f('b', 'מוסתר', false), f('c', 'הנכון')], status, OVER)).toBe('הנכון');
    // a direct command carries no utterance → undefined, so the caller renders the base template
    expect(utteranceForError([f('d', undefined)], status, OVER)).toBeUndefined();
    expect(utteranceForError([f('d', '   ')], status, OVER)).toBeUndefined();
    // nothing owns it, or there is no error at all
    expect(utteranceForError([f('a', 'משולש ABC')], status, OVER)).toBeUndefined();
    expect(utteranceForError([f('b', 'x')], status, null)).toBeUndefined();
  });

  it('the CLASS ratchet: every flagged template has a `_said` variant in both locales', () => {
    expect(SAID_SUBJECT_KEYS.length, 'the sweep is not empty').toBeGreaterThan(0);
    for (const key of SAID_SUBJECT_KEYS) {
      const leaf = key.replace(/^errors\./, '');
      for (const [name, bundle] of [['he', he], ['en', en]] as const) {
        const errs = (bundle as unknown as { errors: Record<string, unknown> }).errors;
        expect(typeof errs[leaf], `${name}.json has ${leaf}`).toBe('string');
        expect(typeof errs[`${leaf}_said`], `${name}.json has ${leaf}_said`).toBe('string');
        expect(errs[`${leaf}_said`] as string, `${name}.json ${leaf}_said interpolates the sentence`).toContain('{{said}}');
      }
    }
  });

  it('the flagged templates render the sentence; each keeps its own dynamic data', () => {
    const said = 'D = חיתוך AB ו-BC';
    const cases: { raw: string; keeps: string }[] = [
      { raw: OVER, keeps: 'מתלכדת' }, // the lowered-constraint fragment, translated
      { raw: '|AB| = |AD| references an unknown point', keeps: '|AB| = |AD|' },
      { raw: 'non-finite position computed', keeps: '' },
    ];
    for (const { raw, keeps } of cases) {
      const out = read(humanizeError(raw, t, said));
      expect(out, `${raw} names the sentence`).toContain(said);
      expect(out, `${raw} resolved its key`).not.toContain('errors.');
      if (keeps) expect(out, `${raw} keeps its reason`).toContain(keeps);
    }
  });

  it('the AUDIT: templates whose subject is already the student’s own letters are NOT swept', () => {
    // These name a point/segment the student typed, so a student can tell which sentence was
    // rejected without the echo. Deliberately unflagged — recorded here so a later sweep that adds
    // them is a decision, not a drift. (ADR: the full audit.)
    const unswept = [
      "'O' is already defined — it can't be redefined as something different",
      'cannot place F on segment AB so that |AC| = 9',
      'C and E would be at the same point',
    ];
    for (const raw of unswept) {
      expect(humanizeError(raw, t, 'משולש ABC'), raw).toBe(humanizeError(raw, t));
    }
  });
});
