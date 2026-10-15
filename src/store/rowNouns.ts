/**
 * #1996 ([ADR-655](../../docs/06-decisions.md#adr-655)) — WHICH NOUN EACH ROW STATED, adjective included.
 *
 * The forced-narrowing note compares the kind the student DECLARED with the kind the givens force. The declared
 * kind is the noun as typed: «משולש שווה צלעות ABC» is an equilateral triangle, although it lowers to a bare
 * `triangle` + two `set-equal` — so it is read by the parser's ONE shape-phrase reader (`readShapePhrase`,
 * ADR-595) on the row's own utterance, never inferred from the base command. That is also what a saved figure
 * re-reads on load, so a reload says what typing said.
 *
 * A row declares a ring only when it carries a command that makes that ring a polygon (a shape noun, a
 * quadrilateral, a triangle, a kite / isosceles variant). The phrase is read from the text BEFORE that ring's
 * letters («משולש ABC חסום בריבוע DEFG» reads «משולש» for ABC and «ריבוע» for DEFG), then after them
 * ("ABCD is a parallelogram"). An inscription with no noun («ABCD חסום במעגל») states no noun, so its ring
 * has no declared kind and never gets the note.
 *
 * Store layer on purpose: replay may not import the parser (`import-direction.test.ts`); the store hands the
 * result to the detect sweep with the facts.
 */
import type { AnyCommand, Id } from '@/engine';
import type { Fact } from '@/replay/core';
import type { RowNouns, RowNoun } from '@/replay/narrowing';
import { narrowImplies, NARROW_KINDS, type NarrowKind } from '../../shell/narrowing';
import { readShapePhrase, type ShapeKind } from '@/parser/shapePhrase';

const KIND: Readonly<Record<ShapeKind, NarrowKind>> = {
  triangle: 'triangle',
  'right-triangle': 'right-triangle',
  'isosceles-triangle': 'isosceles-triangle',
  'equilateral-triangle': 'equilateral-triangle',
  square: 'square',
  rectangle: 'rectangle',
  rhombus: 'rhombus',
  kite: 'kite',
  trapezoid: 'trapezoid',
  parallelogram: 'parallelogram',
  quad: 'quadrilateral',
  'right-trapezoid': 'right-trapezoid',
  'isosceles-trapezoid': 'isosceles-trapezoid',
};

/** The ring a command makes a polygon of, or null. */
function ringOf(cmd: AnyCommand): Id[] | null {
  switch (cmd.type) {
    case 'triangle':
    case 'right-triangle':
    case 'quadrilateral':
    case 'parallelogram':
    case 'rectangle':
    case 'rhombus':
    case 'square':
    case 'trapezoid':
    case 'shape-variant':
      return [...cmd.ids];
    default:
      return null;
  }
}

/** Every spelling of a ring — its rotations and reversals (a polygon is its cycle, ADR-618). */
function spellings(ring: readonly Id[]): string[] {
  const n = ring.length;
  const out: string[] = [];
  for (let r = 0; r < n; r++) {
    out.push(Array.from({ length: n }, (_, i) => ring[(r + i) % n]).join(''));
    out.push(Array.from({ length: n }, (_, i) => ring[(r - i + n) % n]).join(''));
  }
  return out;
}

/**
 * Every noun the utterance states for `ring`, once per time it names the ring («מלבן ABCD, מעוין ABCD» states two).
 * `own`: the row itself made the ring a polygon, so a sentence that never spells the letters («טרפז ישר זוות»,
 * auto-lettered) still reads as its own noun.
 */
export function nounsForRing(utterance: string, ring: readonly Id[], own = true): NarrowKind[] {
  const fits = (s: string): NarrowKind | null => {
    const p = readShapePhrase(s);
    return p && p.arity === ring.length && (p.noun || p.consumed) ? KIND[p.kind] : null;
  };
  const RUN = /\b[A-Z]\d*(?:[A-Z]\d*){2,}\b/;
  const hits = [...utterance.matchAll(new RegExp(String.raw`(?<![A-Z\d])(?:${spellings(ring).join('|')})(?![A-Z\d])`, 'g'))];
  if (!hits.length) {
    const k = own ? fits(utterance) : null;
    return k ? [k] : [];
  }
  const out: NarrowKind[] = [];
  for (const m of hits) {
    const at = m.index!;
    // the text between the previous label run (or the start) and this naming of the ring, then after it
    const before = utterance.slice(0, at).split(RUN).pop() ?? '';
    const after = utterance.slice(at + m[0].length).split(RUN)[0] ?? '';
    const k = fits(before) ?? fits(after);
    if (k) out.push(k);
  }
  return out;
}

/**
 * The refined phrase a command itself records, when the parser stamped one (`trapezoid.kind`, ADR-607 — set even
 * when the text is misspelt, «טרפז ישר זוות»). It only ever REFINES the text's reading, never replaces it.
 */
function stampedKind(cmd: AnyCommand): NarrowKind | null {
  const k = cmd.type === 'trapezoid' ? cmd.kind : cmd.type === 'quadrilateral' || cmd.type === 'triangle' ? cmd.declaredAs : undefined;
  return k && (NARROW_KINDS as string[]).includes(k) ? (k as NarrowKind) : null;
}

/**
 * Every row's nouns, keyed by the row's group key (`group ?? id`). Rows without text state none.
 *
 * A row states a noun for a ring when it makes that ring a polygon, OR when it names an existing ring with a noun
 * whose own command the store folded away as already there («טרפז ABCD» · «טרפז שווה שוקיים ABCD»: the second
 * line keeps only its legs; its noun is still the student's declaration).
 */
export function rowNouns(facts: readonly Fact[]): RowNouns {
  const out: RowNouns = {};
  const rings = new Map<string, Id[]>(); // every declared ring, by its letters, in its first spelling
  const made = new Map<string, Set<string>>(); // row → the rings it makes a polygon of
  const stamps = new Map<string, NarrowKind>(); // row|ring → a refined phrase a command recorded
  for (const f of facts) {
    const ring = ringOf(f.cmd as AnyCommand);
    if (!ring) continue;
    const rk = [...ring].sort().join(',');
    if (!rings.has(rk)) rings.set(rk, ring);
    const key = f.group ?? f.id;
    (made.get(key) ?? made.set(key, new Set()).get(key)!).add(rk);
    const st = stampedKind(f.cmd as AnyCommand);
    if (st) stamps.set(key + '|' + rk, st);
  }
  const seen = new Set<string>();
  for (const f of facts) {
    if (!f.utterance) continue;
    const key = f.group ?? f.id;
    if (seen.has(key)) continue;
    seen.add(key);
    for (const [rk, ring] of rings) {
      const own = made.get(key)?.has(rk) ?? false;
      for (const read of nounsForRing(f.utterance, ring, own)) {
        const stamped = stamps.get(key + '|' + rk);
        const kind = stamped && narrowImplies(stamped, read) ? stamped : read;
        const n: RowNoun = { ring, kind };
        (out[key] ??= []).push(n);
      }
    }
  }
  return out;
}
