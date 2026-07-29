/**
 * #217 (ADR-410): a textbook-typeset VALUE — MathML for exact forms (a real radical bar over the
 * radicand, stacked fractions, π as a symbol), the shared 2-decimal fallback otherwise (#164).
 * MathML Core is native in evergreen browsers; string-tag `createElement` sidesteps the missing
 * JSX intrinsics exactly like the 3-D `VecMath` (the pattern is COPIED, never imported — docs/20 §12).
 */
import React from 'react';
import { formatMeasure, type ExactForm, type UnitValue } from '@/format';

const m = (tag: string, props: Record<string, unknown> | null, ...children: React.ReactNode[]) =>
  React.createElement(tag, props, ...children);

/** The unit symbol itself — `a`, or `a²` for an area. */
const unitSymbol = (u: UnitValue): React.ReactNode =>
  u.pow === 2 ? m('msup', { key: 'sym' }, m('mi', null, u.sym), m('mn', null, '2')) : m('mi', { key: 'sym' }, u.sym);

export function MathValue({
  value,
  exact,
  degrees,
  unit,
}: {
  value: number;
  exact: ExactForm | null;
  degrees?: boolean;
  /** #427: when present this is the knowledge — the row prints `a√2`, never the drawing's `5√2`. */
  unit?: UnitValue | null;
}): React.ReactElement {
  if (unit) return unitMath(unit);
  if (!exact || (exact.root === 1 && !exact.pi)) {
    return React.createElement(React.Fragment, null, `${formatMeasure(value)}${degrees ? '°' : ''}`);
  }
  const coefAbs = Math.abs(exact.p);
  const num: React.ReactNode[] = [];
  if (exact.p < 0) num.push(m('mo', { key: 'sgn' }, '−'));
  if (coefAbs !== 1) num.push(m('mn', { key: 'coef' }, String(coefAbs)));
  if (exact.root > 1) num.push(m('msqrt', { key: 'root' }, m('mn', null, String(exact.root))));
  if (exact.pi) num.push(m('mi', { key: 'pi' }, 'π'));
  const numerator = m('mrow', { key: 'num' }, ...num);
  return m(
    'math',
    { style: { fontSize: '1.05em' }, dir: 'ltr' },
    exact.q > 1 ? m('mfrac', null, numerator, m('mn', null, String(exact.q))) : numerator,
  ) as React.ReactElement;
}

/** `a`, `4a`, `a√2`, `a√10/3`, `a²` — the exact-form typesetting with the student's symbol in front. */
function unitMath(u: UnitValue): React.ReactElement {
  const f = u.exact;
  const num: React.ReactNode[] = [];
  if (!f) {
    // an unrecognized ratio is still knowledge — print it as a decimal multiple ("1.37a")
    num.push(m('mn', { key: 'coef' }, formatMeasure(u.coef)), unitSymbol(u));
  } else {
    const coefAbs = Math.abs(f.p);
    if (f.p < 0) num.push(m('mo', { key: 'sgn' }, '−'));
    if (coefAbs !== 1) num.push(m('mn', { key: 'coef' }, String(coefAbs)));
    num.push(unitSymbol(u));
    if (f.root > 1) num.push(m('msqrt', { key: 'root' }, m('mn', null, String(f.root))));
    if (f.pi) num.push(m('mi', { key: 'pi' }, 'π'));
  }
  const numerator = m('mrow', { key: 'num' }, ...num);
  return m(
    'math',
    { style: { fontSize: '1.05em' }, dir: 'ltr' },
    f && f.q > 1 ? m('mfrac', null, numerator, m('mn', null, String(f.q))) : numerator,
  ) as React.ReactElement;
}
