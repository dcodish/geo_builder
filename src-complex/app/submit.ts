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

import { readEnvelope, type LoadAudit } from '../../shell/save';
import { parseLineV2 } from '../parser/rules';
import type { Derived2 } from '../replay/derive2';
import { type InputError, type SavedSession, useComplexStore } from '../store/useComplexStore';
import { deriveLines } from './deriveLines';

/** This product's save-file envelope (shell/save): the marker `serialize()` writes, and the
 *  highest `SavedSession.version` this build can read. */
export const COMPLEX_SESSION = { app: 'complex-builder', maxVersion: 1 } as const;

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
  /**
   * Lines the FOLD could not use, by their own text.
   *
   * `submitLine` already refuses what the grammar cannot read, so this catches only what parses and
   * still has no reading in context — today, a reference to a letter an enumerating equation has
   * reserved (`z = 1+i` after `z³ = 8`, which the prototype refuses by naming that equation). Left out
   * of the gate, such a line would sit red in the list while the figure drew a phantom for it.
   */
  readonly untranslated: ReadonlySet<string>;
}

const violationsOf = (d: Derived2): Violations => ({
  contradicted: d.contradiction !== null,
  emptied: d.emptiedBy !== null,
  unsatisfied: new Set(d.unsatisfied),
  untranslated: new Set(d.untranslated.map((u) => u.src)),
});

/** Did going from `before` to `after` break something that was not already broken? */
const broke = (before: Violations, after: Violations): boolean =>
  (after.contradicted && !before.contradicted) ||
  (after.emptied && !before.emptied) ||
  [...after.unsatisfied].some((u) => !before.unsatisfied.has(u)) ||
  [...after.untranslated].some((u) => !before.untranslated.has(u));

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

/** The ACTIVE lines — what the figure is folded from: every line not currently disabled (B5/D6:
 *  a muted statement stays in the list, out of the figure). */
const activeOf = (lines: readonly string[], disabled: readonly number[]): string[] =>
  lines.filter((_, i) => !disabled.includes(i));

export const activeLines = (): string[] => {
  const { lines, disabled } = useComplexStore.getState();
  return activeOf(lines, disabled);
};

/**
 * Would replacing the ACTIVE list `before` with `after` break something? — the shared gate core
 * of toggle-on and edit (B5). Same doctrine as acceptLine: config-search first (a change often
 * holds in another drawing of the same figure), then the differential blame — which ACTIVE line,
 * removed, lets the change stand — so the refusal names a statement, never internal state.
 */
function gateChange(
  before: readonly string[],
  after: readonly string[],
  seed: number,
  changed: string,
): Verdict {
  const was = violationsOf(fold(before, seed));
  for (let ds = 0; ds < CONFIG_TRIES; ds++) {
    if (!broke(was, violationsOf(fold(after, seed + ds)))) return { ok: true, seed: seed + ds };
  }
  for (const candidate of before) {
    if (candidate === changed) continue;
    const b2 = violationsOf(fold(before.filter((l) => l !== candidate), seed));
    const a2 = violationsOf(fold(after.filter((l) => l !== candidate), seed));
    if (!broke(b2, a2)) return { ok: false, error: { key: 'incompatible', detail: candidate } };
  }
  return { ok: false, error: { key: 'impossible', detail: changed } };
}

/**
 * Toggle a line's enabled state (B5/D6). DISABLING is always allowed — muting a statement cannot
 * break the figure, only relax it. RE-ENABLING faces the gate: the restored line returns AT ITS
 * POSITION (order is meaningful), and if the figure it re-enters cannot hold it, the toggle is
 * refused naming the conflicting statement — the row stays muted rather than lying.
 */
export function toggleLine(index: number): boolean {
  const st = () => useComplexStore.getState();
  const { lines, disabled, seed } = st();
  if (index < 0 || index >= lines.length) return false;
  if (!disabled.includes(index)) {
    st().setDisabledIdx([...disabled, index]);
    st().clearError();
    return true;
  }
  const nextDisabled = disabled.filter((d) => d !== index);
  const verdict = gateChange(
    activeOf(lines, disabled),
    activeOf(lines, nextDisabled),
    seed,
    lines[index],
  );
  if (!verdict.ok) {
    st().setError(verdict.error);
    return false;
  }
  // no append — the line already exists; adopt the configuration the gate found for it
  st().setDisabledIdx(nextDisabled);
  useComplexStore.setState({ seed: verdict.seed, lastError: null });
  return true;
}

/**
 * Edit a line IN PLACE (B5/D6): the statement keeps its position. The new text re-parses and —
 * when the line is enabled — faces the gate exactly like a typed line; a refused edit changes
 * nothing and names the refusal. Editing a MUTED line only rewrites its text: it gates when it
 * is re-enabled, which is the moment it would touch the figure.
 */
export function editLine(index: number, raw: string): boolean {
  const st = () => useComplexStore.getState();
  const { lines, disabled, seed } = st();
  const line = raw.trim();
  if (index < 0 || index >= lines.length || line === '') return false;
  const parsed = parseLineV2(line);
  if (!parsed.ok) {
    st().setError(
      parsed.reason === 'unaccounted'
        ? { key: 'unaccounted', detail: parsed.items.join(', ') }
        : { key: 'not-handled', detail: line },
    );
    return false;
  }
  if (disabled.includes(index)) {
    st().replaceLine(index, line, seed);
    return true;
  }
  const trial = lines.map((l, i) => (i === index ? line : l));
  const verdict = gateChange(activeOf(lines, disabled), activeOf(trial, disabled), seed, line);
  if (!verdict.ok) {
    st().setError(verdict.error);
    return false;
  }
  st().replaceLine(index, line, verdict.seed);
  return true;
}

/**
 * How one line READS as a question (#789, the ADR-3D-057 doctrine arriving here).
 *
 * A PURE ask parses and yields ONLY query artifacts — it states nothing and constrains nothing.
 * Anything it states makes it a GIVEN ('statement'), and a line the grammar cannot read at all is
 * 'unreadable'. `declares` is deliberately NOT counted: the query rules declare their mentioned
 * points as span bookkeeping, and the lane does not enact them — a question never creates a point
 * (the ADR-3D-057 doctrine); a name a question mentions must exist from the givens, or the row
 * honestly reads "not determined".
 */
export type AskReading =
  | { readonly kind: 'measure' | 'ratio' | 'expr' }
  | { readonly kind: 'statement' }
  | { readonly kind: 'unreadable' };

export function readAsk(raw: string): AskReading {
  const parsed = parseLineV2(raw.trim());
  if (!parsed.ok) return { kind: 'unreadable' };
  const l = parsed.line;
  const askCount = l.queries.length + l.ratios.length + l.exprQueries.length;
  const states =
    l.constraints.length + l.filters.length + l.assertions.length +
    l.objects.length + l.measures.length + l.sequences.length + l.roots.length;
  if (askCount === 0 || states > 0) return { kind: 'statement' };
  return { kind: l.queries.length ? 'measure' : l.ratios.length ? 'ratio' : 'expr' };
}

/**
 * The ask box's entry point: any text lands in the lane (the 3-D posture — `addQuery` has no
 * gate); the panel row explains itself, answered or not. The store dedupes repeats.
 */
export function submitQuery(raw: string): boolean {
  const q = raw.trim();
  if (q === '') return false;
  useComplexStore.getState().addQuery(q);
  return true;
}

/**
 * THE ONE ENTRY POINT the input box uses.
 *
 * It routed between two engines until the cutover deleted the second
 * ([ADR-CX-027](../../docs/06d-decisions-complex.md#adr-cx-027)). One path in is not a tidy-up: a
 * capability reachable from only one of two entry points is invisible to tests aimed at the other,
 * which is how #680 shipped and how #686 stayed green describing it.
 */
export function submitLine(raw: string): boolean {
  const st = () => useComplexStore.getState();
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

  /**
   * #789 — a QUESTION typed in the givens box is routed to the ask lane, never recorded as a fact.
   * One entry point stays true: every utterance the student can type still works here — what moved
   * is where a question LIVES. This routing is also the load-path migration: old save files carry
   * ask lines in `lines`, and replaying them through this very function files them in the lane.
   */
  const ask = readAsk(line).kind;
  if (ask === 'measure' || ask === 'ratio' || ask === 'expr') {
    st().addQuery(line);
    st().clearError();
    return true;
  }

  // the gate reads the ACTIVE figure — a muted line must not veto a new statement (B5)
  const verdict = acceptLine(activeLines(), line, st().seed);
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
 *
 * The envelope is validated BEFORE anything is touched (shell/save: a foreign or future file refuses
 * without resetting the open session), and the replay keeps a LOAD AUDIT (ADR-242, the rule this tree
 * shipped without): a line the grammar no longer reads or the gate now refuses is REPORTED with its
 * reason, never silently dropped — before this, `clearError()` erased even the last line's evidence.
 * The boolean answers only "was this a loadable session"; partial restores return true WITH an audit.
 */
export function hydrateSession(data: unknown): boolean {
  const env = readEnvelope(data, COMPLEX_SESSION);
  if (!env.ok) return false;
  const d = env.data as unknown as SavedSession;
  if (!Array.isArray(d.lines)) return false;
  const st = () => useComplexStore.getState();
  st().resetSession();
  st().restoreView({
    freePos: d.freePos ?? {},
    seed: typeof d.seed === 'number' ? d.seed : 0,
    view: d.view === 'polar' ? 'polar' : 'cart',
    ...(typeof d.name === 'string' ? { name: d.name } : {}),
  });
  const savedDisabled = new Set(Array.isArray(d.disabled) ? d.disabled : []);
  const failed: LoadAudit<InputError>['failed'] = [];
  d.lines.forEach((raw, i) => {
    const line = String(raw);
    // a MUTED saved line re-enters muted, ungated — it gates when re-enabled, which is the
    // moment it would touch the figure (B5). #789: unless it is a QUESTION — a question has no
    // mute in the lane model, so a muted saved ask migrates like an enabled one.
    if (savedDisabled.has(i)) {
      const kind = readAsk(line).kind;
      if (kind === 'measure' || kind === 'ratio' || kind === 'expr') st().addQuery(line);
      else st().recordDisabledLine(line);
      return;
    }
    if (!submitLine(line))
      failed.push({ line, reason: st().lastError ?? { key: 'not-handled', detail: line } });
  });
  // #789 — the lane's own saved field (files written by this version onward); lenient like 3-D:
  // keep well-formed entries, ignore anything else
  if (Array.isArray(d.queries)) {
    for (const q of d.queries) if (typeof q === 'string') st().addQuery(q);
  }
  st().clearError();
  st().setLoadAudit(failed.length > 0 ? { total: d.lines.length, failed } : null);
  return true;
}
