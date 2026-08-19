/**
 * THE RETIREMENT DIFFERENTIAL (#659 step 3 / ADR-453).
 *
 * Span accounting enforces on hard spans since the operator's flip, and it JOINS the `dropped*` gate
 * family rather than replacing it. That is deliberate, and against the flip's own first instinct
 * ("if it merely joins them, 2-D carries both mechanisms forever"): the flip session MEASURED what
 * replacement would cost and found the accountant is not yet equivalent to the gates it would retire.
 *
 * The gates' exemption sets are the accumulated knowledge of ~10 ADRs (count quantifiers, diameter
 * halving, ratio pairs, radical fractions, occurrence-vs-value accounting…). "Clean in shadow" never
 * tested any of that, because shadow mode reports what the accountant WOULD flag and nobody compared
 * it against what the gates DO flag. This file is that comparison, and it is the retirement criterion:
 * a gate may be deleted when its column here is empty.
 *
 * Two divergence directions, and they are NOT symmetric:
 *   · accountant flags / gate clean  → a FALSE REFUSAL of input the tool promises to accept. Since
 *     enforcement is live, this is a SHIPPING DEFECT — asserted empty, always.
 *   · gate flags / accountant clean  → a coverage hole in the accountant. Harmless today (the gate
 *     still fires) but it BLOCKS that gate's retirement. Recorded as a ratchet.
 *
 * METHOD NOTE, learned the hard way during the flip: this differential must run over the REAL parse
 * output. Probing a gate with hand-written commands reports divergences that do not exist — a bare
 * `segment` command accounts nothing, so the accountant "flags" a count quantifier that the real
 * lowering accounts structurally. Synthetic commands lie; the catalog is the honest corpus.
 */
import { describe, expect, it } from 'vitest';
import { COMMAND_CATALOG, droppedGivenNumbers, droppedGivenRelations, droppedNewLabels, parse } from '@/parser';
import { unaccountedSpans } from '../spanAccounting';

/** The three gates whose CATEGORY the accountant's hard buckets claim to cover. The other five read
 *  word/structure categories a token-level accountant cannot see, so they are out of scope here. */
const RETIRABLE = [
  {
    name: 'droppedNewLabels',
    adr: 'ADR-089',
    kind: 'label' as const,
    run: (u: string, c: Parameters<typeof droppedNewLabels>[1]) => droppedNewLabels(u, c).map(String),
  },
  {
    name: 'droppedGivenNumbers',
    adr: 'ADR-250',
    kind: 'number' as const,
    run: (u: string, c: Parameters<typeof droppedGivenNumbers>[1]) => droppedGivenNumbers(u, c).map(String),
  },
  {
    name: 'droppedGivenRelations',
    adr: 'ADR-264',
    kind: 'relation' as const,
    run: (u: string, c: Parameters<typeof droppedGivenRelations>[1]) => droppedGivenRelations(u, c).map(String),
  },
];

/** Every supported catalog example, both locales, through the real parse. */
const corpus = (): { utterance: string; commands: ReturnType<typeof parse> extends { commands: infer C } ? C : never }[] => {
  const rows = [];
  for (const c of COMMAND_CATALOG) {
    if (!c.supported) continue;
    for (const ex of [c.he, c.en]) {
      const r = parse(ex);
      if (r.ok) rows.push({ utterance: ex, commands: r.commands });
    }
  }
  return rows as never;
};

/**
 * The measured divergence over the catalog, recorded 2026-08-19 at the flip. Empty column ⇒ that gate
 * is a retirement candidate (its hand-authored class case must pass too — see the ADR-264 test below).
 */
const RECORDED_HOLES: Record<string, number> = {};

describe('ADR-453 — the gate-retirement differential', () => {
  const rows = corpus();

  it('the corpus is non-vacuous (a shrinking sweep would pass forever proving nothing)', () => {
    expect(rows.length).toBeGreaterThan(100);
  });

  it('NO gate-clean utterance is refused by the accountant — enforcement is live, so this must be empty', () => {
    // The false-refusal direction. A row here means a student typing a SUPPORTED catalog form is
    // escalated to the LLM (or refused) because span accounting flagged content the gates knew was
    // legitimately unclaimed. This is the one direction that ships a defect.
    const falseRefusals: string[] = [];
    for (const { utterance, commands } of rows) {
      const gateHits = RETIRABLE.flatMap((g) => g.run(utterance, commands));
      if (gateHits.length) continue; // the gates already escalate this row — the accountant agreeing is fine
      const hard = unaccountedSpans(utterance, commands);
      if (hard.length) falseRefusals.push(`${utterance} → ${hard.map((s) => `${s.kind}:${s.text}`).join(', ')}`);
    }
    expect(falseRefusals, 'span accounting refuses input every gate accepts').toEqual([]);
  });

  it('records which gates the accountant does NOT yet subsume (each blocks its own retirement)', () => {
    // The coverage-hole direction. Harmless while the gate is still wired — but a gate whose column is
    // non-empty CANNOT be deleted, because deleting it would open exactly these cases.
    const holes: Record<string, number> = {};
    for (const { utterance, commands } of rows) {
      const hard = unaccountedSpans(utterance, commands);
      for (const g of RETIRABLE) {
        if (!g.run(utterance, commands).length) continue;
        if (hard.some((s) => s.kind === g.kind)) continue; // the accountant saw it too
        holes[g.name] = (holes[g.name] ?? 0) + 1;
      }
    }
    // A RATCHET, not a mirror: the recorded set is written down, so any change — a gap closing (the
    // gate becomes retirable) or a new gap opening — fails here and forces a decision. Comparing the
    // set to itself would pass forever while proving nothing, which is the trap this repo names
    // repeatedly (`triage-mirror.test.ts`, the shadow sweep's non-vacuity check).
    expect(holes, 'the accountant/gate divergence changed — re-read #758 before updating this').toEqual(RECORDED_HOLES);
  });

  it('ADR-264 class: a relation between points that ALL already exist — the measured hole', () => {
    // The reason `droppedGivenRelations` is still wired. `accountUtterance` decides relation symbols
    // with ONE global `hasConstraint` flag: any command matching /segment|point|line|circle|…/ marks
    // every relation symbol in the utterance as accounted. So «CE⊥AB» lowered to a bare segment reads
    // clean, and with A/B/C/E all pre-existing there is no label span either — the accountant sees
    // NOTHING while the gate names the whole relation.
    const cmds = [{ type: 'segment', a: 'C', b: 'E' }] as Parameters<typeof droppedGivenRelations>[1];
    expect(droppedGivenRelations('CE⊥AB', cmds)).toEqual(['CE⊥AB']);
    expect(
      unaccountedSpans('CE⊥AB', cmds, { existingPoints: ['A', 'B', 'C', 'E'] }),
      'if this is no longer empty the accountant grew per-relation operand checking — droppedGivenRelations can retire (#758)',
    ).toEqual([]);
  });
});
