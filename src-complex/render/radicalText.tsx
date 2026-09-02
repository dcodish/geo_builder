/**
 * THE RADICAL INDEX, drawn large enough to read (#727, [ADR-CX-036](../../docs/06d-decisions-complex.md)).
 *
 * Where the index IS lives one layer down, in `value/radical` — the two reading surfaces must agree
 * about that, and the spelled number itself comes from `value/modulus.format`, which stays untouched
 * (it is the ONE spelling every surface calls; a per-surface change is exactly how two surfaces come
 * to disagree). What lives here is the drawing: a REAL digit at 0.72 em, raised — about 25 % larger
 * than the ~0.58 em Unicode superscript it replaces, and at normal stroke weight, so `⁵` can no
 * longer be mistaken for the retired `~` mark at canvas size.
 *
 * Two renderers because there are two surfaces — SVG (`PolarPlane`) and HTML (the data panel) — and
 * neither can use the other's markup.
 */
import type { ReactNode } from 'react';
import { splitRadical, hasRadicalIndex } from '../value/radical';

/** How far the index is raised, and how big it is drawn. One pair, both surfaces. */
const RISE = '0.45em';
const SIZE = '0.72em';

/** The data panel's HTML reading. */
export function RadicalText({ text }: { readonly text: string }): ReactNode {
  if (!hasRadicalIndex(text)) return <>{text}</>; // no radical — no wrapper
  return (
    <>
      {splitRadical(text).map((p, i) =>
        'index' in p ? (
          <sup key={i} style={{ fontSize: SIZE, lineHeight: 0 }}>
            {p.index}
          </sup>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  );
}

/**
 * The canvas's SVG reading. `dy` on a `tspan` is CUMULATIVE, so every raised index is followed by an
 * equal and opposite shift — otherwise a label carrying two radicals would climb off its own baseline.
 */
export function RadicalTspans({ text }: { readonly text: string }): ReactNode {
  if (!hasRadicalIndex(text)) return <>{text}</>;
  const parts = splitRadical(text);
  const out: ReactNode[] = [];
  parts.forEach((p, i) => {
    if ('index' in p) {
      out.push(
        <tspan key={i} dy={`-${RISE}`} fontSize={SIZE}>
          {p.index}
        </tspan>,
      );
      // the shift back down normally rides the NEXT run; with no plain run after it, it needs its own
      const next = parts[i + 1];
      if (!next || 'index' in next) out.push(<tspan key={`${i}r`} dy={RISE} />);
    } else {
      out.push(
        <tspan key={i} dy={i > 0 && 'index' in parts[i - 1] ? RISE : undefined}>
          {p.text}
        </tspan>,
      );
    }
  });
  return <>{out}</>;
}
