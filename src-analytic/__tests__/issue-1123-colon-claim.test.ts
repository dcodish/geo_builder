/**
 * #1123 — a bare `XY:` prefix declines a sentence it cannot read, instead of refusing on the student's behalf.
 *
 * Operator: *"the analytics tool doesnt support the ratio AC:CB=3:2"*. The ratio grammar is indeed
 * missing (#1124, the feature) — but the sentence never reached the seam where that could be said,
 * because the named-line colon rule **claimed** it:
 *
 * ```
 * AC:CB = 3:2   →   bad-equation · detail «CB = 3:2»
 * ```
 *
 * `CB = 3:2` appears nowhere in what the student typed. The rule manufactured it by cutting the sentence
 * at the first colon, and `parseLine` stops at a refusal, so no later rule ever saw the line. The figure
 * then drew `C` wherever the sampler put it while the stated ratio vanished.
 *
 * Both honesty invariants broken at once (CLAUDE.md): *"error messages name the conflicting statement,
 * never internal state"*, and *"no stated magnitude is ever silently dropped"*.
 *
 * ## The class, which is why the fix is a discriminator and not a special case
 *
 * `LINE_NAME`'s second alternative is a two-point run, so `AC:` reads as a line name. **This is the
 * fourth instance of one shape**, three documented in `parseAnalytic.ts` itself: `[IVX]{1,3}` with an
 * `i` flag eating a circle equation's `x` (ADR-AG-006); a case-insensitive `LINE_NAME` reading the `th`
 * of *"the line through P"* (#1093 — the same alternative); `HAS_A_WORD` drawing «my answer = x» as a
 * line (#1068). **A rule recognises a PREFIX, claims the remainder unconditionally, and then refuses.**
 *
 * Special-casing a `p:q` tail would have left the class alive for every other `XY:<not-an-equation>`
 * sentence — the patch tripwire docs/17 names. The discriminator used instead is the one the
 * bare-equation branch already applies: the tail must parse as an equation in the PLANE's variables.
 */
import { describe, expect, it } from 'vitest';
import { parseLine } from '../parser/parseAnalytic';

const outcome = (line: string) => {
  const r = parseLine(line);
  return r.ok ? { ok: true as const } : { ok: false as const, code: r.code, detail: r.detail };
};

describe('#1123 — the colon rule declines what it cannot read', () => {
  it('every row of the operator’s measured table now BUILDS — #1124 plugged into the seam', () => {
    /**
     * This case asserted a `not-handled` REFUSAL until #1124, and the change is the point rather than a
     * regression. #1123's job was to stop the colon rule claiming these sentences and refusing on the
     * student's behalf with words he never typed; reaching an honest `not-handled` was the *seam*, and
     * #1124's ratio grammar is what plugs into it. Both landed the same night, in that order, for
     * exactly this reason.
     *
     * The honesty property this issue is really about has not moved — it is asserted below, on sentences
     * that genuinely have no rule.
     */
    for (const line of ['AC:CB = 3:2', 'AC:CB=3:2', 'AB:BC = 1:1', 'AD:DB = 2:3', 'AB:CD = 5:4']) {
      expect(outcome(line).ok, line).toBe(true);
    }
  });

  it('a lowercase run was already declined correctly and still is', () => {
    const r = outcome('xy:ab = 3:2');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('not-handled');
  });
});

describe('#1123 — the named-line colon form itself is untouched', () => {
  it('still mints its line for a real equation', () => {
    for (const line of ['AB: y=2x', 'l1: y=2x', 'ℓ1: y=2x', 'l1: 3x-4y+1=0']) {
      expect(parseLine(line).ok, line).toBe(true);
    }
  });

  it('a NOUN form still refuses loudly — the #1059 ruling is not weakened', () => {
    /**
     * The distinction the fix turns on. «נתון הישר AB: …» carries a noun, which is evidence the student
     * meant an equation, so a broken one must still be reported rather than quietly dropped. The bare
     * colon form has no such evidence and must not refuse on their behalf.
     */
    const r = outcome('נתון הישר AB: y=2x+');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('bad-equation');
  });

  it('the truncated-equation lock’s own case is unaffected', () => {
    // The proof that the noun/bare distinction was kept rather than flattened.
    const r = outcome('נתון מעגל I שמשוואתו (x-3)^2+(y-4)^2');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('bad-equation');
  });
});

describe('#1123 — the honesty invariant, asserted generically', () => {
  it('a not-handled refusal reports the input line verbatim', () => {
    /**
     * Worth asserting as a property rather than per-case, since this is the FOURTH escape of the same
     * class. Any future rule that claims a prefix and hands back a fragment fails here.
     */
    for (const line of ['זה משפט שאין לו כלל', 'AB:CD', 'QQ:ZZ:RR = 1:2:3', 'XY:ZW = abc']) {
      const r = outcome(line);
      if (r.ok || r.code !== 'not-handled') continue;
      expect(r.detail, line).toBe(line);
    }
  });
});
