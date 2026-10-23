/**
 * #1995 stage 5 ([ADR-W-154](../../../docs/06w-decisions-workspace.md#adr-w-154)) — THE REFUSAL-STYLE RATCHET, the
 * shared half of the four-builder lock on the one-next-step rule.
 *
 * The operator's rule (2026-10-13, card 18 B; widened 2026-10-15 to every NEW refusal and status sentence): *"Name the
 * student's statement and give one next step, or say plainly there is none."* Nothing enforced it, so each refusal
 * was reviewed only when someone happened to read it. This lock checks the half a machine can check, on the text AS
 * THE STUDENT SEES IT (each tree renders its rows through its own real renderer — 2-D's `explainError` appends the
 * retry hint):
 *   (a) no row carries an internal id or an engine word, and no Latin word outside the measured token allowlist;
 *   (b) every row gives a next step (`hasNextStep`) or says plainly there is none (`saysNone`) — or is on the
 *       reasoned baseline (`refusal-style-baseline.json`), which only shrinks;
 *   (c) a baseline entry whose row now passes fails ("remove it from the baseline");
 *   (d) a baseline entry with no row fails as stale;
 *   (e) non-vacuity: > 20 rows per product, and the `queued` count never exceeds the file's cap.
 * The STATEMENT half of the rule ("names the student's statement") is not decidable from text — a `{{id}}` the
 * student typed is fine and one the engine picked is not (#1994) — and stays a review judgment.
 *
 * The heuristic is Hebrew-morphology regex, measured at 99358597 (98.6% precise over the 688 refusal/status strings
 * of 050c04a9; every measured false pass is pinned in `refusal-style-meta.test.ts`). It is good enough to GATE, not to
 * judge: every miss goes on the baseline with its reason.
 *
 * The ASSERTIONS live here and the ROWS in each tree, because `shell/` may never import a product tree (ADR-W-016
 * rule 2): 2-D `src/i18n/__tests__/refusal-style.test.ts`; 3-D, analytic and complex reuse their
 * `__tests__/message-floor-2028.test.ts` payload tables (compile-time total over each typed error union). Test-only.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { lowerTheBaseline, REPO_ROOT, UPDATE_BASELINE } from './ts-literals';

// ─── the heuristic ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * A plural imperative from the measured list, word-bounded, with an optional ו־ prefix. Singular imperatives
 * (בחר, הגדר …) are excluded on purpose: they matched analytic past-tense sentences («שהכלי בחר»).
 */
const IMPERATIVES = [
  'רעננו', 'בקשו', 'התייחסו', 'שאלו', 'ספרו', 'שרטטו', 'נסו', 'כתבו', 'הוסיפו', 'בדקו', 'הגדירו', 'ציינו', 'תנו',
  'השתמשו', 'מחקו', 'הסירו', 'בחרו', 'שנו', 'פרקו', 'נסחו', 'הקלידו', 'לחצו', 'סמנו', 'קבעו', 'בנו', 'המשיכו',
  'עדכנו', 'ערכו', 'החליפו', 'הזינו', 'תארו', 'הורידו', 'צרו', 'פתחו', 'שמרו', 'תקנו', 'העבירו', 'קראו', 'חזרו',
  'ודאו', 'פצלו', 'רשמו', 'הפרידו', 'אמרו', 'השמיטו', 'החסירו', 'כנו', 'קרבו', 'הגדילו', 'הקטינו', 'הפכו',
  'השאירו', 'לכו', 'עברו', 'הציגו',
];
const B = '[\\s«"(—\\-:,.!?]';
const IMPERATIVE = new RegExp(`(^|${B})ו?(${IMPERATIVES.join('|')})(?=${B}|$)`);
/** A modal remedy, not negated: «אפשר ל…», «ניתן ל…», «יש ל…», «כדאי ל…», «במקום», «התכוונתם ל…». */
const MODAL = /((?<!לא |אי )(אפשר ל[א-ת]{2,}|ניתן ל[א-ת]{2,})|יש ל[א-ת]{3,}|כדאי ל|במקום|אם התכוונתם|התכוונתם ל|האם התכוונתם)/;
/** A worked example. */
const EXAMPLE = /(למשל|לדוגמה|כגון)/;
/** A taught form after «כדי לומר …:» (2-D `input.arcCopula`): the remedy is the quoted form itself. */
const TAUGHT_FORM = /כדי ל[א-ת]+[^:]*:\s*«/;
/** Says plainly there is no remedy: the tool's limit. */
const NONE = /(מגבלה של הכלי|עדיין לא נתמך|אינו נתמך|לא נתמך|אין מה ל|הכלי עדיין לא|הכלי אינו|בפיתוח|לא ייפתח|נשמרו כפי שהם)/;

export const hasNextStep = (he: string): boolean => IMPERATIVE.test(he) || MODAL.test(he) || EXAMPLE.test(he) || TAUGHT_FORM.test(he);
export const saysNone = (he: string): boolean => NONE.test(he);

/** A Latin word of 4+ letters a Hebrew sentence may carry: a point-name run, a key, a format, the cross-app URL. */
const LATIN_OK = /^([A-Z]+|Enter|Shift|English|LaTeX|triangle|json|docx|png|arcsin|arccos|arctan|https?|www|themathbible|builder|Desmos|GeoGebra)$/;
/**
 * `studentText`'s id shape (`~x`, `@x`, `#x`, `kind-Id`), read over a whole SENTENCE rather than a value: a sentence
 * may quote algebra in a taught example («x=t(k-1, 5-k, -2)»), so a one-letter "kind" is not an id here. Every engine
 * id kind (`circle-`, `seg-`, `poly-`, `tanaux-`) has two letters or more.
 */
const ID_IN_SENTENCE = /[~@#][\p{L}\p{N}_-]+|\b[a-z]{2,}-[\p{L}\p{N}_]+/u;
const ENGINE_WORD = /\b(solver|fold|replay|seed|carrier|residual|jacobian|constraint|undefined|null|NaN)\b/i;

/** The engine-text faults of one rendered sentence (empty = clean). */
export function engineTextFaults(he: string): string[] {
  const out: string[] = [];
  const id = he.match(ID_IN_SENTENCE);
  if (id) out.push(`the id-shaped token «${id[0]}»`);
  const eng = he.match(ENGINE_WORD);
  if (eng) out.push(`the engine word «${eng[0]}»`);
  for (const w of he.match(/[A-Za-z]{4,}/g) ?? []) if (!LATIN_OK.test(w)) out.push(`the Latin word «${w}»`);
  return out;
}

// ─── the baseline ───────────────────────────────────────────────────────────────────────────────────────────────

export type Reason = 'plain-none' | 'heuristic-miss' | 'queued' | 'ruled';
export interface Entry {
  key: string;
  reason: Reason;
  /** plain-none / heuristic-miss: the clause quoted · queued: the batch · ruled: the ruling. */
  note: string;
}
export interface Baseline {
  /** Per product, the most `queued` entries allowed — the backlog only shrinks. */
  queuedCap: Record<string, number>;
  entries: Record<string, Entry>;
}
export interface Row {
  label: string;
  key: string;
  /** The Hebrew text exactly as the student reads it. */
  he: string;
}

export const BASELINE_PATH = 'shell/__tests__/fixtures/refusal-style-baseline.json';
const QUEUED_NOTE = '#1995 stages 3–4 review queue (batch 1 rewrites or reasons it)';

export function readBaseline(): Baseline {
  const abs = join(REPO_ROOT, BASELINE_PATH);
  return existsSync(abs) ? (JSON.parse(readFileSync(abs, 'utf8')) as Baseline) : { queuedCap: {}, entries: {} };
}

const passes = (he: string) => hasNextStep(he) || saysNone(he);

/** Every fault of one product's rows against the baseline — empty when the lock holds. Pure, so the meta test can feed it broken input. */
export function refusalStyleFaults(product: string, rows: readonly Row[], baseline: Baseline): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const id = `${product}:${r.label}`;
    if (seen.has(id)) out.push(`${id}: duplicate row label`);
    seen.add(id);
    for (const f of engineTextFaults(r.he)) out.push(`${id} (${r.key}): ${f} — «${r.he}»`);
    const listed = baseline.entries[id];
    if (passes(r.he)) {
      if (listed) out.push(`${id} (${r.key}) now gives a next step or says there is none — remove it from the baseline`);
    } else if (!listed) {
      out.push(`${id} (${r.key}): no next step and no plain "there is none" — «${r.he}». Give one next step, or say plainly there is none.`);
    }
  }
  const mine = Object.entries(baseline.entries).filter(([id]) => id.startsWith(`${product}:`));
  for (const [id] of mine) if (!seen.has(id)) out.push(`${id}: stale baseline entry (no such row)`);
  const queued = mine.filter(([, e]) => e.reason === 'queued').length;
  const cap = baseline.queuedCap[product] ?? 0;
  if (queued > cap) out.push(`${product}: ${queued} queued entries exceed the cap ${cap} — the backlog only shrinks`);
  if (rows.length <= 20) out.push(`${product}: only ${rows.length} rows — the lock is vacuous`);
  return out;
}

/**
 * Regenerate `product`'s share of the baseline from `rows` (UPDATE_BASELINE=1): an entry that still fails keeps its
 * reason and note; a new failing row enters as `queued`; a passing row leaves. The cap becomes the queued count.
 */
function regenerate(product: string, rows: readonly Row[]): void {
  const base = readBaseline();
  const entries = Object.fromEntries(Object.entries(base.entries).filter(([id]) => !id.startsWith(`${product}:`)));
  for (const r of rows) {
    if (passes(r.he)) continue;
    const id = `${product}:${r.label}`;
    entries[id] = base.entries[id] ?? { key: r.key, reason: 'queued', note: QUEUED_NOTE };
  }
  const sorted = Object.fromEntries(Object.entries(entries).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  const queued = Object.entries(sorted).filter(([id, e]) => id.startsWith(`${product}:`) && e.reason === 'queued').length;
  const queuedCap = { ...base.queuedCap, [product]: queued };
  writeFileSync(join(REPO_ROOT, BASELINE_PATH), JSON.stringify({ queuedCap, entries: sorted }, null, 1) + '\n');
}

/** The lock, over one product's rendered rows. */
export function lockRefusalStyle(product: string, rows: () => readonly Row[]): void {
  describe(`#1995 stage 5 — ${product}: every refusal gives one next step or says there is none`, () => {
    it('holds against the baseline (which only shrinks)', () => {
      const all = rows();
      if (UPDATE_BASELINE) regenerate(product, all);
      const faults = refusalStyleFaults(product, all, readBaseline());
      const removable = faults.filter((f) => f.includes('remove it from the baseline'));
      for (const f of removable) console.warn(lowerTheBaseline(BASELINE_PATH, f));
      expect(faults).toEqual([]);
    });
  });
}
