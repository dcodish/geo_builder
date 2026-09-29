/**
 * #1203 ([ADR-554](../../../docs/06-decisions.md#adr-554)) — the over-constrained counterpart search looks
 * FORWARD too, and names the LATEST statement that completed the contradiction.
 *
 * ADR-508's drop-one search could only name a statement EARLIER than the failing one. But a later
 * statement can commit green while an earlier row goes ✗, and then the search could only blame an
 * innocent older given. Measured on the pre-change tip (`842ede39`), through `runSubmit`:
 *
 *   «משולש ABC · AB=4 · זווית ABC = α · זווית ACB = 30 · AC = 6 · α = 50»
 *   → «α = 50» COMMITS; «AC = 6» goes ✗, and the banner reads
 *     «AC = 6» סותר את «זווית ACB = 30»        ← two givens that held together a moment ago
 *
 * Operator ruling 2026-09-20, option (b): behaviour does not change (the line still commits, the earlier
 * row stays marked) — the WORDS name the statement that caused it: «AC = 6» סותר את «α = 50».
 */
import { describe, expect, it } from 'vitest';
import i18n from '@/i18n';
import { humanizeError, type Translate } from '@/i18n/humanizeError';
import { otherUtteranceForError, utteranceForError } from '@/app/errorSubject';
import { OVER_CONSTRAINED_VS } from '@/replay/core';
import { factsOf, replayFacts } from '@/__tests__/scenario-pipeline';
import { stripFormatControls } from '../../../shell/bidi';

const t: Translate = (k, o) => i18n.t(k, o) as string;

const explain = (steps: string[]) => {
  const facts = factsOf(steps);
  const fig = replayFacts(facts);
  const said = utteranceForError(facts, fig.status, fig.lastError);
  const other = otherUtteranceForError(facts, fig.lastError);
  return { facts, fig, said, other, msg: stripFormatControls(humanizeError(fig.lastError, t, said, other)) };
};

const CLASS = ['משולש ABC', 'AB=4', 'זווית ABC = α', 'זווית ACB = 30', 'AC = 6', 'α = 50'];

describe('#1203 — a later statement that completes the contradiction is the one named', () => {
  it('«α = 50» commits, «AC = 6» is the broken row, and the banner names «α = 50» — not «זווית ACB = 30»', () => {
    const { facts, fig, said, other, msg } = explain(CLASS);
    expect(fig.lastError).toMatch(OVER_CONSTRAINED_VS);
    // behaviour unchanged: the new line holds, the earlier given is the marked row
    for (const f of facts.filter((x) => x.utterance === 'α = 50')) expect(fig.status[f.id]).toBe('ok');
    expect(said).toBe('AC = 6');
    // the words changed: the statement that turned the figure infeasible is named
    expect(other).toBe('α = 50');
    expect(msg).toContain('«AC = 6» סותר את «α = 50»');
    expect(msg).not.toContain('זווית ACB = 30');
  });

  it('LATEST that restores, not merely latest: an unrelated line after it does not steal the blame', () => {
    const { other, msg } = explain([...CLASS, 'M אמצע AB']);
    expect(other).toBe('α = 50');
    expect(msg).toContain('«AC = 6» סותר את «α = 50»');
  });

  it('the refused-last-statement shape is unchanged: nothing follows it, so the earlier given is still named', () => {
    const { said, other } = explain(['משולש ABC', 'AB = 5', 'AB = 8']);
    expect(said).toBe('AB = 8');
    expect(other).toBe('AB = 5');
  });

  it('the sector sibling («גזרה») still refuses as its own statement, naming an earlier given — no later line exists to blame', () => {
    const { facts, fig, said, other } = explain(['ABC משולש ישר זוית', 'AC=15', 'BC=10', 'גזרה ABC']);
    expect(fig.lastError).toMatch(OVER_CONSTRAINED_VS);
    expect(said).toBe('גזרה ABC');
    expect(other).toBe('BC=10');
    // the earlier givens stand
    for (const f of facts.filter((x) => x.utterance !== 'גזרה ABC')) expect(fig.status[f.id]).toBe('ok');
  });
});
