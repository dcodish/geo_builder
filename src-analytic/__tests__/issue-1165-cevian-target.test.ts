/**
 * #1165 (ADR-AG-117) — the TRIANGLE may identify a cevian's side, and «ל-BC» may carry a maqaf.
 *
 * Operator report, 2026-09-17, with a screenshot: *"we need to support things like `AD תיכון` and
 * `AD חוצה זווית` like we do in the 2d tool."* «AD תיכון במשולש ABC» answered `not-handled` here
 * while 2-D answers the same sentence — a sibling disparity, and that framing is what made it worth
 * fixing rather than tail work.
 *
 * The side run was MANDATORY in the rule and «במשולש ABC» was only an optional trailing decoration
 * *after* it, so the triangle could be recognised as text and never be the thing that identifies the
 * target. It is now an ALTERNATIVE, and the maqaf spelling «AD תיכון ל-BC» (#1222) is admitted with
 * it — that one failed only because the rule had no `-` allowance before a Latin run, a convention
 * the tool relies on itself elsewhere.
 *
 * ── WHY THIS LOCK IS WRITTEN AS PARITY ──
 *
 * The obvious lock — "«AD תיכון במשולש ABC» produces a midpoint fact on BC" — would re-state the
 * grammar rule inside the test and stay green through any change that kept both halves wrong
 * together ([ADR-W-053](../../docs/06w-decisions-workspace.md)). So the assertion here is that the
 * NEW spelling and the OLD one are the same statement: identical facts, and identical figures at
 * several seeds. The side-naming form is the reference, it was already locked by #1231/#1232, and
 * a parity test cannot pass by re-implementing what it compares.
 *
 * The refusals are the other half, and they are what makes the triangle form honest: the apex is
 * what picks the side out of the ring, so an apex outside the ring picks nothing and is refused
 * rather than guessed at (ADR-052).
 */
import { describe, expect, it } from 'vitest';
import { parseLine } from '../parser/parseAnalytic';
import { derive } from '../engine/derive';
import { COMMAND_CATALOG_ANALYTIC } from '../parser/catalogAnalytic';

/** The facts one line lowers to, with `src` dropped — `src` is the student's own words and differs
 *  between two spellings BY DESIGN, so it is the one field a parity check must not compare. */
const factsOf = (line: string): unknown[] => {
  const r = parseLine(line);
  expect(r.ok, `did not parse: ${line}`).toBe(true);
  if (!r.ok) return [];
  return r.facts.map((f) => {
    const { src: _src, ...rest } = f as { src: string };
    return rest;
  });
};

/** A figure reduced to what a student sees: who is where, and which segments were drawn. */
const shapeOf = (lines: readonly string[], seed: number) => {
  const d = derive(lines, seed);
  expect(d.faults, `faults at seed ${seed}: ${lines.join(' | ')}`).toEqual([]);
  return {
    points: d.figure.points.map((p) => `${p.id}@${p.x.toFixed(6)},${p.y.toFixed(6)}`).sort(),
    segments: d.figure.segments.map((s) => s.ends.join('')).sort(),
  };
};

const TRIANGLE_HE = ['A(1,6)', 'B(-3,0)', 'C(5,0)'];
const TRIANGLE_EN = ['A(1,6)', 'B(-3,0)', 'C(5,0)'];

describe('ADR-AG-117 — the triangle names the side, and it means the same thing (#1165)', () => {
  /**
   * The two spellings of ONE statement, per role and per locale. The right-hand column is the form
   * that already worked and is already locked; the left-hand one is what this issue added.
   */
  const PAIRS: readonly (readonly [string, string, string])[] = [
    ['he median', 'AD תיכון במשולש ABC', 'AD תיכון לצלע BC'],
    ['he altitude', 'AD גובה במשולש ABC', 'AD גובה לצלע BC'],
    ['en median', 'AD is the median in triangle ABC', 'AD is the median to side BC'],
    ['en altitude', 'AD is the altitude in triangle ABC', 'AD is the altitude to side BC'],
    // #1222 — the maqaf is the same statement as the noun-ful spelling, not a different one.
    ['he median maqaf', 'AD תיכון ל-BC', 'AD תיכון לצלע BC'],
    ['he altitude maqaf', 'AD גובה ל-BC', 'AD גובה לצלע BC'],
  ];

  it.each(PAIRS)('%s — the same facts', (_what, added, reference) => {
    expect(factsOf(added)).toEqual(factsOf(reference));
  });

  // Facts being equal makes the figures equal, but the figure is what the student is shown, and a
  // solve is where an equal-looking pair could still diverge. Several seeds, because one seed can
  // agree by accident and the tool offers the student every configuration.
  it.each(PAIRS)('%s — the same figure, seeds 0–3', (_what, added, reference) => {
    for (let seed = 0; seed <= 3; seed += 1) {
      expect(shapeOf([...TRIANGLE_HE, added], seed), `seed ${seed}`).toEqual(
        shapeOf([...TRIANGLE_EN, reference], seed),
      );
    }
  });

  /**
   * The apex is not always the first letter of the ring. «BD גובה במשולש ABC» is an altitude from
   * `B` to `AC`, and getting that wrong is the failure mode the "remove the apex" rule exists to
   * avoid — it would otherwise be read as an altitude to `BC`, which `B` is an endpoint of.
   */
  it('any vertex may be the apex — the ring is what is left over', () => {
    expect(factsOf('BD גובה במשולש ABC')).toEqual(factsOf('BD גובה לצלע AC'));
    expect(factsOf('CD תיכון במשולש ABC')).toEqual(factsOf('CD תיכון לצלע AB'));
  });
});

describe('ADR-AG-117 — what the triangle form refuses, and with WHICH answer (#1165)', () => {
  const outcome = (line: string): string => {
    const r = parseLine(line);
    return r.ok ? 'ok' : r.code;
  };

  /**
   * Each refusal is pinned to its own CODE, not merely to "not ok", because the code is what picks
   * the message the student reads and the three near-misses here mean three different things. A
   * lock that only asserted `ok === false` would let all three collapse onto one wrong sentence.
   */
  it.each([
    // The apex is not in the ring: nothing chooses among three candidate sides.
    ['apex outside the triangle', 'XD תיכון במשולש ABC', 'apex-not-a-vertex'],
    ['apex outside, altitude', 'XD גובה במשולש ABC', 'apex-not-a-vertex'],
    ['apex outside, english', 'XD is the median in triangle ABC', 'apex-not-a-vertex'],
    // The noun and its vertex count disagree — a different wrong, and `bad-arity` says so truthfully.
    ['four letters called a triangle', 'AD תיכון במשולש ABCD', 'bad-arity'],
    ['two letters called a triangle', 'AD תיכון במשולש AB', 'bad-arity'],
    // #1231's gate still applies through the new spelling: the apex may not BE the foot, and it may
    // not be the foot of a side it is an endpoint of.
    ['apex is its own foot', 'AA תיכון במשולש ABC', 'degenerate-role'],
    ['foot is a vertex of the side', 'AB תיכון במשולש ABC', 'degenerate-role'],
    ['foot is a vertex, altitude', 'AC תיכון במשולש ABC', 'degenerate-role'],
  ])('%s → %s', (_what, line, code) => {
    expect(outcome(line)).toBe(code);
  });

  /**
   * THE NEGATIVE CONTROL. The refusals above are easy to satisfy by refusing the whole form, which
   * is exactly the state this issue is fixing. These must stay `ok`.
   */
  it.each([
    'AD תיכון במשולש ABC',
    'AD גובה במשולש ABC',
    'BD גובה במשולש ABC',
    'AD תיכון ל-BC',
    'AD is the median in triangle ABC',
    'AD is the altitude in triangle ABC',
  ])('still accepted: %s', (line) => {
    expect(outcome(line)).toBe('ok');
  });
});

/**
 * The reference card has to OFFER the triangle spelling, not merely tolerate it.
 *
 * `catalogAnalytic.ts` is the commands panel, the coverage map and the LLM's allowed vocabulary at
 * once (ADR-AG-005 D8), and before this issue it carried no cevian row of any kind — so a student
 * looking for «תיכון» found nothing and the fallback was never taught to emit one. The catalog's own
 * guard (`parser.test.ts`) then proves each row parses in both languages and draws.
 */
describe('ADR-AG-117 — the catalog offers a cevian (#1165)', () => {
  const cevians = COMMAND_CATALOG_ANALYTIC.filter((e) => /תיכון|גובה/.test(e.he));

  it('carries both roles', () => {
    expect(cevians.some((e) => e.he.includes('תיכון'))).toBe(true);
    expect(cevians.some((e) => e.he.includes('גובה'))).toBe(true);
  });

  it('shows the triangle spelling, which is the one that was not handled', () => {
    expect(cevians.some((e) => /במשולש/.test(e.he))).toBe(true);
  });
});
