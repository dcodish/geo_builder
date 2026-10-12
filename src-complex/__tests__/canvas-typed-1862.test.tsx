/**
 * #1862 (ADR-CX-065) — THE CANVAS SHOWS WHAT THE STUDENT TYPED; computed values go to the panel.
 *
 * The operator's rulings: B6 (2026-10-07, #1861) — complex follows ADR-W-047 fully, *"Inputs go on the
 * canvas and computed values go in the panel"*; D1 — a typed number shows as typed, in the view's own
 * form; W7 (2026-10-08) — a number fixed by its own stated modulus and argument counts as typed; W8 —
 * a typed number whose polar form the givens leave open shows its typed form in the polar view too.
 * ADR-W-047 clause 3 — a letter the student did not value stays a letter on the canvas, and the line
 * that valued one («a = 3») carries the letter/value chip.
 *
 * The panel's readings (`reading`/`readingCart`) are NOT changed: every value moved off the canvas is
 * still printed in «נקודות».
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';

import { deriveLines, lowerLines } from '../app/deriveLines';
import { hydrateSession, submitLine } from '../app/submit';
import { statedAs } from '../model/cartesianForm';
import { paramsOf } from '../model/expr';
import { PolarPlane } from '../render/PolarPlane';
import { buildScene } from '../scene/scene';
import { useComplexStore } from '../store/useComplexStore';

const LABELS = { ratio: 'r', limit: 'lim', closed: 'closed' };
const pt = (d: ReturnType<typeof deriveLines>, name: string) => {
  const p = d.points.find((q) => q.name === name);
  if (!p) throw new Error(`no point ${name}`);
  return p;
};
/** [polar view, cartesian view] on the canvas */
const canvasOf = (lines: string[], name: string, letterLines?: Set<number>) => {
  const p = pt(deriveLines(lines, 0, 0, [], letterLines), name);
  return [p.canvas, p.canvasCart];
};

describe('a number the tool COMPUTED shows its name only (B6)', () => {
  it.each([
    [['z1 = 3+4i', 'w = z1·i'], 'w'],
    [['z1 = 2+2i', 'z2 = 1-i', 'w = z1·z2'], 'w'],
    [['z1 = 3+4i', '|w| = |z1|', 'arg(w) = 90°'], 'w'],
  ])('%j → «%s» on the canvas', (lines, name) => {
    expect(canvasOf(lines, name)).toEqual([name, name]);
  });

  it('the roots of «z^2 = 2i» are computed: «z₁», «z₂»', () => {
    expect(canvasOf(['z^2 = 2i'], 'z1')).toEqual(['z₁', 'z₁']);
    expect(canvasOf(['z^2 = 2i'], 'z2')).toEqual(['z₂', 'z₂']);
  });

  it('an enumerated polynomial writes its members as `z1 = root` — still computed', () => {
    expect(canvasOf(['z^2 - 4z + 13 = 0'], 'z1')).toEqual(['z₁', 'z₁']);
  });

  it('the panel keeps every value: the readings are unchanged', () => {
    const w = pt(deriveLines(['z1 = 3+4i', 'w = z1·i'], 0, 0), 'w');
    expect(w.readingCart).toBe('w = -4+3i');
    expect(w.reading).toBe('w ≈ 5·cis143.13°');
  });
});

describe('a number the student TYPED shows as typed, in the view\'s own form (D1)', () => {
  it.each([
    [['z1 = 3+4i'], 'z1', ['z₁ ≈ 5·cis53.13°', 'z₁ = 3+4i']],
    [['z1 = 4i+3'], 'z1', ['z₁ ≈ 5·cis53.13°', 'z₁ = 3+4i']],
    [['z1 = 6·cis(30°)'], 'z1', ['z₁ = 6·cis30°', 'z₁ = 3√3+3i']],
    // W7: its own modulus and argument, stated on two lines
    [['|z| = 2', 'arg(z) = 30°'], 'z', ['z = 2·cis30°', 'z = √3+i']],
    // a typed member of an enumeration stays typed
    [['z1 = 2cis120', 'z^3 = 8'], 'z1', ['z₁ = 2·cis120°', 'z₁ = -1+√3i']],
    // a bound label: «A (z₁)», typed through its label
    [['A = 3+4i', 'z1 = A'], 'z1', ['A (z₁) ≈ 5·cis53.13°', 'A (z₁) = 3+4i']],
  ])('%j → %j', (lines, name, want) => {
    expect(canvasOf(lines, name)).toEqual(want);
  });
});

describe('a letter the student did not value stays a letter (ADR-W-047 clause 3, W8)', () => {
  it('«z1 = 3+4i · z2 = 18r · |z2| = 2|z1|» — the canvas reads «z₂ = 18r», never «z₂ = 10»', () => {
    const lines = ['z1 = 3+4i', 'z2 = 18r', '|z2| = 2|z1|'];
    expect(canvasOf(lines, 'z2')).toEqual(['z₂ = 18r', 'z₂ = 18r']);
    // the panel carries the solved letter and the number
    const d = deriveLines(lines, 0, 0);
    expect(d.params).toEqual([{ name: 'r', value: '±5/9' }]);
    expect(pt(d, 'z2').readingCart).toBe('z₂ = 10');
  });

  it('«z2 = 18r» alone reads «z₂ = 18r» in BOTH views (W8 — no «18|r|·cis0°»)', () => {
    expect(canvasOf(['z2 = 18r'], 'z2')).toEqual(['z₂ = 18r', 'z₂ = 18r']);
  });

  it('«z1 = a+bi · a = 3 · |z1| = 5» — b is solved by the tool, so it stays «b»', () => {
    expect(canvasOf(['z1 = a+bi', 'a = 3', '|z1| = 5'], 'z1')).toEqual(['z₁ = 3+bi', 'z₁ = 3+bi']);
  });
});

describe('the letter/value chip (ADR-W-047 clause 2)', () => {
  const LINES = ['z1 = a+bi', 'a = 3'];

  it('the canvas follows the last statement: «z₁ = 3+bi», and «a = 3» carries the chip', () => {
    const d = deriveLines(LINES, 0, 0);
    expect([pt(d, 'z1').canvas, pt(d, 'z1').canvasCart]).toEqual(['z₁ = 3+bi', 'z₁ = 3+bi']);
    expect(d.paramChips).toEqual([{ param: 'a', line: 1, value: '3' }]);
  });

  it('the LETTER choice switches the canvas to «z₁ = a+bi» — and the panel keeps the value', () => {
    const d = deriveLines(LINES, 0, 0, [], new Set([1]));
    expect([pt(d, 'z1').canvas, pt(d, 'z1').canvasCart]).toEqual(['z₁ = a+bi', 'z₁ = a+bi']);
    expect(pt(d, 'z1').readingCart).toBe('z₁ = 3+bi');
    expect(d.params.find((p) => p.name === 'a')?.value).toBe('3');
  });

  it('both letters valued: the number closes, in each view\'s own form; one letter back → mixed', () => {
    const lines = ['z1 = a+bi', 'a = 3', 'b = 4'];
    expect(canvasOf(lines, 'z1')).toEqual(['z₁ ≈ 5·cis53.13°', 'z₁ = 3+4i']);
    expect(canvasOf(lines, 'z1', new Set([2]))).toEqual(['z₁ = 3+bi', 'z₁ = 3+bi']);
  });

  it('no chip where nothing competes: a letter no typed number uses, a letter the tool solved', () => {
    expect(deriveLines(['z1 = 3+4i', 'a = 3'], 0, 0).paramChips).toEqual([]);
    expect(deriveLines(['z2 = 18r', '|z2| = 10'], 0, 0).paramChips).toEqual([]);
  });
});

describe('the renderer prints the canvas label, not the panel reading', () => {
  it('cartesian and polar views', () => {
    const d = deriveLines(['z1 = 3+4i', 'w = z1·i'], 0, 0);
    const scene = buildScene(d);
    const cart = renderToStaticMarkup(<PolarPlane scene={scene} mode="cart" labels={LABELS} />);
    const polar = renderToStaticMarkup(<PolarPlane scene={scene} mode="polar" labels={LABELS} />);
    expect(cart).toContain('z₁ = 3+4i');
    expect(cart).not.toContain('-4+3i');
    expect(polar).not.toContain('143.13');
    expect(cart).toMatch(/>w<\/text>/);
  });
});

describe('the chip choice persists (store + save file)', () => {
  const st = () => useComplexStore.getState();
  beforeEach(() => st().resetSession());

  it('survives «הציגו תצורה אחרת», a save/load round trip, and shifts with a removed line', () => {
    expect(submitLine('z1 = a+bi')).toBe(true);
    expect(submitLine('a = 3')).toBe(true);
    st().toggleDisplay(1);
    expect(st().display).toEqual({ '1': 'letter' });
    st().nextConfig();
    expect(st().display).toEqual({ '1': 'letter' });

    const saved = st().serialize();
    expect(saved.display).toEqual({ '1': 'letter' });
    st().resetSession();
    expect(st().display).toEqual({});
    expect(hydrateSession(JSON.parse(JSON.stringify(saved)))).toBe(true);
    expect(st().display).toEqual({ '1': 'letter' });

    // a line removed BELOW the valuing row moves the choice with its row
    st().removeLine(0);
    expect(st().display).toEqual({ '0': 'letter' });
  });

  it('a value-mode choice is the default and is not written to the file', () => {
    submitLine('z1 = a+bi');
    submitLine('a = 3');
    st().toggleDisplay(1);
    st().toggleDisplay(1);
    expect(st().serialize().display).toBeUndefined();
  });
});

/**
 * THE CLASS NET — over every saved fixture: a number the student did not state by value shows only
 * its name, and a letter the student did not value never disappears from a typed number's label.
 */
const files = import.meta.glob('./fixtures/*.complex.json', { eager: true, query: '?raw', import: 'default' }) as Record<
  string,
  string
>;

describe('class net over the fixtures', () => {
  it('the net is not empty', () => expect(Object.keys(files).length).toBeGreaterThan(25));

  for (const [file, text] of Object.entries(files)) {
    it(file.replace('./fixtures/', ''), () => {
      const lines = (JSON.parse(text) as { lines: string[] }).lines;
      const low = lowerLines(lines);
      const stated = low.stated ?? [];
      const valued = new Set(low.valuedBy?.keys() ?? []);
      const d = deriveLines(lines, 0, 0);
      for (const p of d.points) {
        const names = [p.name, ...(low.aliases?.has(p.name) ? [low.aliases.get(p.name)!] : [])];
        const how = names.map((n) => statedAs(n, stated, new Set()));
        if (how.every((h) => h === 'computed')) {
          expect([p.canvas, p.canvasCart], `${p.name} is computed`).toEqual([p.display, p.display]);
          continue;
        }
        // every letter in the student's own definition that the student did not value is still there
        for (const c of stated) {
          if ((c.kind ?? 'eq') !== 'eq' || c.lhs.t !== 'ref' || !names.includes(c.lhs.name)) continue;
          for (const letter of paramsOf(c.rhs)) {
            if (valued.has(letter)) continue;
            expect(p.canvasCart, `${p.name}: «${letter}» kept`).toContain(letter);
            expect(p.canvas, `${p.name}: «${letter}» kept`).toContain(letter);
          }
        }
      }
    });
  }
});
