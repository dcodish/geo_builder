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
});
