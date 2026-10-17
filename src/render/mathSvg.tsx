/**
 * A pure-SVG math typesetter for the ON-CANVAS measure labels ([issue #98], extends #40 to the figure).
 *
 * The step list renders math as MathML (`mathText.tsx`), but the SVG figure can't: MathML only lives in SVG
 * via `<foreignObject>`, which the PNG/docx export path (`XMLSerializer` → `drawImage` → `toBlob`) cannot
 * rasterize — the math would export BLANK. So the canvas lays the same measure-label grammar out as real SVG
 * `<text>` + `<line>` nodes, which export faithfully:
 *   - a RADICAL `√7` / `12√2` — a √ sign with an OVERLINE (vinculum) over the radicand (+ an optional
 *     coefficient prefix). The `√()` display parens are dropped.
 *   - a FRACTION `35/√32` — numerator over denominator with a horizontal bar.
 *   - everything else (`k`, `2α`, `37°`, plain numbers) — a single `<text>`, unchanged.
 *
 * The pure renderer has no DOM text metrics, so widths are CHARACTER-APPROXIMATED (labels are short, so small
 * errors don't matter). Everything is centered at `(cx, cy)`, forced LTR (the RTL page must not reorder
 * `12√2` → `2√12`), and carries the same white halo (`paint-order: stroke`) as the plain labels.
 */
import type { JSX } from 'react';
import { hasMath } from '../../shell/math';
// #2175 (ADR-715): the widths live in `mathMetrics` so the angle-value placement reasons about the box drawn here.
import { FRACTION_PART_SCALE, fractionOverhang, mathLayoutOf, mathRise, radicalPad, radicalSignW, textW } from './mathMetrics';

/** A laid-out fragment: its approximate width + a renderer that draws it CENTERED at `(cx, cy)`. */
interface Box {
  w: number;
  render: (cx: number, cy: number, keyPrefix: string) => JSX.Element[];
}

interface Style {
  fill: string;
  halo: string;
  haloW: number;
  strokeW: number;
}

const textProps = (st: Style, fs: number) =>
  ({
    textAnchor: 'middle' as const,
    dominantBaseline: 'central' as const,
    fontSize: fs,
    fontFamily: 'system-ui, sans-serif',
    fontWeight: 500,
    fill: st.fill,
    stroke: st.halo,
    strokeWidth: st.haloW,
    strokeLinejoin: 'round' as const,
    direction: 'ltr' as const,
    style: { direction: 'ltr' as const, unicodeBidi: 'bidi-override' as const, paintOrder: 'stroke' as const, pointerEvents: 'none' as const },
  });

function plain(s: string, fs: number, st: Style): Box {
  return {
    w: textW(s, fs),
    render: (cx, cy, k) => [
      <text key={k} x={cx} y={cy} {...textProps(st, fs)}>
        {s}
      </text>,
    ],
  };
}

/** A horizontal rule (fraction bar / radical vinculum) with a white halo under a coloured stroke. */
function rule(x1: number, x2: number, y: number, st: Style, k: string): JSX.Element[] {
  const common = { x1, y1: y, x2, y2: y, strokeLinecap: 'round' as const, style: { pointerEvents: 'none' as const } };
  return [
    <line key={`${k}h`} {...common} stroke={st.halo} strokeWidth={st.strokeW + st.haloW} />,
    <line key={`${k}b`} {...common} stroke={st.fill} strokeWidth={st.strokeW} />,
  ];
}

function radical(coef: string | undefined, radicand: string, fs: number, st: Style): Box {
  const cb = coef ? plain(coef, fs, st) : null;
  const rb = value(radicand, fs, st); // the √() display parens are already dropped by `mathLayoutOf`
  const sqrtW = radicalSignW(fs);
  const pad = radicalPad(fs);
  const w = (cb?.w ?? 0) + sqrtW + rb.w + pad;
  return {
    w,
    render: (cx, cy, k) => {
      let x = cx - w / 2;
      const els: JSX.Element[] = [];
      if (cb) {
        els.push(...cb.render(x + cb.w / 2, cy, `${k}c`));
        x += cb.w;
      }
      els.push(
        <text key={`${k}r`} x={x + sqrtW * 0.5} y={cy} {...textProps(st, fs)}>
          √
        </text>,
      );
      x += sqrtW;
      els.push(...rule(x, x + rb.w + pad, cy - mathRise(fs), st, `${k}v`)); // vinculum over the radicand
      els.push(...rb.render(x + (rb.w + pad) / 2, cy, `${k}n`));
      return els;
    },
  };
}

function fraction(num: string, den: string, fs: number, st: Style): Box {
  const fsp = fs * FRACTION_PART_SCALE; // parts a touch smaller, textbook-style
  const nb = value(num, fsp, st);
  const db = value(den, fsp, st);
  const w = Math.max(nb.w, db.w) + fractionOverhang(fs);
  return {
    w,
    render: (cx, cy, k) => [
      ...nb.render(cx, cy - mathRise(fs), `${k}n`),
      ...rule(cx - w / 2, cx + w / 2, cy, st, `${k}b`),
      ...db.render(cx, cy + mathRise(fs), `${k}d`),
    ],
  };
}

/** Lay out a value expression: a top-level fraction, a radical, or plain text. */
function value(text: string, fs: number, st: Style): Box {
  const L = mathLayoutOf(text);
  if (L.kind === 'fraction') return fraction(L.num, L.den, fs, st);
  if (L.kind === 'radical') return radical(L.coef, L.radicand, fs, st);
  return plain(L.text, fs, st);
}

/**
 * Render a measure label at `(cx, cy)`. A label with no radical/fraction (`hasMath` false — a number, `2α`,
 * `37°`, a variable) draws as the single plain `<text>` it always was; only radicals and fractions get the
 * SVG layout. Returns a `<g>` so the caller places one element per label.
 */
export function MathSvg({
  text,
  cx,
  cy,
  fontSize,
  fill = '#1d4ed8',
  halo = '#fff',
  haloWidth,
  strokeWidth,
}: {
  text: string;
  cx: number;
  cy: number;
  fontSize: number;
  fill?: string;
  halo?: string;
  haloWidth?: number;
  strokeWidth?: number;
}): JSX.Element {
  const st: Style = { fill, halo, haloW: haloWidth ?? fontSize * 0.2, strokeW: strokeWidth ?? fontSize * 0.09 };
  if (!hasMath(text)) return <g>{plain(text, fontSize, st).render(cx, cy, 'm')}</g>;
  return <g>{value(text, fontSize, st).render(cx, cy, 'm')}</g>;
}
