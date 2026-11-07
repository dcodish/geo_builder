/**
 * THE LOCUS CHIP — a way in to the most-asked construct, on the givens list (#1177, ADR-AG-352).
 *
 * Operator, 2026-09-17, playing the locus lane: *"It is not intuitive for the user to type in data panel about the
 * locus of M. I want a chip next to points in the input panel that can show their locus. This will only be available
 * for points that are not fully defined."* The locus is what 13 of the corpus's 20 first questions ask for, and until
 * this it was reachable only by typing a question whose name the student had to know already.
 *
 * ## The chip is an AFFORDANCE, not a second mechanism
 *
 * It carries the sentence it asks — «המקום הגיאומטרי של M» — and the component hands that sentence to the ask lane through
 * `pressChip`, the ADR-AG-067 lifetime the measure menu uses, with the record marked `via: 'chip'`. This module answers
 * nothing: the ask lane does, with the one grammar it has (ADR-AG-048).
 *
 * ## The chip is the ONLY way in (#2673, ADR-AG-381)
 *
 * Operator, 2026-11-02: *"we should drop the ability to ask for המקום הגיאומטרי through the ask box. this is why we have the
 * chips."* The same words typed in the ask box answer a pointer to this chip (`Answer.chipOnly`); only a record asked
 * `via: 'chip'` is answered with the locus. A conditional locus is built as givens — «נקודה M» · «MA = MB» — and then its
 * chip (ruling 2026-11-03: *"a student should see what he is placing the point and this is part of the pedagogy"*).
 *
 * ## Which points get one: `hasLocus`, never a second predicate
 *
 * "Not fully defined" and "has a locus" are different sets. A point with TWO degrees of freedom («נקודה M» alone)
 * is not fully defined and has no curve for a locus; a point that moves on its own circle while another point is
 * independently free has no one-dimensional freedom either. The chip's condition is the engine's own
 * `hasLocus` — one Newton direction at the configuration being shown, measured at 0.0–0.3 ms for a whole figure —
 * started from the free positions `drawableAt` gives, which is the same start `locusOf` walks from.
 *
 * ## Where it sits: the row that INTRODUCED the point
 *
 * The construction's line provenance, `objectLine` (#1687, ADR-AG-348), is the fold's own attribution — the first
 * fact that brought each object in, mapped to its line — so «נקודה M», «A(0,0)», a noun's vertex, a point created by
 * reference and a tool-named centre each land on the row the student reads it was introduced on. One record serves
 * the solve's fit and this chip (ADR-AG-352 Am. 1).
 */
import { ask, type Answer } from './ask';
import type { Derivation } from '../engine/derive';
import { drawableAt, drawnChoiceSeed } from '../engine/evaluate';
import { hasLocus } from '../engine/locus';
import { isFree, type Id } from '../engine/types';
import { locusSentence } from '../parser/locusPhrases';

/** The question a chip asks — the ask lane's own spelling (`LOCUS_OF`). */
export { locusSentence };

/**
 * THE CHIP'S ENTRY POINT, as the page answers a chip's record (`askSettled(d, sentence, fmt, kindWord, 'chip')`) — the
 * one call a test or a corpus check makes to read a point's locus (#2673). Typing the sentence is `ask` without `via`.
 */
export function askLocus(
  d: Derivation,
  id: Id,
  fmt: (v: number) => string,
  kindWord?: Parameters<typeof ask>[3],
): Answer {
  return ask(d, locusSentence(id), fmt, kindWord, 'chip');
}

export interface LocusChip {
  /** The ACTIVE line (the derivation's index) that introduced the point — the component maps it to its row. */
  line: number;
  id: Id;
  /** The sentence the chip asks: exactly what typing it would ask. */
  sentence: string;
}

/**
 * One chip per point of the figure that has a locus, in figure order, on the line that introduced it.
 *
 * Empty for a figure with no free carrier (nothing moves) and for one whose drawable figure has a free carrier with
 * no position (nothing to start from) — both are figures whose ask has no curve to answer with.
 */
export function locusChips(d: Derivation): LocusChip[] {
  if (d.figure.points.length === 0) return [];
  const f = drawableAt(d.construction, d.configuration);
  const start = new Map<Id, { x: number; y: number }>();
  for (const o of d.construction.objects) {
    if (!isFree(o)) continue;
    const p = f.points.find((q) => q.id === o.id);
    if (!p) return [];
    start.set(o.id, { x: p.x, y: p.y });
  }
  const chips: LocusChip[] = [];
  for (const p of d.figure.points) {
    const line = d.construction.objectLine?.[p.id];
    if (line === undefined) continue;
    if (!hasLocus(d.construction, f.env, p.id, start, d.configuration.seed, drawnChoiceSeed(f, d.configuration.seed))) continue;
    chips.push({ line, id: p.id, sentence: locusSentence(p.id) });
  }
  return chips;
}
