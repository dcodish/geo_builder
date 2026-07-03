/**
 * Parser shadow-matrix guard ([docs/15-hardening-plan.md](../../../docs/15-hardening-plan.md) A1 / PAR-11).
 *
 * `parse()` is first-match-wins over the ordered `RULES` array. Ordering is defended only by hand-written
 * cases, so the recurring parser bug class (ADR-119 parallel-chords, ADR-077, ADR-166's parser half, and
 * the silent mis-parses the 2026-07-02 review found) is always the same shape: an earlier, coarser rule
 * CLAIMS a fragment that a later, more-specific rule should own — and because the earlier rule returns a
 * (partial) command array, the parse commits it silently.
 *
 * This test runs EVERY rule against a corpus (not stopping at the first match) and records, per utterance:
 *   - `winner`      — the rule `parse()` actually uses (first to return an array / 'stop' / clarify);
 *   - `shadowedBy`  — LATER rules that also return an array whose output DIVERGES from the winner's.
 *
 * A non-empty `shadowedBy` is a *candidate* shadow (two rules read the same input differently). The
 * snapshots below pin the current behaviour: a future keyword edit or new rule that changes a winner, or
 * creates a new divergent claimer, produces a reviewable snapshot diff — the structural guard the parser
 * lacked. It is intentionally zero-runtime-cost (test-only; `RULES` is exported solely for this).
 *
 * NOTE: this compares RAW rule outputs (before the `withChordMembership` / `withImplicitCircles` post-passes
 * that `parse()` applies uniformly to the winner) — shadowing is about which rule claims the input and what
 * it emits, which is exactly the raw layer.
 */

import { describe, it, expect } from 'vitest';
import { RULES, normalizeUtterance, type ParseContext } from '../parse';
import { COMMAND_CATALOG } from '../catalog';
import allowlist from './shadow-allowlist.json';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
/** A permissive single-circle context: one circle O (so unnamed circle refs resolve unambiguously) and
 *  every capital as an existing point (so relational rules can treat labels as already-placed). */
const CTX: ParseContext = { circles: ['O'], points: LETTERS };

type RuleKind = 'array' | 'stop' | 'clarify' | 'null';
interface Analysis {
  winner: string; // rule name, or '(escalate)' if a 'stop' wins, or '(none)' if nothing claims
  winnerKind: RuleKind;
  shadowedBy: string[]; // later rules returning an array that DIVERGES from the winner's output
}

/** Run every rule against `text`; classify the winner and any later divergent array-claimers. Applies the
 *  same pre-normalization `parse()` does, so the analysis sees exactly the string the rules receive. */
function analyze(raw: string, ctx: ParseContext = CTX): Analysis {
  const text = normalizeUtterance(raw);
  const results = RULES.map((rule) => {
    let raw: unknown;
    try {
      raw = rule(text, ctx);
    } catch {
      raw = null; // a rule that throws on this input is treated as no-match for the matrix (not this test's concern)
    }
    const kind: RuleKind = raw === 'stop' ? 'stop' : Array.isArray(raw) ? 'array' : raw && typeof raw === 'object' ? 'clarify' : 'null';
    return { name: rule.name || '(anon)', kind, json: kind === 'array' ? JSON.stringify(raw) : '' };
  });

  const winnerIdx = results.findIndex((r) => r.kind !== 'null');
  if (winnerIdx < 0) return { winner: '(none)', winnerKind: 'null', shadowedBy: [] };
  const w = results[winnerIdx];
  const winner = w.kind === 'stop' ? '(escalate)' : w.name;
  const shadowedBy =
    w.kind === 'array'
      ? results.slice(winnerIdx + 1).filter((r) => r.kind === 'array' && r.json !== w.json).map((r) => r.name)
      : []; // a 'stop'/clarify winner already escalates — later claimers are moot
  return { winner, winnerKind: w.kind, shadowedBy };
}

describe('parser shadow-matrix — catalog corpus', () => {
  const corpus = COMMAND_CATALOG.filter((c) => c.supported).flatMap((c) => [
    { text: c.en, lang: 'en' as const },
    { text: c.he, lang: 'he' as const },
  ]);

  it('winner rule per catalog utterance is stable', () => {
    const winners = corpus.map(({ text, lang }) => ({ text, lang, winner: analyze(text).winner }));
    expect(winners).toMatchSnapshot();
  });

  it('divergent later-claimers (candidate shadows) per catalog utterance are stable', () => {
    const shadows = corpus
      .map(({ text, lang }) => ({ text, lang, ...analyze(text) }))
      .filter((a) => a.shadowedBy.length > 0)
      .map(({ text, lang, winner, shadowedBy }) => ({ text, lang, winner, shadowedBy }));
    expect(shadows).toMatchSnapshot();
  });

  it('the divergent shadow-pair SET equals the checked-in allowlist (HARD gate — `vitest -u` cannot absorb it)', () => {
    // The plan's A1 design (docs/15-hardening-plan.md): "assert the set of (winner → shadowed-rule) pairs
    // equals a checked-in allowlist". The snapshots above give readable per-utterance diffs, but a blanket
    // `vitest -u` regenerates them — a genuine new shadow could be silently re-pinned (review 2026-07-03,
    // M2). This assertion has no snapshot to update: a NEW pair fails CI with both rule names; fix the
    // shadow, or review it and add it to shadow-allowlist.json deliberately.
    const pairs = new Set<string>();
    for (const { text } of corpus) {
      const a = analyze(text);
      for (const sb of a.shadowedBy) pairs.add(`${a.winner} → ${sb}`);
    }
    expect([...pairs].sort()).toEqual([...allowlist.shadowPairs].sort());
  });

  it('every supported catalog utterance is claimed by SOME rule (none silently escalate)', () => {
    // A catalog construct is, by definition, supported — so a rule must claim it. If this fails, a shadow
    // or a keyword regression made a supported phrasing fall through to the LLM. (phase4 asserts .ok; this
    // asserts a deterministic rule — not the escalation path — owns it.)
    const escalating = corpus.filter(({ text }) => analyze(text).winner === '(none)').map((c) => c.text);
    expect(escalating).toEqual([]);
  });
});

/**
 * KNOWN shadow-prone inputs the 2026-07-02 review verified by executing the parser (Phase C targets). Each
 * probe pins the rule that must OWN the utterance as a HARD assertion (per the M2 hardening — the earlier
 * snapshot form could be silently absorbed by `vitest -u`); a flip means an ordering/regex change moved the
 * utterance to a different rule and must be a deliberate edit HERE, not a snapshot refresh. Kept as an
 * explicit list (not derived) so the intent is legible next to each utterance.
 */
describe('parser shadow-matrix — known shadow-prone probes (Phase C tracking)', () => {
  const PROBES: { text: string; ctx?: ParseContext; note: string; owner: string }[] = [
    { text: 'chord AB = 6', note: 'PAR-1: the length rule owns the tail (chord bails)', owner: 'distanceConstraint' },
    { text: 'chord AB = chord CD', note: 'PAR-1/P4: noun-repeated equality owned by equalSegments', owner: 'equalSegments' },
    { text: 'קוטר AB = 10', note: 'PAR-1: the length rule owns the tail (diameter bails)', owner: 'distanceConstraint' },
    { text: 'AB = 4, BC = 6', note: 'PAR-2: two comma-joined givens split all-or-nothing', owner: 'multiStatement' },
    { text: 'זווית ABC = 40, זווית DEF = 60', note: 'PAR-2: two angles split', owner: 'multiStatement' },
    { text: 'המיתרים AB ו-CD מאונכים זה לזה', note: 'PAR-3: plural מאונכים recognised by the ⟂ rule', owner: 'perpendicularConstraint' },
    { text: 'הקוטר AB מאונך למיתר CD', note: 'PAR-4: ⟂ rule wins; membership restored by the post-pass', owner: 'perpendicularConstraint' },
    { text: 'נקודה D על הרדיוס OB', note: 'PAR-5: point-on-carrier owns a point on a radius', owner: 'pointOnSegment' },
    { text: 'E על הקוטר AB', note: 'PAR-5: point-on-carrier owns a point on a diameter', owner: 'pointOnSegment' },
    { text: 'שטח מרובע SABC הוא 20', note: 'PAR-6: the area rule owns an S-leading polygon', owner: 'area' },
    { text: 'נקודה E על AC ב־40%', note: 'PAR-7: maqaf normalised — the ratio form parses', owner: 'pointOnSegment' },
    { text: 'points F, G, H on segments AB, AC, CB', note: 'PAR-8: the N-points rule owns the plural', owner: 'pointsOnSegments' },
  ];

  it('each probe is owned by exactly the rule its fix assigned (HARD, per probe)', () => {
    const misowned = PROBES.map(({ text, ctx, note, owner }) => ({ text, note, owner, actual: analyze(text, ctx ?? CTX).winner })).filter(
      (p) => p.actual !== p.owner,
    );
    expect(misowned).toEqual([]);
  });
});
