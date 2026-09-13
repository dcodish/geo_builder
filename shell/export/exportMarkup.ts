/**
 * #713 ([ADR-W-051](../../docs/06w-decisions-workspace.md#adr-w-051)) — the clean-export contract, stated
 * over MARKUP so every product can lock it without a DOM.
 *
 * `svgToPng` (this folder) strips every `[data-noexport]` subtree from a CLONE of the live SVG before
 * rasterising — that is the one contract by which a downloaded image never carries on-screen chrome
 * (hover marks, crossing offers, hit rings, hidden-item ghosts, edit affordances). The opt-in is
 * per-product tagging, and the tests run DOM-free (`renderToStaticMarkup`), so this is the same removal
 * expressed over the serialised markup: a product renders its figure with every chrome affordance ON,
 * strips it here, and asserts the result is its chrome-free render. `normalizeForExport` drops the
 * attributes that paint nothing (`class`, cursor styles) and the `<title>` tooltips, so the comparison is
 * about INK.
 */

const TAG = /<(\/?)([A-Za-z][\w:-]*)([^>]*?)(\/?)>/g;

/** Remove every element carrying `data-noexport` (and its subtree) from SVG/HTML markup. */
export function stripNoExport(markup: string): string {
  let out = '';
  let last = 0;
  let depth = 0; // > 0 while inside a stripped subtree
  for (const m of markup.matchAll(TAG)) {
    const [whole, close, , attrs, selfClose] = m;
    const at = m.index ?? 0;
    if (depth === 0) {
      if (!close && /\sdata-noexport(=|\s|$)/.test(attrs)) {
        out += markup.slice(last, at);
        last = at + whole.length;
        if (!selfClose) depth = 1;
      }
      continue;
    }
    // inside a stripped subtree — track nesting until its closing tag
    if (close) depth--;
    else if (!selfClose) depth++;
    if (depth === 0) last = at + whole.length;
  }
  return out + markup.slice(last);
}

/** The selection accents the rasteriser REVERTS: `data-export-<x>` carries the resting value of `<x>`. */
const REVERTS: [string, string][] = [
  ['data-export-stroke', 'stroke'],
  ['data-export-width', 'stroke-width'],
  ['data-export-fill', 'fill'],
  ['data-export-r', 'r'],
  ['data-export-weight', 'font-weight'],
];

/** Apply the rasteriser's accent reverts to markup: every `data-export-<x>="v"` becomes `<x>="v"`. */
export function revertExportAccents(markup: string): string {
  return markup.replace(TAG, (whole, close: string, name: string, attrs: string, selfClose: string) => {
    if (close) return whole;
    let out = attrs;
    for (const [src, target] of REVERTS) {
      const m = out.match(new RegExp(`\\s${src}="([^"]*)"`));
      if (!m) continue;
      out = out.replace(m[0], '');
      const re = new RegExp(`(\\s${target})="[^"]*"`);
      out = re.test(out) ? out.replace(re, `$1="${m[1]}"`) : `${out} ${target}="${m[1]}"`;
    }
    return `<${name}${out}${selfClose}>`;
  });
}

/** Drop the non-painting parts of markup so two renders compare by ink alone. */
export function normalizeForExport(markup: string): string {
  return revertExportAccents(stripNoExport(markup))
    .replace(/<title>[\s\S]*?<\/title>/g, '')
    .replace(/\sclass="[^"]*"/g, '')
    .replace(/cursor:\s*[a-z-]+;?/g, '')
    .replace(/\sstyle=""/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
