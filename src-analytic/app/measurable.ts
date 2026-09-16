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

export interface Measurable {
  /** The sentence to ask — exactly what the student could have typed. */
  sentence: string;
}

/** A line the student can NAME, and therefore ask about. */
function namedLines(c: Construction): string[] {
  const out: string[] = [];
  for (const o of c.objects) {
    if (o.kind !== 'curve') continue;
    if (o.label.kind && o.label.kind !== 'line') continue;
    const n = o.label.name;
    // An anonymous curve is referred to by its equation (ADR-AG-056); that is a long menu entry and
    // a student rarely wants the distance to one, so the menu keeps to names.
    if (n) out.push(n);
  }
  return out;
}

/** Is this name really two points the figure holds? Then it also names a SEGMENT with a length. */
function asPair(c: Construction, name: string): [Id, Id] | null {
  const m = /^([A-Z][0-9]?)([A-Z][0-9]?)$/.exec(name);
  if (!m || m[1] === m[2]) return null;
  const has = (id: Id) => c.objects.some((o) => o.id === id);
  return has(m[1]) && has(m[2]) ? [m[1], m[2]] : null;
}

/**
 * The questions a POINT admits: where it is, and how far it is from each line on the canvas.
 *
 * The distances come first only when there IS a line — on a bare point the coordinate question is
 * the only honest offer.
 */
export function measurablesOfPoint(c: Construction, id: Id): Measurable[] {
  const out: Measurable[] = [{ sentence: id }];
  for (const line of namedLines(c)) out.push({ sentence: `המרחק מ-${id} לישר ${line}` });
  return out;
}

/**
 * The questions a CURVE admits — the operator's three, in the order he named them.
 *
 * The length is offered only when the curve's name really is two points: «הישר ℓ1» has no nodes, and
 * offering «אורך ℓ1» would be the menu inventing a measurement.
 */
export function measurablesOfCurve(c: Construction, id: Id): Measurable[] {
  const o = c.objects.find((q) => q.id === id);
  if (!o || o.kind !== 'curve') return [];
  const name = o.label.name;
  const kind = o.label.kind ?? o.curve.kind;

  // A conic is asked for its equation and nothing else: it has no slope and no two nodes.
  if (!name) return [];
  if (kind && kind !== 'line') return [{ sentence: `משוואת ${name}` }];

  const out: Measurable[] = [{ sentence: `משוואת הישר ${name}` }, { sentence: `שיפוע הישר ${name}` }];
  const pair = asPair(c, name);
  if (pair) out.push({ sentence: `${pair[0]}${pair[1]}` });
  return out;
}

/** Everything clickable-and-measurable about one object, by what the renderer reported. */
export function measurablesOf(c: Construction, what: { kind: 'point' | 'curve'; id: Id }): Measurable[] {
  return what.kind === 'point' ? measurablesOfPoint(c, what.id) : measurablesOfCurve(c, what.id);
}
