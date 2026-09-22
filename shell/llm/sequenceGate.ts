/**
 * THE SEQUENCE GATE, ONCE (#1356) — a point run the model respelled is restored to the student's own
 * spelling, before anything re-parses it.
 *
 * ## The defect it exists for
 *
 * 2-D #536 was a production P1: Haiku alphabetised a stated betweenness — «ADB» came back as
 * «ישר ABD» — and the figure committed **the negation of the student's given**. D lies between A and
 * B; the respelling says B does. The rule the repo settled on is blunt and correct:
 *
 * > never reorder the letters of a point sequence — **the sequence IS the statement**.
 *
 * 3-D hit the identical class and copied the fix (#555 / ADR-3D-173). Analytic has hit it too: the
 * model renamed a student's «ישר 1» to `l1` and locked them out of their own figure
 * ([#1297](https://github.com/dcodish/geo_builder/issues/1297)).
 *
 * ## Why it is in `shell/`
 *
 * The two shipped copies are the same algorithm to the line: build a map of the runs the STUDENT
 * stated, keyed by label multiset; drop a key stated two inequivalent ways as ambiguous; then rewrite
 * any run in the model's lines whose labels match a stated key in neither the stated order nor its
 * reverse. Only three things differed — the label pattern, how the utterance is normalised, and a
 * length-preserving transform applied to the line before matching.
 *
 * Analytic's would have been the **third** copy. Per the operator's standing rule that the tools share
 * as much of the design and pedagogy as possible ([#1358](https://github.com/dcodish/geo_builder/issues/1358)),
 * the algorithm lives here and each product passes its three differences in. `shell/` is reachable from
 * every product tree (`BOUNDARIES.json`) and imports none of them — this file knows no product.
 *
 * ## Why the REVERSE is accepted
 *
 * «ABD» and «DBA» are the same statement read from the other end; only a genuine re-ordering is a
 * different claim. Rejecting a reversal would "restore" spellings that were never wrong.
 */

/** What a product must supply. Everything else is shared. */
export interface SequenceGateSpec {
  /**
   * Matches ONE label token, global.
   *
   * A factory rather than a value. Measured, so the reason is accurate: this would be safe either way
   * — `String.prototype.matchAll` clones the regex and leaves the original's `lastIndex` untouched,
   * and `String.prototype.match` with `/g` resets it. The factory is for clarity and for the next
   * caller who reaches for `exec` (which DOES advance `lastIndex`, and which `matchAll` then honours),
   * not because a shared instance breaks today.
   */
  label: () => RegExp;
  /** Matches a RUN of three or more labels, global. Same reasoning. */
  run: () => RegExp;
  /**
   * Normalise the student's utterance before reading their stated runs. May change length — the
   * indices are never used on this side.
   */
  normalizeUtterance: (s: string) => string;
  /**
   * Prepare one model line. `match` is what the run regex is applied to and MUST be index-stable with
   * respect to `emit` (same length, or literally the same string), because a replacement is spliced by
   * match index. `emit` is the text the rewritten line is built from.
   *
   * This is where the two shipped copies quietly differed and the difference is preserved rather than
   * unified: 2-D masks the ADR-118 area marker `S` for matching but emits from the ORIGINAL line, so a
   * line it does not rewrite comes back byte-for-byte; 3-D canonicalises prime marks and emits from the
   * canonicalised text. Unifying them would have changed output in a shipped tool.
   */
  prepareLine: (line: string) => { match: string; emit: string };
}

const sameSeq = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i]);
const rev = (a: readonly string[]) => [...a].reverse();

/**
 * Restore, in `lines`, every point run the student spelled differently in `utterance`.
 *
 * Returns the lines (unchanged where nothing was restored) and a `restored` log of `WAS→WANT` entries,
 * which the caller records on the submit event so a `source:'llm'` session stays reconstructable —
 * both shipped copies do this and it is how #536 was diagnosed in the first place.
 */
export function restoreStatedSequences(
  utterance: string,
  lines: string[],
  spec: SequenceGateSpec,
): { lines: string[]; restored: string[] } {
  const split = (run: string): string[] => run.match(spec.label()) ?? [];

  /**
   * The runs the STUDENT stated, keyed by label multiset.
   *
   * A key stated two INEQUIVALENT ways is ambiguous and maps to null — the student wrote both «ABD»
   * and «ADB», so neither can be called the authority and nothing is restored for that key. Silently
   * picking the first would invent a given.
   */
  const stated = new Map<string, string[] | null>();
  for (const m of spec.normalizeUtterance(utterance).matchAll(spec.run())) {
    const labels = split(m[0]);
    const key = [...labels].sort().join(',');
    const prev = stated.get(key);
    if (prev === undefined) stated.set(key, labels);
    else if (prev !== null && !sameSeq(prev, labels) && !sameSeq(prev, rev(labels))) stated.set(key, null);
  }
  if (stated.size === 0) return { lines, restored: [] };

  const restored: string[] = [];
  const out = lines.map((line) => {
    const { match, emit } = spec.prepareLine(line);
    let result = '';
    let last = 0;
    for (const m of match.matchAll(spec.run())) {
      const labels = split(m[0]);
      const want = stated.get([...labels].sort().join(','));
      if (!want || sameSeq(labels, want) || sameSeq(labels, rev(want))) continue;
      restored.push(`${labels.join('')}→${want.join('')}`);
      result += emit.slice(last, m.index) + want.join('');
      last = m.index + m[0].length;
    }
    return result ? result + emit.slice(last) : line;
  });
  return { lines: out, restored };
}
