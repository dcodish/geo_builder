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

/**
 * #2211 + #2219 ([ADR-744](../../docs/06-decisions.md#adr-744)) — THE OBJECT-LIST SHAPE, the distributor's second shape.
 *
 * A relation stated from ONE subject to a LIST of objects of one kind — «DE מקביל ל-BC ו-AB», "AF is perpendicular to
 * BC and DE", «מעגל O משיק ל-AB ו-AC», «M אמצע AC ו-BD», «EF = AD ו-AE», «מעגל Q משיק למעגלים O ו-P», «מעגל Q משיק
 * למעגל O ולמעגל P», "circle Q is tangent to circle O and circle P" — means what the same relation typed once per object
 * means: «DE מקביל ל-BC» · «DE מקביל ל-AB». The whole-line rules read the FIRST object and the clause split turned the
 * rest into bare draws («segment AB», «circle P»), so the relation to them vanished green; the pair resolver collapsed a
 * circle beside a plural pair into the pair (Q dropped).
 *
 * Pure string work: a subject at the sentence opening (a circle «(ה)מעגל X» / "(the) circle X", a label pair with an
 * optional segment noun, or one label with an optional point noun), a predicate span W that names no label, and an
 * object list of two or more objects of ONE kind (circle names, or two-letter segment names) running to the end of the
 * line — a plural head («למעגלים O ו-P», «לקטעים BC ו-AB», "circles O and P", "to both BC and AB") or one object per
 * item («ל-BC ו-AB», «ל-BC ול-AB», «למעגל O ולמעגל P», «BC, AB», "BC and segment AB", "circle O and (to) circle P").
 * The list head's preposition rides every clause; a plural head noun becomes its singular. Whether the line IS such a
 * relation is decided by the grammar, not here: the caller (`distributedClauses`, parse.ts) keeps the shape only when
 * the head clauses read alone and name the subject and their object. Returns the clauses with their labels, or null.
 */
const SEP_HE = String.raw`(?:\s*,\s*(?:ו-?\s*|וגם\s+)?|\s+ו-?\s*|\s+וגם\s+)`;
const SEP_EN = String.raw`(?:\s*,\s*(?:and\s+(?:also\s+)?)?|\s+and\s+(?:also\s+)?)`;
const PREP_HE = String.raw`(?:ל-?|ב-?|את\s+)`;
const SEG = String.raw`${ULABEL}${ULABEL}`;
const SEG_NOUN_HE = String.raw`(?:קטע|צלע|ישר)`;
const SEG_PLURAL_HE: Record<string, string> = { קטעים: 'קטע', צלעות: 'צלע', ישרים: 'ישר' };
const SEG_PLURAL_EN: Record<string, string> = { segments: 'segment', sides: 'side', lines: 'line' };

type Kind = 'circle' | 'segment';
interface ListItem { prep: string; noun: string; name: string }
export interface ObjectListShape {
  /** the subject's labels (a circle's centre letter, a segment's two letters, a point) */
  subject: string[];
  /** per object, in order: the clause text and the object's labels */
  clauses: { text: string; labels: string[] }[];
}

// `circle`: a circle subject — the one subject a list of CIRCLES may follow (#2211's shape). A circle list after a segment
// or point subject is another sentence: «AB משיק משותף למעגלים O ו-P» is one common tangent of the pair, «A נמצאת על
// המעגלים O ו-P» an incidence list (#2185) — kind agreement in the grammar, never a predicate word list.
const SUBJECTS: { he: boolean; circle?: true; re: RegExp }[] = [
  { he: true, circle: true, re: rx(String.raw`^\s*(ה?מעגל\s+(${ULABEL}))(?![A-Za-z\d])`, '') },
  { he: true, re: rx(String.raw`^\s*((?:ה?${SEG_NOUN_HE}\s+)?(${SEG}))(?![A-Za-z\d])`, '') },
  { he: true, re: rx(String.raw`^\s*((?:ה?נקודה\s+)?(${ULABEL}))(?![A-Za-z\d])`, '') },
  { he: false, circle: true, re: rx(String.raw`^\s*((?:[Tt]he\s+)?[Cc]ircle\s+(${ULABEL}))(?![A-Za-z\d])`, '') },
  { he: false, re: rx(String.raw`^\s*((?:[Tt]he\s+)?(?:(?:[Ss]egment|[Ll]ine|[Ss]ide)\s+)?(${SEG}))(?![A-Za-z\d])`, '') },
  { he: false, re: rx(String.raw`^\s*((?:[Tt]he\s+)?(?:[Pp]oint\s+)?(${ULABEL}))(?![A-Za-z\d])`, '') },
];

/** The object list at the END of `rest` (the text after the subject): [predicate, kind, items]. */
function readList(rest: string, he: boolean): { pred: string; kind: Kind; items: ListItem[] } | null {
  const forms: { kind: Kind; re: RegExp; plural: boolean }[] = he
    ? [
        { kind: 'circle', plural: true, re: rx(String.raw`^(.*?)\s+(${PREP_HE})?(?:ה|שני\s+ה)?(מעגלים)\s+(${ULABEL}(?:\s*(?:,|ו-?)\s*${ULABEL})+)\s*\.?\s*$`, '') },
        { kind: 'circle', plural: false, re: rx(String.raw`^(.*?)\s+(${PREP_HE}?ה?מעגל\s+${ULABEL}(?:${SEP_HE}${PREP_HE}?ה?מעגל\s+${ULABEL})+)\s*\.?\s*$`, '') },
        { kind: 'segment', plural: true, re: rx(String.raw`^(.*?)\s+(${PREP_HE})?(?:ה|שני\s+ה)?(קטעים|צלעות|ישרים)\s+(${SEG}(?:\s*(?:,|ו-?)\s*${SEG})+)\s*\.?\s*$`, '') },
        { kind: 'segment', plural: false, re: rx(String.raw`^(.*?)\s*?(?<![A-Za-z\d])(${PREP_HE}?(?:ה?${SEG_NOUN_HE}\s+)?${SEG}(?:${SEP_HE}${PREP_HE}?(?:ה?${SEG_NOUN_HE}\s+)?${SEG})+)(?![A-Za-z\d])\s*\.?\s*$`, '') },
      ]
    : [
        { kind: 'circle', plural: true, re: rx(String.raw`^(.*?)\s+(to\s+)?(?:both\s+)?(?:the\s+)?(?:two\s+)?(circles)\s+(${ULABEL}(?:(?:\s*,\s*|\s+and\s+)${ULABEL})+)\s*\.?\s*$`, '') },
        { kind: 'circle', plural: false, re: rx(String.raw`^(.*?)\s+((?:to\s+)?(?:both\s+)?(?:the\s+)?circle\s+${ULABEL}(?:${SEP_EN}(?:to\s+)?(?:the\s+)?circle\s+${ULABEL})+)\s*\.?\s*$`, '') },
        { kind: 'segment', plural: true, re: rx(String.raw`^(.*?)\s+(to\s+)?(?:both\s+)?(?:the\s+)?(segments|sides|lines)\s+(${SEG}(?:(?:\s*,\s*|\s+and\s+)${SEG})+)\s*\.?\s*$`, '') },
        { kind: 'segment', plural: false, re: rx(String.raw`^(.*?)\s*?(?<![A-Za-z\d])((?:to\s+)?(?:both\s+)?(?:the\s+)?(?:(?:segment|side|line)\s+)?${SEG}(?:${SEP_EN}(?:to\s+)?(?:the\s+)?(?:(?:segment|side|line)\s+)?${SEG})+)(?![A-Za-z\d])\s*\.?\s*$`, '') },
      ];
  for (const f of forms) {
    const m = rest.match(f.re);
    if (!m) continue;
    const pred = m[1].trim();
    if (f.plural) {
      const prep = (m[2] ?? '').trim();
      const noun = he ? (f.kind === 'circle' ? 'מעגל' : SEG_PLURAL_HE[m[3]]) : f.kind === 'circle' ? 'circle' : SEG_PLURAL_EN[m[3].toLowerCase()];
      const names = m[4].match(rx(f.kind === 'circle' ? ULABEL : SEG, 'g')) ?? [];
      return { pred, kind: f.kind, items: names.map((name) => ({ prep, noun, name })) };
    }
    const body = m[2];
    const itemRe = he
      ? rx(String.raw`(${PREP_HE})?(?:ה?(${f.kind === 'circle' ? 'מעגל' : SEG_NOUN_HE})\s+)?(${f.kind === 'circle' ? ULABEL : SEG})(?![A-Za-z\d])`, 'g')
      : rx(String.raw`(to\s+)?(?:both\s+)?(?:the\s+)?(?:(${f.kind === 'circle' ? 'circle' : String.raw`segment|side|line`})\s+)?(${f.kind === 'circle' ? ULABEL : SEG})(?![A-Za-z\d])`, 'g');
    const items = [...body.matchAll(itemRe)].map((x) => ({ prep: (x[1] ?? '').trim(), noun: x[2] ?? '', name: x[3] }));
    if (items.length < 2) continue;
    return { pred, kind: f.kind, items };
  }
  return null;
}

export function objectListShape(s: string): ObjectListShape | null {
  const he = /[א-ת]/.test(s);
  for (const sub of SUBJECTS.filter((x) => x.he === he)) {
    const m = s.match(sub.re);
    if (!m) continue;
    const rest = s.slice(m[0].length);
    const list = readList(rest, he);
    if (!list) continue;
    if (list.kind === 'circle' && !sub.circle) continue;
    // The predicate is a relation's own words: it names no label (a second subject «A ו-B על …» is not one subject),
    // and it is not empty (a draw list «מעגל O ומעגל P» has no predicate).
    if (!list.pred || rx(ULABEL, '').test(list.pred)) continue;
    const first = list.items[0];
    const clauses = list.items.map((it) => {
      const prep = it.prep || first.prep;
      const noun = it.noun || (list.kind === 'circle' ? (he ? 'מעגל' : 'circle') : '');
      const p = prep.replace(/-$/, '');
      const obj = he
        ? noun ? (p === 'את' ? `את ${noun} ${it.name}` : `${p}${noun} ${it.name}`) : `${prep}${it.name}`
        : `${prep ? `${prep} ` : ''}${noun ? `${noun} ` : ''}${it.name}`;
      return { text: `${m[1].trim()} ${list.pred} ${obj}`.replace(/\s+/g, ' ').trim(), labels: it.name.match(LABEL_G) ?? [] };
    });
    return { subject: m[2].match(LABEL_G) ?? [], clauses };
  }
  return null;
}
