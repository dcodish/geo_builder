/**
 * The 3-D LLM honesty gates (S2.3 of docs/24 — the 2-D ADR-089/ADR-240 dropped-labels and ADR-250
 * dropped-numbers gates, copied as a pattern per docs/20 §12):
 *
 *  - `droppedNewLabels3`  — a NEW point/vector label the utterance states that lands in NO committed
 *                            command is a lost object → refuse with the label named;
 *  - `droppedGivenNumbers3` — a stated magnitude absent from every command payload is a lost given →
 *                            refuse with the number named.
 *
 * Plus the WIRING lock: `store3.submitSteps` (the one seam through which LLM-normalised lines commit)
 * refuses with `dropped-given` and keeps the prior figure. And the FALSE-POSITIVE net: no catalog
 * utterance, parsed by the deterministic grammar, trips either gate in either locale — the gates run
 * on catalog-shaped canonical lines, so the corpus is exactly the surface they must never block.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import type { Command3 } from '../../engine/types';
import { useGeo3 } from '../../store/store3';
import { COMMAND_CATALOG_3D } from '../catalog3';
import { droppedConstructNoun3, droppedGivenNumbers3, droppedNewLabels3, droppedShapeNoun3 } from '../honesty3';
import { parse3 } from '../parse3';

/** Parse a canonical line through the REAL grammar (a fixture line must parse — fail loudly if not). */
function cmds(line: string): Command3[] {
  const p = parse3(line);
  if (!p.ok) throw new Error(`fixture line must parse: ${line}`);
  return p.commands;
}

const CUBE_POINTS = ['A', 'B', 'C', 'D', "A'", "B'", "C'", "D'"];

describe('droppedNewLabels3 — a stated NEW label must land in the committed commands', () => {
  it('a decomposition that loses a stated point is refused with the label named', () => {
    // the student stated M and N; the decomposition only built M — N was silently lost
    const out = droppedNewLabels3('נקודה M על AB ונקודה N על CD', cmds('M אמצע AB'), CUBE_POINTS);
    expect(out).toEqual(['N']);
  });

  it('a complete decomposition passes', () => {
    const all = [...cmds('M אמצע AB'), ...cmds('N אמצע CD')];
    expect(droppedNewLabels3('נקודה M על AB ונקודה N על CD', all, CUBE_POINTS)).toEqual([]);
  });

  it('a label that already EXISTS on the figure is context, never a drop', () => {
    // a statement about existing points whose lowering doesn't re-name them all
    expect(droppedNewLabels3("קטע CA'", cmds("קטע CA'"), CUBE_POINTS)).toEqual([]);
    expect(droppedNewLabels3('D על AB', [{ type: 'segment3', a: 'A', b: 'B' }] as Command3[], CUBE_POINTS)).toEqual([]);
  });

  it('PRIMES are part of the label (canonical after normalize3, U+2032 included)', () => {
    // M אמצע B'D' carries B', D' — complete
    expect(droppedNewLabels3("M אמצע B'D'", cmds("M אמצע B'D'"), CUBE_POINTS)).toEqual([]);
    // a dropped primed label is named WITH its prime
    expect(droppedNewLabels3("נקודה K' על AB", cmds('קטע AB'), ['A', 'B'])).toEqual(["K'"]);
    // the typographic prime normalizes before extraction (the ADR-3D-001 canonicalisation)
    expect(droppedNewLabels3('נקודה K′ על AB', cmds('קטע AB'), ['A', 'B'])).toEqual(["K'"]);
  });

  it('a dropped VECTOR name (lowercase u/v/w) is refused', () => {
    // the student named two vectors; the decomposition only bound u
    const out = droppedNewLabels3('נסמן: AB = u, AD = v', cmds('נסמן: AB = u'), CUBE_POINTS);
    expect(out).toEqual(['v']);
  });

  it('bound vector names account — including coefficient-glued forms (tw, 0.5v, αu)', () => {
    expect(droppedNewLabels3("נסמן: AB = u, AD = v, AA' = w", cmds("נסמן: AB = u, AD = v, AA' = w"), CUBE_POINTS)).toEqual([]);
    expect(droppedNewLabels3('AS = (1-t)u + 0.5v + tw', cmds('AS = (1-t)u + 0.5v + tw'), CUBE_POINTS, ['u', 'v', 'w'])).toEqual([]);
  });

  it('an already-DECLARED vector referenced without re-binding is context, never a drop', () => {
    expect(droppedNewLabels3('u ⊥ v', cmds('u ⊥ v'), CUBE_POINTS, ['u', 'v'])).toEqual([]);
  });

  it("3-D non-labels never false-positive: ℓ-line names, Greek scalars, symbol letters k/m/t, axes", () => {
    expect(droppedNewLabels3('הישר ℓ1: x = (0,0,0) + t(1,0,0)', cmds('הישר ℓ1: x = (0,0,0) + t(1,0,0)'))).toEqual([]);
    expect(droppedNewLabels3('P על AM כך ש-KP = αu + βv', cmds('P על AM כך ש-KP = αu + βv'), CUBE_POINTS.concat(['M', 'K', 'P']), ['u', 'v'])).toEqual([]);
    expect(droppedNewLabels3('k = 1/2', cmds('k = 1/2'))).toEqual([]);
    expect(droppedNewLabels3('D בראשית הצירים', cmds('D בראשית הצירים'))).toEqual([]);
  });

  it('the operand fields u:/v: of a cos-angle command are KEYS, not bound vector names', () => {
    // a command whose JSON carries "u": and "v": as field names must not account a stated vector w
    const c = cmds('קוסינוס הזווית ACB = 3/4'); // cos-angle with u/v pair operands
    expect(droppedNewLabels3('הוקטור w מקיים קוסינוס הזווית ACB = 3/4', c, ['A', 'B', 'C'])).toEqual(['w']);
  });
});

describe('droppedGivenNumbers3 — a stated magnitude must land in the committed commands', () => {
  it('a decomposition that loses a stated length is refused with the number named', () => {
    expect(droppedGivenNumbers3('AB = 7', cmds('קטע AB'))).toEqual(['7']);
  });

  it('a complete decomposition passes', () => {
    expect(droppedGivenNumbers3('AB = 7', cmds('AB = 7'))).toEqual([]);
  });

  it('COORDINATES state several signed numbers', () => {
    expect(droppedGivenNumbers3('A(2,-2,6)', cmds('A(2,-2,6)'))).toEqual([]);
    const out = droppedGivenNumbers3('A(2,-2,6)', cmds('קטע AB'));
    expect(out).toContain('2');
    expect(out).toContain('6');
  });

  it('π-sizes account through the n·π lowering', () => {
    expect(droppedGivenNumbers3('נפח החרוט = 100π', cmds('נפח החרוט = 100π'))).toEqual([]);
    expect(droppedGivenNumbers3('נפח החרוט = 100π', cmds('קטע AB'))).toEqual(['100']);
  });

  it('RADICAL and FRACTION values are consumed whole at the value the parser lowered to', () => {
    const cosLine = 'קוסינוס הזווית בין הוקטורים u ו-w הוא √35/10';
    expect(droppedGivenNumbers3(cosLine, cmds(cosLine))).toEqual([]);
    expect(droppedGivenNumbers3(cosLine, cmds('קטע AB'))).toEqual(['√35/10']);
    expect(droppedGivenNumbers3('וקטור SE = 3/4 וקטור SD', cmds('וקטור SE = 3/4 וקטור SD'))).toEqual([]);
  });

  it('RATIOS account through their on-segment lowering (t = a/(a+b))', () => {
    expect(droppedGivenNumbers3('E על AC כך ש-AE:EC = 2:1', cmds('E על AC כך ש-AE:EC = 2:1'))).toEqual([]);
    expect(droppedGivenNumbers3("K על AA' כך ש-AK = 2KA'", cmds("K על AA' כך ש-AK = 2KA'"))).toEqual([]);
    expect(droppedGivenNumbers3('E על AC כך ש-AE:EC = 2:1', cmds('קטע AC'))).toEqual(['2:1']);
  });

  it('NAME SUBSCRIPTS (π1, ℓ2, O1) are names, not magnitudes', () => {
    const line = 'הזווית בין המישורים π1 ו-π2 היא 45';
    expect(droppedGivenNumbers3(line, cmds(line))).toEqual([]); // 1/2 subscripts don't demand accounting
    expect(droppedGivenNumbers3(line, cmds('קטע AB'))).toEqual(['45']); // …but the real 45 still does
  });

  it('DEGREE values account (stored as deg or lowered trigonometrically)', () => {
    expect(droppedGivenNumbers3('∠BAC = 90', cmds('∠BAC = 90'))).toEqual([]);
    expect(droppedGivenNumbers3('60 < זווית SAB < 90', cmds('60 < זווית SAB < 90'))).toEqual([]);
    expect(droppedGivenNumbers3('∠BAC = 90', cmds('קטע AB'))).toEqual(['90']);
  });
});

describe('the gates hold at the LLM commit seam (store3.submitSteps) — wiring lock', () => {
  beforeEach(() => {
    useGeo3.setState({ facts: [], seed: 0, lastError: null });
    useGeo3.temporal.getState().clear();
  });

  it('a decomposition that loses a stated label refuses with dropped-given and keeps the prior figure', () => {
    useGeo3.getState().submit('קובייה ABCD');
    const before = useGeo3.getState().facts.length;
    useGeo3.getState().submitSteps('נקודה M על AB ונקודה N על CD', ['M אמצע AB']);
    const st = useGeo3.getState();
    expect(st.facts.length).toBe(before); // keep-prior: nothing committed
    expect(st.lastError).toEqual({ code: 'dropped-given', items: 'N' });
  });

  it('a decomposition that loses a stated magnitude refuses with the number named', () => {
    useGeo3.getState().submit('קובייה ABCD');
    useGeo3.getState().submitSteps('AB = 7', ['קטע AB']);
    expect(useGeo3.getState().lastError).toEqual({ code: 'dropped-given', items: '7' });
  });

  it('a complete decomposition commits as one fact', () => {
    useGeo3.getState().submit('קובייה ABCD');
    useGeo3.getState().submitSteps('נקודה M באמצע AB ונקודה N באמצע CD', ['M אמצע AB', 'N אמצע CD']);
    const st = useGeo3.getState();
    expect(st.lastError).toBeNull();
    expect(st.facts).toHaveLength(2); // the cube + ONE fact carrying both steps
  });

  it('an EXISTING label referenced by the utterance but not the steps does not block (M1 context)', () => {
    useGeo3.getState().submit('קובייה ABCD');
    useGeo3.getState().submitSteps("נקודה M על המקצוע BB' של הקובייה ABCD", ["M אמצע BB'"]);
    expect(useGeo3.getState().lastError).toBeNull();
  });
});

describe('false-positive net — no catalog utterance trips either gate (both locales)', () => {
  // The LLM emits catalog-shaped canonical lines, so the catalog IS the surface the gates must never
  // block. Existing points/vectors are empty here (everything is new) — the strictest setting.
  for (const entry of COMMAND_CATALOG_3D) {
    for (const [lang, text] of [
      ['he', entry.he],
      ['en', entry.en],
    ] as const) {
      it(`${lang}: ${text}`, () => {
        const p = parse3(text);
        expect(p.ok, text).toBe(true);
        if (!p.ok) return;
        expect(droppedNewLabels3(text, p.commands), `labels gate tripped on: ${text}`).toEqual([]);
        expect(droppedGivenNumbers3(text, p.commands), `numbers gate tripped on: ${text}`).toEqual([]);
        expect(droppedShapeNoun3(text, p.commands), `shape-noun gate tripped on: ${text}`).toEqual([]);
        expect(droppedConstructNoun3(text, p.commands), `construct-noun gate tripped on: ${text}`).toEqual([]);
      });
    }
  }
});
