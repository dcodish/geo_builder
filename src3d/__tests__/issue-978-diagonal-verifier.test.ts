/**
 * #978 ([ADR-3D-246](../../docs/06b-decisions-3d.md#adr-3d-246)) — the VERIFIER arm of the «אלכסון» claim.
 *
 * #859 (ADR-3D-203) checks the diagonal claim at the apply moment, guarded to ONE solid holding both
 * letters. Measured on `d440f01` through the real `submit → derive3` path:
 *
 *   «קובייה ABCDA'B'C'D'» · «אלכסון AB»                       → refused `not-a-diagonal`   ✓ (one solid)
 *   «קובייה …» · «פירמידה SEFGH» · «אלכסון AB»                → accepted, row green        ✗ (two solids: never judged)
 *   «קובייה …» · «פירמידה SEFGH» · «אלכסון ראשי AC»           → accepted, row green        ✗ (a face diagonal called main)
 *   «אלכסון AB» with no solid                                → refused `unknown-point`     (moot — never commits)
 *   «קובייה …» · «אלכסון AE» (E free)                        → accepted                    (correct: nothing can judge it)
 *
 * One predicate now serves both layers (`diagonalClaimVerdict`, the ADR-499 shape ported): the apply
 * moment refuses what one solid can already contradict, and `derive3` asks the same question over the
 * FINAL figure for every ok diagonal row — a pair some solid holds must be a diagonal of the claimed kind
 * in every solid that holds it; a pair no solid holds stays unjudged (ADR-104).
 */
import { describe, expect, it } from 'vitest';
import { derive3, useGeo3 } from '../store/store3';
import { diagonalClaimVerdict } from '../engine/baseShapes';

const build = (utterances: string[]) => {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
  const errors: (unknown | null)[] = [];
  for (const u of utterances) {
    useGeo3.getState().submit(u);
    errors.push(useGeo3.getState().lastError);
  }
  const st = useGeo3.getState();
  return { st, d: derive3(st.facts, st.seed), errors };
};

const CUBE = "קובייה ABCDA'B'C'D'";
const PYR = 'פירמידה SEFGH';

describe('#978 — a diagonal claim the apply moment could not judge is judged on the final figure', () => {
  it('two solids, an EDGE called a diagonal → refused, naming the statement («אלכסון AB»)', () => {
    const { st, errors } = build([CUBE, PYR, 'אלכסון AB']);
    expect(st.facts).toHaveLength(2);
    expect(errors[2]).toEqual({ code: 'not-a-diagonal', a: 'A', b: 'B', kind: 'any' });
  });
  it('two solids, a face diagonal claimed MAIN → refused with the space kind', () => {
    const { st, errors } = build([CUBE, PYR, 'אלכסון ראשי AC']);
    expect(st.facts).toHaveLength(2);
    expect(errors[2]).toEqual({ code: 'not-a-diagonal', a: 'A', b: 'C', kind: 'space' });
  });
  it('two solids, a true face diagonal → green', () => {
    const { st, d } = build([CUBE, PYR, 'אלכסון AC']);
    expect(st.facts).toHaveLength(3);
    expect(Object.values(d.status)).toEqual(['ok', 'ok', 'ok']);
  });
  it('two solids, a true space diagonal claimed main → green', () => {
    const { st, d } = build([CUBE, PYR, "אלכסון ראשי AC'"]);
    expect(st.facts).toHaveLength(3);
    expect(Object.values(d.status)).toEqual(['ok', 'ok', 'ok']);
  });
  it('a pair STRADDLING two solids is unjudged — accepted, never refused', () => {
    const { st, d } = build([CUBE, PYR, 'אלכסון AS']);
    expect(st.facts).toHaveLength(3);
    expect(Object.values(d.status)).toEqual(['ok', 'ok', 'ok']);
  });
  it('a pair reaching a FREE point is unjudged — accepted (ADR-3D-191 keeps the ink)', () => {
    const { st, d } = build([CUBE, 'אלכסון AE']);
    expect(st.facts).toHaveLength(2);
    expect(Object.values(d.status)).toEqual(['ok', 'ok']);
  });
});

describe('#978 — the apply-time arm is unchanged (one solid), and the legitimate order stays green', () => {
  it('«קובייה» then «אלכסון AB» (an edge) is still refused at the apply moment', () => {
    const { st, errors } = build([CUBE, 'אלכסון AB']);
    expect(st.facts).toHaveLength(1);
    expect(errors[1]).toEqual({ code: 'not-a-diagonal', a: 'A', b: 'B', kind: 'any' });
  });
  it('«קובייה» then «אלכסון ראשי AC» (a face diagonal) is still refused with the space kind', () => {
    const { errors } = build([CUBE, 'אלכסון ראשי AC']);
    expect(errors[1]).toEqual({ code: 'not-a-diagonal', a: 'A', b: 'C', kind: 'space' });
  });
  it.each([
    [['מלבן ABCD', 'אלכסון AC']],
    [[CUBE, 'אלכסון AC']],
    [[CUBE, "אלכסון ראשי AC'"]],
  ])('%j builds green', (seq) => {
    const { st, d } = build(seq);
    expect(st.facts).toHaveLength(seq.length);
    expect(Object.values(d.status).every((s) => s === 'ok')).toBe(true);
  });
  it('a diagonal typed before any solid is refused upstream (no letter to hang it on) — nothing to revisit', () => {
    const { st, errors } = build(['אלכסון AB']);
    expect(st.facts).toHaveLength(0);
    expect(errors[0]).toMatchObject({ code: 'unknown-point' });
  });
});

describe('#978 — the one predicate', () => {
  const cube = { ids: ['A', 'B', 'C', 'D', "A'", "B'", "C'", "D'"], faces: [['A', 'B', 'C', 'D'], ["A'", "B'", "C'", "D'"], ['A', 'B', "B'", "A'"], ['B', 'C', "C'", "B'"], ['C', 'D', "D'", "C'"], ['D', 'A', "A'", "D'"]] };
  const pyr = { ids: ['E', 'F', 'G', 'H', 'S'], faces: [['E', 'F', 'G', 'H'], ['E', 'F', 'S'], ['F', 'G', 'S'], ['G', 'H', 'S'], ['H', 'E', 'S']] };
  it('null when no solid holds both letters; a verdict only from the solids that do', () => {
    expect(diagonalClaimVerdict([cube, pyr], 'A', 'S', 'any')).toBeNull();
    expect(diagonalClaimVerdict([cube, pyr], 'A', 'X', 'any')).toBeNull();
    expect(diagonalClaimVerdict([], 'A', 'C', 'any')).toBeNull();
    expect(diagonalClaimVerdict([cube, pyr], 'A', 'B', 'any')).toBe(false);
    expect(diagonalClaimVerdict([cube, pyr], 'A', 'C', 'any')).toBe(true);
    expect(diagonalClaimVerdict([cube, pyr], 'A', 'C', 'space')).toBe(false);
    expect(diagonalClaimVerdict([cube, pyr], 'A', "C'", 'space')).toBe(true);
    expect(diagonalClaimVerdict([cube, pyr], "C'", 'A', 'space')).toBe(true);
    expect(diagonalClaimVerdict([cube, pyr], 'E', 'G', 'any')).toBe(true);
    expect(diagonalClaimVerdict([cube, pyr], 'E', 'S', 'any')).toBe(false);
  });
});
