/**
 * Rasterise a live SVG figure to a PNG blob — the shared export path behind "save image" and behind the
 * figure that rides beside the givens in the question document.
 *
 * SHARED (#745, ADR-W-026). It was a private helper inside `src/render/Figure.tsx`, so the 3-D builder
 * grew a thinner copy inline in `App3.tsx` and the complex builder had none at all — which is why the
 * question export could not reach either of them. Nothing in here reasons about geometry: it takes an
 * `<svg>` element and returns pixels, which is the definition of chrome.
 *
 * Browser-only (Image/canvas/DOM); never called during the SSR render tests. A white rect is painted
 * first so the PNG is not transparent, and `scale` over-samples for a crisp result. `encodeURIComponent`
 * (not btoa) carries Hebrew labels safely.
 *
 * The CLEAN-export contract (F3/REN-3) is honoured for any product that opts into it: a live figure
 * carries interaction visuals a worksheet must never bake in, so elements tagged `data-noexport` are
 * removed from the clone and `data-export-*` attributes are reverted onto their live counterparts. A
 * renderer that tags nothing simply exports as drawn — the contract costs it nothing.
 */

/**
 * Printed figure width in px@96dpi (the .docx transformation unit) — 9.5 cm, up from 8 cm/302 px (#451).
 *
 * It lives HERE, with the ink normalisation that consumes it, because the two are one decision: the
 * document prints the PNG at this width and `scaleInk` pre-multiplies the ink by `canvasWidth / this`,
 * so the printed figure reads the same whatever the size of the user's browser window. Two constants
 * could drift; one cannot. `questionDoc` imports it — which also keeps `docx` out of the static import
 * graph of every caller that only needs the number.
 */
export const QUESTION_IMAGE_WIDTH_PX = 360;

/**
 * The source pixel size of the figure, resolved in the order a renderer is likely to have declared it.
 *
 * Resolved as a PAIR, never attribute-by-attribute: mixing a CSS-laid-out width with a viewBox height
 * would export the figure at the wrong aspect ratio. 2-D sets explicit width/height attributes, 3-D is
 * laid out by CSS (`clientWidth`), and the complex plane declares only a `viewBox` — all three are real,
 * none is a product branch.
 *
 * Exported for the drift lock in `shell/__tests__/question-export.test.ts`: getting this wrong for one
 * product does not throw — it silently exports that builder's figure at a default size or at the wrong
 * aspect ratio, which is exactly the class of defect nobody notices until a worksheet is printed.
 */
export function sourceSize(svg: SVGSVGElement): { w: number; h: number } {
  const attrW = Number(svg.getAttribute('width'));
  const attrH = Number(svg.getAttribute('height'));
  if (attrW > 0 && attrH > 0) return { w: attrW, h: attrH };
  if (svg.clientWidth > 0 && svg.clientHeight > 0) return { w: svg.clientWidth, h: svg.clientHeight };
  const vb = (svg.getAttribute('viewBox') ?? '').trim().split(/[\s,]+/).map(Number);
  if (vb.length === 4 && vb[2] > 0 && vb[3] > 0) return { w: vb[2], h: vb[3] };
  return { w: 600, h: 600 };
}

/**
 * #451 — normalise the INK to the printed size.
 *
 * `r`, `stroke` and `fontSize` are absolute pixel constants in the SOURCE canvas, and the `.docx` prints
 * the PNG at a fixed physical width. So the printed line weight and label size were
 * `constant x (printedWidth / canvasWidth)` — on a ~700 px canvas printed at 8 cm that is 0.43x, i.e. a
 * 0.65 px line and a ~1.8 mm label: the operator's "not really useful". Worse, it made the printed figure
 * depend on the SIZE OF THE USER'S BROWSER WINDOW — a wide monitor exported a fainter, smaller-lettered
 * figure than a narrow one, for the same construction.
 *
 * This is [ADR-3D-098](../../docs/06b-decisions-3d.md#adr-3d-098) in the print dimension: an annotation's
 * weight is a property of the OUTPUT medium, never of the source geometry. Passing the print width makes
 * the ink deterministic — scaled by `canvasWidth / printWidth`, so after the page's downscale it lands at
 * exactly the weight the constants describe, whatever the window.
 *
 * The 2x oversample is unrelated and stays: it buys resolution, never apparent size.
 */
export function scaleInk(root: SVGSVGElement, k: number): void {
  // A degenerate factor must never touch the ink: k = 0 (a canvas measured before layout) would set every
  // stroke to zero and export an invisible figure, and k = 1 has nothing to do but rewrite every attribute.
  if (!(k > 0) || Math.abs(k - 1) < 1e-6) return;
  const num = (v: string | null) => (v === null ? null : Number.parseFloat(v));
  for (const el of [...root.querySelectorAll<SVGElement>('*')]) {
    const sw = num(el.getAttribute('stroke-width'));
    if (sw !== null && Number.isFinite(sw)) el.setAttribute('stroke-width', String(sw * k));
    const fs = num(el.getAttribute('font-size'));
    if (fs !== null && Number.isFinite(fs)) el.setAttribute('font-size', String(fs * k));
    const da = el.getAttribute('stroke-dasharray');
    if (da) el.setAttribute('stroke-dasharray', da.trim().split(/[\s,]+/).map((v) => String(Number.parseFloat(v) * k)).join(' '));
    // only a POINT DOT's radius is ink; a drawn circle's `r` is GEOMETRY and must never be touched
    if (el.hasAttribute('data-ink-dot')) {
      const rr = num(el.getAttribute('r'));
      if (rr !== null && Number.isFinite(rr)) el.setAttribute('r', String(rr * k));
    }
  }
}

export async function svgToPng(svg: SVGSVGElement, scale = 2, printWidthPx?: number): Promise<Blob> {
  const { w, h } = sourceSize(svg);
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  // A CSS-laid-out figure carries no width/height of its own, so the serialized standalone document has
  // no intrinsic size and some engines rasterise it at a default 300x150. State the resolved size.
  clone.setAttribute('width', String(w));
  clone.setAttribute('height', String(h));
  // CLEAN export (F3/REN-3): strip the interaction-only visuals and revert the selection accents, on the
  // CLONE — crossing suggestion dots, hidden-item ghosts, hover relation marks, highlight overlays.
  for (const el of [...clone.querySelectorAll('[data-noexport]')]) el.remove();
  const revert = (attr: string, target: string) => {
    for (const el of clone.querySelectorAll(`[${attr}]`)) el.setAttribute(target, el.getAttribute(attr)!);
  };
  revert('data-export-stroke', 'stroke');
  revert('data-export-width', 'stroke-width');
  revert('data-export-fill', 'fill');
  revert('data-export-r', 'r');
  revert('data-export-weight', 'font-weight');
  if (printWidthPx) scaleInk(clone, w / printWidthPx); // #451 — ink is a property of the PRINTED page
  const data = new XMLSerializer().serializeToString(clone);
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(data)}`;
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('svg load failed'));
    img.src = url;
  });
  const canvas = document.createElement('canvas');
  canvas.width = w * scale;
  canvas.height = h * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2d context');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png'));
}
