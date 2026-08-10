/**
 * The 3-D POLISH pair — #336 (clear leaves the input behind) and #491 (the canvas lost a decimal).
 *
 * #336 — "clear the session" has TWO OWNERS: the store (facts/queries/planeDisplay/figureName) and
 * `App3.tsx`'s component-local state (the command input, the guidance note, the query box). The button
 * was wired to the store half only, so the text the student just cleared stayed on screen. 2-D closed
 * exactly this in #146 by routing its button through one handler resetting both owners; 3-D never
 * received the fix — the same defect, a product apart. The store half is asserted here; the component
 * half is the `clearAll` handler, whose two-owner contract is documented at its definition (there is no
 * component-render harness in this tree, and adding one for a four-line handler is not the trade).
 *
 * #491 — #481 correctly replaced the canvas's private 3-decimal rounder with the panel's shared
 * formatter (one set of rounding rules for one product), but inherited the panel's 2-place fallback
 * along with it, coarsening `-0.586` to `-0.59`. Precision is a property of the SURFACE — the canvas
 * has room a panel row does not — so the fallback is now the caller's to choose while every exact tier
 * stays shared. What this deliberately does NOT do is make the triple uniform: `(-0.586, √2, 3.414)`
 * prints the one component that HAS an exact form as that form. Hiding it to look tidy would assert
 * that none of them are exact, which is false.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { cleanMag, cleanNum } from '../engine/dataView';
import { derive3, useGeo3 } from '../store/store3';

describe('#491 — the decimal FALLBACK is the surface\'s choice; the exact tiers are shared', () => {
  it('the canvas precision (3) recovers what the panel precision (2) rounded away', () => {
    expect(cleanMag(-0.5857864376269049)).toBe('-0.59'); // the panel: house precision, unchanged
    expect(cleanMag(-0.5857864376269049, 3)).toBe('-0.586'); // the canvas: the #481 regression, closed
  });

  it('asking for more places NEVER trades away an exact form — the tiers sit above the fallback', () => {
    expect(cleanMag(Math.SQRT2, 3)).toBe('√2');
    expect(cleanMag(2 * Math.SQRT2, 3)).toBe('2√2');
    expect(cleanMag(0.5, 3)).toBe('1/2');
    expect(cleanMag(3, 3)).toBe('3');
    expect(cleanMag(-0, 3)).toBe('0');
  });

  it('a MIXED triple is the honest rendering, not a defect to normalise away', () => {
    // (√2−2, √2, √2+2): one component is representable in the surd tier and two are not.
    const triple = [Math.SQRT2 - 2, Math.SQRT2, Math.SQRT2 + 2].map((x) => cleanMag(x, 3));
    expect(triple).toEqual(['-0.586', '√2', '3.414']);
  });

  it('the default is untouched, so every existing caller keeps the panel\'s precision', () => {
    expect(cleanNum(1.23456)).toBe('1.23');
    expect(cleanNum(1.23456, 1e-5, false, 3)).toBe('1.235');
  });
});

describe('#336 — clear resets the STORE half (the component half is `clearAll`)', () => {
  beforeEach(() => {
    useGeo3.setState({ facts: [], seed: 0, lastError: null, planeDisplay: {}, queries: [] });
    useGeo3.temporal.getState().clear();
  });

  it('a built figure, a query and a display toggle all go away together', () => {
    useGeo3.getState().submit("תיבה ABCDA'B'C'D'");
    useGeo3.getState().togglePlaneDisplay('ABC');
    expect(useGeo3.getState().facts.length).toBeGreaterThan(0);
    expect(derive3(useGeo3.getState().facts, 0).construction.solids).toHaveLength(1);

    useGeo3.getState().clear();
    const st = useGeo3.getState();
    expect(st.facts).toEqual([]);
    expect(st.queries).toEqual([]);
    expect(st.planeDisplay).toEqual({});
    expect(st.lastError).toBeNull();
  });
});
