/**
 * #782 (ADR-461) — the honesty-gate battery is ONE function, and both commit seams ask it.
 *
 * The defect: `App.commitEdit` parsed the edited text and committed straight to `replaceGroup`, running
 * none of the `dropped*` gates and no span accounting. So an edit that produced a PARTIAL parse landed
 * silently with the student's stated content gone — the exact class the submit gates exist to refuse,
 * one seam over, and silently bypassable for every gate added since ADR-089.
 *
 * These lock the CLASS, not the reported cell: that `honestyGateReport` is the single answer both seams
 * receive, and that it trips on each gate family. The submit pipeline's own behaviour is unchanged by
 * construction (it now calls the function that used to be its inline block), which the whole corpus
 * asserts; what is new is that the same verdict is available to — and taken by — the edit seam.
 */
import { describe, it, expect } from 'vitest';
import { parse } from '@/parser';
import { honestyGateReport, CONTEXT_FREE_GATES } from '../honestyGates';
import type { AnyCommand } from '@/engine';

/** The battery's verdict on one utterance parsed against a given point context. */
const gateOf = (utterance: string, points: string[] = []) => {
  const r = parse(utterance, { points });
  expect(r.ok, `precondition: «${utterance}» must parse for this to be a GATE question`).toBe(true);
  return honestyGateReport(utterance, r.ok ? r.commands : ([] as AnyCommand[]), { points });
};

describe('#782 — the battery is a function, so a seam cannot accidentally lack it', () => {
  it('a clean, fully-accounted step passes', () => {
    const g = gateOf('משולש ABC');
    expect(g.clean).toBe(true);
    expect(g.items).toEqual([]);
  });

  it('the canonical edit from the issue — a PARTIAL parse — is NOT clean, and names what was left unread', () => {
    // «מרכזו O. שתי נקודות על המעגל A ו B»: the lowering takes the circle and drops the two stated
    // points. Before this fix the ✎ seam committed it; the note must now carry the student's own tokens.
    const g = gateOf('מרכזו O. שתי נקודות על המעגל A ו B');
    expect(g.clean).toBe(false);
    expect(g.items.length).toBeGreaterThan(0);
    // The honesty invariant: what is shown is the STUDENT'S text, never a gate name or internal state.
    for (const item of g.items) expect(item).not.toMatch(/dropped|unaccounted|gate/i);
  });

  it('the report is a FULL account, not a first-failure short-circuit', () => {
    const g = gateOf('מרכזו O. שתי נקודות על המעגל A ו B');
    // Every field is present and typed even when its own gate is silent — the seam decides what to do,
    // the battery never decides what to look at.
    expect(g).toHaveProperty('dropped');
    expect(g).toHaveProperty('droppedNums');
    expect(g).toHaveProperty('droppedRels');
    expect(g).toHaveProperty('droppedVerbs');
    expect(g).toHaveProperty('droppedCompound');
    expect(g).toHaveProperty('droppedWordRels');
    expect(g).toHaveProperty('droppedCmp');
    expect(g).toHaveProperty('droppedConstruct');
    expect(g).toHaveProperty('unaccounted');
  });

  it('`clean` is exactly "no gate fired" — the two can never disagree', () => {
    for (const u of ['משולש ABC', 'ריבוע ABCD', 'מרכזו O. שתי נקודות על המעגל A ו B']) {
      const g = gateOf(u);
      const anyFired =
        g.dropped.length > 0 ||
        g.droppedNums.length > 0 ||
        g.droppedRels.length > 0 ||
        g.droppedVerbs.length > 0 ||
        g.droppedCompound.length > 0 ||
        g.droppedWordRels.length > 0 ||
        g.droppedCmp ||
        g.droppedConstruct.length > 0 ||
        g.unaccounted.length > 0;
      expect(g.clean, `«${u}»`).toBe(!anyFired);
    }
  });

  it('an EXISTING point the edit does not re-name is context, not a drop (the exemption survives extraction)', () => {
    const r = parse('AB = 5', { points: ['A', 'B'] });
    expect(r.ok).toBe(true);
    expect(honestyGateReport('AB = 5', r.ok ? r.commands : [], { points: ['A', 'B'] }).clean).toBe(true);
  });

  it('the context-free gate MAP is what the corpus net iterates — membership is mechanical, not hand-listed', () => {
    // If this list is ever trimmed, the corpus-wide false-positive net silently stops measuring a gate.
    expect(Object.keys(CONTEXT_FREE_GATES).sort()).toEqual([
      'droppedComparison',
      'droppedCompoundRelation',
      'droppedConstructNoun',
      'droppedGivenNumbers',
      'droppedGivenRelations',
      'droppedGivenVerbs',
      'droppedMidsegment',
      'droppedRadiusSymbol',
      'droppedRegionSubject',
      'droppedWordRelations',
    ]);
    for (const [name, gate] of Object.entries(CONTEXT_FREE_GATES)) {
      expect(typeof gate, name).toBe('function');
    }
  });
});
