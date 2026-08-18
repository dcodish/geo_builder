/**
 * Rasterise a live SVG figure to a PNG blob — "save image" / "copy image" / the question docx.
 *
 * #742: moved here from `render/Figure.tsx` when the export BUTTONS moved to the top tool row
 * (one export home in every builder, ADR-W-024). The host (App) queries the svg from its canvas
 * card and calls this; the renderer no longer knows exports exist.
 *
 * Browser-only (uses Image/canvas/DOM); never called during the SSR render tests. A white rect is
 * painted first so the PNG isn't transparent; `scale` over-samples for a crisp result.
 * `encodeURIComponent` (not btoa) carries Hebrew labels safely.
 */

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
export function scaleInkForTest(root: SVGSVGElement, k: number): void { scaleInk(root, k); }

function scaleInk(root: SVGSVGElement, k: number): void {
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
  const w = Number(svg.getAttribute('width')) || svg.clientWidth || 600;
  const h = Number(svg.getAttribute('height')) || svg.clientHeight || 600;
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  // CLEAN export (F3/REN-3): the live SVG carries interaction visuals a worksheet must not bake in —
  // crossing suggestion dots, hidden-item ghosts, hover relation marks, highlight overlays (all tagged
  // `data-noexport`), and selection accents (tagged with their base values). Strip / revert on the CLONE.
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
