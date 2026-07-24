/**
 * 3-D parser shadow-matrix guard (S2.3 of [docs/24-foundation-hardening-plan.md](../../../docs/24-foundation-hardening-plan.md) —
 * the 2-D A1/PAR-11 guard COPIED as a pattern per docs/20 §12, never imported).
 *
 * `parse3()` is first-match-wins over the ordered `RULES` array (~80 rules). Ordering is defended only
 * by hand-written cases and per-rule comments ("MUST precede onSegment", "BEFORE rightPyramid", …), so
 * the recurring parser bug class is always the same shape: an earlier, coarser rule CLAIMS an utterance
 * that a later, more-specific rule should own — and because the earlier rule returns a (partial) command
 * array, the parse commits it silently. The 3-D product has already paid for this class:
 * [ADR-3D-071](../../../docs/06b-decisions-3d.md) — `האלכסונים AC ו BD נחתכים בנקודה O` was read by the
 * named-quad BRANCH as the cyclic quad A→C→B→D and silently put O on the midpoint of edge AB.
 *
 * This test runs EVERY rule against the catalog corpus (not stopping at the first match) and records,
 * per utterance:
 *   - `winner`     — the rule `parse3()` actually uses (the first to return a command array);
 *   - `shadowedBy` — LATER rules that also return an array whose output DIVERGES from the winner's.
 *
 * A non-empty `shadowedBy` is a *candidate* shadow (two rules read the same input differently). The
 * snapshots pin current behaviour (reviewable diffs), and the PAIR SET is hard-gated against a reviewed
 * allowlist that `vitest -u` cannot silently absorb. Regeneration is a deliberate act:
 * `GEN_SHADOW3=1 npx vitest run src3d/parser/__tests__/shadow-matrix3.test.ts` (the GEN_FIXTURES3
 * pattern) — then REVIEW the diff of shadow-allowlist3.json before committing.
 *
 * NOTE: rules share one piece of per-parse pre-state — the module-level VEC_MARKED flag `parse3` sets
 * from the RAW utterance before normalization. `analyze` applies the same pre-state (markVectorContext)
 * and the same `normalize3`, so it sees exactly what the rules see. `parse3`'s early ambiguity refusal
 * (bare pair=pair → 'ambiguous-vector-length') runs BEFORE the rules; no catalog utterance hits it, so
 * the matrix is faithful for this corpus.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { COMMAND_CATALOG_3D } from '../catalog3';
import { RULES, markVectorContext, normalize3 } from '../parse3';
import allowlist from './shadow-allowlist3.json';

interface Analysis {
  winner: string; // rule name, or '(none)' if nothing claims
  shadowedBy: string[]; // later rules returning an array that DIVERGES from the winner's output
  winnerJson: string; // the winner's raw command array (JSON) — probes assert branch-level ownership on it
}

/** Run every rule against `text`; classify the winner and any later divergent array-claimers. */
function analyze(raw: string): Analysis {
  markVectorContext(raw); // the same per-parse pre-state parse3 applies (bare pair=pair disambiguation)
  const text = normalize3(raw);
  const results = RULES.map((rule) => {
    let out: unknown = null;
    try {
      out = rule(text);
    } catch {
      out = null; // a rule that throws on foreign input is a no-match for the matrix (not this test's concern)
    }
    const claims = Array.isArray(out);
    return { name: rule.name || '(anon)', claims, json: claims ? JSON.stringify(out) : '' };
  });
  const winnerIdx = results.findIndex((r) => r.claims);
  if (winnerIdx < 0) return { winner: '(none)', shadowedBy: [], winnerJson: '' };
  const w = results[winnerIdx];
  const shadowedBy = results
    .slice(winnerIdx + 1)
    .filter((r) => r.claims && r.json !== w.json)
    .map((r) => r.name);
  return { winner: w.name, shadowedBy, winnerJson: w.json };
}

describe('3-D parser shadow-matrix — catalog corpus', () => {
  // Every catalog entry is, by definition, supported (the catalog3 guard re-parses them all), so the
  // whole catalog in BOTH locales is the corpus (symbol-form entries where he === en analyze twice —
  // harmless, and it keeps the corpus definition identical to the 2-D guard's).
  const corpus = COMMAND_CATALOG_3D.flatMap((c) => [
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
    // The snapshots above give readable per-utterance diffs, but a blanket `vitest -u` regenerates
    // them — a genuine new shadow could be silently re-pinned. This assertion has no snapshot to
    // update: a NEW pair fails with both rule names; fix the shadow, or review it and regenerate the
    // allowlist deliberately (GEN_SHADOW3=1).
    const pairs = new Set<string>();
    for (const { text } of corpus) {
      const a = analyze(text);
      for (const sb of a.shadowedBy) pairs.add(`${a.winner} → ${sb}`);
    }
    const sorted = [...pairs].sort();
    if (process.env.GEN_SHADOW3) {
      const path = fileURLToPath(new URL('./shadow-allowlist3.json', import.meta.url));
      const comment = (JSON.parse(readFileSync(path, 'utf8')) as { _comment: string })._comment;
      writeFileSync(path, `${JSON.stringify({ _comment: comment, shadowPairs: sorted }, null, 2)}\n`);
      return; // the freshly generated file IS the new baseline — review its diff before committing
    }
    expect(sorted).toEqual([...allowlist.shadowPairs].sort());
  });

  it('every catalog utterance is claimed by SOME rule (none silently escalate)', () => {
    // The catalog3 guard asserts parse3().ok; this asserts a deterministic RULE owns each utterance
    // (not the pre-rule escapes), so a keyword regression that pushes a supported phrasing to the LLM
    // fails here with the utterance named.
    const escalating = corpus.filter(({ text }) => analyze(text).winner === '(none)').map((c) => c.text);
    expect(escalating).toEqual([]);
  });
});

/**
 * KNOWN shadow-prone inputs, pinned as HARD owner assertions (the 2-D Phase-C probe pattern): a flip
 * means an ordering/regex change moved the utterance to a different rule (or branch) and must be a
 * deliberate edit HERE, never a snapshot refresh. The ADR-3D-071 probes also pin the winning BRANCH
 * via the emitted commands — the historic theft was intra-rule (the named-quad branch of
 * `diagIntersection` claiming two grouped diagonals), which rule-level ownership alone cannot see.
 */
describe('3-D parser shadow-matrix — known shadow-prone probes', () => {
  const PROBES: { text: string; note: string; owner: string; commands?: unknown }[] = [
    {
      text: 'האלכסונים AC ו BD נחתכים בנקודה O',
      note: 'ADR-3D-071: the Hebrew PLURAL names both diagonals in one word — two runs of two letters is the semantic signal, never the word count; the named-quad branch must not claim it',
      owner: 'diagIntersection',
      commands: [{ type: 'point-on-segment3', id: 'O', a: 'A', b: 'C', t: 0.5 }],
    },
    {
      text: 'the diagonals AC and BD intersect at point O',
      note: 'ADR-3D-071 (En): the verb form + trailing `at point O` marker; two grouped diagonals, not quad ACBD',
      owner: 'diagIntersection',
      commands: [{ type: 'point-on-segment3', id: 'O', a: 'A', b: 'C', t: 0.5 }],
    },
    {
      text: 'האלכסון AC והאלכסון BD נפגשים בנקודה O',
      note: 'ADR-3D-071/ADR-3D-055: the per-diagonal repeated word + the נפגש verb — same two-run grouping',
      owner: 'diagIntersection',
      commands: [{ type: 'point-on-segment3', id: 'O', a: 'A', b: 'C', t: 0.5 }],
    },
    {
      text: 'O מפגש האלכסונים של הפאה ABCD',
      note: 'ADR-3D-071 (converse guard): ONE run of four letters IS a named quad — the cyclic diag-intersection, not two diagonals',
      owner: 'diagIntersection',
      commands: [{ type: 'diag-intersection', id: 'O', face: ['A', 'B', 'C', 'D'] }],
    },
    {
      text: 'P על AM כך ש-KP = αu + βv',
      note: 'documented ordering: spanPoint MUST precede onSegment (Greek scalars would otherwise parse as a free point, silently dropping the condition)',
      owner: 'spanPoint',
    },
    {
      text: 'T על הקטע SC כך ש-TABCD היא פירמידה ישרה',
      note: 'V8-j: rightPyramidPoint before rightPyramid (which would build TABCD as a solid)',
      owner: 'rightPyramidPoint',
    },
    {
      text: 'נפח הפירמידה SENB שווה לנפח הפירמידה CENB',
      note: 'documented ordering: volumeEqPoly before volumePolyClaim/rightPyramid (its RHS is a volume, not a number; נפח must never build a pyramid)',
      owner: 'volumeEqPoly',
    },
    {
      text: 'משולש ABC ישר זווית',
      note: '#116: rightTriangle BEFORE planarPolygon (which would swallow the bare משולש and drop the right angle)',
      owner: 'rightTriangle',
    },
    {
      text: 'SM ⊥ DB',
      note: 'issue #14: the two-segment ⟂ is owned by perpSegGiven (after perpPlaneClaim — 3–4-point targets are planes)',
      owner: 'perpSegGiven',
    },
  ];

  it('each probe is owned by exactly the rule (and branch) its fix assigned (HARD, per probe)', () => {
    const misowned = PROBES.map(({ text, note, owner, commands }) => {
      const a = analyze(text);
      const branchOk = commands === undefined || a.winnerJson === JSON.stringify(commands);
      return { text, note, owner, actual: a.winner, branchOk, got: a.winnerJson };
    }).filter((p) => p.actual !== p.owner || !p.branchOk);
    expect(misowned).toEqual([]);
  });
});
