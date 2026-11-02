/**
 * SIBLING PHRASINGS (#2654 idea 3, ADR-W-171) — a deterministic generator of the spellings a student
 * might type for a sentence the guide already teaches, and the ratchet that records the ones a builder
 * reads differently.
 *
 * The class rule of docs/17 is "the same wrong outcome in another spelling". Sessions used to find those
 * spellings one at a time and file one issue each. This file finds them mechanically: every catalog
 * sentence of every builder (the BASE) is rewritten by small, meaning-preserving OPERATORS, and each
 * product's test (`sibling-phrasings.test.ts` in `src/`, `src-analytic/`, `src3d/`, `src-complex/`)
 * sends the base and every variant through the product's REAL submit decision — the same function its
 * `geo-input-parity` thin lock drives — on the same figure. A variant whose outcome differs from its
 * base's is a FAILING variant. The known ones are rows of a checked-in list (`sibling-phrasings/
 * known-<builder>.json`); the test fails on a failing variant that is not listed, and on a listed
 * variant that now agrees ("remove it from the list") — the list only shrinks. docs/22 §10a: a failing
 * sibling phrasing is a row of that list, never a new issue.
 *
 * No network, no model: the generator is pure string rewriting, the runners are the deterministic lanes
 * (an `escalate` / `not-handled` is the verdict, the model is never asked — standing rule 2).
 *
 * ## The operators — measured, not imagined
 *
 * Each operator is a spelling real students produce. Measured 2026-11-02 over the 1,102 distinct
 * utterances of the four builders' production event logs (`logs/prod-events-*.jsonl`, 2026-09-24 →
 * 10-25). Candidates with no real occurrence were dropped: a glued prefix «בA» (0), a space after ∠ (0),
 * the prime ′ (0), gershayim/ASCII quotes inside Hebrew (0), the reversed equality «5 = AB» (0).
 * Every operator must preserve meaning; one that does not is a bug in this file, not a finding.
 */

export type Builder = '2d' | 'analytic' | '3d' | 'complex';
export const BUILDERS: readonly Builder[] = ['2d', 'analytic', '3d', 'complex'];

export type OperatorId =
  | 'prefix-space'
  | 'prefix-hyphen-space'
  | 'prefix-maqaf'
  | 'compound-hyphen-space'
  | 'ktiv-haser'
  | 'symbol-spacing'
  | 'perp-glyph'
  | 'degree-sign'
  | 'trailing-period'
  | 'given-lead'
  | 'definite-article'
  | 'rename-letters'
  | 'bidi-marks'
  | 'double-space'
  | 'geresh-prime';

export interface Operator {
  id: OperatorId;
  /** what it rewrites, and the prod count that justifies it (distinct utterances, of 1,102) */
  why: string;
  /** builders it does not apply to, with the reason */
  skip?: readonly Builder[];
  /** the variant of `line`, or null when the operator does not apply (or would not change it) */
  apply: (line: string) => string | null;
}

const HEB = 'א-ת';
/** a one-letter Hebrew prefix standing alone before a Latin name, number or symbol: «ל-AB», «ב-B», «ו-C», «ש-DE» */
const PREFIX_HYPHEN = new RegExp(`(^|[\\s(,])([בלמוש])-(?=[A-Za-z0-9(∠√|])`, 'g');
const changed = (from: string, to: string): string | null => (to === from ? null : to);

const COMPOUNDS = /(ישר|שווה)([- ])(זווית|זוית|שוקיים|צלעות)/g;

/** Nouns a student writes with or without the definite article before a lettered name. */
const NOUNS = [
  'משולש', 'ריבוע', 'מלבן', 'מעוין', 'מקבילית', 'טרפז', 'מרובע', 'דלתון', 'מחומש', 'משושה',
  'נקודה', 'נקודות', 'קטע', 'ישר', 'צלע', 'אלכסון', 'מעגל', 'זווית', 'זוית', 'תיכון', 'גובה', 'מיתר', 'קשת',
  'מישור', 'פירמידה', 'מנסרה', 'תיבה', 'קובייה', 'גליל', 'חרוט', 'כדור',
];
const FEMININE = new Set(['מקבילית', 'נקודה', 'צלע', 'זווית', 'זוית', 'קשת', 'פירמידה', 'מנסרה', 'תיבה', 'קובייה']);
/**
 * The noun that OPENS the sentence, before its lettered name («המשולש ABC», «הנקודה E נמצאת …»). Inside a
 * sentence the article can change the reading: «משולש קהה זווית ABC» is not «קהה הזווית».
 */
const DEFINITE = new RegExp(`^(\\s*)(${NOUNS.join('|')})(?=\\s+[A-Z])`);

/** words that make a sentence a RELATION, not a declaration of an object */
const RELATION = /(^|\s)(ה?(מקביל|מקבילה|מאונך|מאונכת|ניצב|ניצבת|אנך|חותך|חותכת|משיק|משיקה|משיקים|נמצא|נמצאת|נמצאות|גדול|גדולה|קטן|קטנה|היא|הוא|מתלכד|מוכל|מוכלת|ישרה|עובר|עוברת|יוצר|נפגשים|מורידים|מעבירים|שווה|שווים|בין|שבין|לבין))(\s|$)|[=<>⊥⟂∥]/;

/**
 * «נתון / נתונה / נתונים / נתונות», agreeing with the first noun (an exam's lead-in; the parser must not care).
 * Measured: all 35 prod uses open a DECLARATION — a noun, its name, maybe a «ש…» clause or «: equation»
 * («נתונה הנקודה A(2,1)», «נתון מעגל I שמשוואתו …», «נתון הישר l1: y=x») — never a relation («נתון AB ∥ CD»
 * is «נתון כי …» in Hebrew), so a sentence whose head is a relation is not given one.
 */
function givenLead(line: string): string | null {
  const first = line.trim().split(/\s+/)[0].replace(new RegExp(`^ה(?=[${HEB}]{3})`), '');
  if (!NOUNS.includes(first)) return null;
  // the head is what precedes «: equation» or a relative clause that DESCRIBES the object («שמשוואתו …», «שמרכזו …»)
  const head = line.split(/:|\s(?=ש(?:משוואת|מרכז|רדיוס|צלע|אורכ|קודקוד|בסיס|שטח))/)[0];
  if (RELATION.test(head)) return null;
  const verb = first.endsWith('ות') ? 'נתונות' : first.endsWith('ים') ? 'נתונים' : FEMININE.has(first) ? 'נתונה' : 'נתון';
  return `${verb} ${line.trim()}`;
}

/** Toggle the spacing around = ⊥ ⟂ ∥: spaced if the first one is tight, tight if it is spaced (both are common). */
function symbolSpacing(line: string): string | null {
  const sym = /(?<![<>!≤≥=])([=⊥⟂∥])(?!=)/;
  const m = sym.exec(line);
  if (!m) return null;
  const spaced = /\s/.test(line[m.index - 1] ?? '') || /\s/.test(line[m.index + 1] ?? '');
  const all = /\s*(?<![<>!≤≥=])([=⊥⟂∥])(?!=)\s*/g;
  return changed(line, spaced ? line.replace(all, '$1') : line.replace(all, ' $1 ').replace(/^ | $/g, ''));
}

/** An angle's measure with and without the degree sign («∠ABC = 40» / «∠ABC = 40°»). */
function degreeSign(line: string): string | null {
  const angle = /((?:∠|זווית\s+|זוית\s+)[A-Z]{1,3}\s*=\s*)(\d+(?:\.\d+)?)(°?)(?=\s|$|[,;)])/g;
  if (!angle.test(line)) return null;
  return changed(line, line.replace(angle, (_, lhs: string, n: string, deg: string) => `${lhs}${n}${deg ? '' : '°'}`));
}

export const OPERATORS: readonly Operator[] = [
  {
    id: 'prefix-space',
    why: 'a prefix letter before a name with a space instead of a hyphen, «ל AC» for «ל-AC» (23 vs 51 hyphenated, ב/ל/מ/ו)',
    apply: (l) => changed(l, l.replace(PREFIX_HYPHEN, '$1$2 ')),
  },
  {
    id: 'prefix-hyphen-space',
    why: 'hyphen then space, «ל- BG» (2: «מאונך ל- BG», «N ו- P»)',
    apply: (l) => changed(l, l.replace(PREFIX_HYPHEN, '$1$2- ')),
  },
  {
    id: 'prefix-maqaf',
    why: 'the Hebrew maqaf ־ for the hyphen, pasted from a typeset exam (1: «כך ש־AD ⟂ BC»)',
    apply: (l) => changed(l, l.replace(PREFIX_HYPHEN, '$1$2־')),
  },
  {
    id: 'compound-hyphen-space',
    why: '«ישר-זווית» ↔ «ישר זווית», «שווה-שוקיים» ↔ «שווה שוקיים» (29 spaced, 1 hyphenated)',
    apply: (l) => changed(l, l.replace(COMPOUNDS, (_, a: string, sep: string, b: string) => `${a}${sep === '-' ? ' ' : '-'}${b}`)),
  },
  {
    id: 'ktiv-haser',
    why: '«זוית» for «זווית» (24 vs 41)',
    apply: (l) => changed(l, l.replace(/זווית/g, 'זוית').replace(/זוויות/g, 'זויות')),
  },
  {
    id: 'symbol-spacing',
    why: 'spaces around = ⊥ ⟂ ∥ or none (134 spaced, 161 tight)',
    apply: symbolSpacing,
  },
  {
    id: 'perp-glyph',
    why: '⟂ for ⊥ and back (14 vs 3)',
    apply: (l) => changed(l, l.replace(/[⊥⟂]/g, (c) => (c === '⊥' ? '⟂' : '⊥'))),
  },
  {
    id: 'degree-sign',
    why: 'an angle measure with or without ° (5 with, 9 without)',
    skip: ['complex'],
    apply: degreeSign,
  },
  {
    id: 'trailing-period',
    why: 'a sentence closed with a period (10)',
    apply: (l) => (/[.?!:,;]\s*$/.test(l) ? null : `${l.trimEnd()}.`),
  },
  {
    id: 'given-lead',
    why: 'the exam lead-in «נתון/נתונה/נתונים/נתונות» before a noun-first sentence (35, every one noun-first)',
    apply: givenLead,
  },
  {
    id: 'definite-article',
    why: 'the definite article on the noun before a lettered name, «המשולש ABC» (153 with ה, 242 bare)',
    apply: (l) => {
      const m = DEFINITE.exec(l);
      return m ? `${l.slice(0, m.index)}${m[1]}ה${m[2]}${l.slice(m.index + m[0].length)}` : null;
    },
  },
  {
    id: 'rename-letters',
    why: 'other point letters, renamed consistently over the context and the sentence (12 of 60 named polygons in prod are not lettered AB…: MKNL, SENB, DEF)',
    skip: ['complex'], // z, w, u name KINDS of number there (ADR-CX-047), not points
    apply: () => null, // a whole-sequence operator: see `renameSteps`
  },
  {
    id: 'bidi-marks',
    why: 'left-to-right marks around each Latin name, as copied from rendered text (7: «הנקודה ‎P‎ נמצאת על הקטע ‎AB‎»)',
    apply: (l) => changed(l, l.replace(/[A-Z][A-Z0-9'′]*/g, (t) => `‎${t}‎`)),
  },
  {
    id: 'double-space',
    why: 'a doubled space between words (8)',
    apply: (l) => changed(l, l.trim().replace(' ', '  ')),
  },
  {
    id: 'geresh-prime',
    why: 'the Hebrew geresh ׳ as the prime, «A׳» for «A\'» (1)',
    apply: (l) => changed(l, l.replace(/([A-Z])'/g, '$1׳')),
  },
];

// ─── the letter renaming ────────────────────────────────────────────────────────────────────────────

/**
 * Capitals that are not point names: the roman numerals of «מעגל I / II», the radius R of «R = 2r», the
 * area S of «נסמן את שטח ABCD ב-S». Renaming one changes what the sentence says, so it is never renamed.
 */
export const RESERVED: ReadonlySet<string> = new Set(['I', 'R', 'S']);

/** The fixed seed: the generator is deterministic, the renaming target is a function of it. */
export const SEED = 2654;

/**
 * A point-name run: capitals (with digits and primes), not the capital of an English word («Triangle»). A run
 * glued to a coefficient is still a name: «kDC'» is k·DC'.
 */
const NAME_RUN = /[A-Z]+(?:\d+)?(?:['′׳]+)?(?![a-z])/g;

function letterSet(steps: readonly string[], keep: ReadonlySet<string>): string[] {
  const used = new Set<string>();
  for (const s of steps) for (const m of s.matchAll(NAME_RUN)) for (const c of m[0]) if (/[A-Z]/.test(c) && !keep.has(c)) used.add(c);
  return [...used].sort();
}

/**
 * Rename every point letter of the sequence to fresh letters, keeping their order (ABCD → EFGH: a
 * square's vertex order is the same), seeded: `SEED` picks where in the pool the block starts. `keep`
 * are letters with a meaning of their own in that builder (analytic's origin O).
 */
export function renameSteps(steps: readonly string[], keep: ReadonlySet<string> = RESERVED): { steps: string[]; map: Record<string, string> } | null {
  const from = letterSet(steps, keep);
  if (from.length === 0) return null;
  const allUsed = new Set(steps.join(' ').match(/[A-Z]/g) ?? []);
  const pool = [...'ABCDEFGHJKLMNPQRSTUVW'].filter((c) => !allUsed.has(c) && !keep.has(c));
  if (pool.length < from.length) return null;
  const start = SEED % (pool.length - from.length + 1);
  const target = pool.slice(start, start + from.length);
  const map: Record<string, string> = {};
  from.forEach((c, i) => (map[c] = target[i]));
  const rename = (s: string) => s.replace(NAME_RUN, (run) => [...run].map((c) => map[c] ?? c).join(''));
  return { steps: steps.map(rename), map };
}

/**
 * Name every capital by its order of first appearance — a fingerprint with its letters made anonymous.
 * A renamed sequence is compared this way: the letters the builder CHOSE (a tangent point, an auto-named
 * centre) are the next free ones, which a renaming moves too, and no map can predict them.
 */
export function anonymise(text: string): string {
  // A canonical id spells its letters sorted («seg-CO»); a renaming that keeps a reserved letter (analytic's O)
  // can move a letter across it. So the order is read OUTSIDE the ids first, and an id's letters are a set.
  const order = new Map<string, number>();
  const see = (s: string) => {
    for (const c of s.match(/(?<![a-z])[A-Z]/g) ?? []) if (!order.has(c)) order.set(c, order.size);
  };
  see(text.replace(/-[A-Z]{2,}/g, '-'));
  see(text);
  const named = text.replace(/(?<![a-z])[A-Z]/g, (c) => `⟨${order.get(c)}⟩`);
  return named.replace(/-((?:⟨\d+⟩){2,})/g, (_, run: string) => `-${(run.match(/⟨\d+⟩/g) ?? []).sort().join('')}`);
}

/** Undo a renaming inside a structural fingerprint: only capitals that do not continue a lowerCamel word. */
export function unrename(text: string, map: Readonly<Record<string, string>>): string {
  const inv: Record<string, string> = {};
  for (const [k, v] of Object.entries(map)) inv[v] = k;
  return text.replace(/(?<![a-z])[A-Z]/g, (c) => inv[c] ?? c);
}

// ─── bases, variants, outcomes ──────────────────────────────────────────────────────────────────────

/** One sentence under test: the figure it is typed on (context), then the sentence. */
export interface Base {
  builder: Builder;
  context: readonly string[];
  sentence: string;
}

export interface Variant {
  operator: OperatorId;
  /** the context the variant is typed on — the base's, except for a renaming */
  context: readonly string[];
  sentence: string;
  map?: Record<string, string>;
}

/** Every sibling of one base, at most one per operator, never the base itself. */
export function variantsOf(base: Base, keep: ReadonlySet<string> = RESERVED): Variant[] {
  const out: Variant[] = [];
  for (const op of OPERATORS) {
    if (op.skip?.includes(base.builder)) continue;
    if (op.id === 'rename-letters') {
      const r = renameSteps([...base.context, base.sentence], keep);
      if (r) out.push({ operator: op.id, context: r.steps.slice(0, -1), sentence: r.steps[r.steps.length - 1], map: r.map });
      continue;
    }
    const v = op.apply(base.sentence);
    if (v !== null && v !== base.sentence) out.push({ operator: op.id, context: base.context, sentence: v });
  }
  return out;
}

/**
 * What a builder's real decision did with one line, typed on a figure: the verdict, the product's own
 * code, and `shape` — a structural fingerprint of what it would build (commands / facts), empty where
 * the builder's decision does not expose one.
 */
export interface Outcome {
  verdict: string;
  code?: string;
  shape?: string;
}

/**
 * Type `context` on an empty canvas (accepting each line as the app does), then DECIDE each of `lines`
 * against that figure without recording it. `null` when the context itself does not build.
 */
export type DecideRunner = (context: readonly string[], lines: readonly string[]) => Promise<readonly Outcome[] | null> | readonly Outcome[] | null;

const TEXT_KEYS = new Set(['src', 'utterance', 'raw', 'line', 'text']);

/** A JSON fingerprint with the keys that carry the typed text (never structure) removed. */
export function fingerprint(value: unknown): string {
  // a string's spacing and direction marks are spelling, never structure («y=x» / «y = x» is one line)
  // and an id DERIVED from the typed text (analytic's anonymous `curve-anon<hash>`) is a spelling too
  return JSON.stringify(value, (k, v) =>
    typeof v !== 'string' ? v : TEXT_KEYS.has(k) ? undefined : v.replace(/[\s‎‏⁦-⁩]/g, '').replace(/anon[a-z0-9]+/g, 'anon'),
  );
}

const show = (o: Outcome) => `${o.verdict}${o.code ? ` (${o.code})` : ''}`;

/** How the variant's outcome differs from its base's, or null when it agrees. */
export function difference(base: Outcome, variant: Outcome, map?: Record<string, string>): string | null {
  const back = (s: string | undefined) => (s === undefined || !map ? s : unrename(s, map));
  const code = back(variant.code);
  if (base.verdict !== variant.verdict || base.code !== code) return `${show(base)} → ${show({ ...variant, code })}`;
  const same = map ? anonymise(base.shape ?? '') === anonymise(variant.shape ?? '') : (base.shape ?? '') === (variant.shape ?? '');
  if (!same) return `${show(base)}, but a different construction`;
  return null;
}

/** One failing variant: a row of the known list. */
export interface FailingVariant {
  builder: Builder;
  base: string;
  variant: string;
  operator: OperatorId;
  differs: string;
}

export interface SweepReport {
  bases: number;
  /** bases whose context did not build on this figure (not tested) */
  skipped: string[];
  variants: Partial<Record<OperatorId, number>>;
  failing: FailingVariant[];
}

/** Run every variant of every base and collect the failing ones. */
export async function sweep(builder: Builder, bases: readonly Base[], run: DecideRunner, keep: ReadonlySet<string> = RESERVED): Promise<SweepReport> {
  const report: SweepReport = { bases: 0, skipped: [], variants: {}, failing: [] };
  for (const base of bases) {
    const vars = variantsOf(base, keep);
    if (vars.length === 0) {
      report.bases++;
      continue;
    }
    const plain = vars.filter((v) => !v.map);
    const got = await run(base.context, [base.sentence, ...plain.map((v) => v.sentence)]);
    if (!got) {
      report.skipped.push(base.sentence);
      continue;
    }
    report.bases++;
    const outcomes = new Map<Variant, Outcome>(plain.map((v, i) => [v, got[i + 1]]));
    for (const v of vars.filter((x) => x.map)) {
      const r = await run(v.context, [v.sentence]);
      outcomes.set(v, r ? r[0] : { verdict: 'context-broken' });
    }
    for (const v of vars) {
      report.variants[v.operator] = (report.variants[v.operator] ?? 0) + 1;
      const d = difference(got[0], outcomes.get(v)!, v.map);
      if (d) report.failing.push({ builder, base: base.sentence, variant: v.sentence, operator: v.operator, differs: d });
    }
  }
  return report;
}

const keyOf = (r: Pick<FailingVariant, 'builder' | 'base' | 'operator'>) => `${r.builder} | ${r.base} | ${r.operator}`;

/**
 * THE RATCHET — the list only shrinks. A failing variant that is not listed is a fault (fix the parser,
 * or — if the variation is real and the fix is not this session's — add the row); a listed variant that
 * now agrees is a fault too (remove its row).
 */
export function ratchetFaults(found: readonly FailingVariant[], known: readonly FailingVariant[]): string[] {
  const faults: string[] = [];
  const foundKeys = new Map(found.map((f) => [keyOf(f), f]));
  const knownKeys = new Set(known.map(keyOf));
  for (const f of found) {
    if (!knownKeys.has(keyOf(f))) faults.push(`NEW failing sibling phrasing [${f.operator}] «${f.base}» → «${f.variant}»: ${f.differs}`);
  }
  for (const k of known) {
    if (!foundKeys.has(keyOf(k))) faults.push(`[${k.operator}] «${k.base}» → «${k.variant}» agrees with its base now — remove it from known-${k.builder}.json`);
  }
  return faults;
}

/** Choose, for every catalog sentence, the first parity-row context it is typed in (or none). */
export function basesFrom(
  builder: Builder,
  sentences: readonly string[],
  contexts: readonly (readonly string[])[],
): Base[] {
  const seen = new Set<string>();
  const out: Base[] = [];
  for (const sentence of sentences) {
    if (seen.has(sentence)) continue;
    seen.add(sentence);
    let context: readonly string[] = [];
    for (const steps of contexts) {
      const i = steps.indexOf(sentence);
      if (i >= 0) {
        context = steps.slice(0, i);
        break;
      }
    }
    out.push({ builder, context, sentence });
  }
  return out;
}

/** Counts for the report: failing variants per operator. */
export function failingByOperator(failing: readonly FailingVariant[]): Partial<Record<OperatorId, number>> {
  const out: Partial<Record<OperatorId, number>> = {};
  for (const f of failing) out[f.operator] = (out[f.operator] ?? 0) + 1;
  return out;
}
