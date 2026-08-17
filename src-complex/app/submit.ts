/**
 * THE ACCEPTANCE GATE — *a new statement must never break an earlier one.*
 *
 * ADR-276's doctrine, which the prototype held in `useComplexStore.addLine` by re-deriving twice and
 * comparing. Under `?engine=v2` it was held by **nothing at all**: #658 made `addLine` return early for
 * v2 as soon as the grammar could read the line, and the gate sat below that return, unreachable. So a
 * v2 session could accept `|z1| = 5` and then `|z1| = 7` and draw a figure that satisfies neither.
 *
 * ## Why the gate cannot live in the store any more
 *
 * The prototype's `derive` was in `engine/`, which the store may import. v2's fold is reached through
 * `deriveLines`, and `deriveLines` composes `parser` with `replay` — which the layer guard permits in
 * `app/` and nowhere else, for the reason it caught once already. The gate therefore comes UP a layer,
 * and the store goes back to being state: it records lines and errors, and decides nothing.
 *
 * That is also the shape 2-D had to extract after the fact (docs/23: a 2,717-line store holding the
 * replay engine) and the reason this tree has an `app/` layer from the start. The submit path belongs
 * here, never inline in the component and never inside the state container.
 *
 * ## What counts as breaking, and what deliberately does not
 *
 * A GIVEN can be violated; an ANSWER cannot. So the gate reads the three signals a given produces —
 * an inconsistent linear system (`contradiction`), a filter that empties the configuration set
 * (`emptiedBy`, LADDER-CX stage 2's `bound-unsatisfiable`), and a numeric relation the solver could not
 * satisfy (`unsatisfied`) — and ignores `claims` entirely. A student's wrong answer must land and be
 * marked ✗; refusing it would be the tool grading the input box instead of the figure. `undecided` is
 * likewise not a violation — the engine could not evaluate the relation, which is a different sentence
 * from "the relation is false", and its own contract says so.
 *
 * Only a NEWLY-broken signal refuses. A figure that already had an unsatisfied relation stays
 * accepting: the doctrine is about damage the new line causes, not about the state it arrives into.
 *
 * ## Inserts at LADDER-CX stage 0e — the dry run
 *
 * Stage 0e is *"dry-run on a trial fact list; keep-prior on failure"*, and this is that stage for the
 * v2 line list. It sits above stage 1's own refusal (an inconsistent system) because the two answer
 * different questions: stage 1 says *these givens cannot all hold*, and stage 0e says *which line to
 * blame and therefore what to keep*.
 */

import { parseLineV2 } from '../parser/rules';
import type { Derived2 } from '../replay/derive2';
import { type InputError, type SavedSession, useComplexStore } from '../store/useComplexStore';
import { deriveLines } from './deriveLines';

/**
 * How many configurations to try before blaming the new line — the prototype's mini config-search.
 *
 * A new given often holds in a different drawing of the same figure, and offering that drawing is not
 * a compromise: every configuration in the set satisfies every given, so picking the one that fits is
 * the ADR-052 discipline rather than a search for a lucky sample.
 */
const CONFIG_TRIES = 8;

/** The app's own fold: the store's single `seed` drives both the branch index and the sample, as `App` does. */
const fold = (lines: readonly string[], seed: number): Derived2 => deriveLines(lines, seed, seed);

/** The signals a stated GIVEN can violate. Claims and `undecided` are excluded on purpose — see above. */
interface Violations {
  readonly contradicted: boolean;
  readonly emptied: boolean;
  readonly unsatisfied: ReadonlySet<string>;
}

const violationsOf = (d: Derived2): Violations => ({
  contradicted: d.contradiction !== null,
  emptied: d.emptiedBy !== null,
  unsatisfied: new Set(d.unsatisfied),
});

/** Did going from `before` to `after` break something that was not already broken? */
const broke = (before: Violations, after: Violations): boolean =>
  (after.contradicted && !before.contradicted) ||
  (after.emptied && !before.emptied) ||
  [...after.unsatisfied].some((u) => !before.unsatisfied.has(u));

export type Verdict =
  /** accepted, in this configuration — the caller records the seed so the figure shown is the one that fit */
  | { readonly ok: true; readonly seed: number }
  | { readonly ok: false; readonly error: InputError };

/**
 * Would adding `raw` break an earlier line? — the whole gate, pure over `(lines, raw, seed)`.
 *
 * The refusal NAMES the earlier statement, and it finds it the way the doctrine is phrased: by asking
 * which earlier line, removed, lets the new one in. That is a differential question and it is answered
 * differentially, over every refusal cause at once — the linear tier's conflict set would name only
 * its own rows, and would say nothing about a filter that emptied the branch set or a numeric relation
 * that stopped being satisfiable.
 *
 * When no single earlier line explains it, the new statement cannot hold at all (`|z1| = -5`, or a
 * claim on the origin) and the refusal quotes the student's own line rather than inventing a culprit.
 */
export function acceptLine(lines: readonly string[], raw: string, seed: number): Verdict {
  const next = [...lines, raw];
  const before = violationsOf(fold(lines, seed));

  for (let ds = 0; ds < CONFIG_TRIES; ds++) {
    if (!broke(before, violationsOf(fold(next, seed + ds)))) return { ok: true, seed: seed + ds };
  }

  for (let i = 0; i < lines.length; i++) {
    const without = lines.filter((_, k) => k !== i);
    const b2 = violationsOf(fold(without, seed));
    const a2 = violationsOf(fold([...without, raw], seed));
    if (!broke(b2, a2)) return { ok: false, error: { key: 'incompatible', detail: lines[i] } };
  }

  return { ok: false, error: { key: 'impossible', detail: raw } };
}

/**
 * THE ONE ENTRY POINT the input box uses — both engines, one place.
 *
 * The prototype branch is still the store's, unchanged, because it is deleted whole by the cutover and
 * moving it first would be churn on code with a scheduled end. Everything v2 is decided here.
 */
export function submitLine(raw: string): boolean {
  const st = () => useComplexStore.getState();
  if (st().engine !== 'v2') return st().addLine(raw);

  const line = raw.trim();
  const parsed = parseLineV2(line);
  if (!parsed.ok) {
    st().setError(
      parsed.reason === 'unaccounted'
        ? { key: 'unaccounted', detail: parsed.items.join(', ') }
        : { key: 'not-handled', detail: line },
    );
    return false;
  }

  const verdict = acceptLine(st().lines, line, st().seed);
  if (!verdict.ok) {
    st().setError(verdict.error);
    return false;
  }
  st().recordLine(line, verdict.seed);
  return true;
}

/**
 * Replay a saved session through the real submit path.
 *
 * The saved seed is restored FIRST, before the lines are replayed. The old order restored it last, and
 * with a gate in the path that is a bug waiting: a session saved in configuration 3 would be re-gated
 * in configuration 0, and a line that holds only in the saved drawing would be refused on load — the
 * session silently losing a statement, which is #658's failure mode arriving through the file dialog.
 */
export function hydrateSession(data: unknown): boolean {
  const d = data as SavedSession;
  if (!d || d.app !== 'complex-builder' || !Array.isArray(d.lines)) return false;
  const st = () => useComplexStore.getState();
  st().resetSession();
  st().restoreView({
    freePos: d.freePos ?? {},
    seed: typeof d.seed === 'number' ? d.seed : 0,
    view: d.view === 'polar' ? 'polar' : 'cart',
  });
  for (const line of d.lines) submitLine(String(line));
  st().clearError();
  return true;
}
