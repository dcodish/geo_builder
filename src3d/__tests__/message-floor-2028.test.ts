/**
 * #2028 ([ADR-W-130](../../docs/06w-decisions-workspace.md#adr-w-130)) — 3-D (`errorText3` over `StoreError3`): every member of the typed error union
 * renders a locale sentence of the student's own words, never engine text. The assertions are shared
 * (`shell/__tests__/fixtures/message-floor.ts`); the rows are this tree's.
 */
import { describe, expect, it } from 'vitest';
import i18n3d from '../i18n';
import { errorText3 } from '../i18n/errorText3';
import type { StoreError3 } from '../store/store3';
import { studentFacingViolations } from '../../shell/studentText';
import { drive, lockMessageFloor, TYPED, type Fixed, type Payload } from '../../shell/__tests__/fixtures/message-floor';
import { lockRefusalStyle } from '../../shell/__tests__/fixtures/refusal-style';

// ─── 3-D: `errorText3` over `StoreError3` ───────────────────────────────────────────────────────────────────────

type Code3 = NonNullable<StoreError3>['code'];
const others = ['∠ABC = 40°'];
const ERRORS3: Record<Code3, Payload[]> = {
  'already-defined': [{ id: 'circle-ABCD' }, { id: 'P' }],
  'angle-name-taken': [{ angle: 'ABC', symbol: 'k', line: '∠ABC = 40°', was: { vertex: 'B', p: 'A', q: 'C', label: 'k', coef: 1 } }, { angle: 'ABC', symbol: 'k', was: { vertex: 'B', p: 'A', q: 'C', label: 'k', coef: 1 } }],
  'angle-coef-conflict': [{ was: { vertex: 'B', p: 'A', q: 'C', label: 'k', coef: 2 } }],
  'shape-disjoint': [{ stated: 'trapezoid', actual: 'parallelogram' }],
  'inscribed-contradicts-noun': [
    { shape: 'rightTrapezoid', forced: 'rectangle', sentence: 'AB = 3', other: 'משולש ABC' },
    { shape: 'rightTrapezoid', forced: 'rectangle', sentence: 'AB = 3' },
  ],
  'ambiguous-vector-length': [{ a1: 'A', b1: 'B', a2: 'P', b2: 'Q', c: 3 }, {}],
  'unknown-point': [{ id: 'P' }],
  'unknown-vector': [{ id: 'AB' }],
  'free-vector-metric': [{ id: 'u', sentence: '|u| = 5' }, { id: 'u' }],
  'free-vector-combination': [{ id: 'w', sentence: 'w = u + v' }, { id: 'w' }],
  'free-vector-conflict': [{ id: 'u' }],
  'unknown-plane': [{ id: 'π1' }, { id: 'base' }],
  'not-a-diagonal': [{ a: 'A', b: 'B', kind: 'any' }, { a: 'A', b: 'B', kind: 'space' }],
  'unknown-line': [{ id: 'ℓ' }],
  'bad-solid': [{ kind: 'cube' }],
  'bad-name': [{ id: 'P' }],
  'need-basis': [{}],
  'no-solution': [{ id: 'P' }],
  'not-on-segment': [{ id: 'P' }],
  'two-params': [{}],
  'no-roots': [{ sym: 'k', stated: 'AB = 3', others }, { sym: 'k', stated: 'AB = 3', others: [] }],
  'not-on-plane': [{ id: 'P' }],
  'not-coplanar': [{ id: 'π1' }],
  'plane-side-undefined': [{ id: 'π1' }],
  'wrong-side-of-plane': [{ id: 'P' }],
  'not-on-line': [{ id: 'P' }],
  'point-coincides': [{ id: 'P', with: 'A' }],
  'line-misses-plane': [{ id: 'P' }],
  'crossing-off-segment': [{ id: 'P' }],
  'segments-do-not-meet': [{ id: 'P', s1: 'AB', s2: 'CD' }],
  'symbolic-new-point': [{ id: 'P' }],
  'power-needs-solid': [{ id: 'P' }],
  'injection-unsatisfiable': [{}],
  'givens-contradict': [{ stated: 'AB = 3', others }, { stated: 'AB = 3', others: [] }],
  'polygon-collapsed': [
    { stated: 'AB = 3', others, sides: 4, ring: 'ABCD' },
    { stated: 'AB = 3', others: [], sides: 4, ring: 'ABCD' },
    { stated: 'AB = 3', others, sides: 3, ring: 'ABC', forced: true },
    { stated: 'AB = 3', others: [], sides: 5, ring: 'ABCDE', forced: true },
  ],
  'ring-crossed': [{ stated: 'משולש ABC' }],
  'ring-not-flat': [{ stated: 'AB = 3', others, sides: 4, vertices: ['A', 'B'] }, { stated: 'AB = 3', others: [], sides: 4, vertices: ['A', 'B'] }],
  'sign-unsatisfiable': [{ id: 'P' }],
  'no-such-solid': [{ id: 'pyramid' }, { id: 'ABCD' }],
  'two-unknowns': [{ id: 'P' }],
  'size-on-solid': [{}],
  'unknown-symbol': [{ id: 'k' }],
  'sign-not-selectable': [{ id: 'k' }],
  'ambiguous-angle': [{ id: 'B' }],
  'no-prism-to-make-right': [{}],
  'ambiguous-prism': [{}],
  'ambiguous-solid': [{ id: 'ABCD', count: 2 }],
  'ambiguous-definite-shape': [{ shapes: ['ABC', 'ABCD'], sides: 3, sentence: 'משולש ABC', example: 'משולש ABC' }, { shapes: ['ABCD', 'ABCDE'], sides: 4 }, { shapes: ['ABCDE', 'ABC'], sides: 5 }],
  'bound-unsatisfiable': [{ id: 'P' }],
  'vacuous-relation': [{}],
  'plane-not-determined': [{ id: 'π1' }],
  'line-not-determined': [{ id: 'ℓ' }],
  'point-not-determined': [{ id: 'P' }],
  'given-not-drivable': [{ object: { kind: 'point', id: 'P' } }, { object: { kind: 'size', solid: 'cone' } }],
  'claim-refuted': [{}],
  'placement-not-fixed': [{}],
  'incircle-needs-triangle': [{}],
  'incircle-known-limit': [{ sides: 5 }, { sides: 6 }, { sides: 8 }],
  'not-understood': [{}],
  'param-roles-conflated': [{ letter: 'k' }],
  'ambiguous-main-diagonal': [{ pairs: 'AG, BH' }, { pairs: '' }],
  'ambiguous-angle-vertex': [{ vertex: 'B', angles: '∠ABC, ∠ABD' }, { vertex: 'B', angles: '' }],
  'proof-target': [{ sentence: 'הוכיחו כי AB = CD' }],
  'radian-angle': [{}],
  'unread-name': [{ detail: 'ДЖФ' }],
  'unread-word': [{ detail: 'ДЖФ' }],
  'component-symbolic': [{ component: 'x_B' }],
  'dropped-given': [{ items: 'AB = 3' }],
  'split-statements': [{ all: '(1) משולש ABC  (2) ישר זווית ב-B' }],
  'right-angle-vertex': [{ triangle: 'משולש ABC', angle: '∠ABC = 90°', more: '' }],
  'split-roles': [{ first: 'משולש ABC', second: 'P אמצע AB' }],
  'dependents-broken': [{ items: 'AB = 3', cause: 'משולש ABC' }],
  'rename-refused': [
    { reason: 'same', from: 'A', to: 'B' },
    { reason: 'no-source', from: 'A', to: 'B' },
    { reason: 'target-taken', from: 'A', to: 'B' },
  ],
  'swap-refused': [{ reason: 'same', a: 'A', b: 'B' }, { reason: 'no-source', a: 'A', b: 'B' }],
  'bad-file': [{}],
  'newer-schema': [{}],
  'too-large': [{}],
};

const ROWS = Object.entries(ERRORS3).flatMap(([code, variants]) =>
  variants.map((p, i) => ({ label: `${code} #${i + 1}`, key: code, render: (t: Fixed) => errorText3(t, { code, ...p } as unknown as StoreError3) })),
);

lockMessageFloor('3-D (errorText3)', i18n3d, ROWS);

// #1995 stage 5 (ADR-W-154): the same rows, rendered in Hebrew, hold the one-next-step rule.
lockRefusalStyle('3d', () => ROWS.map((r) => ({ label: r.label, key: r.key, he: drive(i18n3d, 'he', r.render).text ?? '' })));


describe('#2028 — the lock can fail', () => {
  it('an engine token in a value is reported, and a missing locale entry is caught', () => {
    const leak = drive(i18n3d, 'he', (t) => errorText3(t, { code: 'unknown-point', id: '@f-AB' }));
    expect(studentFacingViolations(leak.values, { typed: TYPED, names: [] }).length).toBeGreaterThan(0);
    expect(drive(i18n3d, 'he', (t) => t('err.thisKeyDoesNotExist')).missing).toEqual(['err.thisKeyDoesNotExist']);
  });
});
