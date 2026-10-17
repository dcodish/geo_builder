/**
 * #2028 ([ADR-W-130](../../docs/06w-decisions-workspace.md#adr-w-130)) — analytic (`errorText` over `InputError`): every member of the typed error union
 * renders a locale sentence of the student's own words, never engine text. The assertions are shared
 * (`shell/__tests__/fixtures/message-floor.ts`); the rows are this tree's.
 */
import { analyticI18n as i18nA } from '../i18n';
import { errorText as analyticErrorText } from '../app/errorText';
import type { InputError as AnalyticError } from '../store/useAnalyticStore';
import { lockMessageFloor, type Fixed, type Payload } from '../../shell/__tests__/fixtures/message-floor';

// ─── analytic: `errorText` over `InputError` ────────────────────────────────────────────────────────────────────

const ANALYTIC: Record<AnalyticError['key'], Payload[]> = {
  'not-handled': [{}],
  'name-taken': [{ detail: '∠ABC = 40°', nameOf: 'ABC', nameKind: 'angle' }, { detail: 'AB = 3', nameOf: 'AB', nameKind: 'length' }],
  'measure-contradicts': [{ detail: '∠ABC = 40°', what: '∠ABC = 40°' }],
  'radius-contradicts': [{ detail: 'מעגל O ברדיוס 4', declared: 'מעגל O ברדיוס 3' }, { detail: 'מעגל O ברדיוס 4' }], // #2119 (ADR-684)
  'forced-collinear': [{ detail: 'מעגל שעובר דרך A, D ו-B', declaredLines: ['D על AB'], collinear: ['A', 'D', 'B'] }, { detail: 'מעגל שעובר דרך A, D ו-E', declaredLines: ['D על AB', 'E על AB'], collinear: ['A', 'D', 'E'] }], // #1963 (ADR-AG-296)
  'split-statements': [{ parts: ['משולש ABC', 'ישר זווית ב-B'] }, { parts: ['משולש ABC', 'ישר זווית ב-B'], teach: { triangle: 'משולש ABC', angle: '∠ABC = 90°' } }],
  'bad-equation': [{}],
  'out-of-scope': [{}],
  'proof-target': [{}],
  'radian-angle': [{ detail: 'π/2' }],
  'unread-name': [{}],
  'unread-word': [{}],
  'mixed-number': [{ detail: '2', decimal: '45', sum: '30', product: '2' }, { detail: '2', sum: '30', product: '2' }],
  'reserved-coordinate': [{}],
  'bad-arity': [{}],
  'repeated-vertex': [{}],
  'degenerate-role': [{}],
  'apex-not-a-vertex': [{}],
  'bisector-wrong-apex': [{}],
  'bisector-is-side': [{ pair: 'AB', vertex: 'A', polygonKind: 'triangle' }, { pair: 'AB', vertex: 'A', polygonKind: 'square' }, { pair: 'AB', vertex: 'A', polygonKind: 'n5' }], // #2115 (ADR-AG-299)
  'length-xy': [{}],
  'coordinate-restriction': [{}],
  'ambiguous-cevian': [{}],
  'cevian-no-triangle': [{}],
  'ambiguous-hypotenuse': [{}],
  'ambiguous-no-right-angle': [{}],
  'ambiguous-role-side': [{ detail: 'תיכון לבסיס', role: 'base' }, { detail: 'גובה לשוק', role: 'leg' }], // #2018 (ADR-AG-298)
  'crossing-already-named': [{ holder: 'P' }, { holder: 'P', operands: ['AB', 'CD'] }],
  'third-crossing': [{ line: 'AB', a: 'A', b: 'B' }],
  'tangent-no-second-crossing': [{ id: 'P' }],
  'self-crossing': [{}],
  'llm-busy': [{}],
  'llm-understood-unsupported': [{}],
  'llm-dropped': [{ labels: 'B, C' }],
  'llm-invented': [{}],
  'llm-invented-existing': [{ labels: 'P' }],
  'bad-operand': [{}],
  'conflicting-restatement': [{}],
  'name-kind-clash': [{ existing: 'curve:circle' }, { existing: 'derived:centroid' }, {}],
  'unknown-reference': [{}, { expected: 'circle' }, { expected: 'line', nearMiss: { suggest: 'l1', existing: ['l1'] } }],
  'kind-mismatch': [{ existing: 'curve:circle', expected: 'parabola' }],
  'does-not-exist': [{ existing: 'curve:circle' }],
  'ring-contradicts-noun': [{}],
  'polygon-collapsed': [{ polygon: 'ABC', shape: 'משולש', declared: 'משולש ABC' }],
  'inscribed-contradicts-noun': [{ shape: 'טרפז ישר זווית', forced: 'מלבן' }],
  'inscribed-contradicts-declared': [{ shape: 'טרפז ישר זווית', forced: 'מלבן', declared: 'משולש ABC' }],
  'shape-excluded': [{ actual: 'מקבילית', stated: 'טרפז' }],
  'ambiguous-angle': [{}, { example: '∠ABC' }, { options: ['ABC', 'ABD'] }],
  'ambiguous-shape': [{}, { host: { kind: 'circle', found: 0 } }, { host: { kind: 'circle', found: 2, candidates: ['I', 'II'] } }],
  'numeral-notation': [{ holder: '1', expected: 'line' }],
  'out-of-domain': [{ domain: { min: 0, minOpen: true } }],
  'undistinguished-diagonal': [{}],
  'not-a-diagonal': [{}],
  'diagonal-is-side': [{ polygon: 'ABCD', pair: 'AB' }],
  'diagonal-none-here': [{ polygon: 'ABC', pair: 'AB' }],
  'ambiguous-height': [{ options: ['AB = 3', '|AB| = |CD|'] }],
  'shape-not-found': [{ shape: 'טרפז' }],
  'ambiguous-side': [{}],
  'polygon-not-supported': [{}],
  'already-named': [{ holder: 'P' }],
  'alias-taken': [{ holder: 'P' }],
  'rename-bad-name': [{}],
  'rename-same': [{}],
  'rename-unknown': [{}],
  'rename-taken': [{ holder: 'P אמצע AB' }, {}],
  'rename-not-typed': [{}],
  'rename-unsafe': [{ holder: 'A' }, { holder: 'A', detail: '' }],
  'swap-bad-name': [{}],
  'swap-same': [{}],
  'swap-unknown': [{}],
  'swap-not-typed': [{}],
  'swap-unsafe': [{ holder: 'A', other: 'B' }, { holder: 'A', other: 'B', detail: '' }],
  unsatisfiable: [{}, { reusedId: 'P', definedBy: 'P אמצע AB' }],
  'load-foreign': [{ detail: 'קובץ.json' }],
  'load-newer': [{ detail: 'קובץ.json' }],
  'load-too-large': [{ detail: 'קובץ.json' }],
  'load-unreadable': [{ detail: 'קובץ.json' }],
};

lockMessageFloor(
  'analytic (errorText)',
  i18nA,
  Object.entries(ANALYTIC).flatMap(([key, variants]) =>
    variants.map((p, i) => ({ label: `${key} #${i + 1}`, render: (t: Fixed) => analyticErrorText({ key, detail: 'P על AB', ...p } as unknown as AnalyticError, t) })),
  ),
);

