/**
 * #217 (ADR-410): a textbook-typeset VALUE — MathML for exact forms (a real radical bar over the
 * radicand, stacked fractions, π as a symbol), the shared 2-decimal fallback otherwise (#164).
 * MathML Core is native in evergreen browsers; string-tag `createElement` sidesteps the missing
 * JSX intrinsics exactly like the 3-D `VecMath` (the pattern is COPIED, never imported — docs/20 §12).
 */
import React from 'react';
import { formatMeasure, type ExactForm } from '@/format';

const m = (tag: string, props: Record<string, unknown> | null, ...children: React.ReactNode[]) =>
  React.createElement(tag, props, ...children);

export function MathValue({ value, exact, degrees }: { value: number; exact: ExactForm | null; degrees?: boolean }): React.ReactElement {
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
