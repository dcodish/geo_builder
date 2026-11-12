/**
 * #2502 ([ADR-AG-468](../../docs/06c-decisions-analytic.md#adr-ag-468)) — «AB קוטר האליפסה», «AB הוא קוטר המעגל», «CD הוא
 * מיתר של המעגל», «קוטר האליפסה AB»: THE CONSTRUCT STATE AND THE COPULA ON EVERY CURVE.
 *
 * Operator, 2026-11-12 (home PC): *"the term קוטר in ellipse is not defined?"*. Measured at caf619a5 through
 * `decideSubmit`: every «ב/של» spelling read, every construct-state spelling («קוטר/מיתר + definite noun», no
 * preposition) was `not-handled`, on the circle as on the ellipse. 2-D reads the circle's (measured at caf619a5 through
 * `decideDeterministic2D`, the parity rows `construct-*-2502`). The issue comment's table is locked here row by row.
 *
 * pipeline-lock: the verdict is per spelling and per figure — a read line drawn as a diameter (A and B opposite through the
 * centre) or a chord (both ends on the curve), the which-one question with two curves of the kind (#2477's rule), and
 * #2625's refusal on the parabola. The fixtures net asserts only that two saved figures build.
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit } from '../app/submit';
import { derive } from '../engine/derive';
import circleFixture from './fixtures/issue-2502-copula-diameter.analytic.json';
import ellipseFixture from './fixtures/issue-2502-ellipse-construct.analytic.json';

const ELLIPSE = 'x^2/25+y^2/9=1';
const SEEDS = [0, 1, 2, 3, 4, 5];

/** The line through the student's door after `context`; the drawn figure when it records. */
function submit(context: readonly string[], line: string, seed = 0) {
  const v = decideSubmit(line, context, seed);
  if (v.kind !== 'record') return { v, d: null, at: () => undefined };
  const d = derive([...context, v.line], v.configuration ?? seed);
  const at = (id: string) => d.figure.points.find((p) => p.id === id);
  return { v, d, at };
}

const onEllipse = (p: { x: number; y: number } | undefined) => !!p && Math.abs(p.x ** 2 / 25 + p.y ** 2 / 9 - 1) < 1e-6;

/** The comment's table: the ✅ column (read before) and the ❌ column (read now). Every one is a diameter of the ellipse. */
const ELLIPSE_DIAMETERS = [
  'AB קוטר באליפסה',
  'AB קוטר של האליפסה',
  'AB הוא קוטר באליפסה',
  'הקטע AB הוא קוטר של האליפסה',
  'קוטר AB באליפסה',
  'הקוטר AB של האליפסה',
  'AB is a diameter of the ellipse',
  'AB קוטר האליפסה',
  'AB הוא קוטר האליפסה',
  'קוטר האליפסה AB',
];

describe('#2502 — a diameter of the ellipse, in every spelling of the issue table', () => {
  it.each(ELLIPSE_DIAMETERS)('«%s» draws A and B on the ellipse, opposite through its centre', (line) => {
    for (const seed of SEEDS) {
      const { v, d, at } = submit([ELLIPSE], line, seed);
      expect(v.kind, `seed ${seed}`).toBe('record');
      expect(d!.faults, `seed ${seed}`).toEqual([]);
      const [a, b] = [at('A'), at('B')];
      expect(onEllipse(a) && onEllipse(b), `seed ${seed}`).toBe(true);
      expect(Math.hypot(a!.x + b!.x, a!.y + b!.y), `seed ${seed}`).toBeLessThan(1e-6);
    }
  });
  it.each(['AB מיתר האליפסה', 'AB מיתר של האליפסה', 'מיתר האליפסה AB'])('«%s» draws a chord: both ends on the ellipse', (line) => {
    const { v, d, at } = submit([ELLIPSE], line);
    expect(v.kind).toBe('record');
    expect(d!.faults).toEqual([]);
    expect(onEllipse(at('A')) && onEllipse(at('B'))).toBe(true);
  });
  it.each(['AB קוטר האליפסה', 'קוטר האליפסה AB', 'AB מיתר האליפסה'])('two ellipses: «%s» asks which one, as «AB קוטר באליפסה» does', (line) => {
    const two = [ELLIPSE, '(x-12)^2/16+y^2/4=1'];
    const v = decideSubmit(line, two, 0);
    const twin = decideSubmit('AB קוטר באליפסה', two, 0);
    expect(v.kind === 'refused' && v.error.key).toBe('ambiguous-shape');
    expect(twin.kind === 'refused' && twin.error.key).toBe('ambiguous-shape');
  });
});

describe('#2502 — a diameter or chord of THE circle, the copula and the construct state (2-D’s reading)', () => {
  const CIRCLE = ['מעגל O'];
  it.each(['AB קוטר המעגל', 'AB הוא קוטר המעגל', 'קוטר המעגל AB', 'AB הוא קוטר של המעגל'])('«%s» draws AB through O, on the drawn circle', (line) => {
    for (const seed of SEEDS) {
      const { v, d, at } = submit(CIRCLE, line, seed);
      expect(v.kind, `seed ${seed}`).toBe('record');
      expect(d!.faults, `seed ${seed}`).toEqual([]);
      const [a, b, o] = [at('A')!, at('B')!, at('O')!];
      expect(Math.hypot(a.x + b.x - 2 * o.x, a.y + b.y - 2 * o.y), `seed ${seed}`).toBeLessThan(1e-6);
      expect(d!.construction.objects.filter((x) => x.kind.startsWith('circle'))).toHaveLength(1);
    }
  });
  it.each(['AB מיתר המעגל', 'AB הוא מיתר המעגל', 'CD הוא מיתר של המעגל', 'מיתר המעגל CD', 'מיתר AB של המעגל'])('«%s» is a chord of the drawn circle', (line) => {
    const { v, d } = submit(CIRCLE, line);
    expect(v.kind).toBe('record');
    expect(d!.faults).toEqual([]);
    expect(d!.construction.objects.filter((x) => x.kind.startsWith('circle'))).toHaveLength(1);
  });
  it.each(['AB קוטר המעגל', 'AB הוא קוטר המעגל', 'קוטר המעגל AB', 'AB מיתר המעגל', 'CD הוא מיתר של המעגל'])('two circles: «%s» asks which one', (line) => {
    const v = decideSubmit(line, ['מעגל O', 'מעגל P'], 0);
    expect(v.kind === 'refused' && v.error.key).toBe('ambiguous-shape');
  });
  it.each([
    ['AB קוטר המעגל', 'AB קוטר במעגל'],
    ['קוטר המעגל AB', 'AB קוטר במעגל'],
    ['AB מיתר המעגל', 'AB מיתר במעגל'],
    ['מיתר המעגל AB', 'AB מיתר במעגל'],
  ])('no circle yet: «%s» draws one, as «%s» does', (line, twin) => {
    const { v, d } = submit([], line);
    expect(v.kind).toBe('record');
    expect(d!.faults).toEqual([]);
    const kinds = (x: NonNullable<typeof d>) => x.construction.objects.map((o) => o.kind);
    expect(kinds(d!)).toEqual(kinds(submit([], twin).d!));
  });
});

describe('#2502 — on the parabola, the construct state is refused with #2625’s sentence', () => {
  it.each(['AB קוטר הפרבולה', 'AB הוא קוטר הפרבולה', 'קוטר הפרבולה AB'])('«%s» → parabola-no-diameter, as «AB קוטר בפרבולה»', (line) => {
    const v = decideSubmit(line, ['y^2=8x'], 0);
    expect(v.kind === 'refused' && v.error.key).toBe('parabola-no-diameter');
  });
  it('«AB מיתר הפרבולה» is a chord of the parabola, as «AB מיתר בפרבולה» is', () => {
    expect(submit(['y^2=8x'], 'AB מיתר הפרבולה').v.kind).toBe('record');
  });
});

describe('#2502 — the two saved figures', () => {
  it.each([circleFixture, ellipseFixture])('$name builds line by line through the door', (fx) => {
    const held: string[] = [];
    for (const line of fx.lines) {
      const v = decideSubmit(line, held, fx.seed);
      expect(v.kind, line).toBe('record');
      if (v.kind === 'record') held.push(v.line);
    }
    expect(derive(held, fx.seed).faults).toEqual([]);
  });
});
