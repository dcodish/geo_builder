/**
 * #2185 ([ADR-735](../../docs/06-decisions.md#adr-735)) — THE INCIDENCE-LIST DISTRIBUTOR.
 *
 * «A על מעגל O ועל מעגל P», «A ו-B על מעגל O ועל מעגל P», «P על האלכסון AC ועל האלכסון BD», "A on circle O and on
 * circle P": one subject run, then «על»/"on" before each of two or more carriers. The sentence means what the same
 * incidences typed one per line mean — every subject on every carrier («A על מעגל O» · «A על מעגל P»). With
 * «בהתאמה»/"respectively" subject i pairs with carrier i, the pairing 2-D already gives «D ו-E על AB ועל AC
 * בהתאמה»; a count mismatch is not read (null).
 *
 * Strict by construction: every carrier must be a carrier reference (an optional carrier noun and one or two
 * labels), so a predicate that is not a bare incidence («כך ש-…», a second subject «A על K1 ו-B על K2») is never a
 * list and the caller's other readers keep it. Shared by the parser (`parseResolved` reads such a line as its
 * distribution, all-or-nothing) and the clause splitter `clausesOf` (the coverage gate sees each incidence) — one
 * helper, never forked. Returns the distributed clauses, or null when the line is not an incidence list.
 */
import { RESPECTIVELY, ULABEL, rx } from './lexicon';

const LABELS = String.raw`${ULABEL}(?:\s*(?:,\s*|\s+ו-?\s*|\s+and\s+)${ULABEL})*`;
const HE_LIST = rx(
  String.raw`^\s*(?:ה?נקוד(?:ה|ות)\s+)?(${LABELS})\s+(?:נקוד(?:ה|ות)\s+)?(?:(?:ש)?(?:נמצא(?:ת|ות|ים)?|מונח(?:ת|ות|ים)?)\s+)?על\s+(.+?)\s*(,?\s*${RESPECTIVELY})?\s*\.?\s*$`,
  '',
);
const EN_LIST = rx(
  String.raw`^\s*(?:(?:the\s+)?points?\s+)?(${LABELS})\s+(?:(?:is|are|lies|lie)\s+)?on\s+(.+?)\s*(,?\s*${RESPECTIVELY})?\s*\.?\s*$`,
  'i',
);
const HE_SEP = /\s*,\s*(?:ו|וגם\s+)?על\s+|\s+(?:ו-?|וגם\s+)על\s+/;
const EN_SEP = /\s*,\s*(?:and\s+(?:also\s+)?)?on\s+|\s+and\s+(?:also\s+)?on\s+/i;
const HE_CARRIER = rx(String.raw`^(?:ה?(?:מעגל|ישר|קטע|אלכסון|צלע|קרן)\s+)?(?:${ULABEL}){1,2}$`, '');
const EN_CARRIER = rx(String.raw`^(?:the\s+)?(?:(?:circle|line|segment|diagonal|side|ray)\s+)?(?:${ULABEL}){1,2}$`, 'i');
const LABEL_G = rx(ULABEL, 'g');

export function incidenceList(s: string): string[] | null {
  const he = /[א-ת]/.test(s);
  const m = s.match(he ? HE_LIST : EN_LIST);
  if (!m) return null;
  const subjects = m[1].match(LABEL_G) ?? [];
  const carriers = m[2].split(he ? HE_SEP : EN_SEP).map((p) => p.trim());
  if (carriers.length < 2 || !subjects.length) return null;
  if (!carriers.every((c) => (he ? HE_CARRIER : EN_CARRIER).test(c))) return null;
  const on = he ? 'על' : 'on';
  if (m[3]) {
    // «בהתאמה» pairs subject i with carrier i — a count mismatch says nothing readable
    if (subjects.length !== carriers.length) return null;
    return carriers.map((c, i) => `${subjects[i]} ${on} ${c}`);
  }
  const subj = subjects.join(he ? ' ו-' : ' and ');
  return carriers.map((c) => `${subj} ${on} ${c}`);
}
