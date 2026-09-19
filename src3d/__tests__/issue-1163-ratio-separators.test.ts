/**
 * #1163 — `:` AND `/` ARE ONE NOTATION WITH TWO SEPARATORS.
 *
 * Prod session `i8gw52ej`, a student stating the ratio in which a point divides a segment:
 *
 * ```
 * תיבה
 * אלכסון BD
 * E על BD
 * BE/ED=1:3      ✗ not-handled      ← only the PAID LLM read it
 * BE:ED=1:3      ✓ builds
 * ```
 *
 * Re-reported by the operator 2026-09-18 in a second spelling — «AB/BC = 3/1» — which is how a
 * textbook writes it. 2-D has had the `/`-form sibling (`segmentRatio`) beside its colon form for as
 * long as the colon form has existed; 3-D never grew it.
 *
 * **Nobody was blocked**, which is the honest framing: the LLM fallback rewrote the slash into a colon
 * and the figure built (`[llm/ok] BE/ED=1:3 ==> ["BE:ED = 1:3"]`). This buys cost and determinism.
 * [ADR-3D-249](../../docs/06b-decisions-3d.md#adr-3d-249) then made the colon form genuinely DRIVE
 * instead of refute, which makes the missing sibling more visible rather than less.
 *
 * ## Why every assertion here is a COMPARISON
 *
 * A lock that spells out the expected commands re-implements the grammar it guards and stays green
 * through the change that kills it (ADR-W-053). So these assert that two spellings of one statement
 * produce *the same thing* — whatever that thing is. Change the lowering and both sides move
 * together; break one separator and the pair separates, which is the only failure worth catching.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { parse3 } from '../parser/parse3';
import { derive3, useGeo3 } from '../store/store3';

const st = () => useGeo3.getState();

/** The prod prefix the student actually typed, verbatim. */
const PREFIX = ['תיבה', 'אלכסון BD', 'E על BD'];

beforeEach(() => {
  st().clear();
});

describe('#1163 — the two separators are one notation', () => {
  /** Each row: two spellings that state the SAME thing. Neither side is the "expected" one. */
  const PAIRS: [string, string][] = [
    ['BE/ED=1:3', 'BE:ED=1:3'],
    ['AB/BC = 3/1', 'AB:BC = 3:1'],
    ["A'K / A'C = 2 / 3", "A'K : A'C = 2 : 3"],
    ['AB/BC = 3:4', 'AB:BC = 3/4'],
    // the bare-number RHS — 2-D's own third spelling, and `q` defaults to 1
    ['AB/BC=2', 'AB:BC = 2:1'],
    ['AB:BC=2', 'AB/BC = 2/1'],
  ];

  it.each(PAIRS)('«%s» and «%s» lower to the same commands', (slash, colon) => {
    const a = parse3(slash);
    const b = parse3(colon);
    expect(a.ok, `${slash} must parse`).toBe(true);
    expect(b.ok, `${colon} must parse`).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.commands, 'one statement, one lowering').toEqual(b.commands);
  });

  it('the prod sequence builds with the slash spelling, exactly as with the colon one', () => {
    [...PREFIX, 'BE/ED=1:3'].forEach((l) => st().submit(l));
    const slashErr = st().lastError;
    const slashFacts = st().facts.length;
    expect(slashErr, 'the spelling the student actually typed').toBeNull();

    st().clear();
    [...PREFIX, 'BE:ED=1:3'].forEach((l) => st().submit(l));
    expect(st().lastError).toBeNull();
    expect(slashFacts, 'the same figure, from the same statement').toBe(st().facts.length);
  });

  /**
   * THE FIGURE, not the verdict. The ratio is what the student stated, so the drawing has to honour
   * it — and `E` is a free rider, so this is the arm that would notice the statement being recorded
   * and never solved.
   */
  it('the slash spelling DRIVES: E really does divide BD in 1:3', () => {
    [...PREFIX, 'BE/ED=1:3'].forEach((l) => st().submit(l));
    expect(st().lastError).toBeNull();
    const pos = derive3(st().facts, st().seed).positions;
    const [B, E, D] = ['B', 'E', 'D'].map((id) => pos.get(id)!);
    const d = (P: typeof B, Q: typeof B) => Math.hypot(Q.x - P.x, Q.y - P.y, Q.z - P.z);
    expect(d(B, E) / d(E, D), 'BE:ED must be 1:3 on the canvas').toBeCloseTo(1 / 3, 6);
  });
});

/**
 * A length ratio is POSITIVE. 2-D guards this in both of its ratio rules; 3-D's colon form silently
 * accepted «AB:BC = 0:3» — a statement that a segment has zero length — and the new separator would
 * have made that reachable by a second spelling. Refused rather than drawn.
 */
describe('#1163 — a non-positive ratio is not a ratio', () => {
  it.each(['AB:BC = 0:3', 'AB/BC = 0/3', 'AB/BC = 0', 'AB:BC = 3:0'])('«%s» is not read as a ratio', (line) => {
    const r = parse3(line);
    if (r.ok) expect(r.commands.some((c) => c.type === 'claim'), `${line} must not become a ratio claim`).toBe(false);
  });
});
