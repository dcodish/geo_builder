/**
 * THE «נתון:» LIST OF THE QUESTION EXPORT (#1872, [ADR-AG-269](../../docs/06c-decisions-analytic.md#adr-ag-269)).
 *
 * «הורידו שאלה» puts the figure beside a numbered list of the givens, as a .docx — the shared composer
 * (`shell/export/questionDoc`) lays it out; this module decides WHICH lines are givens and how each reads.
 *
 * ## Like 2-D (operator ruling W5, 2026-10-08)
 *
 * Asked whether analytic's list should print every row as it shows it (3-D's way) or follow 2-D, he chose
 * **"Like 2-D"**: 2-D's `questionLines` (ADR-252, #465). Ported here over analytic's own facts:
 *
 * - **One line per submission.** A sentence the AI fallback rewrote into several machine lines is ONE
 *   statement, as 2-D's submission group is: the rows it produced print once.
 * - **A muted row is not a given** — it was taken out of the figure (2-D: a group with no enabled fact).
 * - **Scaffolding is omitted** (ADR-252). A submission whose every fact is pure INK — a bare segment
 *   «AD», «הקטע AB», a bare drawn line «הישר BC» — or a value-less MARKER that names a NEW point
 *   («נקודה E», «D על BC», «P על l1») states no given: it adds no constraint the figure did not already
 *   show, and the drawn result is in the image beside the text. It is kept anyway when a LATER kept
 *   given refers to something it introduced («D על BC» stays when «זווית BAD = 30» follows), and the
 *   check cascades in reverse, so a marker whose only consumer is omitted ink goes with it.
 *   A statement about an EXISTING point (M1 — «C על l1» after C was placed) is a given, never ink.
 * - **The canonical spelling where one exists, the student's words where none does** (2-D:
 *   `canonicalText(...) ?? utterance`). This tree has no fact → sentence renderer: that is #1468, held by
 *   the operator's own ruling (2026-09-27, *"student's words now, form later"*). What it has is the
 *   recorded line, which for a typed row IS the student's sentence (a taught imperative is recorded in
 *   its taught form already, #1353) — and for a fallback-built row is model output, which ADR-AG-172
 *   rules is never shown (`spokenFor`, #1297). So every printed line is the student's own sentence, and
 *   the paper agrees with the fact list.
 *
 * ## Why the classification is safe in the direction that matters
 *
 * A classification that is even slightly wrong could DROP a given the student stated — the tool lying
 * about the question (3-D's reason for staying verbatim, ADR-W-027). So both judgements lean one way:
 * a fact kind is scaffolding only by NAME in the short list below (an unknown or new kind is a given),
 * and the ids a submission refers to are read off EVERY string its facts carry, intersected with the
 * figure's real object ids — a new fact field is a reference automatically, and an over-read reference
 * can only KEEP a scaffold line (a line too many), never drop a given.
 *
 * Pure over its inputs (no store, no DOM), so it is unit-tested in node through the real parser.
 */
import type { Fact } from '../engine/types';
import { parseLine } from '../parser/parseAnalytic';
import { spokenSentence } from '../store/useAnalyticStore';

/** Every string a fact carries, except its own source text — the candidate ids it refers to. */
function stringsOf(v: unknown, out: Set<string>): void {
  if (typeof v === 'string') out.add(v);
  else if (Array.isArray(v)) for (const x of v) stringsOf(x, out);
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) if (k !== 'src') stringsOf(x, out);
}

/**
 * Is this fact pure scaffolding in context? `fresh` holds the point ids this SUBMISSION introduces (named
 * by nothing earlier): a membership statement about a fresh point is a marker; about an existing one it
 * is a given (M1). The list is closed on purpose — every other kind is a stated given.
 */
function isScaffoldFact(f: Fact, fresh: ReadonlySet<string>): boolean {
  switch (f.t) {
    case 'segment': // pure ink between two points (a sentence's own `ref` segment rides with its other facts)
    case 'line-2pt': // «הישר BC» — a bare drawn line through two points
      return true;
    case 'declare': // names a point without placing it — a marker when new, nothing at all when not
      return true;
    case 'constraint':
      // «D על BC» / «P על l1» with no ratio, no value: the 2-D marker kinds (point-on-segment, -line, -circle)
      return (f.k.t === 'on-line-2pt' || f.k.t === 'on-curve') && fresh.has(f.k.id);
    case 'selector':
      // the «על הקטע» half of the same marker sentence — which side of the carrier, for a NEW point only
      return f.sel.kind === 'between' && fresh.has(f.sel.id);
    default:
      return false;
  }
}

/**
 * The givens, in entry order, as the exported question prints them.
 *
 * @param lines      the store's lines (every row, muted or not)
 * @param disabled   the muted rows
 * @param spokenFor  per row, the student's sentence for a fallback-built row (with its part marker)
 * @param objectIds  the ids of the objects the ACTIVE figure holds (`derive(...).construction.objects`) —
 *                   what a string in a fact must be to count as a reference
 */
export function questionLines(
  lines: readonly string[],
  disabled: readonly number[],
  spokenFor: Readonly<Record<number, string>>,
  objectIds: ReadonlySet<string>,
): string[] {
  // One SUBMISSION per typed row; consecutive rows one fallback sentence produced are one submission.
  const groups: { text: string; rows: number[] }[] = [];
  lines.forEach((line, i) => {
    const spoken = spokenFor[i] !== undefined ? spokenSentence(spokenFor[i]) : null;
    const last = groups[groups.length - 1];
    const prevSpoken = i > 0 && spokenFor[i - 1] !== undefined ? spokenSentence(spokenFor[i - 1]) : null;
    if (spoken !== null && last && prevSpoken === spoken && last.rows[last.rows.length - 1] === i - 1) last.rows.push(i);
    else groups.push({ text: (spoken ?? line).trim(), rows: [i] });
  });

  // Forward pass: per submission, its enabled facts, the ids it refers to, and the ids it INTRODUCES.
  const defined = new Set<string>();
  const meta = groups.map((g) => {
    const active = g.rows.filter((i) => !disabled.includes(i));
    const facts = active.flatMap((i) => {
      const r = parseLine(lines[i]);
      return r.ok ? r.facts : [];
    });
    const mentions = new Set<string>();
    for (const f of facts) stringsOf(f, mentions);
    const refs = [...mentions].filter((s) => objectIds.has(s));
    const intro = refs.filter((id) => !defined.has(id));
    const fresh = new Set(intro);
    for (const id of intro) defined.add(id);
    const scaffold = facts.length > 0 && facts.every((f) => isScaffoldFact(f, fresh));
    return { g, active, refs, intro, scaffold };
  });

  // Reverse pass: a scaffold submission survives only if a LATER KEPT one refers to what it introduced.
  const needed = new Set<string>();
  const keep = new Set<number>();
  for (let k = meta.length - 1; k >= 0; k--) {
    const m = meta[k];
    if (m.active.length === 0) continue; // muted ⇒ not a given, and refers to nothing
    if (!m.scaffold || m.intro.some((id) => needed.has(id))) {
      keep.add(k);
      for (const id of m.refs) needed.add(id);
    }
  }

  return meta.filter((_, k) => keep.has(k) && meta[k].g.text).map((m) => m.g.text);
}
