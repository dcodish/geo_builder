/**
 * LABEL ACCOUNTING — the label pass of the span accountant, as a module the parser can call too
 * (#1795, [ADR-597](../../docs/06-decisions.md#adr-597)).
 *
 * Every point letter the student wrote must be ACCOUNTED for by the commands a parse lowers to: either
 * a command carries it, or it is CONTEXT the lowering refers to. This module is that question, once.
 * `spanAccounting.ts` asks it for the enforcing verdict at both commit seams, and `parseResolved` asks
 * it so a whole-line rule that read only a prefix routes to the clause split instead of committing
 * (the ADR-264 Am. 1 guard family). It lives apart from both because `spanAccounting.ts` imports from
 * `parse.ts`, so `parse.ts` could not import the accountant back.
 *
 * THE EXEMPTION, NARROWED (#1795). Until now an EXISTING label was context unconditionally — "a
 * tangent at an existing point" was the stated reason, but nothing checked that the lowering referred
 * to the label at all. So a clause about points that already exist («… עובר דרך C», «… ו-D על BC»,
 * «B מתחת ל-AC») was invisible to the only total mechanism the gate family has, and ~twenty whole-line
 * rules dropped such a clause green. An existing label is now context only when the lowering REFERS to
 * it:
 *  1. a command carries it (as before — the plain "accounted" case);
 *  2. it is a member or the centre of a CIRCLE the commands reference (`circle-X` / its centre id):
 *     «AD קוטר במעגל ABCD» names the circle by its points, and the lowering references the circle;
 *  3. it NAMES a circle («במעגל O», "circle O") and the lowering touches a circle;
 *  4. it is a vertex of an existing POLYGON the sentence names with its noun («במשולש ABC»), when the
 *     commands carry at least one of that polygon's vertices — a definite reference to the shape;
 *  5. it names the circle of a sentence-opening LOCATIVE («במעגל O, המיתר AC …») and the figure already
 *     holds what the scene says — at least two existing points carried, all on that circle (#1678, ADR-601).
 * A bound radius symbol or angle alias stays masked as notation, exactly as before.
 *
 * Widening this closure is the sanctioned direction when a real reference is found un-exempted
 * (objects referenced → their defining points). Re-widening the EXEMPTION is not.
 */
import type { AnyCommand } from '@/engine';

/** Latin unit tokens — never a run of point labels. */
export const UNIT_WORDS: ReadonlySet<string> = new Set(['cm', 'mm']);
/**
 * #1698 (ADR-566): Latin NOTATION words that are never a run of point labels — the units above and the
 * trigonometric function names `trigGiven` reads («נתון: tan∢ABC = 2» is not the points T, A, N). One
 * list, read by every gate that asks which labels a text states (the parser's and the span accountant's).
 */
export const NOTATION_WORDS: ReadonlySet<string> = new Set([...UNIT_WORDS, 'tan', 'tg', 'ctg', 'cotg', 'cot', 'sin', 'cos']);

/** The figure context label accounting takes its exemptions from — a structural subset of `ParseContext`. */
export interface LabelAccountCtx {
  /** Labels already ON the figure. Context only when the lowering refers to them (see the header). */
  existingPoints?: string[];
  /** Bound radius-symbol letters (R/r, #54) — measure names, not points. */
  radiusSymbols?: string[];
  /** Bound angle-alias names (ADR-386, «נסמן זוית BAM כ-A1») — notation, not points. */
  angleAliases?: string[];
  /** Per circle object, the points known to lie on it (`ParseContext.circleMembers`). */
  circleMembers?: { id?: string; center: string; points: string[] }[];
  /** Vertex lists of the polygons already in the figure (`ParseContext.polygons`). */
  polygons?: string[][];
}

/** The polygon nouns a sentence names a shape with («במשולש ABC») — rule 4's scene nouns. */
const POLY_NOUNS = 'משולש|מרובע|ריבוע|מלבן|מעוין|מעויין|טרפז|דלתון|מקבילית|מחומש|משושה|triangle|quadrilateral|square|rectangle|rhombus|trapezoid|kite|parallelogram|pentagon|hexagon';
const CIRCLE_NOUNS = 'מעגל|circle';
const POLY_NOUN_RUN = new RegExp(`(?:${POLY_NOUNS})\\s+((?:[A-Z]\\d*\\s*){3,})`, 'gi');
const CIRCLE_NAME = new RegExp(`(?:${CIRCLE_NOUNS})\\s+([A-Z]\\d*)(?![A-Za-z\\d])`, 'gi');
const SCENE_NOUN_BEFORE = new RegExp(`(?:${POLY_NOUNS}|${CIRCLE_NOUNS})\\s*$`, 'i');

/**
 * #1888 (ADR-603): does the text END with a scene noun — a polygon or circle noun, glued prefixes allowed
 * («במשולש », «המעגל »)? The label run right after one NAMES the scene the statement lives in; it is
 * context, read through rules 2–4 below, never a given of its own. The same nouns rules 3 and 4 read.
 */
export const endsWithSceneNoun = (textBefore: string): boolean => SCENE_NOUN_BEFORE.test(textBefore);
/** A sentence-opening locative that names its circle — «במעגל O …», "in (the) circle O …" (rule 5). */
const LOCATIVE_CIRCLE_NAME = /^\s*(?:ב(?:ה)?מעגל|[Ii]n\s+(?:the\s+|a\s+)?circle)\s+([A-Z]\d*)(?![A-Za-z\d])/;

/** Every string VALUE of the commands (field names and `type` excluded — the "TYPE contains E" trap). */
function commandStrings(commands: AnyCommand[]): string[] {
  const out: string[] = [];
  const collect = (v: unknown): void => {
    if (typeof v === 'string') out.push(v);
    else if (Array.isArray(v)) v.forEach(collect);
    else if (v && typeof v === 'object') Object.entries(v).forEach(([k, x]) => k !== 'type' && collect(x));
  };
  commands.forEach(collect);
  return out;
}

/**
 * The labels the commands CARRY. Case-sensitive over values: an id like 'seg-AB' contributes A,B (its
 * lowercase machine prefix contributes nothing). #779: a WHOLE value that is one label token claims its
 * canonical form case-blind — the bound radius symbol `name: "r"` accounts a lowercase-stated «r».
 */
export function carriedLabels(commands: AnyCommand[]): Set<string> {
  const strVals = commandStrings(commands);
  const labels = new Set(strVals.flatMap((v) => v.match(/[A-Z]\d*/g) ?? []));
  for (const v of strVals) if (/^[A-Za-z]\d*$/.test(v)) labels.add(v.toUpperCase());
  return labels;
}

/**
 * The existing labels the lowering REFERS to without carrying them (rules 2–4 of the header). Pure over
 * the normalized text, the commands and the figure context; the result is used only to exempt a label
 * that is ALSO on the figure.
 */
export function referencedContextLabels(s: string, commands: AnyCommand[], actx: LabelAccountCtx): Set<string> {
  const out = new Set<string>();
  const vals = new Set(commandStrings(commands));
  const carried = carriedLabels(commands);
  const centreLetter = (c: string) => c.replace(/^@ctr-/, '').toUpperCase();
  // 2 — a referenced circle brings its members and its centre.
  for (const e of actx.circleMembers ?? []) {
    const id = e.id ?? `circle-${centreLetter(e.center)}`;
    if (!vals.has(id) && !vals.has(e.center)) continue;
    for (const p of e.points) out.add(p.toUpperCase());
    out.add(centreLetter(e.center));
  }
  // 3 — a circle NAME, when the lowering touches a circle at all.
  const touchesCircle = commands.some((c) => /circle|inscribe|tangent|chord|arc|diameter/i.test(c.type)) || [...vals].some((v) => /^circle-|^@ctr-/.test(v));
  if (touchesCircle) for (const m of s.matchAll(CIRCLE_NAME)) out.add(m[1].toUpperCase());
  // 5 — #1678 (ADR-601): a sentence-opening LOCATIVE circle («במעגל O, המיתר AC חותך את המיתר BD …» / "in
  // circle O, …") is the scene the statement lives in, and it says one thing: the points the statement is about
  // lie on that circle. The lowering refers to it exactly when that already holds — at least two existing
  // points carried, every one a member of the named circle. A carried point OFF the circle keeps the label
  // unaccounted (the scene states a membership the lowering does not carry — never dropped green).
  const loc = s.match(LOCATIVE_CIRCLE_NAME);
  if (loc) {
    const x = loc[1].toUpperCase();
    const circle = (actx.circleMembers ?? []).find((e) => (e.id ?? `circle-${centreLetter(e.center)}`) === `circle-${x}` || centreLetter(e.center) === x);
    const existing = new Set((actx.existingPoints ?? []).map((p) => p.toUpperCase()));
    const members = new Set((circle?.points ?? []).map((p) => p.toUpperCase()));
    const about = [...carried].filter((p) => existing.has(p) && p !== x);
    if (circle && about.length >= 2 && about.every((p) => members.has(p))) out.add(x);
  }
  // 4 — a polygon named by its noun, when it is an EXISTING polygon and the lowering touches it. #1888 (ADR-603):
  // a TRIANGLE whose three vertices all exist is one too, declared or not — three points always span a triangle,
  // so «EF קטע אמצעים במשולש DCA» names its scene by its existing corners (the sanctioned direction above).
  const polys = (actx.polygons ?? []).map((v) => new Set(v.map((x) => x.toUpperCase())));
  const existingPts = new Set((actx.existingPoints ?? []).map((p) => p.toUpperCase()));
  for (const m of s.matchAll(POLY_NOUN_RUN)) {
    const run = (m[1].match(/[A-Z]\d*/g) ?? []).map((x) => x.toUpperCase());
    const ring = polys.find((p) => p.size === run.length && run.every((x) => p.has(x)));
    const spanned = run.length === 3 && new Set(run).size === 3 && run.every((x) => existingPts.has(x));
    if ((ring || spanned) && run.some((x) => carried.has(x))) for (const x of run) out.add(x);
  }
  return out;
}

/**
 * The label pass: every stated label run (uppercase runs everywhere; in HEBREW text also a standalone
 * lowercase Latin run, #779) must be carried, masked as notation, or referenced context. Returns the
 * unaccounted labels in order of appearance, plus the lowercase runs read as label words (the word pass
 * of the span accountant skips those). `s` must already be normalized (`normalizeUtterance`).
 */
export function unaccountedLabels(
  s: string,
  commands: AnyCommand[],
  actx: LabelAccountCtx = {},
  opts: {
    /** the RAW utterance, when the caller has it — «S_{ABC}» is recognised before normalization glues it */
    raw?: string;
    /** read a standalone lowercase Latin run in Hebrew text as labels (#779). The commit seams do; the
     *  parser's routing guard does not — there «is» / «x» in «זווית ABC is x» are words and symbols. */
    lowercaseRuns?: boolean;
  } = {},
): { labels: string[]; labelWords: Set<string> } {
  const raw = opts.raw ?? s;
  const carried = carriedLabels(commands);
  // The AREA MARKER S is notation, not a point (the ADR-121/236 class): in the normalized glued «SABC»
  // the leading S names the measure — mask it exactly like the honesty gates do.
  const areaMarker = /(?<![A-Za-z])S(?=[A-Z]{3,4}(?![A-Z]))/.test(s) || /S_/.test(raw);
  const existing = new Set((actx.existingPoints ?? []).map((x) => x.toUpperCase()));
  const symbols = new Set([...(actx.radiusSymbols ?? []), ...(actx.angleAliases ?? [])]);
  // #779: symbol masks compare case-blind — a bound «r» masks the canonical R.
  const symbolsUpper = new Set([...symbols].map((x) => x.toUpperCase()));
  let context: Set<string> | null = null; // computed lazily: most utterances never need it
  const labels: string[] = [];
  const account = (label: string): void => {
    if (label === 'S' && areaMarker) return;
    if (symbols.has(label) || symbolsUpper.has(label)) return;
    if (carried.has(label)) return;
    if (existing.has(label)) {
      context ??= referencedContextLabels(s, commands, actx);
      if (context.has(label)) return;
    }
    labels.push(label);
  };
  for (const run of s.match(/(?:[A-Z]\d*)+/g) ?? []) for (const label of run.match(/[A-Z]\d*/g) ?? []) account(label);
  // #779: in HEBREW text a standalone Latin run is notation regardless of case — the parser's own
  // captures accept lowercase. Latin-only text keeps the uppercase-only read. Unit/trig tokens excluded.
  const labelWords = new Set<string>();
  if (opts.lowercaseRuns !== false && /[א-ת]/.test(s)) {
    for (const run of s.match(/(?<![A-Za-z\d])(?=[A-Za-z]*[a-z])[A-Za-z][A-Za-z\d]*(?![A-Za-z\d])/g) ?? []) {
      if (NOTATION_WORDS.has(run.toLowerCase())) continue;
      labelWords.add(run.toLowerCase());
      for (const label of run.toUpperCase().match(/[A-Z]\d*/g) ?? []) account(label);
    }
  }
  return { labels, labelWords };
}
