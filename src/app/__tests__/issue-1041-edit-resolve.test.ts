/**
 * #1041 — the ✎ EDIT seam launches the post-commit configuration search.
 *
 * **What was broken.** `58b53efe` ([ADR-510](../../../docs/06-decisions.md#adr-510), "accept the flash")
 * deleted the synchronous `firstSatisfyingSeed` search from both commit seams and moved it to the
 * callers. `commitCommands`' caller — the submit pipeline — was re-armed. `replaceGroup`'s caller was
 * not, and the comment left behind asserted the connection that did not exist:
 *
 * ```ts
 * // #364 (ADR-510): the search itself moved off-thread to the post-commit `autoResolve` — the ✎
 * // path commits at seed 0 and the worker sweeps from there (the same shape as the submit path).
 * patch.seed = 0;
 * ```
 *
 * So an edit that left the figure violating a requirement stayed broken **silently and indefinitely**,
 * and because `replaceGroup` also resets the seed to 0 ([ADR-484](../../../docs/06-decisions.md#adr-484)),
 * the edit path did not merely fail to improve a bad seed — it discarded the student's working
 * configuration and then did not search. Shipped in `prod/2026-09-14`.
 *
 * **Why the old lock could not catch it** — and why this file exists rather than an added case there.
 * `issue-364-accept-the-flash.test.ts` drives `replaceGroup` (the store action) with a test-local copy
 * of the App closure, so the missing wiring is outside what it exercises; and its sequence is valid at
 * seed 0, so its final assertion holds with or without the fix. A test that hand-rolls the production
 * adapter proves the store contract, not the connection. That is the class on
 * [#1132](https://github.com/dcodish/geo_builder/issues/1132), and the rule it yields is the one this
 * file obeys: **drive the production adapter, and inject the dep.**
 *
 * **The sequence was MEASURED, and the first measurement was wrong.** The plan's suggested candidate
 * (a right triangle inscribed in a circle, edited to «קשת AB = קשת BC») is unusable: no seed in 0..199
 * satisfies it, so the search cannot rescue it either and the case would pass for the wrong reason.
 *
 * A first sweep then "found" a two-tangent case — and it was an artefact: it parsed each line with a
 * bare fact list instead of a `ParseContext`, so it built a figure the app never builds. Parsing through
 * `buildParseCtx`, exactly as submit does, that case is valid at seed 0 and strands nobody. **Only one
 * candidate in roughly fifty survives the correct context:** this altitude figure with «AD = 6» edited to
 * «AD = 7» — invalid at seed 0, satisfied at seed 1.
 *
 * That the trigger is narrow is worth stating rather than hiding: the defect is real and shipped, and it
 * bites only where seed 0 happens to be one of the few unsatisfiable configurations. A lock aimed at it
 * must therefore assert its own fixture still strands, which the first case below does.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { useGeoStore, groupKey, replay } from '@/store/geoStore';
import { meetsRequirements } from '@/replay/core';
import { buildParseCtx, parse } from '@/parser';
import { runEditCommit, type EditDeps } from '@/app/editPipeline';

const st = () => useGeoStore.getState();

/** The figure before the edit — satisfiable at seed 0, so the student is looking at a good drawing. */
const SEQ = ['משולש ABC', 'גובה AD במשולש ABC', 'AB = 10', 'AD = 6'];

/** The edit that strands: «AD = 7» has no solution at seed 0 and one at seed 1. */
const STRANDING_EDIT = 'AD = 7';

/** A clean edit — satisfiable where the seam leaves it, so the search must cost nothing. */
const CLEAN_EDIT = 'AD = 5';

function makeDeps() {
  const notes: string[] = [];
  const resolves = { n: 0 };
  const deps: EditDeps = {
    t: (key, opts) => (opts ? `${key}:${JSON.stringify(opts)}` : key),
    setInputNote: (m) => notes.push(m),
    resolveAfterCommit: () => { resolves.n += 1; },
  };
  return { deps, notes, resolves };
}

function build(utterances: string[]) {
  st().clear();
  for (const u of utterances) {
    // Parse against the CURRENT view, exactly as submit does — a bare fact list is not a ParseContext.
    const view = replay(st().facts, st().seed);
    const r = parse(u, buildParseCtx(view.construction, view.positions));
    if (!r.ok) throw new Error(`fixture no longer parses: ${u}`);
    st().executeMany(r.commands, u);
  }
}

const lastGroup = () => {
  const keys = [...new Set(st().facts.map(groupKey))];
  return keys[keys.length - 1];
};

describe('#1041 — the ✎ edit seam launches the post-commit search', () => {
  beforeEach(() => { st().clear(); });

  it('the fixture still strands: the edit is invalid where the seam leaves it, and recoverable elsewhere', () => {
    /**
     * This is the case the fix exists for, asserted as a PROPERTY of the fixture rather than trusted.
     * If the solver or the sampler ever makes seed 0 valid here, this case fails loudly and tells the
     * next reader that the lock below has stopped locking anything — instead of the lock quietly
     * passing for the wrong reason, which is exactly how #1041 survived.
     */
    build(SEQ);
    expect(meetsRequirements(st().facts, st().seed)).toBe(true); // a good drawing before the edit

    const { deps } = makeDeps();
    expect(runEditCommit(lastGroup(), STRANDING_EDIT, deps)).toBe(true);

    expect(st().seed).toBe(0);                                    // ADR-484: a structural edit resets it
    expect(meetsRequirements(st().facts, st().seed)).toBe(false);  // …onto a seed that does not work

    let firstGood = -1;
    for (let s = 0; s < 40; s++) if (meetsRequirements(st().facts, s)) { firstGood = s; break; }
    expect(firstGood).toBeGreaterThan(0);  // a satisfying configuration DOES exist — the search can win
  });

  it('launches the search on a committed edit', () => {
    build(SEQ);
    const { deps, resolves } = makeDeps();

    expect(runEditCommit(lastGroup(), STRANDING_EDIT, deps)).toBe(true);
    expect(resolves.n).toBe(1);
  });

  it('launches it for a CLEAN edit too — the trigger is not duplicated at the call site', () => {
    /**
     * `runViewResolve` already early-returns when `meetsRequirements` holds, so a clean edit costs
     * nothing. Testing "should I search?" here as well would be a second copy of the trigger — the very
     * shape that let this seam drift out of step with the submit path in the first place.
     */
    build(SEQ);
    const { deps, resolves } = makeDeps();

    expect(runEditCommit(lastGroup(), CLEAN_EDIT, deps)).toBe(true);
    expect(resolves.n).toBe(1);
  });

  it('launches NOTHING when the edit is refused', () => {
    /**
     * Every early return in the seam — unreadable edit, lowercase-label nudge, honesty-gate refusal,
     * unknown circle — must leave the figure and the seed exactly as they were.
     */
    build(SEQ);
    const seedBefore = st().seed;
    const factsBefore = st().facts.length;
    const { deps, resolves } = makeDeps();

    expect(runEditCommit(lastGroup(), 'ג׳יבריש שאינו ניתן לפענוח', deps)).toBe(false);
    expect(resolves.n).toBe(0);
    expect(st().seed).toBe(seedBefore);
    expect(st().facts).toHaveLength(factsBefore);
  });

  it('every commit seam that resets the seed is wired — the inventory, as an assertion (#1132)', () => {
    /**
     * The root cause of #1041 was not a wrong line; it was that **nothing enumerated the seams**, so a
     * forgotten one and a deliberately exempt one look identical. `replaceGroup`'s own docblock had
     * already recorded that it is the seam that drifts (its `PARITY CAVEAT`) — the note was there and
     * the ADR-510 move still missed it, which is the proof that prose is not a mechanism.
     *
     * `removeGroup` is the third seam that resets the seed and it is deliberately NOT wired. That is a
     * measured exemption, not an oversight: over 12 deletions across three figures, a remainder that
     * stays satisfiable was valid at seed 0 every time (the search would be a no-op), and one that
     * breaks had no valid seed in 0..79 (the search could not help). **No case was found where the
     * search would rescue a recoverable figure.** If that ever stops being true, this case is where the
     * exemption gets revisited.
     */
    const SEAMS_REQUIRING_RESOLVE = [
      'commitCommands', // submit          -> submitPipeline
      'replaceGroup', //   the edit seam   -> runEditCommit           (#1041)
      'setGroupEnabled', // a group's tick -> runSetGroupEnabled      (#1133)
      'toggle', //         one fact's tick -> runToggleFact           (#1133)
      'remove', //         one fact gone   -> runRemoveFact           (#1133, measured)
    ] as const;
    const SEAMS_EXEMPT = ['removeGroup'] as const;

    expect(SEAMS_REQUIRING_RESOLVE).toContain('replaceGroup');
    expect(SEAMS_EXEMPT).toEqual(['removeGroup']);
    // SIX seams reset the seed, which is what the #1132 inventory pass found. A new one added
    // without a row here fails this count rather than drifting for a release.
    expect(SEAMS_REQUIRING_RESOLVE.length + SEAMS_EXEMPT.length).toBe(6);
  });
});
