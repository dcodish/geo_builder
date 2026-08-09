/**
 * The 3-D half of the bilingual MORPHOLOGY MATRIX (S2.2 of docs/24) — see the 2-D twin
 * src/parser/__tests__/morphology-matrix.test.ts for the rationale (stems × surface forms locked to
 * parse equivalently; the recurring classes: single-vav זוית ADR-3D-032, the final/medial kaf trap
 * ADR-3D-035, the meet-verb family ADR-3D-055). Kept per-product (patterns copied, never imported).
 */
import { describe, expect, it } from 'vitest';
import { parse3 } from '../parse3';

const types = (s: string) => {
  const r = parse3(s);
  return r.ok ? r.commands.map((c) => c.type).sort() : null;
};

describe('3-D morphology matrix (parse3 is context-free)', () => {
  it('perpendicular: symbol ⊥ ≡ word מאונך ≡ plural מאונכים (ADR-3D-035)', () => {
    const base = types('SM ⊥ DB');
    expect(base, 'canonical ⊥ did not parse').not.toBeNull();
    expect(types('SM מאונך ל-DB')).toEqual(base);
    expect(types('SM ו-DB מאונכים זה לזה')).toEqual(base);
  });

  it('the diagonal crossing: נחתכים ≡ נפגשים (ADR-3D-055)', () => {
    const base = types('אלכסוני הריבוע ABCD נחתכים בנקודה O');
    expect(base, 'canonical נחתכים did not parse').not.toBeNull();
    expect(types('אלכסוני הריבוע ABCD נפגשים בנקודה O')).toEqual(base);
  });

  it('the angle noun: זווית ≡ זוית (ADR-3D-032 Am.)', () => {
    const base = types('זווית ADC = 60');
    expect(base, 'canonical זווית did not parse').not.toBeNull();
    expect(types('זוית ADC = 60')).toEqual(base);
  });

  /**
   * #486 — the DEFINITE ARTICLE is optional, and so is the subject noun. Both were silent drops:
   * «B על המישור π2» parsed and «B על מישור π2» did not, which sent input the parser can already lower
   * to a paid LLM call. Same class as the kaf/vav/yod entries above, and now shared (HE_PLANE / HE_LINE /
   * HE_SEG / HE_SUBJ) rather than re-spelled per rule.
   */
  it('the definite article on a noun gate is optional: מישור ≡ המישור (#486)', () => {
    const base = types('B על המישור π2');
    expect(base, 'canonical article form did not parse').not.toBeNull();
    expect(types('B על מישור π2')).toEqual(base);
  });

  it('the definite article on the segment noun: קטע ≡ הקטע ≡ bare (#486)', () => {
    const base = types('G על הקטע AD');
    expect(base, 'canonical article form did not parse').not.toBeNull();
    expect(types('G על קטע AD')).toEqual(base);
    expect(types('G על AD')).toEqual(base);
  });

  it('the subject noun before a label is optional: הנקודה B ≡ נקודה B ≡ B (#486)', () => {
    const base = types('B על המישור π2');
    expect(types('הנקודה B על המישור π2')).toEqual(base);
    expect(types('נקודה B על המישור π2')).toEqual(base);
  });

  it('English admits the article too: «on plane π2» ≡ «on the plane π2» (#486)', () => {
    const base = types('B on plane π2');
    expect(base).not.toBeNull();
    expect(types('B on the plane π2')).toEqual(base);
  });

  /**
   * #485 — a crossing is stated verb-headed OR noun-headed, and the noun frame was missing entirely
   * on a capability the engine already had.
   */
  it('the line-plane crossing: verb frame ≡ noun frame (#485)', () => {
    const base = types('ℓ חותך את π1 בנקודה A');
    expect(base, 'canonical verb form did not parse').not.toBeNull();
    expect(types('A נקודת החיתוך של ℓ עם π1')).toEqual(base);
    expect(types('A נקודת חיתוך של ℓ עם π1')).toEqual(base);
    expect(types('A היא נקודת החיתוך של ℓ עם π1')).toEqual(base);
    expect(types('A = חיתוך ℓ עם π1')).toEqual(base);
    expect(types('A is the intersection of ℓ and π1')).toEqual(base);
    expect(types('ℓ intersects plane π1 at A')).toEqual(base);
  });

  it('the crossing takes a POINT-RUN plane in both frames (#401)', () => {
    const base = types('הישר ℓ1 חותך את מישור ACD בנקודה E');
    expect(base, 'a named line cutting a point-run plane did not parse').not.toBeNull();
    expect(base).toContain('plane-through'); // the run is materialised, so referencing it draws it
    expect(types('E נקודת החיתוך של ℓ1 עם ACD')).toEqual(base);
    expect(types('line ℓ1 cuts plane ACD at E')).toEqual(base);
  });

  it('the crossing rules do not poach their neighbours (#485)', () => {
    // the diagonal crossing keeps its own rule, and a non-line operand is still refused
    expect(types('O נקודת חיתוך אלכסוני הבסיס')).toEqual(['diag-intersection']);
    expect(types('A נקודת החיתוך של q עם π1'), 'q is not a line name').toBeNull();
  });
});
