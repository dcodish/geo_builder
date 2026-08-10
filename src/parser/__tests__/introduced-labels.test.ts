/**
 * #255 — the honesty battery guarantees "nothing DROPPED"; this is the half that guarantees
 * "nothing ADDED".
 *
 * `droppedNewLabels` (ADR-089) returns `inputLabels.filter(…)` — it ranges only over labels extracted
 * FROM THE UTTERANCE, so it is structurally blind to labels the lowering introduces. Session
 * `i1mt2us8` (2026-07-21): «AB חותך את CD» escalated, the LLM normalised it to «M חיתוך AB ו-CD» —
 * inventing the point M — and the log records `dropped: []`. A labelled node entered the student's
 * namespace with no gate tripped and no notice. ADR-383 gave the bare crossing statement a
 * deterministic lane, closing the reported vector; the hole itself is general.
 *
 * The gate keys on the LLM's CANONICAL LINES rather than on the commands, and that choice is the whole
 * design: the grammar legitimately mints labels while lowering (a foot, a midpoint, the ADR-263/270
 * auto-label family), so a command-side gate would need a list of every auto-naming construct — the
 * enumeration-is-not-a-rule trap, and the reason this gate did not already exist. A label the LLM
 * WROTE, that the student never wrote and the figure does not have, is an invention; a label the
 * grammar mints while lowering that line appears in no line at all.
 */
import { describe, expect, it } from 'vitest';
import { introducedNewLabels } from '@/parser';

describe('#255 — the reported session (i1mt2us8): the LLM invents a point', () => {
  it('«AB חותך את CD» normalised to «M חיתוך AB ו-CD» names M as invented', () => {
    expect(introducedNewLabels('AB חותך את CD', ['M חיתוך AB ו-CD'])).toEqual(['M']);
  });

  it('the same decomposition WITHOUT the invention passes', () => {
    expect(introducedNewLabels('AB חותך את CD', ['AB חותך את CD'])).toEqual([]);
  });

  it('once the student names the point themselves, it is theirs and never flagged', () => {
    expect(introducedNewLabels('M נקודת החיתוך של AB ו-CD', ['M חיתוך AB ו-CD'])).toEqual([]);
  });
});

describe('#255 — what must NEVER be flagged (a false flag would refuse a working decomposition)', () => {
  it('a label already ON THE FIGURE is context, not an invention', () => {
    // «המשולש» expanded to its letters is the LLM doing its job — those points exist.
    expect(introducedNewLabels('המשולש שווה שוקיים', ['משולש ABC שווה שוקיים'], ['A', 'B', 'C'])).toEqual([]);
  });

  it('a label the GRAMMAR mints while lowering appears in no line, so it cannot be seen here', () => {
    // The canonical line names no point; the foot/midpoint the lowering creates is invisible to this
    // gate BY CONSTRUCTION — which is why the gate reads lines rather than commands.
    expect(introducedNewLabels('העבר אנך מ-A אל BC', ['אנך מ-A אל BC'])).toEqual([]);
  });

  it('scaffolding ids are not uppercase label runs, so they are exempt by construction', () => {
    expect(introducedNewLabels('משולש ABC', ['משולש ABC', '~aux-1 @tang-2'])).toEqual([]);
  });

  it('multi-line decompositions are judged as a whole, each label once', () => {
    expect(introducedNewLabels('ריבוע ABCD', ['ריבוע ABCD', 'E אמצע AB', 'F אמצע CD'])).toEqual(['E', 'F']);
  });

  it('normalisation matches the dropped-side gate (subscripts glued: O_1 ≡ O1)', () => {
    expect(introducedNewLabels('מעגל O_1', ['מעגל O1'])).toEqual([]);
  });

  it('an empty decomposition invents nothing', () => {
    expect(introducedNewLabels('משולש ABC', [])).toEqual([]);
  });
});
