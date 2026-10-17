/**
 * The SIZE of an on-canvas measure label, without a DOM (#2175, [ADR-715](../../docs/06-decisions.md#adr-715)).
 *
 * `MathSvg` lays a measure out as pure SVG and positions its parts from character-approximated widths; the
 * placement of an angle's value needs the same box to decide whether the label fits inside its wedge. One
 * module owns the arithmetic so the box the placement reasons about is the box `MathSvg` draws — the two
 * cannot drift apart. No React here: `scene.ts` imports it.
 */

const NUM = String.raw`\d+(?:\.\d+)?`;
const RADICAND = String.raw`\(\s*${NUM}(?:\s*\/\s*${NUM})?\s*\)|${NUM}`;
/** `12√2`, `√7`, `√(3/2)` — an optional coefficient, the radical sign, a radicand. */
export const RADICAL = new RegExp(String.raw`^(${NUM})?\s*[*·]?\s*√\s*(${RADICAND})$`);

/** Approximate the rendered width of a run of glyphs at font size `fs` (no DOM metrics in the pure renderer). */
export function textW(s: string, fs: number): number {
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
export function splitSlash(v: string): [string, string] | null {
  let depth = 0;
  for (let i = 0; i < v.length; i++) {
    if (v[i] === '(') depth++;
    else if (v[i] === ')') depth--;
    else if (v[i] === '/' && depth === 0) return [v.slice(0, i), v.slice(i + 1)];
  }
  return null;
}

/** The radical sign's advance and the pad after the radicand, at font size `fs`. */
export const radicalSignW = (fs: number) => 0.72 * fs;
export const radicalPad = (fs: number) => 0.12 * fs;
/** A fraction's parts are set a touch smaller, textbook-style; the bar overhangs the wider part by this much. */
export const FRACTION_PART_SCALE = 0.9;
export const fractionOverhang = (fs: number) => 0.2 * fs;
/** The vertical offset of a fraction's numerator/denominator (and of a radical's vinculum) from the centre line. */
export const mathRise = (fs: number) => 0.55 * fs;

/** Which layout `MathSvg` gives a value: a top-level fraction, a radical, or plain text. */
export type MathLayout =
  | { kind: 'fraction'; num: string; den: string }
  | { kind: 'radical'; coef: string | undefined; radicand: string }
  | { kind: 'plain'; text: string };

export function mathLayoutOf(text: string): MathLayout {
  const t = text.trim();
  const slash = splitSlash(t);
  if (slash && /√|\d/.test(slash[0]) && /√|\d/.test(slash[1])) return { kind: 'fraction', num: slash[0], den: slash[1] };
  const rad = t.match(RADICAL);
  if (rad) return { kind: 'radical', coef: rad[1], radicand: rad[2].replace(/[()]/g, '') };
  return { kind: 'plain', text: t };
}

/**
 * How tall a line of label glyphs INKS, in font sizes: digits, Latin and Greek letters sit within ~0.75 em of the
 * centre line `MathSvg` draws on (`dominant-baseline: central`). The white halo is deliberately not counted — it
 * exists so a line may graze the text without hurting it.
 */
export const INK_HEIGHT = 0.75;

/**
 * The label's INK box `{ w, h }` in px at font size `fs`, centred on the point `MathSvg` is given: one inked line
 * for plain text, up to the vinculum for a radical, both rows for a fraction. `plain` mirrors `MathSvg`'s own
 * fast path (a label with no radical or fraction).
 */
export function mathLabelBox(text: string, fs: number, plain = false): { w: number; h: number } {
  if (plain) return { w: textW(text, fs), h: INK_HEIGHT * fs };
  const L = mathLayoutOf(text);
  if (L.kind === 'plain') return { w: textW(L.text, fs), h: INK_HEIGHT * fs };
  if (L.kind === 'radical') {
    const w = (L.coef ? textW(L.coef, fs) : 0) + radicalSignW(fs) + mathLabelBox(L.radicand, fs).w + radicalPad(fs);
    return { w, h: 2 * mathRise(fs) };
  }
  const fsp = fs * FRACTION_PART_SCALE;
  const w = Math.max(mathLabelBox(L.num, fsp).w, mathLabelBox(L.den, fsp).w) + fractionOverhang(fs);
  return { w, h: 2 * mathRise(fs) + INK_HEIGHT * fsp };
}
