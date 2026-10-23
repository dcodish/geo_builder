/**
 * #2201 phase 3a ([ADR-756](../../../docs/06-decisions.md#adr-756)) — THE 2-D ERROR BANK IS TOTAL.
 *
 * 2-D was the only builder whose message contract was prose: the engine wrote English sentences and the humaniser
 * pattern-matched them, so rewording one dropped the student to the floor in silence. Now every refusal is a variant of
 * `EngineError` (`src/engine/errors.ts`), its wire written by `engineErrorDebugText` and read back by
 * `parseEngineError`, and worded by `humanizeError.ts`'s `switch (e.code)`. This file holds the three halves together:
 *
 *   1. every variant round-trips (format → parse is the identity), so the formatter and the parser cannot drift;
 *   2. every variant has an arm (`wordingOf` is total — its `never` is tsc's half), and every variant with a ruled
 *      sentence reaches it, in both locales;
 *   3. no engine, replay or store file writes an error sentence of its own: the AST walker finds no template (or
 *      sentence literal) assigned to an `error` / `reason` / `detail` property or to `status[…]`, and no literal outside
 *      the bank carries a wire phrase.
 */
import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import i18n from '@/i18n';
import { engineErrorDebugText, parseEngineError, PARAM_KINDS, type EngineError, type EngineErrorCode } from '@/engine/errors';
import { humanizeErrorOutcome, wordingOf, type Translate } from '@/i18n/humanizeError';
import { parseSource, sourceFiles } from '../../../shell/__tests__/fixtures/ts-literals';

const he: Translate = (k, o) => i18n.getFixedT('he')(k, o) as string;
const en: Translate = (k, o) => i18n.getFixedT('en')(k, o) as string;

/** One sample of every variant — a `Record` over every code, so a new variant fails `tsc` until it has one. */
const SAMPLES: { [C in EngineErrorCode]: Extract<EngineError, { code: C }> } = {
  'reserved-radius-ambiguous': { code: 'reserved-radius-ambiguous', letter: 'r', circles: ['O', 'P'], sized: true },
  'metric-impossible': { code: 'metric-impossible', a: 'A', b: 'C', value: '9', sum: '8', via: ['B'] },
  'angle-sum-impossible': { code: 'angle-sum-impossible', polygon: 'ABC', sum: '200°', bound: '180°', angles: '∠ABC = 100°, ∠ACB = 100°' },
  'measure-out-of-range': { code: 'measure-out-of-range', given: '|AB| = -3', measure: 'length' },
  'bound-impossible': { code: 'bound-impossible', value: '|BC| = 4', bound: '|BC| > 10' },
  'obtuse-side-impossible': { code: 'obtuse-side-impossible', vertex: 'C', deg: '90', hyp: 'AB', hypVal: '3', leg: 'CB', legVal: '4' },
  'unknown-circle': { code: 'unknown-circle', center: 'O2' },
  'unresolved-deps': { code: 'unresolved-deps', ids: ['A', 'B', 'circle-O'] },
  'undefined-points': { code: 'undefined-points', ids: ['A', 'B'] },
  'non-finite': { code: 'non-finite' },
  'unknown-point': { code: 'unknown-point', what: '|AB| = |AD|' },
  'polygon-collapsed': { code: 'polygon-collapsed', vertices: ['A', 'B', 'C', 'D', 'E'], corner: ['B', 'C', 'D'], what: '∠BCD = 180°' },
  'not-cyclic': { code: 'not-cyclic', shape: 'right-trapezoid', ring: 'ABCD', forced: 'rectangle' },
  'diagonal-height': { code: 'diagonal-height', diagonal: 'AC', shape: 'square', ring: 'ABCD' },
  'collinear-circle': { code: 'collinear-circle', points: ['A', 'D', 'B'] },
  'circumcircle-collinear': { code: 'circumcircle-collinear', id: 'O', a: 'A', b: 'D', c: 'B' },
  'shape-excluded': { code: 'shape-excluded', actual: 'parallelogram', stated: 'trapezoid' },
  'name-taken': { code: 'name-taken', measure: 'angle', name: 'ABC', symbol: 'α' },
  'equal-nested': { code: 'equal-nested', circle: 'circle-P', relation: 'int-tangent' },
  'tangents-exhausted': { code: 'tangents-exhausted', pair: 'AB', kind: 'any', position: 'int-tangent' },
  'restated-size': { code: 'restated-size', circle: 'circle-O', value: '4' },
  'over-constrained': { code: 'over-constrained', what: '|AC| = 9' },
  'over-constrained-unnamed': { code: 'over-constrained-unnamed' },
  'not-determined': { code: 'not-determined', who: ['@ctr-O', 'A'], what: '@ctr-OB ⟂ AB' },
  'third-crossing': { code: 'third-crossing', id: '~D', a: 'A', b: 'C', circle: 'circle-O' },
  'tangent-no-second-crossing': { code: 'tangent-no-second-crossing', id: 'E', line: 'line-CA', circle: 'circle-O', touch: 'A' },
  'toward-at-centre': { code: 'toward-at-centre', id: 'E', toward: 'B', circle: 'circle-O' },
  'cannot-place-on-segment': { code: 'cannot-place-on-segment', id: 'F', seg: 'AB', what: '|AC| = 9' },
  'tangent-at-centre': { code: 'tangent-at-centre', circle: 'circle-O' },
  'circles-dont-meet': { code: 'circles-dont-meet', id: 'A', c1: 'circle-O', c2: 'circle-P' },
  'circles-tangent-only': { code: 'circles-tangent-only', id: 'B', c1: 'circle-O', c2: 'circle-P', avoid: 'A' },
  'line-misses-circle': { code: 'line-misses-circle', id: 'E', line: 'line-AB', circle: 'circle-O' },
  'distance-circles-miss': { code: 'distance-circles-miss', id: 'C' },
  'lines-parallel': { code: 'lines-parallel', id: 'E', l1: 'AB', l2: 'CD' },
  'perp-foot-coincide': { code: 'perp-foot-coincide', seg: 'AB' },
  'line-points-coincide': { code: 'line-points-coincide', line: 'line-AB', a: 'A', b: 'B' },
  'bisect-opposite': { code: 'bisect-opposite', angle: '∠ABC' },
  'radius-not-positive': { code: 'radius-not-positive', circle: 'circle-O' },
  'radius-point-at-centre': { code: 'radius-point-at-centre', circle: 'circle-O' },
  'same-spot': { code: 'same-spot', a: 'C', b: 'E' },
  'diagonal-is-side': { code: 'diagonal-is-side', pair: 'AB', shape: 'ABCD' },
  'diagonal-none': { code: 'diagonal-none', pair: 'AB', shape: 'ABC' },
  'already-defined': { code: 'already-defined', id: 'O' },
  'tangent-needs-fixed-radius': { code: 'tangent-needs-fixed-radius' },
  'no-longer-available': { code: 'no-longer-available', ids: ['D'] },
  'muted-row-owns': { code: 'muted-row-owns', ids: ['A', 'B', 'C'], row: 'משולש ABC' },
  'unbound-variable': { code: 'unbound-variable', name: 'α' },
  'unenforceable-relation': { code: 'unenforceable-relation', names: ['k'] },
  'cant-build-yet': { code: 'cant-build-yet', role: 'median', ring: 'ABC' },
  'degenerate-segment': { code: 'degenerate-segment', rel: '⟂', seg: 'BB' },
  'degenerate-length': { code: 'degenerate-length', seg: 'AA' },
  'degenerate-angle': { code: 'degenerate-angle', angle: '∠ABB' },
  'degenerate-collinear': { code: 'degenerate-collinear', id: 'A' },
  raw: { code: 'raw', text: 'solver did not converge within the iteration budget' },
};

/** The variants no ruled sentence says (the floor, before and after phase 3a). */
const FLOOR_CODES: ReadonlySet<EngineErrorCode> = new Set<EngineErrorCode>([
  'over-constrained-unnamed', 'circles-tangent-only', 'line-misses-circle', 'distance-circles-miss', 'lines-parallel', 'perp-foot-coincide',
  'line-points-coincide', 'bisect-opposite', 'radius-not-positive', 'radius-point-at-centre', 'cant-build-yet', 'degenerate-length', 'raw',
]);

describe('#2201 phase 3a — the bank round-trips', () => {
  for (const e of Object.values(SAMPLES) as EngineError[]) {
    it(`${e.code}: format → parse is the identity`, () => {
      expect(parseEngineError(engineErrorDebugText(e))).toEqual(e);
    });
  }

  it('every variant declares the kind of every field (PARAM_KINDS) — the fields 3b checks', () => {
    for (const e of Object.values(SAMPLES) as EngineError[]) {
      const kinds = PARAM_KINDS[e.code] as Record<string, string>;
      for (const f of Object.keys(e).filter((k) => k !== 'code')) expect(kinds[f], `${e.code}.${f}`).toBeDefined();
    }
  });

  it('a fold tail is read only on the variants that read one; elsewhere the text is no variant (the floor, as before)', () => {
    expect(parseEngineError(`${engineErrorDebugText(SAMPLES['over-constrained'])} [vs #3]`)).toEqual({ ...SAMPLES['over-constrained'], vs: 3 });
    expect(parseEngineError(`${engineErrorDebugText(SAMPLES['same-spot'])} [vs #3]`).code).toBe('raw');
  });
});

describe('#2201 phase 3a — every variant is worded (the switch is total)', () => {
  for (const e of Object.values(SAMPLES) as EngineError[]) {
    it(`${e.code}: ${FLOOR_CODES.has(e.code) ? 'the floor' : 'its ruled sentence'}, in both locales`, () => {
      const w = wordingOf(e);
      if (FLOOR_CODES.has(e.code)) {
        expect(w).toBeNull();
        expect(humanizeErrorOutcome(engineErrorDebugText(e), he).floor).toBe(true);
        return;
      }
      expect(w).not.toBeNull();
      for (const t of [he, en]) {
        const out = humanizeErrorOutcome(engineErrorDebugText(e), t);
        expect(out.text).not.toContain('errors.');
        // a sample whose value is an engine token still floors by ADR-W-130's guard; every other renders its key
        if (!/[~@]/.test(engineErrorDebugText(e))) expect(out.floor, `${e.code} fell to the floor`).toBe(false);
      }
    });
  }
});

// ── 3: no engine file writes an error sentence of its own ─────────────────────────────────────────────────────────
const TREES = ['src/engine', 'src/replay', 'src/store'];
const BANK = 'src/engine/errors.ts';
const ERROR_PROPS = new Set(['error', 'reason', 'detail']);
/** The opening words of every wire sentence: a literal outside the bank that carries one is a sentence written in place. */
const WIRE_PHRASES = [
  'cannot hold', 'cannot construct', 'cannot place', 'cannot build', 'cannot take a tangent', 'cannot drop a perpendicular', 'cannot bisect',
  'references an unknown point', 'impossible: ', 'over-constrained: ', 'collapsed: polygon', 'shape-excluded:', 'name-taken:', 'tangents-exhausted:',
  'reserved radius ambiguous', 'not determined:', 'is not defined', 'is no longer available', "can't build", 'cannot be enforced', 'would be at the same point',
  'is not a diagonal', 'is already defined', 'needs two distinct points', 'needs three distinct points', 'must be distinct', 'undefined point:',
  'unresolved dependencies', 'non-finite position', 'radius must be positive', 'coincides with the centre', 'tangent circles need',
];

const isSentence = (n: ts.Node): boolean =>
  ts.isTemplateExpression(n) || ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) && /\s/.test(n.text));
const textOf = (n: ts.Node): string | null =>
  ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) ? n.text : ts.isTemplateExpression(n) ? n.head.text + n.templateSpans.map((s) => s.literal.text).join('') : null;

/** Every place `sf` writes an error sentence of its own. */
function errorSentenceSites(sf: ts.SourceFile): string[] {
  const out: string[] = [];
  const where = (n: ts.Node) => `${sf.fileName}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}`;
  const visit = (n: ts.Node) => {
    if (ts.isPropertyAssignment(n) && ts.isIdentifier(n.name) && ERROR_PROPS.has(n.name.text) && isSentence(n.initializer)) out.push(`${where(n)} ${n.name.text}: <sentence>`);
    if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken && isSentence(n.right)) {
      const l = n.left;
      if (ts.isPropertyAccessExpression(l) && ERROR_PROPS.has(l.name.text)) out.push(`${where(n)} .${l.name.text} = <sentence>`);
      if (ts.isElementAccessExpression(l) && ts.isIdentifier(l.expression) && l.expression.text === 'status') out.push(`${where(n)} status[…] = <sentence>`);
    }
    // a verifier row's `message` is its English DEBUG text beside its `messageKey` + `params` (already coded, verify.ts)
    const verifierDebug = !!n.parent && ts.isPropertyAssignment(n.parent) && ts.isIdentifier(n.parent.name) && n.parent.name.text === 'message' && n.parent.initializer === n;
    const txt = verifierDebug ? null : textOf(n);
    if (txt !== null) for (const p of WIRE_PHRASES) if (txt.includes(p)) out.push(`${where(n)} a literal carries the wire phrase «${p}»`);
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

describe('#2201 phase 3a — no engine file writes an error sentence of its own', () => {
  const files = sourceFiles(TREES, new Set(['__tests__'])).filter((f) => f !== BANK);

  it('the walker sees the trees (non-vacuous)', () => {
    expect(files.length).toBeGreaterThan(40);
    expect(files).toContain('src/engine/evaluate.ts');
    expect(files).toContain('src/replay/core.ts');
  });

  it('no template or sentence assigned to error / reason / detail / status[…], and no wire phrase outside the bank', () => {
    const sites = files.flatMap((f) => errorSentenceSites(parseSource(f)));
    expect(sites, sites.join('\n')).toEqual([]);
  });

  it('the walker catches each shape it claims (the lock can fail)', () => {
    const sites = (src: string) => errorSentenceSites(parseSource('x.ts', src));
    expect(sites('const r = { ok: false, error: `${a} would be at the same point` };')).toHaveLength(2);
    expect(sites("const r = { reason: 'a sentence here' };")).toHaveLength(1);
    expect(sites('status[f.id] = `variable ${x} oops`;')).toHaveLength(1);
    expect(sites('x.detail = `oops ${y}`;')).toHaveLength(1);
    expect(sites('const s = `cannot construct ${p}: lines`;')).toHaveLength(1);
    expect(sites("const r = { reason: 'error', ok: true };")).toEqual([]);
    expect(sites('// over-constrained: a comment is not a node\nconst a = 1;')).toEqual([]);
  });
});
