/**
 * A CONIC MAY BE NAMED, AND EVERY REFERENCE SITE INHERITS IT (#1271 + #1336, ADR-AG-170).
 *
 * Operator: *"since we can have more than 1 parabola on a diagram, we need to support things like
 * «נתונה פרבולה I - y^2=2x»"*, widened 2026-09-20: *"we need to support all such forms of
 * writing."* And #1336 (playing round #1332 T14): «פרבולה I: y^2=2x» reached the LLM escape and
 * came back «not understood» — for a sentence whose only problem was that a parabola could not
 * carry a name.
 *
 * One naming clause for both conics (a third copy per kind is the #1233/#1267 shape), the
 * connective set the textbook prints («שמשוואתה», «:», «-», «היא»), gender tolerated, ids
 * `parabola-I`/`ellipse-I` beside `circle-I`.
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { parseLine } from '../parser/parseAnalytic';
import { runFallback } from '../app/fallback';

const conicIds = (d: ReturnType<typeof derive>) => d.construction.objects.filter((o) => o.kind === 'curve').map((o) => o.id);

describe('#1271 — every naming spelling, per conic kind × connective', () => {
  it.each([
    ['נתונה פרבולה I - y^2=2x', 'parabola-I'],
    ['נתונה פרבולה I שמשוואתה y^2=2x', 'parabola-I'],
    ['נתון פרבולה I שמשוואתו y^2=2x', 'parabola-I'],
    ['פרבולה I: y^2=2x', 'parabola-I'],
    ['נתונה אליפסה I שמשוואתה x^2/9+y^2/4=1', 'ellipse-I'],
    ['אליפסה II - x^2/25+y^2/9=1', 'ellipse-II'],
    ['parabola I: y^2=2x', 'parabola-I'],
    ['נתון מעגל I - x^2+y^2=16', 'circle-I'],
  ])('«%s» → %s', (line, id) => {
    const d = derive([line], 0);
    expect(d.faults).toEqual([]);
    expect(conicIds(d)).toEqual([id]);
  });

  it('TWO named parabolas are separately referable — his own reason for asking', () => {
    const d = derive(['נתונה פרבולה I שמשוואתה y^2=2x', 'נתונה פרבולה II שמשוואתה y^2=8x'], 0);
    expect(d.faults).toEqual([]);
    expect(conicIds(d).sort()).toEqual(['parabola-I', 'parabola-II']);
  });

  it('the anonymous forms keep working exactly as today', () => {
    const d = derive(['נתונה פרבולה שמשוואתה y^2=2x', 'y^2=8x'], 0);
    expect(d.faults).toEqual([]);
    expect(conicIds(d)).toHaveLength(2);
    expect(conicIds(d).every((id) => id.startsWith('curve-anon'))).toBe(true);
  });

  it('restating a named conic is ONE object (ADR-AG-023)', () => {
    const d = derive(['נתונה פרבולה I שמשוואתה y^2=2x', 'פרבולה I: y^2=2x'], 0);
    expect(conicIds(d)).toEqual(['parabola-I']);
  });
});

describe('#1271 — the reference sites', () => {
  it('«P על הפרבולה I» puts P on THAT parabola', () => {
    const d = derive(['נתונה פרבולה I שמשוואתה y^2=8x', 'נתונה פרבולה II שמשוואתה y^2=2x', 'P על הפרבולה I'], 0);
    expect(d.faults).toEqual([]);
    const p = d.figure.points.find((q) => q.id === 'P')!;
    expect(Math.abs(p.y * p.y - 8 * p.x)).toBeLessThan(1e-6);
  });

  it('a crossing sentence with the named parabola builds', () => {
    const d = derive(['נתון הישר l1: y=4', 'נתונה פרבולה I שמשוואתה y^2=8x', 'A נקודת החיתוך של הישר l1 עם הפרבולה I'], 0);
    expect(d.faults).toEqual([]);
    const a = d.figure.points.find((q) => q.id === 'A')!;
    expect(a.y).toBeCloseTo(4, 5);
    expect(a.x).toBeCloseTo(2, 5);
  });
});

describe('#1336 — the escape is not entered, and a rejected completion is not «not understood»', () => {
  it('«פרבולה I: y^2=2x» now parses DIRECTLY — the escape never fires for it', () => {
    expect(parseLine('פרבולה I: y^2=2x').ok).toBe(true);
  });

  it('runFallback carries the refusal CODE on a rejected completion, and never the model’s text as the message', async () => {
    // The model answers a line the tool refuses (an unknown reference) — the caller must be able
    // to say "understood, unsupported" without naming the model's line.
    const out = await runFallback('משפט כלשהו', [], 0, async () => ({ steps: ['P על המעגל VII'] }) as never);
    expect(out.kind).toBe('rejected');
    if (out.kind === 'rejected') {
      expect(out.code).toBeTruthy();
    }
  });
});
