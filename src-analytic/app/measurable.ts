/**
 * WHAT CAN BE MEASURED ABOUT THE THING YOU CLICKED (#1048).
 *
 * Operator, 2026-09-15: *"maybe buttons or some other mechanism — you could think about it — where a
 * user can say I want to see the distance between this point and a specific line … clicking on a
 * line itself should allow us to either show the equation of the line or the distance between the
 * two nodes of the line … maybe also the slope as a third option."*
 *
 * ## The click composes a SENTENCE, and shows it
 *
 * Every option below is a question the ask lane already answers, spelled exactly as a student would
 * type it. That is the whole design and the reason to prefer it to a toolbar: a button teaches
 * nothing, while a click that says *"this is called «המרחק מ-A לישר l1»"* teaches the vocabulary the
 * exam uses — the same argument ADR-W-030 makes for teaching non-canonical input rather than
 * silently accepting it, and the same «two surfaces, one grammar» rule the crossing rings follow
 * (ADR-AG-048).
 *
 * So this module composes TEXT. It does not measure anything, and it must not: a second path to an
 * answer is how two surfaces of one panel start disagreeing.
 *
 * ## Only what the figure can actually be asked
 *
 * An option is offered only when the sentence behind it would resolve — a distance to a line needs a
 * line to exist, and a segment's length needs the name to really be two points. Offering an option
 * whose answer is «לא הבנתי» would be the menu lying about the figure.
 */
import type { Construction, Id } from '../engine/types';
import { asPair, lineNamesOf, segmentName } from './lines';

export interface Measurable {
  /** The sentence to ask — exactly what the student could have typed. */
  sentence: string;
}

/**
 * The questions a POINT admits: where it is, and how far it is from each line on the canvas.
 *
 * The distances come first only when there IS a line — on a bare point the coordinate question is
 * the only honest offer.
 */
export function measurablesOfPoint(c: Construction, id: Id): Measurable[] {
  const out: Measurable[] = [{ sentence: id }];
  /**
   * THE OPPOSITE SIDE FIRST (#1139).
   *
   * On a triangle, the distance from `C` to `AB` is the HEIGHT — the question a student actually
   * came to ask. The two sides through `C` are legitimate questions with legitimate answers (zero),
   * so the menu still offers them; it simply stops burying the interesting one under them.
   */
  const touches = (n: string) => {
    const p = asPair(n);
    return !!p && (p[0] === id || p[1] === id);
  };
  const names = lineNamesOf(c);
  for (const line of [...names.filter((n) => !touches(n)), ...names.filter(touches)])
    out.push({ sentence: `המרחק מ-${id} לישר ${line}` });
  return out;
}

/**
 * The three questions a LINE admits, whatever surface named it — the operator's own three, in the
 * order he named them.
 *
 * ONE list, because a curve object and a clicked triangle side are the same question about the same
 * kind of thing. Two copies of it is how the menu started disagreeing with itself in the first place.
 *
 * The length is offered only when the name really is two points: «הישר ℓ₁» has no nodes, and
 * offering «אורך ℓ₁» would be the menu inventing a measurement.
 */
function lineQuestions(c: Construction, name: string): Measurable[] {
  const out: Measurable[] = [{ sentence: `משוואת הישר ${name}` }, { sentence: `שיפוע הישר ${name}` }];
  const pair = asPair(name);
  if (pair && c.objects.some((q) => q.id === pair[0]) && c.objects.some((q) => q.id === pair[1]))
    out.push({ sentence: `${pair[0]}${pair[1]}` });
  return out;
}

/** The questions a CURVE admits. */
export function measurablesOfCurve(c: Construction, id: Id): Measurable[] {
  const o = c.objects.find((q) => q.id === id);
  if (!o || o.kind !== 'curve') return [];
  const name = o.label.name;
  const kind = o.label.kind ?? o.curve.kind;

  // A conic is asked for its equation and nothing else: it has no slope and no two nodes.
  if (!name) return [];
  if (kind && kind !== 'line') return [{ sentence: `משוואת ${name}` }];
  return lineQuestions(c, name);
}

/**
 * The questions a drawn SEGMENT admits — a triangle's side, or a stated «קטע AB» (#1139).
 *
 * Operator, 2026-09-16: *"the line itself is not clickable in this state and it should be — allowing
 * to show distance, equation, slope."* The side was drawn, and was an object to nobody: `onPick`
 * reported only points and curves, so there was nothing a click could even name.
 */
export function measurablesOfSegment(c: Construction, id: Id): Measurable[] {
  const name = segmentName(c, id);
  return name ? lineQuestions(c, name) : [];
}

/** Everything clickable-and-measurable about one object, by what the renderer reported. */
export function measurablesOf(
  c: Construction,
  what: { kind: 'point' | 'curve' | 'segment'; id: Id },
): Measurable[] {
  if (what.kind === 'point') return measurablesOfPoint(c, what.id);
  if (what.kind === 'segment') return measurablesOfSegment(c, what.id);
  return measurablesOfCurve(c, what.id);
}
