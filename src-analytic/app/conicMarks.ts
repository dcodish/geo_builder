/**
 * THE CONIC CHIP AND ITS MARKS (#1863 / #1218, ADR-AG-376) — the first surface on the annotation channel
 * (`app/annotations.ts`, ADR-AG-375). And the conic that is a circle (ADR-AG-377).
 *
 * Operator rulings, quoted in the ADRs:
 * - 2026-10-09 / 2026-10-14: a four-state control on a parabola, nothing → directrix → focus → both; its label names the
 *   NEXT action; the marks are named `F`, `F₁`/`F₂`, a directrix by its equation.
 * - 2026-11-04 (#2709, ADR-AG-466): *"foci only for ellipse."* An ellipse's chip is nothing → focus → nothing, and an
 *   ellipse draws no directrix. A saved `directrix` / `both` on an ellipse is READ as nothing / focus (`stateOn`, the one
 *   read of the map), never rewritten.
 * - #1863 (2026-10-07, line 3): values (a focus's coordinates, a directrix's equation) are written only when the givens
 *   determine them — the circle-centre rule (`knownCurve`, ADR-AG-036).
 * - sr-07 (2026-11-02): a tool label never repeats a student's letter; a focus the student lettered keeps its letter
 *   and the mark adds none; the book's letter taken elsewhere → the mark shows with no letter.
 * - sr-29 (2026-11-02): the directrix is a thin dashed line.
 * - 2026-11-03 card d2: an ellipse whose givens make a = b is a circle — no chip, its centre shown as a circle's centre,
 *   and a notice says so.
 *
 * Pure over the derivation and the annotation map. A click writes the map (`withConic`); it never goes through
 * `decideSubmit`, because it states nothing.
 */
import type { Derivation } from '../engine/derive';
import { ellipseFoci, parabolaDirectrix, parabolaFocus } from '../engine/curves';
import { knownCurve, type Figure } from '../engine/evaluate';
import type { NumCurve } from '../engine/types';
import { fmtAnalytic } from '../format';
import { CONIC_CYCLE, ELLIPSE_CYCLE, conicStateOf, nextConic, showsDirectrix, showsFocus, type AnnotationMap, type ConicState } from './annotations';
import { roleLineOf } from './curveText';

type ConicKind = 'parabola' | 'ellipse';

/** One chip: the row it sits on, the curve it drives, its state now and the state one press gives. */
export interface ConicChip {
  /** The ACTIVE line (the derivation's index) that introduced the curve — the component maps it to its row. */
  line: number;
  id: string;
  kind: ConicKind;
  /** The curve's own name, when it has one (carried on the chip when two conics share a row). */
  name: string;
  state: ConicState;
  next: ConicState;
}

/**
 * A mark to draw, in WORLD coordinates. `label` is absent when nothing may be written there; `labelNoValues` is what
 * may be written with the values switch off (#2688, ADR-AG-388): a focus's letter alone, a directrix nothing.
 */
export type ConicMark =
  | { kind: 'focus'; curve: string; x: number; y: number; label?: string; labelNoValues?: string }
  | { kind: 'directrix'; curve: string; line: NumCurve & { kind: 'line' }; label?: string };

/** The locale key of a chip's label: what the NEXT press does, in the curve's number (one focus, or two). */
export function conicChipKey(kind: ConicKind, next: ConicState): string {
  return `conicChip.${kind}.${next}`;
}

/** IS THIS ELLIPSE A CIRCLE? (ADR-AG-377) — the engine's one predicate (`engine/crossings.ts`), which the centre offer reads too. */
export { isRoundEllipse as isCircleShaped } from '../engine/crossings';
import { isRoundEllipse as isCircleShaped } from '../engine/crossings';

/** The stated conics a chip can drive: parabolas and ellipses the student stated, minus the ellipses that are circles. */
function stated(d: Derivation): Array<{ id: string; kind: ConicKind; name: string; curve: NumCurve }> {
  return d.figure.curves
    .filter((c) => c.stated && (c.curve.kind === 'parabola' || c.curve.kind === 'ellipse'))
    .filter((c) => !(c.curve.kind === 'ellipse' && isCircleShaped(d.construction, c.id)))
    .map((c) => ({ id: c.id, kind: c.curve.kind as ConicKind, name: c.label.name, curve: c.curve }));
}

/** Each kind's chip cycle (#2709, ADR-AG-466): a parabola's four states; an ellipse's foci only. */
const CYCLE_OF: Record<ConicKind, readonly ConicState[]> = { parabola: CONIC_CYCLE, ellipse: ELLIPSE_CYCLE };

/**
 * THE ONE READ OF A CONIC'S STATE (#2709, ADR-AG-466) — the map's record folded onto the kind's cycle, for the chip and
 * the marks alike. A state the kind does not have (a saved `both` or `directrix` on an ellipse, from before the
 * 2026-11-04 ruling) reads as the focus when it showed the focus, else as nothing. The map itself is never rewritten:
 * the next press writes the state the chip names.
 */
function stateOn(annotations: AnnotationMap, id: string, kind: ConicKind): ConicState {
  const s = conicStateOf(annotations, id);
  const cycle = CYCLE_OF[kind];
  if (cycle.includes(s)) return s;
  return showsFocus(s) && cycle.includes('focus') ? 'focus' : 'none';
}

/** One chip per stated parabola or ellipse (not a circle), on the row that introduced it, in figure order. */
export function conicChips(d: Derivation, annotations: AnnotationMap): ConicChip[] {
  const out: ConicChip[] = [];
  for (const c of stated(d)) {
    const line = d.construction.objectLine?.[c.id];
    if (line === undefined) continue;
    const state = stateOn(annotations, c.id, c.kind);
    out.push({ line, id: c.id, kind: c.kind, name: c.name, state, next: nextConic(state, CYCLE_OF[c.kind]) });
  }
  return out;
}

/** Does a drawn point stand here? Its letter wins the place (#1086's rule for the circle centre; sr-07). */
const pointAtPlace = (fig: Figure, x: number, y: number): boolean =>
  fig.points.some((p) => Math.hypot(p.x - x, p.y - y) < 1e-6 * Math.max(1, Math.hypot(x, y)));

/** The book's letter for focus k of this kind: `F`, or `F₁` / `F₂`. */
const bookLetter = (kind: ConicKind, k: number): string => (kind === 'parabola' ? 'F' : k === 0 ? 'F₁' : 'F₂');
/** The plain spelling of a letter (`F₁` ≡ `F1`), so a student's «F1» takes the book's «F₁». */
const plain = (s: string): string => s.replace(/[₀-₉]/g, (ch) => String(ch.charCodeAt(0) - 0x2080));

/**
 * WHAT TO DRAW — every mark the annotation map asks for, in world space.
 *
 * - a focus is a dot at its closed form; its label is the book's letter (when no student point holds that letter),
 *   followed by its coordinates when the curve is KNOWN; a student's point standing at the focus keeps the place and
 *   the mark writes nothing;
 * - a directrix is a line, labelled by its equation when the curve is known, else unlabelled;
 * - a hidden curve (#2238) draws no marks, as its centre cross goes with a hidden circle (ADR-AG-376, a question to
 *   the operator on the PR).
 */
export function conicMarksOf(d: Derivation, annotations: AnnotationMap, hidden: (id: string) => boolean = () => false): ConicMark[] {
  const out: ConicMark[] = [];
  const taken = new Set(d.figure.points.map((p) => plain(p.id)));
  for (const c of stated(d)) {
    const state = stateOn(annotations, c.id, c.kind);
    if (state === 'none' || hidden(c.id)) continue;
    const known = knownCurve(d.construction, c.id) !== null;
    const v = (n: number) => fmtAnalytic(n);
    if (showsFocus(state)) {
      const foci = c.curve.kind === 'parabola' ? [parabolaFocus(c.curve)] : c.curve.kind === 'ellipse' ? ellipseFoci(c.curve) : [];
      foci.forEach((f, k) => {
        if (pointAtPlace(d.figure, f.x, f.y)) {
          out.push({ kind: 'focus', curve: c.id, x: f.x, y: f.y });
          return;
        }
        const letter = taken.has(plain(bookLetter(c.kind, k))) ? '' : bookLetter(c.kind, k);
        const label = known ? `${letter}(${v(f.x)}, ${v(f.y)})` : letter;
        out.push({ kind: 'focus', curve: c.id, x: f.x, y: f.y, ...(label ? { label } : {}), ...(letter ? { labelNoValues: letter } : {}) });
      });
    }
    // only a parabola's cycle reaches a directrix state (#2709): an ellipse draws none
    if (showsDirectrix(state) && c.curve.kind === 'parabola') {
      const lines = [parabolaDirectrix(c.curve) as NumCurve & { kind: 'line' }];
      for (const line of lines) out.push({ kind: 'directrix', curve: c.id, line, ...(known ? { label: roleLineOf(line) } : {}) });
    }
  }
  return out;
}

/**
 * Where the marks must be ON SCREEN (R25a, R127: what the student asked for is in the frame): a focus's point, and a
 * directrix's crossing with its axis — the line runs across the whole view, so one point frames it.
 */
export function markAnchors(marks: readonly ConicMark[]): Array<{ x: number; y: number }> {
  return marks.map((m) =>
    m.kind === 'focus' ? { x: m.x, y: m.y } : Math.abs(m.line.b) < 1e-12 ? { x: -m.line.c / m.line.a, y: 0 } : { x: 0, y: -m.line.c / m.line.b },
  );
}

/** The circle notice (ADR-AG-377): one per stated ellipse the givens make a circle, with the lines that do it. */
export interface CircleNote {
  curve: string;
  name: string;
  /** ACTIVE line indices of the givens that force a = b, in typed order. */
  causeLines: number[];
}

/**
 * WHICH ELLIPSES ARE CIRCLES, AND BECAUSE OF WHAT — read like the narrowing note (`app/narrowing.ts`): the cause is
 * every other line whose removal stops the ellipse being a circle (a later «a = 3» on «x²/a² + y²/9 = 1»), and the
 * ellipse's own equation when that alone does it. Re-derives only when a circle exists, so a figure with none pays
 * one knowledge read per ellipse.
 */
export function circleNotesOf(lines: readonly string[], d: Derivation, rederive: (lines: readonly string[]) => Derivation): CircleNote[] {
  const out: CircleNote[] = [];
  for (const c of d.figure.curves) {
    if (!c.stated || c.curve.kind !== 'ellipse' || !isCircleShaped(d.construction, c.id)) continue;
    const intro = d.construction.objectLine?.[c.id];
    if (intro === undefined) continue;
    const cause: number[] = [];
    lines.forEach((_, i) => {
      if (i === intro) return;
      const without = rederive(lines.filter((__, j) => j !== i));
      const still = without.figure.curves.some((q) => q.id === c.id) && isCircleShaped(without.construction, c.id);
      if (!still) cause.push(i);
    });
    out.push({ curve: c.id, name: c.label.name, causeLines: cause.length ? cause : [intro] });
  }
  return out;
}

/** The notice as one sentence, in the narrowing note's voice (cause first) — the words are this product's locale. */
export function circleNoteText(
  n: CircleNote,
  t: (key: string, opts?: Record<string, unknown>) => string,
  lineText: (i: number) => string,
): string {
  const items = n.causeLines.map(lineText);
  const given =
    items.length <= 1 ? (items[0] ?? '') : items.slice(0, -1).join(t('narrowed.listSep')) + t('narrowed.listLast') + items[items.length - 1];
  const cause = t(items.length > 1 ? 'narrowed.cause.givens' : 'narrowed.cause.given', { given });
  return t(n.name ? 'conicCircleNamed' : 'conicCircle', { cause, name: n.name });
}
