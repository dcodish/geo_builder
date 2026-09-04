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

const NUM = String.raw`\d+(?:\.\d+)?`;
const RADICAND = String.raw`\(\s*${NUM}(?:\s*\/\s*${NUM})?\s*\)|${NUM}`;
const RADICAL = new RegExp(String.raw`^(${NUM})?\s*[*·]?\s*√\s*(${RADICAND})$`);

/** Approximate the rendered width of a run of glyphs at font size `fs` (no DOM metrics in the pure renderer). */
function textW(s: string, fs: number): number {
  let w = 0;
  for (const ch of s) {
    if (ch === '√') w += 0.72 * fs;
    else if (/[.,'|]/.test(ch)) w += 0.28 * fs;
    else if (ch === '°') w += 0.42 * fs;
    else if (/[a-z0-9α-ωΑ-Ω]/i.test(ch)) w += 0.56 * fs;
    else w += 0.5 * fs;
  }
  return w;
}

/** Split a value at its TOP-LEVEL `/` (not one inside a `√(…)` group), or null. Mirrors `mathText`. */
function splitSlash(v: string): [string, string] | null {
  let depth = 0;
  for (let i = 0; i < v.length; i++) {
    if (v[i] === '(') depth++;
    else if (v[i] === ')') depth--;
    else if (v[i] === '/' && depth === 0) return [v.slice(0, i), v.slice(i + 1)];
  }
  return null;
}

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
  const rb = value(radicand.replace(/[()]/g, ''), fs, st); // drop the √() display parens
  const sqrtW = 0.72 * fs;
  const pad = 0.12 * fs;
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
      els.push(...rule(x, x + rb.w + pad, cy - fs * 0.55, st, `${k}v`)); // vinculum over the radicand
      els.push(...rb.render(x + (rb.w + pad) / 2, cy, `${k}n`));
      return els;
    },
  };
}

function fraction(num: string, den: string, fs: number, st: Style): Box {
  const fsp = fs * 0.9; // parts a touch smaller, textbook-style
  const nb = value(num, fsp, st);
  const db = value(den, fsp, st);
  const w = Math.max(nb.w, db.w) + 0.2 * fs;
  return {
    w,
    render: (cx, cy, k) => [
      ...nb.render(cx, cy - fs * 0.55, `${k}n`),
      ...rule(cx - w / 2, cx + w / 2, cy, st, `${k}b`),
      ...db.render(cx, cy + fs * 0.55, `${k}d`),
    ],
  };
}

/** Lay out a value expression: a top-level fraction, a radical, or plain text. */
function value(text: string, fs: number, st: Style): Box {
  const t = text.trim();
  const slash = splitSlash(t);
  if (slash && /√|\d/.test(slash[0]) && /√|\d/.test(slash[1])) return fraction(slash[0], slash[1], fs, st);
  const rad = t.match(RADICAL);
  if (rad) return radical(rad[1], rad[2], fs, st);
  return plain(t, fs, st);
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
