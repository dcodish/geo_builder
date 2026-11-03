/**
 * #1863 / #1218 (ADR-AG-375, ADR-AG-376, ADR-AG-377) — THE ANNOTATION CHANNEL and its first surface, the conic chip;
 * and the ellipse the givens make a circle.
 *
 * Rulings (quoted in the ADRs): the four-state cycle, nothing → directrix → focus → both, the same on a parabola and an
 * ellipse (2026-10-09, confirmed 2026-10-14); the label names the next action; marks `F`, `F₁`/`F₂`, a directrix by its
 * equation; values only when the givens determine them (#1863); sr-07 (a student's letter wins, the book's letter is
 * never repeated); sr-29 (a dashed directrix); card d2 (a = b: a circle — no chip, the centre, a notice).
 *
 * Every assertion calls the real decisions — `derive`, `conicChips`, `conicMarksOf`, `circleNotesOf`, `buildScene`, the
 * store — never a copy of them (#1102).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { derive, type Derivation } from '../engine/derive';
import { ellipseDirectrices } from '../engine/curves';
import { knownCurve } from '../engine/evaluate';
import { cleanAnnotations, CONIC_CYCLE, nextConic, withConic, type AnnotationMap } from '../app/annotations';
import { circleNoteText, circleNotesOf, conicChipKey, conicChips, conicMarksOf, isCircleShaped, markAnchors } from '../app/conicMarks';
import { drawnBox } from '../app/drawnBox';
import { curveParts } from '../app/curveText';
import { loadAnalyticSession } from '../app/loadSession';
import { relabelCurveStyle } from '../app/rename';
import { buildScene } from '../render/scene';
import { analyticI18n } from '../i18n';
import { useAnalyticStore } from '../store/useAnalyticStore';

const FIX = path.join(__dirname, 'fixtures');
const fixture = (name: string) =>
  JSON.parse(readFileSync(path.join(FIX, `${name}.analytic.json`), 'utf8')) as { lines: string[]; annotations?: AnnotationMap };

const PARABOLA = ['נתונה פרבולה שמשוואתה y^2=54x'];
const ELLIPSE = ['נתונה אליפסה שמשוואתה x^2/25+y^2/9=1'];
const Y_MAJOR = ['נתונה אליפסה שמשוואתה x^2/9+y^2/25=1'];
const PARAM = ['נתונה פרבולה שמשוואתה y^2=2px'];
const ROUND = ['נתונה אליפסה שמשוואתה x^2/9+y^2/9=1'];

const curveId = (d: Derivation, k = 0) => d.figure.curves.filter((c) => c.stated)[k].id;
const all = (d: Derivation, s: 'directrix' | 'focus' | 'both'): AnnotationMap =>
  Object.fromEntries(d.figure.curves.filter((c) => c.stated).map((c) => [c.id, { conic: s }]));
const labels = (marks: ReturnType<typeof conicMarksOf>, kind: 'focus' | 'directrix') =>
  marks.filter((m) => m.kind === kind).map((m) => m.label ?? null);
const tHe = analyticI18n.getFixedT('he');
const tEn = analyticI18n.getFixedT('en');
const bare = (s: string) => s.replace(/[⁦-⁩]/g, '');

describe('#1863 — the chip: one per stated conic, starting from nothing', () => {
  it.each([
    ['a parabola', PARABOLA, 'parabola'],
    ['an ellipse', ELLIPSE, 'ellipse'],
    ['a parameterised parabola', PARAM, 'parabola'],
  ])('%s gets one chip on its own row, and a fresh figure draws no mark', (_n, lines, kind) => {
    const d = derive(lines, 0);
    const chips = conicChips(d, {});
    expect(chips.map((c) => [c.line, c.kind, c.state, c.next])).toEqual([[0, kind, 'none', 'directrix']]);
    expect(conicMarksOf(d, {})).toEqual([]);
  });

  it('no chip without a conic — a line, a circle, points', () => {
    for (const lines of [['A(0,0)', 'B(4,0)'], ['נתון מעגל שמשוואתו x^2+y^2=9'], ['נתון ישר l שמשוואתו y=2x+1']]) {
      expect(conicChips(derive(lines, 0), {})).toEqual([]);
    }
  });

  it('the cycle visits the four states and returns to nothing; the label always names the NEXT press (He and En)', () => {
    expect(CONIC_CYCLE.map(nextConic)).toEqual(['directrix', 'focus', 'both', 'none']);
    const he = (k: 'parabola' | 'ellipse') => CONIC_CYCLE.map((s) => tHe(conicChipKey(k, nextConic(s))));
    const en = (k: 'parabola' | 'ellipse') => CONIC_CYCLE.map((s) => tEn(conicChipKey(k, nextConic(s))));
    expect(he('parabola')).toEqual(['הצג מדריך', 'הצג מוקד', 'הצג מוקד ומדריך', 'הסתר']);
    expect(he('ellipse')).toEqual(['הצג מדריכים', 'הצג מוקדים', 'הצג מוקדים ומדריכים', 'הסתר']);
    expect(en('parabola')).toEqual(['Show directrix', 'Show focus', 'Show focus and directrix', 'Hide']);
    expect(en('ellipse')).toEqual(['Show directrices', 'Show foci', 'Show foci and directrices', 'Hide']);
  });

  it('pressing four times draws directrix → focus → both → nothing', () => {
    const d = derive(PARABOLA, 0);
    const id = curveId(d);
    let map: AnnotationMap = {};
    const seen: string[][] = [];
    for (let k = 0; k < 4; k += 1) {
      const chip = conicChips(d, map)[0];
      map = withConic(map, id, chip.next);
      seen.push(conicMarksOf(d, map).map((m) => m.kind));
    }
    expect(seen).toEqual([['directrix'], ['focus'], ['focus', 'directrix'], []]);
    expect(map).toEqual({}); // «nothing» leaves no trace in the record
  });
});

describe('#1863 — the marks and their values (written only when the givens determine them)', () => {
  it('y^2=54x: F(27/2, 0) and x = -27/2 — the canvas strings are the panel\'s', () => {
    const d = derive(PARABOLA, 0);
    const marks = conicMarksOf(d, all(d, 'both'));
    expect(labels(marks, 'focus')).toEqual(['F(27/2, 0)']);
    expect(labels(marks, 'directrix')).toEqual(['x = -27/2']);
    const parts = curveParts(knownCurve(d.construction, curveId(d))!);
    expect(parts.details!.map((x) => x.text)).toEqual(['(27/2, 0)', 'x = -27/2']);
  });

  it.each([0, 1, 2, 3])('y^2=2px at seed %i: the F mark without coordinates and a directrix with no equation', (seed) => {
    const d = derive(PARAM, seed);
    const marks = conicMarksOf(d, all(d, 'both'));
    expect(labels(marks, 'focus')).toEqual(['F']);
    expect(labels(marks, 'directrix')).toEqual([null]);
  });

  it('x^2/25+y^2/9=1: both foci F₁(4, 0), F₂(-4, 0) and BOTH directrices x = ±25/4', () => {
    const d = derive(ELLIPSE, 0);
    const marks = conicMarksOf(d, all(d, 'both'));
    expect(labels(marks, 'focus')).toEqual(['F₁(4, 0)', 'F₂(-4, 0)']);
    expect(labels(marks, 'directrix')).toEqual(['x = 25/4', 'x = -25/4']);
  });

  it('the y-major twin: foci and directrices on the y-axis', () => {
    const d = derive(Y_MAJOR, 0);
    const marks = conicMarksOf(d, all(d, 'both'));
    expect(labels(marks, 'focus')).toEqual(['F₁(0, 4)', 'F₂(0, -4)']);
    expect(labels(marks, 'directrix')).toEqual(['y = 25/4', 'y = -25/4']);
  });

  it('the directrix states draw only directrices, the focus states only foci', () => {
    const d = derive(ELLIPSE, 0);
    expect(conicMarksOf(d, all(d, 'directrix')).map((m) => m.kind)).toEqual(['directrix', 'directrix']);
    expect(conicMarksOf(d, all(d, 'focus')).map((m) => m.kind)).toEqual(['focus', 'focus']);
  });

  it('two ellipses: two chips, two independent states', () => {
    const d = derive([...ELLIPSE, 'נתונה אליפסה שמשוואתה x^2/16+y^2/4=1'], 0);
    const chips = conicChips(d, {});
    expect(chips.map((c) => c.line)).toEqual([0, 1]);
    const map = withConic({}, chips[1].id, 'focus');
    expect(conicChips(d, map).map((c) => c.state)).toEqual(['none', 'focus']);
    expect(conicMarksOf(d, map).every((m) => m.curve === chips[1].id)).toBe(true);
  });
});

describe('#1863 — letters (sr-07: a student\'s letter wins, the book\'s is never repeated)', () => {
  it('«F1 ו-F2 מוקדי האליפסה»: the student\'s points hold the foci, and the marks write nothing', () => {
    const d = derive([...ELLIPSE, 'F1 ו-F2 מוקדי האליפסה'], 0);
    const marks = conicMarksOf(d, all(d, 'focus'));
    expect(marks).toHaveLength(2);
    expect(labels(marks, 'focus')).toEqual([null, null]);
  });

  it('a student\'s F elsewhere (the fixture): the focus mark keeps its coordinates and drops the letter', () => {
    const fx = fixture('issue-1863-student-f');
    const d = derive(fx.lines, 0);
    expect(Object.keys(fx.annotations!)).toEqual([curveId(d)]);
    expect(labels(conicMarksOf(d, fx.annotations!), 'focus')).toEqual(['(2, 0)']);
  });

  it('a student\'s F at the focus («F מוקד הפרבולה»): the point keeps the place, the mark adds no label', () => {
    const d = derive(['נתונה פרבולה שמשוואתה y^2=8x', 'F מוקד הפרבולה'], 0);
    expect(labels(conicMarksOf(d, all(d, 'focus')), 'focus')).toEqual([null]);
  });
});

describe('#1863 — the ellipse with a = b is a circle (ADR-AG-377, card d2)', () => {
  it('no chip, no marks; the scene marks its centre as a circle\'s, with its coordinates', () => {
    const d = derive(ROUND, 0);
    const id = curveId(d);
    expect(isCircleShaped(d.construction, id)).toBe(true);
    expect(conicChips(d, {})).toEqual([]);
    expect(conicMarksOf(d, { [id]: { conic: 'both' } })).toEqual([]);
    const box = { minX: -5, minY: -5, maxX: 5, maxY: 5 };
    const scene = buildScene(d.figure, box, 400, 400, {
      curveKnown: (c) => knownCurve(d.construction, c) !== null,
      circleShaped: (c) => isCircleShaped(d.construction, c),
    });
    const c = scene.curves.find((k) => k.id === id)!;
    expect(c.centre).toBeDefined();
    expect(c.centre!.label?.replace(/[⁦-⁩]/g, '')).toBe('(0, 0)');
  });

  it('a non-round ellipse keeps no centre cross (unchanged)', () => {
    const d = derive(ELLIPSE, 0);
    const scene = buildScene(d.figure, { minX: -6, minY: -6, maxX: 6, maxY: 6 }, 400, 400, { circleShaped: (c) => isCircleShaped(d.construction, c) });
    expect(scene.curves[0].centre).toBeUndefined();
  });

  it('the notice names the equation, cause first, He and En', () => {
    const d = derive(ROUND, 0);
    const notes = circleNotesOf(ROUND, d, (ls) => derive(ls, 0));
    expect(notes.map((n) => n.causeLines)).toEqual([[0]]);
    expect(bare(circleNoteText(notes[0], tHe, (i) => ROUND[i]))).toBe('בגלל הנתון נתונה אליפסה שמשוואתה x^2/9+y^2/9=1, האליפסה היא כעת מעגל — מעגל הוא סוג של אליפסה.');
    expect(bare(circleNoteText(notes[0], tEn, (i) => ROUND[i]))).toBe('Because of the given נתונה אליפסה שמשוואתה x^2/9+y^2/9=1, the ellipse is now a circle — a circle is a kind of ellipse.');
  });

  it('a later given that makes it round is the cause; without it there is no note and the chip is back', () => {
    const lines = ['נתונה אליפסה שמשוואתה x^2/a^2+y^2/9=1', 'a=3'];
    const d = derive(lines, 0);
    expect(circleNotesOf(lines, d, (ls) => derive(ls, 0)).map((n) => n.causeLines)).toEqual([[1]]);
    const open = derive(lines.slice(0, 1), 0);
    expect(circleNotesOf(lines.slice(0, 1), open, (ls) => derive(ls, 0))).toEqual([]);
    expect(conicChips(open, {})).toHaveLength(1);
  });

  it('the closed form: no directrix when a = b', () => {
    expect(ellipseDirectrices({ kind: 'ellipse', a: 3, b: 3 })).toBeNull();
  });

  it('no note for a non-round ellipse, a parabola, or a circle typed as a circle', () => {
    for (const lines of [ELLIPSE, PARABOLA, ['נתון מעגל שמשוואתו x^2+y^2=9']]) {
      expect(circleNotesOf(lines, derive(lines, 0), (ls) => derive(ls, 0))).toEqual([]);
    }
  });
});

describe('#1863 — the scene draws what the chip asked for, through the one label placement', () => {
  it('a hidden curve draws no marks (#2238), and its chip state is kept', () => {
    const d = derive(PARABOLA, 0);
    const map = all(d, 'both');
    expect(conicMarksOf(d, map, () => true)).toEqual([]);
    expect(conicChips(d, map)[0].state).toBe('both');
  });

  it('the parabola fixture: a focus dot and a dashed directrix with their placed labels', () => {
    const fx = fixture('issue-1863-parabola');
    const d = derive(fx.lines, 0);
    expect(Object.keys(fx.annotations!)).toEqual([curveId(d)]);
    const marks = conicMarksOf(d, fx.annotations!);
    const scene = buildScene(d.figure, { minX: -30, minY: -30, maxX: 30, maxY: 30 }, 600, 600, { roleMarks: marks });
    expect(scene.roles.foci).toHaveLength(1);
    expect(scene.roles.directrices).toHaveLength(1);
    const strip = (s?: string) => s?.replace(/[⁦-⁩]/g, '');
    expect(strip(scene.roles.foci[0].label?.text)).toBe('F(27/2, 0)');
    expect(strip(scene.roles.directrices[0].label?.text)).toBe('x = -27/2');
    // the directrix is the vertical line x = -27/2, across the whole view
    const l = scene.roles.directrices[0];
    expect(Math.abs(l.x1 - l.x2)).toBeLessThan(1e-6);
    expect(Math.abs(l.y1 - l.y2)).toBeGreaterThan(500);
  });

  it('the ellipse fixture: two foci and two directrices', () => {
    const fx = fixture('issue-1863-ellipse');
    const d = derive(fx.lines, 0);
    expect(Object.keys(fx.annotations!)).toEqual([curveId(d)]);
    const scene = buildScene(d.figure, { minX: -8, minY: -8, maxX: 8, maxY: 8 }, 600, 600, { roleMarks: conicMarksOf(d, fx.annotations!) });
    expect(scene.roles.foci).toHaveLength(2);
    expect(scene.roles.directrices).toHaveLength(2);
  });

  it('the frame takes in what the chip drew (R25a): F(27/2, 0) and x = -27/2 are on screen', () => {
    const d = derive(PARABOLA, 0);
    const box = drawnBox(d.figure, d.box, [], markAnchors(conicMarksOf(d, all(d, 'both'))));
    expect(box.maxX).toBeGreaterThan(13.5);
    expect(box.minX).toBeLessThan(-13.5);
    // nothing asked, the frame is the figure's own
    expect(drawnBox(d.figure, d.box, [], markAnchors(conicMarksOf(d, {})))).toEqual(d.box);
  });

  it('no marks asked, no roles drawn', () => {
    const d = derive(PARABOLA, 0);
    const scene = buildScene(d.figure, { minX: -30, minY: -30, maxX: 30, maxY: 30 }, 600, 600, {});
    expect(scene.roles).toEqual({ foci: [], directrices: [] });
  });
});

describe('#1863 — the channel: undoable, saved, never a given (ADR-AG-375)', () => {
  beforeEach(() => {
    useAnalyticStore.getState().clearAll();
    useAnalyticStore.temporal.getState().clear();
  });

  it('a press is one undo step; redo puts it back; «נקה הכל» clears it', () => {
    const st = useAnalyticStore.getState();
    st.recordLine(PARABOLA[0]);
    const id = curveId(derive(useAnalyticStore.getState().lines, 0));
    st.setAnnotations(withConic(useAnalyticStore.getState().annotations, id, 'directrix'));
    expect(useAnalyticStore.getState().annotations).toEqual({ [id]: { conic: 'directrix' } });
    useAnalyticStore.getState().undo();
    expect(useAnalyticStore.getState().annotations).toEqual({});
    expect(useAnalyticStore.getState().lines).toEqual(PARABOLA);
    useAnalyticStore.getState().redo();
    expect(useAnalyticStore.getState().annotations).toEqual({ [id]: { conic: 'directrix' } });
    useAnalyticStore.getState().clearAll();
    expect(useAnalyticStore.getState().annotations).toEqual({});
  });

  it('save → load round-trips the state; a file without it loads with nothing shown', () => {
    const st = useAnalyticStore.getState();
    st.recordLine(ELLIPSE[0]);
    const id = curveId(derive(ELLIPSE, 0));
    st.setAnnotations({ [id]: { conic: 'both' } });
    const saved = JSON.parse(JSON.stringify(useAnalyticStore.getState().serialize()));
    expect(saved.annotations).toEqual({ [id]: { conic: 'both' } });
    useAnalyticStore.getState().clearAll();
    loadAnalyticSession(saved, 'x');
    expect(useAnalyticStore.getState().annotations).toEqual({ [id]: { conic: 'both' } });
    const { annotations: _a, ...old } = saved;
    loadAnalyticSession(old, 'x');
    expect(useAnalyticStore.getState().annotations).toEqual({});
  });

  it('a hand-edited map keeps only known facets', () => {
    expect(cleanAnnotations({ a: { conic: 'focus' }, b: { conic: 'weird' }, c: 3, d: { other: 1 } })).toEqual({ a: { conic: 'focus' } });
    expect(cleanAnnotations([1, 2])).toEqual({});
  });

  it('another configuration and an unrelated line keep the state, and no mark moves', () => {
    const d0 = derive(PARABOLA, 0);
    const map = all(d0, 'both');
    const before = conicMarksOf(d0, map);
    for (const d of [derive(PARABOLA, 3), derive([...PARABOLA, 'A(1,2)'], 0)]) {
      expect(conicChips(d, map)[0].state).toBe('both');
      expect(conicMarksOf(d, map)).toEqual(before);
    }
  });

  it('the chip adds nothing to the givens: the derivation is the same with or without it', () => {
    const d = derive(PARABOLA, 0);
    const again = derive(PARABOLA, 0);
    conicMarksOf(d, all(d, 'both'));
    expect(d.construction.objects.length).toBe(again.construction.objects.length);
    expect(d.figure.points).toEqual(again.figure.points);
  });

  it('a letter change re-keys the map like the curve display map', () => {
    const before = derive(['נתונה פרבולה שמשוואתה y^2=54x', 'A(1,1)'], 0);
    const after = derive(['נתונה פרבולה שמשוואתה y^2=54x', 'B(1,1)'], 0);
    const id = curveId(before);
    expect(relabelCurveStyle({ [id]: { conic: 'focus' } }, before, after)).toEqual({ [curveId(after)]: { conic: 'focus' } });
  });
});
