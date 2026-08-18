/**
 * #451 — the printed figure's INK is a property of the page, not of the browser window.
 *
 * `stroke`/`fontSize`/`pointR` are absolute pixels in the SOURCE canvas while the `.docx` prints the PNG
 * at a fixed physical width, so the printed line weight and label size were
 * `constant × (printWidth / canvasWidth)`: faint and tiny on a wide monitor, and DIFFERENT for the same
 * construction depending on the window size. `scaleInk` normalises by `canvasWidth / printWidth`.
 *
 * Tested against a minimal element stub — this repo's render tests are deliberately DOM-free (no jsdom),
 * and `scaleInk` touches only getAttribute/setAttribute/hasAttribute/querySelectorAll.
 *
 * Moved to shell/ with the rasteriser it covers (#745): the printed-ink rule is not 2-D's, it is every
 * builder's, and it now guards the one copy all three export through.
 */
import { describe, expect, it } from 'vitest';
import { scaleInk } from '../export/svgToPng';

function el(attrs: Record<string, string>) {
  const m = new Map(Object.entries(attrs));
  return {
    getAttribute: (k: string) => (m.has(k) ? m.get(k)! : null),
    setAttribute: (k: string, v: string) => void m.set(k, v),
    hasAttribute: (k: string) => m.has(k),
    num: (k: string) => Number(m.get(k)),
    raw: (k: string) => m.get(k),
  };
}
const rootOf = (els: ReturnType<typeof el>[]) => ({ querySelectorAll: () => els }) as unknown as SVGSVGElement;

const K = 700 / 360;

describe('#451 — ink normalises to the printed width', () => {
  it('stroke weight, label size and dashes scale; a drawn circle GEOMETRY does not', () => {
    const line = el({ 'stroke-width': '1.5', 'stroke-dasharray': '3 2' });
    const text = el({ 'font-size': '16' });
    const drawnCircle = el({ r: '120', 'stroke-width': '1.5' }); // geometry
    const dot = el({ r: '2', 'data-ink-dot': '1' }); // ink
    scaleInk(rootOf([line, text, drawnCircle, dot]), K);

    expect(line.num('stroke-width')).toBeCloseTo(1.5 * K, 6);
    expect(line.raw('stroke-dasharray')).toBe(`${3 * K} ${2 * K}`);
    expect(text.num('font-size')).toBeCloseTo(16 * K, 6);
    expect(drawnCircle.num('r')).toBe(120); // GEOMETRY — never touched
    expect(drawnCircle.num('stroke-width')).toBeCloseTo(1.5 * K, 6); // its OUTLINE is ink
    expect(dot.num('r')).toBeCloseTo(2 * K, 6);
  });

  it('the printed ink no longer depends on the window size', () => {
    // the same construction exported from two canvas widths must land identically ON THE PAGE
    const onPage = (canvasW: number) => {
      const line = el({ 'stroke-width': '1.5' });
      const text = el({ 'font-size': '16' });
      scaleInk(rootOf([line, text]), canvasW / 360);
      const shrink = 360 / canvasW; // the docx scales the PNG down to the print width
      return { stroke: line.num('stroke-width') * shrink, font: text.num('font-size') * shrink };
    };
    const narrow = onPage(500);
    const wide = onPage(1400);
    expect(narrow.stroke).toBeCloseTo(wide.stroke, 6);
    expect(narrow.font).toBeCloseTo(wide.font, 6);
    // …and at exactly the weight the renderer's constants describe
    expect(wide.stroke).toBeCloseTo(1.5, 6);
    expect(wide.font).toBeCloseTo(16, 6);
  });

  it('a scale of 1 is a no-op', () => {
    const line = el({ 'stroke-width': '1.5' });
    scaleInk(rootOf([line]), 1);
    expect(line.raw('stroke-width')).toBe('1.5');
  });
});

/**
 * #745 — the guard nearly lost when `scaleInk` was lifted out of `Figure.tsx` into `shell/export/`.
 * Nothing covered it, so the move deleted it silently and both reviews read fine: a degenerate factor
 * is not a wrong NUMBER, it is an invisible figure on a printed worksheet.
 */
describe('#745 — a degenerate factor never touches the ink', () => {
  const untouched = (k: number) => {
    const line = el({ 'stroke-width': '1.5', 'font-size': '16' });
    scaleInk(rootOf([line]), k);
    return line.num('stroke-width') === 1.5 && line.num('font-size') === 16;
  };

  it('k = 0 (a canvas measured before layout) would export an INVISIBLE figure', () => {
    expect(untouched(0)).toBe(true);
  });

  it('a negative or NaN factor is refused, not applied', () => {
    expect(untouched(-2)).toBe(true);
    expect(untouched(Number.NaN)).toBe(true);
  });

  it('k = 1 is a no-op — nothing to scale, nothing rewritten', () => {
    expect(untouched(1)).toBe(true);
  });
});
