/**
 * #924 (ADR-3D-223) — a lowercase point label in a position the grammar only allows a label parses like
 * its uppercase twin, at the ONE uplift chokepoint (#181's `upliftLowercaseLabels`).
 *
 * Prod, session 1dnu5sao (2026-09-07): «C(p²,1,0)» parsed instantly; «c(p²,0,1)» — the same line typed
 * from the symbol palette with a lowercase c — fell through to the paid LLM lane (which recovered it).
 * Measured at `82d87c6`, the class as the App actually sees it (parse3 + the #353 convention nudge):
 *
 *     c(p²,0,1) · c(p,1,0) · a(1,2,3)           not-handled, nudge candidate null  → LLM   (single letter)
 *     תיבה abcda'b'c'd' · פירמידה sabcd          not-handled, nudge candidate none/wrong → LLM (long primed run)
 *     ab = 5 · ac ⊥ bd · קובייה abcd · נסמן: ab = u · הזווית בין ac לבין ab
 *                                               not-handled, but the #353 nudge TEACHES them — no LLM call
 *
 * Arm 1 — the coordinate definition at the sentence start — is delivered here. Arm 2 — a solid noun as an
 * anchor — collides with the standing #353/#498 lock that a lowercase solid is TAUGHT, not lifted, so it is
 * escalated for a ruling rather than built over a lock; its rows are recorded below. The un-anchored
 * remainder (arm 3) stays with the nudge, which already serves it, and the case-significant lanes (axes,
 * parameters, vector names, line names) are byte-unchanged — the guards below are taken from the prod
 * log, not imagined.
 */
import { describe, expect, it } from 'vitest';
import { normalize3, parse3 } from '../parser/parse3';
import { upperCasedLabelCandidate3 } from '../parser/scope3';
import { derive3, useGeo3 } from '../store/store3';

const cmds = (u: string) => {
  const r = parse3(u);
  if (!r.ok) throw new Error(`not parsed: ${u} → ${r.reason}`);
  return r.commands;
};

describe('#924 arm 1 — the coordinate definition: a lowercase label before a 3-tuple at the sentence start', () => {
  for (const [lower, upper] of [
    ['c(p²,0,1)', 'C(p²,0,1)'],
    ['c(p,1,0)', 'C(p,1,0)'],
    ['a(1,2,3)', 'A(1,2,3)'],
    ["b'(0,0,4)", "B'(0,0,4)"],
    ['נתונה d(3,p,0)', 'נתונה D(3,p,0)'],
    ['נקודה c(1,2,3)', 'נקודה C(1,2,3)'], // the #181 noun anchor, unchanged
  ]) {
    it(`«${lower}» ≡ «${upper}»`, () => {
      expect(normalize3(lower)).toBe(normalize3(upper));
      expect(cmds(lower)).toEqual(cmds(upper));
    });
  }

  it('the parameter of a parametric line is NOT a label: «t(m-2,m,m+2)» mid-sentence stays lowercase', () => {
    for (const u of ['ישר l x=(1,2,3)+t(m-2,m,m+2)', 'x=(1,2,3)+t(2,0,2)', 'משוואת הישר AC היא x=(8,-1,-1)+t(k+1,0,k-3)']) {
      expect(normalize3(u), u).toBe(u);
      expect(parse3(u).ok, u).toBe(true);
    }
  });

  it('a lone axis letter never uplifts, even before a tuple', () => {
    expect(normalize3('x(1,2,3)')).toBe('x(1,2,3)');
  });
});

describe('#924 arm 2 — a solid noun is NOT an uplift anchor; the whole run is TAUGHT (operator ruling 2026-09-07)', () => {
  it('«תיבה abcd» stays taught by the nudge, exactly as lowercase-nudge.test.ts locks it', () => {
    expect(normalize3('תיבה abcd')).toBe('תיבה abcd');
    expect(parse3('תיבה abcd').ok).toBe(false);
    expect(upperCasedLabelCandidate3('תיבה abcd')).toBe('תיבה ABCD');
  });

  /**
   * This block was written in round #927 as a MEASUREMENT of what still escaped to the paid LLM lane,
   * pending the operator's ruling on arm 2 — *"a solid noun is an uplift anchor, or the nudge widens?"*
   * The ruling landed 2026-09-07 (*"we should not accept this"* → TEACH), and round #931 widened the
   * nudge's run shape ([ADR-3D-226](../../docs/06b-decisions-3d.md#adr-3d-226)). So the rows flip here
   * from "recorded as escaping" to "taught", which is the whole point of having recorded them.
   */
  it('a long or primed solid run is now taught, not escalated — the #927 measurement, flipped', () => {
    for (const [u, cand] of [
      ["תיבה abcda'b'c'd'", "תיבה ABCDA'B'C'D'"],
      ['פירמידה sabcd', 'פירמידה SABCD'],
    ] as const) {
      expect(parse3(u).ok, `${u} is still not ACCEPTED as typed — the #353/#498 ruling stands`).toBe(false);
      expect(upperCasedLabelCandidate3(u), u).toBe(cand);
      expect(parse3(cand).ok, `${u}: the nudge's candidate parses, so the note fires instead of the LLM`).toBe(true);
    }
  });
});

describe('#924 — the operator\'s row builds THROUGH THE PARSER (no escalation), like #902\'s uppercase twin', () => {
  it("«תיבה ABCDA'B'C'D'» · «c(p²,1,0)» · «p=3» → accepted, C lands at (9, 1, 0)", () => {
    const st = useGeo3.getState();
    st.clear();
    for (const u of ["תיבה ABCDA'B'C'D'", 'c(p²,1,0)', 'p=3']) {
      st.submit(u);
      expect(useGeo3.getState().lastError, `«${u}» must be accepted by the parser path`).toBeNull();
    }
    const d = derive3(useGeo3.getState().facts, useGeo3.getState().seed);
    for (const f of useGeo3.getState().facts) expect(d.status[f.id], f.utterance).toBe('ok');
    const C = d.positions.get('C')!;
    expect(Math.abs(C.x - 9) + Math.abs(C.y - 1) + Math.abs(C.z)).toBeLessThan(1e-6);
  });

});

describe('#924 — the unchanged guards, from the prod log (the case-significant lanes)', () => {
  for (const u of [
    'l ⊥ π',
    'ℓ ∥ π1',
    'l ⊥BCK',
    'u = (k-1,k,3)',
    'k = 2',
    'נקודה x',
    't>0',
    'AE=t*AS',
    'D(3,p,0)',
    'M(k,1,3)',
    'k הוא פרמטר חיובי',
    'נסמן: AB = u, AD = v, AS = w',
    'מישור π: 3x+my+(m+6)z+4=0',
    'l',
    'הזווית בין AB לבין v היא 60',
    'הזווית בין הוקטורים w ו-u',
    'CD = v',
  ]) {
    it(`«${u}» is byte-unchanged by the uplift`, () => {
      expect(normalize3(u)).toBe(u.replace(/ {2,}/g, ' '));
    });
  }
});

describe('#924 arm 3 — NOT uplifted (not armed): the un-anchored operand runs stay with the #353 nudge, which already teaches them', () => {
  for (const u of ['ab = 5', 'ac ⊥ bd', 'נסמן: ab = u', 'הזווית בין ac לבין ab היא 40']) {
    it(`«${u}» does not parse as typed, and the convention nudge has a parsing candidate — no LLM call`, () => {
      expect(parse3(u).ok).toBe(false);
      const cand = upperCasedLabelCandidate3(u);
      expect(cand, 'the nudge lifts the run').not.toBeNull();
      expect(parse3(cand!).ok, 'the corrected spelling parses, so the App shows the nudge instead of escalating').toBe(true);
    });
  }
});
