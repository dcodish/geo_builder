/**
 * #1378 — a canvas ref that is READ must also be BOUND.
 *
 * The analytic builder declared `canvasCard`, read `canvasCard.current?.querySelector('svg')` in
 * its rasteriser, and **never wrote `ref={canvasCard}` on any element**. So `.current` was
 * permanently null, every rasterise rejected, and «⧉ העתיקו תמונה» / «⤓ הורידו תמונה» had never
 * worked — both enabled, both failing into a 1.4-second ✕ with no explanation (the #511 broken
 * promise). The share feature then inherited it as a preview image that was never uploaded, which
 * is how the operator finally saw it: a WhatsApp card with no picture.
 *
 * **`tsc` cannot see this.** The code compiles perfectly; a ref that is never attached is valid
 * TypeScript. Nor could a behavioural test catch it without a DOM and a renderer. What IS reliably
 * checkable is the pairing — if a file reads `x.current` it must also bind `ref={x}` — so that is
 * what this asserts, across every product tree at once.
 *
 * Deliberately narrow: only refs read through `.current?.querySelector(...)` (i.e. refs used to
 * reach INTO the DOM) are required to be bound. A ref used purely as mutable storage — a drag
 * origin, a timer id, a previous value — never binds to an element and is not a defect.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const TREES = ['src', 'src3d', 'src-complex', 'src-analytic'];

function sourceFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (name === '__tests__' || name === 'node_modules') continue;
    if (statSync(p).isDirectory()) out.push(...sourceFiles(p));
    else if (/\.tsx$/.test(name) && !/\.test\.tsx$/.test(name)) out.push(p);
  }
  return out;
}

/** Refs a file reaches into the DOM with, and the refs it actually binds. */
export function domRefAudit(text: string): { read: string[]; bound: string[]; unbound: string[] } {
  const read = [...text.matchAll(/\b(\w+)\.current\??\.(?:querySelector|querySelectorAll|getBoundingClientRect|contains)\b/g)]
    .map((m) => m[1]);
  const bound = [...text.matchAll(/\bref=\{(\w+)\}/g)].map((m) => m[1]);
  const unbound = [...new Set(read)].filter((r) => !bound.includes(r));
  return { read: [...new Set(read)], bound: [...new Set(bound)], unbound };
}

describe('#1378 — every DOM-reaching ref is attached to an element', () => {
  const files = TREES.flatMap((t) => sourceFiles(join(ROOT, t)));

  it('scans a real surface (the guard is not vacuous)', () => {
    const anyRead = files.some((f) => domRefAudit(readFileSync(f, 'utf8')).read.length > 0);
    expect(files.length).toBeGreaterThan(10);
    expect(anyRead, 'at least one builder reaches into the DOM through a ref').toBe(true);
  });

  it('no builder reads a ref it never binds', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const { unbound } = domRefAudit(readFileSync(file, 'utf8'));
      for (const name of unbound) offenders.push(`${file.slice(ROOT.length + 1)}: ${name}`);
    }
    expect(
      offenders,
      'a ref read but never attached is permanently null — the button is enabled and cannot work',
    ).toEqual([]);
  });

  /** The detector must be able to FAIL — this is the exact shape that shipped. */
  it('CATCHES the analytic defect as it was written', () => {
    const shipped = `
      const rasterCanvas = () => {
        const svg = canvasCard.current?.querySelector('svg');
        if (!svg) return Promise.reject(new Error('no canvas'));
        return svgToPng(svg);
      };
      const canvasCard = useRef<HTMLDivElement | null>(null);
      return <div ref={viewportRef}><svg /></div>;
    `;
    expect(domRefAudit(shipped).unbound).toEqual(['canvasCard']);
  });

  it('does NOT flag a ref used as plain mutable storage', () => {
    const fine = `
      const dragRef = useRef<{ x: number } | null>(null);
      const timer = useRef(0);
      return <div ref={viewportRef} onPointerDown={() => (dragRef.current = { x: 1 })} />;
    `;
    expect(domRefAudit(fine).unbound).toEqual([]);
  });
});
