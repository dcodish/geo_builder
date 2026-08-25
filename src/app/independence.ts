/**
 * #763 — INDEPENDENT constructs are taught one fact at a time, never decomposed and built.
 *
 * The operator's ruling (2026-08-19), after «שני מעגלים משיקים מבחוץ ואלכסון AB» drew two tangent
 * circles AND a floating segment AB belonging to nothing, committed as one green step:
 *
 *   > *"what we should do in such cases is ask user to input one fact at a time and refuse to draw
 *   > this shape. it will be similar in other cases like «משולש ABC וריבוע WERT»."*
 *
 * WHAT ACTUALLY WENT WRONG (the corrected diagnosis — the original issue body blamed the grammar).
 * The deterministic lane behaved perfectly: it produced only `[segment A B]`, the ADR-292 verb gate
 * caught the dropped tangency, and the partial parse was refused. What built the figure was the LLM
 * fallback, which DECOMPOSED the compound into two independent statements and built both. So this is
 * not a grammar bug and not an honesty-gate gap — it is a policy question at the escalation seam:
 * an utterance that packs independent constructs should be taught, not decomposed.
 *
 * WHY THE EXISTING GUIDANCE NEVER FIRED. `splitGuidance`/`looksCompound` already produce exactly the
 * right message, but `looksCompound`'s separator is a hand-listed noun set
 * (`ו(?=מעגל|משולש|ריבוע|…)`), and «אלכסון» is not in it. That list is a docs/17 §3 chokepoint
 * enumeration: it fails OPEN on every noun nobody thought of. Hence this module derives instead.
 *
 * THE DERIVATION, and it is the whole design: **a clause "stands alone" when it parses in an EMPTY
 * context and its commands then BUILD from an empty figure.** The tool itself decides what counts as
 * a construct, so a construct added to the grammar tomorrow is covered the same day, with no list to
 * maintain. Separators are deliberately liberal — a piece that is not a standalone statement can
 * never trigger a refusal, so over-splitting is free.
 *
 * The BUILD half is not redundant with the parse half, and measuring it is what made this shippable:
 * «מעגל P משיקים זה לזה בנקודה M» — the TAIL of a supported catalog form — *parses*, because the
 * tangency rule matches with one circle in hand. A fragment that parses is still a fragment; only the
 * engine could tell them apart. Requiring the build took the catalog's false positives from 10 to 4
 * and simultaneously took the reported forms caught from 3/4 to 4/4.
 *
 * PLACEMENT IS A SAFETY PROPERTY, not a convenience. This runs at the escalation seam, beside
 * `looksLikeLatex` / `wordRootMagnitude` / `splitGuidance`, so it only ever sees input the
 * deterministic grammar ALREADY DECLINED. A supported compound («דלתון ABCD, AB=AD» — ADR-264's
 * clause form) therefore never reaches it. See ADR-460 for the four residual false positives this
 * property covers, and `independence.test.ts` for the net that fails if the property stops holding.
 */
import { parse } from '@/parser';
import type { ScopeMatch } from '@/parser';
import { replay } from '@/store/geoStore';
import type { Fact } from '@/store/geoStore';
import type { AnyCommand } from '@/engine';

/**
 * Liberal clause separators. NO noun lookahead anywhere — that is the enumeration this issue exists
 * to retire. A bare «ו» glued to any Hebrew word splits; so do the explicit connectives and ordinary
 * punctuation. Over-splitting costs nothing: every piece must independently pass `standsAlone`.
 */
const SEPARATORS = /[,;.\n]|\s+(?:וגם|ואז|and|then|with)\s+|\s+ו(?=[א-ת])/g;

const clausesOf = (utterance: string): string[] =>
  utterance
    .split(SEPARATORS)
    .map((p) => p.replace(/^\s*[ו]?\s*/, '').trim())
    .filter((p) => p.length > 1);

/** The uppercase point labels a clause names. */
const labelsOf = (s: string): string[] => s.match(/[A-Z]\d*/g) ?? [];

/**
 * Does `clause` refer BACK to something an earlier clause introduced? Derived from the text itself,
 * not from a noun list: a DEFINITE word here («המעגל», "the circle") whose stem also appears in the
 * earlier text is a reference to that object, so the two clauses are one statement.
 *
 * Deliberately generous — a false "yes" only ever SUPPRESSES a refusal, which is the safe direction.
 * Hence the prefix comparison: «המעגל» refers back to «מעגלים» even though neither is the other's
 * whole word.
 */
function refersBack(clause: string, earlier: string): boolean {
  const earlierHe = earlier.match(/[א-ת]+/g) ?? [];
  for (const w of clause.match(/[א-ת]+/g) ?? []) {
    if (w.length < 4 || !w.startsWith('ה')) continue;
    const stem = w.slice(1);
    if (earlierHe.some((e) => e.startsWith(stem) || stem.startsWith(e.replace(/^ה/, '')))) return true;
  }
  const earlierEn = (earlier.match(/[A-Za-z]+/g) ?? []).map((w) => w.toLowerCase());
  const words = (clause.match(/[A-Za-z]+/g) ?? []).map((w) => w.toLowerCase());
  for (let i = 0; i < words.length - 1; i++) {
    if (words[i] === 'the' && earlierEn.includes(words[i + 1])) return true;
  }
  return false;
}

/**
 * Does the clause say anything BEYOND naming points? A bare label run («AB») is a noun phrase, not a
 * statement — the grammar happily reads it as a segment, but as the first half of a compound it is far
 * more likely a conjoined SUBJECT: "AB and CD are chords in circle O" is one sentence about two chords,
 * not two statements. Structural, not a word list: strip the label runs and see whether any words are
 * left.
 */
const hasContentWord = (clause: string): boolean =>
  /[א-ת]{2,}|[A-Za-z]{2,}/.test(clause.replace(/(?:[A-Z]\d*)+/g, ' '));

/** Parses alone AND builds alone — the tool's own definition of "this is a whole construct". */
function standsAlone(clause: string): boolean {
  if (!hasContentWord(clause)) return false;
  const r = parse(clause, {});
  if (!r.ok || r.commands.length === 0) return false;
  const facts: Fact[] = r.commands.map((cmd, i) => ({ id: `i${i}`, utterance: clause, cmd: cmd as AnyCommand, enabled: true }));
  const fig = replay(facts);
  if (fig.lastError || fig.pending) return false;
  return Object.values(fig.status).every((s) => s === 'ok');
}

/**
 * The discriminator. Returns the `split-statements` guidance when the utterance packs two or more
 * INDEPENDENT whole constructs, `null` otherwise.
 *
 * Independent = stands alone, and (after the first) shares no label with what came before and makes
 * no definite back-reference to it. Both halves matter: sharing a label is what makes «ריבוע ABCD,
 * נקודה G על AD» one statement, and the back-reference is what makes «מעגל O, נקודה A על המעגל» one.
 */
export function independentConstructs(utterance: string): ScopeMatch | null {
  const parts = clausesOf(utterance);
  if (parts.length < 2) return null;
  if (!parts.every(standsAlone)) return null;

  const seen = new Set(labelsOf(parts[0]));
  for (let i = 1; i < parts.length; i++) {
    const earlier = parts.slice(0, i).join(' ');
    if (labelsOf(parts[i]).some((L) => seen.has(L))) return null;
    if (refersBack(parts[i], earlier)) return null;
    for (const L of labelsOf(parts[i])) seen.add(L);
  }
  return {
    category: 'split-statements',
    messageKey: 'input.scope.split-statements',
    params: { first: parts[0], second: parts[1], all: parts.map((p, i) => `(${i + 1}) ${p}`).join('  ') },
  };
}
