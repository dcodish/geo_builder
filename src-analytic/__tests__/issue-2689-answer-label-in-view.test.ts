/**
 * #2689 (ADR-AG-392) — A LABEL IS NEVER WRITTEN PAST THE CANVAS EDGE.
 *
 * Found by round #2678's pre-play: `A(-3,0) · B(3,0) · נקודה P · PA + PB = 10`, then «הצג מקום גאומטרי» on P. The
 * ellipse's label sat at a fixed offset up-right of the trace's midpoint — measured at the app's 720×720 canvas, seed
 * 0, its text started at x = 631 and ran ~215px, so the student read «אליפסה · x²/25 + y²/16 =» and no «1».
 *
 * **The class: an answer's label (a traced locus's equation, a height's value) was never placed** — it was the one
 * value on the canvas outside `placeSceneLabels` — and the placement itself had no view bound. Now every label goes
 * through the one placement with the canvas as a hard bound, and an answer's label moves along its own curve.
 *
 * Every case goes the student's path: derive → ask (the chip) → the drawn-loci reading → the app's frame → the scene.
 */
import { describe, expect, it } from 'vitest';
import { ask } from '../app/ask';
import { drawnLoci } from '../app/answers';
import { drawnBox } from '../app/drawnBox';
import { derive } from '../engine/derive';
import { fmtAnalytic } from '../format';
import { ANSWER_LABEL_FONT, LENGTH_LABEL_FONT, buildScene, placeSceneLabels } from '../render/scene';
import { INITIAL_VIEW, viewBox } from '../render/view';

const HE: Record<string, string> = { line: 'ישר', circle: 'מעגל', parabola: 'פרבולה', ellipse: 'אליפסה', hyperbola: 'היפרבולה' };
const ISO = /[⁦-⁩]/g;

/** The label's inked box, as the renderer writes it: centred on the placed point, 0.35em down, bold (×1.1). */
const boxOf = (l: { text: string; x: number; y: number }, font: number, bold: boolean) => {
  const hw = (l.text.replace(ISO, '').length * font * 0.6 * (bold ? 1.1 : 1)) / 2;
  return { x0: l.x - hw, x1: l.x + hw, y0: l.y - 0.45 * font, y1: l.y + 0.6 * font };
};
const inside = (b: { x0: number; x1: number; y0: number; y1: number }, w: number, h: number) =>
  b.x0 >= 0 && b.y0 >= 0 && b.x1 <= w && b.y1 <= h;

const locusScene = (lines: readonly string[], who: string, seed: number, w: number, h: number) => {
  const d = derive([...lines], seed);
  const a = ask(d, `המקום הגיאומטרי של ${who}`, fmtAnalytic, ((k: string) => HE[k] ?? k) as never, 'chip');
  const answers = [{ ...a, shown: true }] as never;
  const frame = viewBox(drawnBox(d.figure, d.box, answers, []), INITIAL_VIEW, { width: w, height: h });
  return { value: a.value, scene: buildScene(d.figure, frame, w, h, { loci: drawnLoci(answers) }) };
};

const SURFACES: Array<[number, number]> = [
  [720, 720], // the app's fallback canvas
  [900, 600],
  [420, 600], // a phone-width canvas, where the equation is a third of the width
];

const CASES: Array<[string, readonly string[], string, RegExp]> = [
  ['the reported ellipse (PA + PB = 10)', ['A(-3,0)', 'B(3,0)', 'נקודה P', 'PA + PB = 10'], 'P', /^אליפסה · x²\/25 \+ y²\/16 = 1$/],
  ['a parabola (focus-directrix)', ['A(2,0)', 'l: x = -2', 'נקודה X', 'XA = d_{Xl}'], 'X', /^פרבולה/],
  ['a translated circle', ['A(2,1)', 'נקודה P', 'PA = 3'], 'P', /^מעגל/],
  ['a line (open, runs off the view)', ['A(0,0)', 'B(6,8)', 'נקודה M', 'MA = MB'], 'M', /^ישר/],
];

describe('#2689 — a locus equation is written whole, inside the canvas', () => {
  it.each(CASES.flatMap(([n, lines, who, kind]) => [0, 1, 2, 3].map((seed) => [n, seed, lines, who, kind] as const)))(
    '%s · seed %i',
    (_n, seed, lines, who, kind) => {
      for (const [w, h] of SURFACES) {
        const { value, scene } = locusScene(lines, who, seed, w, h);
        expect(value ?? '', 'the chip answered with the curve').toMatch(kind);
        const label = scene.loci[0]?.label;
        expect(label, 'the equation is on the canvas').toBeTruthy();
        expect(label!.text.replace(ISO, ''), 'the canvas says what the panel says').toBe(value);
        expect(inside(boxOf(label!, ANSWER_LABEL_FONT, true), w, h), `inside ${w}×${h}: ${JSON.stringify(label)}`).toBe(true);
      }
    },
  );

  it('the reported case at 720×720, seed 0: the label used to start at x = 631 — now its whole box is inside', () => {
    const { scene } = locusScene(CASES[0][1], 'P', 0, 720, 720);
    const b = boxOf(scene.loci[0].label!, ANSWER_LABEL_FONT, true);
    expect(b.x1).toBeLessThanOrEqual(720);
  });
});

describe('#2689 — the class: the one placement keeps EVERY label inside the view', () => {
  it('a length label requested at the right edge comes back inside it', () => {
    const [c] = placeSceneLabels([{ mid: { x: 598, y: 200 }, n: { x: 1, y: 0 }, text: 'AB = 12.5' }], [], [], [], { width: 600, height: 400 });
    expect(inside(boxOf({ text: 'AB = 12.5', ...c }, LENGTH_LABEL_FONT, false), 600, 400)).toBe(true);
  });

  it('a candidate-bound label (an angle value) whose every spot is past the top edge is moved inward', () => {
    const [c] = placeSceneLabels(
      [{ mid: { x: 300, y: 2 }, n: { x: 0, y: -1 }, text: '40°', candidates: [{ x: 300, y: -10 }, { x: 310, y: -12 }] }],
      [],
      [],
      [],
      { width: 600, height: 400 },
    );
    expect(inside(boxOf({ text: '40°', ...c }, LENGTH_LABEL_FONT, false), 600, 400)).toBe(true);
  });

  it('with no view given, nothing is bounded (a unit caller sees the old placement)', () => {
    const [c] = placeSceneLabels([{ mid: { x: 598, y: 200 }, n: { x: 1, y: 0 }, text: 'AB = 12.5' }], [], [], []);
    expect(c.x).toBeGreaterThan(598);
  });

  it("a height's value (the other answer label) is placed inside the view too", () => {
    const d = derive(['נתונה הנקודה A(2,5)', 'נתון הישר l1: 3x-4y+1=0'], 0);
    const a = ask(d, 'המרחק מ-A לישר l1', fmtAnalytic);
    for (const [w, h] of SURFACES) {
      const s = buildScene(d.figure, d.box, w, h, { marks: [{ from: a.mark!.from, foot: a.mark!.foot, label: a.value ?? undefined }] });
      const l = s.measures[0].label!;
      expect(l.text).toBe(a.value);
      expect(inside(boxOf(l, ANSWER_LABEL_FONT, true), w, h)).toBe(true);
    }
  });
});
