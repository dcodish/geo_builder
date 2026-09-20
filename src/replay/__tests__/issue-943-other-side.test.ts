/**
 * #943 half B ([ADR-508](../../../docs/06-decisions.md#adr-508)) — an over-constrained refusal names BOTH
 * statements.
 *
 * Measured on `d440f01` (real parse → replay → the real Hebrew locale), the operator's sequence:
 *
 *   «משולש ABC» · «∠ABC = 90» · «ריבוע DEFG חסום במשולש ABC» · «D = חיתוך AB ו-EF»
 *   → «לא ניתן: «D = חיתוך AB ו-EF» סותר נתון קודם — …»          the other side never named
 *
 * Half A (ADR-487) made the refused sentence the subject. The fold knew WHICH statement failed (the
 * ADR-492 pass) but never asked AGAINST WHAT; `humanizeError` — figure-free — structurally could not.
 * Now a bounded drop-one search in the same attribution block re-folds the prefix with each relevant
 * earlier STATEMENT removed; the latest whose removal makes the failing statement hold is the
 * conflicting given, carried as a structured `[vs #<index>]` tail and resolved to words by
 * `otherUtteranceForError`. No single removal restores it ⇒ none is named and the `_said` wording stands.
 * Cost only on the refused path — the counter lock below.
 *
 * SENTENCE CHANGED 2026-09-20 (ADR-531, #1274): he typed «D = חיתוך AB ו-BC». Its two carriers share B,
 * and the operator has since ruled that such a sentence is REFUSED BY NAME before it becomes a fact —
 * so it can no longer scaffold an over-constraint. «D = חיתוך AB ו-EF» redefines the same square vertex
 * and was measured to produce the identical refusal, subject and other-side attribution. His original
 * sentence is covered as a refusal in src/app/__tests__/issue-1274-crossing-already-named.test.ts.
 */
import { describe, expect, it } from 'vitest';
import i18n from '@/i18n';
import he from '@/i18n/locales/he.json';
import en from '@/i18n/locales/en.json';
import { humanizeError, OTHER_SUBJECT_KEYS, type Translate } from '@/i18n/humanizeError';
import { otherUtteranceForError, utteranceForError } from '@/app/errorSubject';
import { conflictSearchStats, OVER_CONSTRAINED_VS, replay } from '@/replay/core';
import { factsOf, replayFacts } from '@/__tests__/scenario-pipeline';
import { stripFormatControls } from '../../../shell/bidi';

const t: Translate = (k, o) => i18n.t(k, o) as string;
const read = (s: string) => stripFormatControls(s);

const explain = (steps: string[]) => {
  const facts = factsOf(steps);
  const fig = replayFacts(facts);
  const said = utteranceForError(facts, fig.status, fig.lastError);
  const other = otherUtteranceForError(facts, fig.lastError);
  return { facts, fig, said, other, msg: read(humanizeError(fig.lastError, t, said, other)) };
};

describe('#943 half B — the refusal names the conflicting earlier given', () => {
  it('the operator’s exact sequence names «ריבוע DEFG חסום במשולש ABC» as the other side', () => {
    const { fig, said, other, msg } = explain(['משולש ABC', '∠ABC = 90', 'ריבוע DEFG חסום במשולש ABC', 'D = חיתוך AB ו-EF']);
    expect(fig.lastError).toMatch(OVER_CONSTRAINED_VS);
    expect(said).toBe('D = חיתוך AB ו-EF');
    expect(other).toBe('ריבוע DEFG חסום במשולש ABC');
    expect(msg).toContain('«D = חיתוך AB ו-EF» סותר את «ריבוע DEFG חסום במשולש ABC»');
    expect(msg).not.toContain('סותר נתון קודם');
    expect(msg).not.toContain('errors.');
  });

  it.each([
    [['משולש ABC', 'AB = 5', 'AB = 8'], 'AB = 8', 'AB = 5'],
    [['משולש ABC', '∠ABC = 90', '∠ABC = 60'], '∠ABC = 60', '∠ABC = 90'],
  ])('%j → «%s» contradicts «%s» (a plain earlier given is named)', (steps, saidExp, otherExp) => {
    const { said, other, msg } = explain(steps);
    expect(said).toBe(saidExp);
    expect(other).toBe(otherExp);
    expect(msg).toContain(`«${saidExp}» סותר את «${otherExp}»`);
  });

  it('a jointly-infeasible set with no single culprit keeps the `_said` wording — never a false naming', () => {
    // ∠ABC = 90 and AB ⟂ BC say the same thing: removing either leaves the other to forbid 60°
    const { fig, said, other, msg } = explain(['משולש ABC', '∠ABC = 90', 'AB ⟂ BC', '∠ABC = 60']);
    expect(fig.lastError).toMatch(/^over-constrained: .+ cannot hold$/);
    expect(said).toBe('∠ABC = 60');
    expect(other).toBeUndefined();
    expect(msg).toContain('«∠ABC = 60» סותר נתון קודם');
  });

  it('the banner and every row of the refused statement carry ONE string (ADR-398), tail included', () => {
    const { facts, fig } = explain(['משולש ABC', 'AB = 5', 'AB = 8']);
    const rows = facts.filter((f) => f.utterance === 'AB = 8').map((f) => fig.status[f.id]);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r).toBe(fig.lastError);
  });

  it('the English locale renders the `_said_vs` variant too', () => {
    const { fig, said, other } = explain(['משולש ABC', 'AB = 5', 'AB = 8']);
    const tEn: Translate = (k, o) => i18n.getFixedT('en')(k, o) as string;
    const msg = read(humanizeError(fig.lastError, tEn, said, other));
    expect(msg).toContain('«AB = 8» contradicts «AB = 5»');
  });
});

describe('#943 half B — the guards', () => {
  it('COUNTER LOCK: a green replay runs no search fold', () => {
    const before = conflictSearchStats.folds;
    for (const steps of [['משולש ABC', 'AB = 5', 'BC = 4'], ['ריבוע ABCD', 'AB = 6'], ['מעגל O', 'משיק למעגל O בנקודה B']]) {
      const facts = factsOf(steps);
      const fig = replayFacts(facts);
      expect(fig.lastError, steps.join(' · ')).toBeNull();
      replay(facts, 1);
    }
    expect(conflictSearchStats.folds).toBe(before);
  });

  it('a refused replay runs a bounded number of search folds, and re-replaying the same content runs none more', () => {
    const facts = factsOf(['משולש ABC', 'AB = 5', 'AB = 8']);
    replayFacts(facts);
    const before = conflictSearchStats.folds;
    replay(facts, 3);
    replay(facts, 5);
    expect(conflictSearchStats.folds).toBe(before); // the fold is memoised; the tail rides the memo
  });

  it('the resolver: no tail ⇒ undefined; a tail ⇒ that fact’s words; an index off the list ⇒ undefined', () => {
    const facts = factsOf(['משולש ABC', 'AB = 5']);
    expect(otherUtteranceForError(facts, 'over-constrained: |AB| = 8 cannot hold')).toBeUndefined();
    expect(otherUtteranceForError(facts, 'over-constrained: |AB| = 8 cannot hold [vs #1]')).toBe('AB = 5');
    expect(otherUtteranceForError(facts, 'over-constrained: |AB| = 8 cannot hold [vs #9]')).toBeUndefined();
    expect(otherUtteranceForError(facts, null)).toBeUndefined();
  });

  it('humanizeError: the tail never leaks — `what` is the bare reason, and without `other` the `_said` variant renders', () => {
    const raw = 'over-constrained: |AB| = 8 cannot hold [vs #1]';
    expect(read(humanizeError(raw, t, 'AB = 8'))).toContain('«AB = 8» סותר נתון קודם');
    expect(read(humanizeError(raw, t, 'AB = 8'))).not.toContain('vs #');
    expect(read(humanizeError(raw, t))).not.toContain('vs #');
    expect(read(humanizeError(raw, t, 'AB = 8', 'AB = 5'))).not.toContain('vs #');
  });

  it('RATCHET: every key that can name the other side has a `_said_vs` variant in BOTH locales', () => {
    expect(OTHER_SUBJECT_KEYS).toContain('errors.overConstrained');
    const get = (obj: unknown, key: string) => key.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), obj);
    for (const key of OTHER_SUBJECT_KEYS) {
      for (const [name, loc] of [['he', he], ['en', en]] as const) {
        const s = get(loc, `${key}_said_vs`);
        expect(typeof s, `${name}: ${key}_said_vs`).toBe('string');
        expect(s as string).toContain('{{said}}');
        expect(s as string).toContain('{{other}}');
      }
    }
  });
});
