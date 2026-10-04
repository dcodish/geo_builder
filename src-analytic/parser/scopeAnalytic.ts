/**
 * THE GUIDANCE REGISTER (#1353, slice (e) of #778 / [ADR-W-030](../../docs/06w-decisions-workspace.md#adr-w-030)).
 *
 * This tree had no register. 2-D has `src/parser/scope.ts` and 3-D has `src3d/parser/scope3.ts`;
 * analytic answered every unrecognised family with the same `not-handled`, so an input the tool could
 * have taught was indistinguishable from one it had never heard of.
 *
 * Its first member is the **imperative wrapper** — «הוסף …», «צייר …», «draw …». The operator's ruling:
 *
 * > *"When a user enters a command like add a line, draw a shape, we need to tell him to add the input
 * > as a textbook would… I don't want the tool to support the wrong text input because it teaches them
 * > wrong."*
 *
 * Measured at HEAD before this shipped: 42 of 1,470 wrapper × catalog pairs BUILT SILENTLY, so the
 * imperative form was recorded as the student's own sentence and read back to them from the fact list,
 * the saved file and the exported image.
 *
 * ## Why this is a lexicon and not a model call
 *
 * ADR-W-030 rejected routing the decision to the LLM, and the reason was policy stability rather than
 * cost: what counts as non-canonical input is a teaching decision the product owns, and a decision that
 * can drift with a model's mood is not a policy. The lexicon is closed and lives here, where a test can
 * read it.
 *
 * ## Why this module does not itself parse
 *
 * It produces CANDIDATES and nothing else. Whether a candidate is a real sentence is
 * {@link parseLine}'s question, and the caller ({@link decideSubmit}) asks it — so the teaching text is
 * always a string the parser has just accepted, and this module can never teach a form the tool would
 * reject. That property is what #778 wanted from deriving the sentence out of the commands; re-parsing
 * the exact string gets it more directly, with no renderer in between.
 */
import { unwrap } from './frameAnalytic';

/**
 * The closed imperative lexicon.
 *
 * ADR-W-030's list, plus `תצייר` — the form the operator's own prod utterance used
 * («תצייר לי משולש עם תיכון מ-A», the first live analytic LLM call, #1278). Exported so the coverage
 * test enumerates the real list rather than a copy of it.
 */
export const IMPERATIVE_VERBS_HE = [
  'הוסף', 'תוסיף', 'הוסיפו', 'להוסיף',
  'שרטט', 'תשרטט', 'שרטטו',
  'צייר', 'תצייר', 'ציירו', 'לצייר',
  'בנה', 'תבנה', 'בנו',
  'העבר', 'תעביר',
  // #1620 (ADR-AG-206) — the exam's construction imperatives, taught by the frames below.
  'העבירו', 'הורידו', 'מעבירים', 'מורידים', 'בחרו',
  'סמן', 'תסמן', 'סמנו', 'סימון',
  'הדגש', 'תדגיש',
  'הצג', 'תציג', 'הראה', 'הראו',
] as const;

export const IMPERATIVE_VERBS_EN = ['add', 'draw', 'mark', 'show', 'construct', 'highlight', 'plot'] as const;

/**
 * Particles that may sit between the verb and the sentence and carry no geometry —
 * «הוסף **את** המעגל», «תצייר **לי** משולש», «draw **me a** triangle».
 *
 * Stripping them is OPTIONAL, never assumed: {@link imperativeCandidates} offers both the stripped and
 * the unstripped remainder, and the caller keeps whichever one the parser accepts. A particle that is
 * really part of the sentence therefore costs nothing.
 */
const PARTICLES_HE = ['את', 'לי', 'לנו', 'נא', 'בבקשה'];
const PARTICLES_EN = ['me', 'a', 'an', 'the', 'us'];

/** One reading of a wrapped utterance: the verb the student wrote, and the sentence underneath it. */
export interface ImperativeCandidate {
  /** Verbatim, so a message can quote the student's own word back to them. */
  verb: string;
  /** The sentence to verify and teach. Never empty. */
  remainder: string;
  /**
   * #1620 — set on a reading of the exam's CONSTRUCTION register ({@link constructionCandidates}), whose
   * sentence may restate a given the figure already holds (the exam does); absent on the tool wrapper.
   */
  exam?: true;
}

/**
 * #1620 (ADR-AG-206) — THE EXAM'S CONSTRUCTION REGISTER: «העבירו משיק…», «מן הנקודה B הורידו אנך…».
 *
 * Operator ruling 2026-10-01 on #1620: the bagrut's construction imperatives are TAUGHT, never obeyed as
 * typed (ADR-W-030) — the plain declarative sentence is pre-filled for the student to confirm. They differ
 * from the tool-directed wrapper above in two ways that a verb-first strip cannot reach:
 *
 *  1. **The verb sits mid-clause**, after an adverbial that carries the construction's anchor —
 *     «**מן הנקודה B** הורידו אנך לציר ה-x», «**דרך הנקודה D שעל המעגל** העבירו משיק למעגל»,
 *     «**במשולש OBC** העבירו גבהים…». Stripping the verb would leave «מן הנקודה B אנך לציר ה-x».
 *  2. **The object is indefinite and its claims ride on relative clauses** — «ישר **המקביל** לציר ה-y
 *     וחותך…», «נקודה E כרצונכם, **הנמצאת** על הצלע DC». The textbook sentence is the definite subject
 *     with those clauses as its predicate: «הישר העובר דרך הנקודה E מקביל לציר ה-y וחותך…».
 *
 * So this register REWRITES by frame — one composition rule per construction noun, from a closed noun
 * list — and, like the wrapper, never decides: every string it builds is a CANDIDATE that `decideSubmit`
 * keeps only if the parser and the fold accept it. A frame that composes nonsense costs nothing.
 *
 * The verb must be a WHOLE TOKEN from {@link CONSTRUCTION_VERBS_HE}: «שהורידו», «שהעבירו» (a relative
 * clause DESCRIBING a drawn object — «הנקודה E נמצאת על האנך שהורידו מנקודה B…») never match, so a
 * descriptive line is neither taught nor refused here. And the mid-clause position is admitted only
 * after one of the three adverbials below, never anywhere in a line.
 */

/**
 * The construction verbs — the exam's plural imperative, its present-tense «מעבירים» (2/4: «דרך E
 * מעבירים קטע EF…»), and the singular forms already in the wrapper lexicon. A subset of
 * {@link IMPERATIVE_VERBS_HE}, so the #1353 catalog net covers every one of them.
 */
export const CONSTRUCTION_VERBS_HE = ['העבר', 'תעביר', 'העבירו', 'הורידו', 'מעבירים', 'מורידים', 'בחרו'] as const;

/**
 * Words that carry no geometry and are dropped wherever they stand — «בחרו נקודה E **כרצונכם**, …» (2/4).
 * "At your choice" is what makes the point free, and a point nothing pins is free already (ADR-052).
 */
const NON_GEOMETRIC_HE = /(?<![א-ת])כרצונ(?:כם|כן|ך)(?![א-ת])/g;

/** A point label, and a list of them — «A», «A ו-C», «A, B ו-C». */
const LBL = String.raw`[A-Z][0-9₀-₉]?`;
const LBL_LIST = String.raw`${LBL}(?:\s*(?:,|ו-?)\s*${LBL})*`;
/** The anchor nouns an adverbial names a point by — «מן **הנקודה** B», «מן **הקודקודים** A ו-C». */
const ANCHOR_NOUN = '(?:נקודה|נקודות|קודקוד|קודקודים)';
/** The polygon nouns of «במשולש OBC …» — the setting a role noun (altitude, median) is drawn in. */
const SETTING_NOUN = '(?:משולש|מרובע|ריבוע|מלבן|מעוי?י?ן|מקבילית|טרפז|דלתון)';

/** «מן הנקודה B», «מנקודה D», «מהקודקוד C», «מן הקודקודים A ו-C», «מ-B». */
const FROM_ADV = new RegExp(String.raw`^(?:מן\s+|מ-?)(?:ה?(${ANCHOR_NOUN})\s+)?(${LBL_LIST})(?=[\s,]|$)\s*,?\s*`);
/** «דרך E», «דרך הנקודה D», «דרך הנקודה D שעל המעגל». The rider is kept: a frame decides what it implies. */
const THROUGH_ADV = new RegExp(String.raw`^דרך\s+(?:ה?(${ANCHOR_NOUN})\s+)?(${LBL})(?=[\s,]|$)(?:\s+ש(?:על|נמצאת\s+על)\s+(ה[א-ת]+))?\s*,?\s*`);
/** «במשולש OBC», «במשולש ישר זווית ABC». */
const IN_ADV = new RegExp(String.raw`^(ב${SETTING_NOUN}(?:\s+[א-ת-]+){0,3}?\s+(?:${LBL}){3,4})(?=[\s,]|$)\s*,?\s*`);

/**
 * The construction nouns, each with its DEFINITE form — the closed list the frames compose from.
 * `role` marks the nouns that state a role in a named polygon («OD ו-BE הם גבהים»), whose textbook
 * sentence is a copula, not a definite subject.
 */
const CONSTRUCTION_NOUNS: Record<string, { def: string; plural?: boolean; role?: boolean }> = {
  משיק: { def: 'המשיק' },
  משיקים: { def: 'המשיקים', plural: true },
  מיתר: { def: 'המיתר' },
  קוטר: { def: 'הקוטר' },
  אלכסון: { def: 'האלכסון' },
  אנך: { def: 'האנך' },
  אנכים: { def: 'האנכים', plural: true },
  ישר: { def: 'הישר' },
  קטע: { def: 'הקטע' },
  נקודה: { def: 'הנקודה' },
  גובה: { def: 'גובה', role: true },
  גבהים: { def: 'גבהים', plural: true, role: true },
  תיכון: { def: 'תיכון', role: true },
  תיכונים: { def: 'תיכונים', plural: true, role: true },
};
const NOUN_RE = new RegExp(String.raw`^(?:את\s+)?(שני\s+)?ה?(${Object.keys(CONSTRUCTION_NOUNS).sort((a, b) => b.length - a.length).join('|')})(?![א-ת])\s*`);
/** The object's own names — «AD», «EF», «OD ו-BE»: one- or two-letter names, as a list. */
const SEG = String.raw`(?:${LBL}){1,2}`;
const LABELS_AFTER_NOUN = new RegExp(String.raw`^(${SEG}(?:\s*(?:,|ו-?)\s*${SEG})*)(?=[\s,]|$)\s*`);

/**
 * The relative participles whose clause becomes the PREDICATE — «ישר **המקביל** לציר ה-x **החותך** את…»
 * → «מקביל לציר ה-x **וחותך** את…». A closed list, so «ה-x» or a definite noun is never mistaken for one.
 */
const PARTICIPLES = [
  'מקביל', 'מקבילה', 'מקבילים', 'מקבילות',
  'חותך', 'חותכת', 'חותכים', 'חותכות',
  'נמצא', 'נמצאת', 'נמצאים', 'נמצאות',
  'מאונך', 'מאונכת', 'מאונכים', 'מאונכות',
  'מונח', 'מונחת', 'מונחים', 'מונחות',
  'עובר', 'עוברת', 'עוברים', 'עוברות',
  'משיק', 'משיקה',
];
const RELATIVE = new RegExp(String.raw`(^|\s*,\s*|\s+)(ו?)ה(${PARTICIPLES.join('|')})(?=\s|$)`, 'g');

/** Turn the object's relative clauses into its predicate: the first loses «ה», each later one gains «ו». */
function predicate(rest: string): string {
  let seen = 0;
  return rest
    .replace(RELATIVE, (_m, _lead: string, vav: string, p: string) => ` ${seen++ === 0 && !vav ? '' : 'ו'}${p}`)
    .replace(/\s+/g, ' ')
    .trim();
}

/** «B» → «הנקודה B»; «הקודקוד C» stays; plural anchors keep their own noun. */
const anchorNp = (noun: string | undefined, labels: string): string =>
  `ה${noun ?? (/(?:,|ו-?)/.test(labels) ? 'נקודות' : 'נקודה')} ${labels}`;

/**
 * Every textbook reading of an exam construction imperative, best first — or `[]` when `raw` is not one.
 * Pure string work over a closed grammar: `ADVERBIAL* VERB ADVERBIAL* NOUN LABELS? REST`.
 */
export function constructionCandidates(raw: string): ImperativeCandidate[] {
  let s = unwrap(raw).replace(NON_GEOMETRIC_HE, '').replace(/\s+,/g, ',').replace(/\s+/g, ' ').trim();
  let from: { noun?: string; labels: string } | null = null;
  let through: { noun?: string; label: string; on?: string } | null = null;
  let setting: string | null = null;
  let verb: string | null = null;

  for (let guard = 0; guard < 6 && s; guard++) {
    const head = s.split(' ')[0].replace(/,$/, '');
    if (!verb && (CONSTRUCTION_VERBS_HE as readonly string[]).includes(head)) {
      verb = head;
      s = s.slice(s.indexOf(head) + head.length).replace(/^\s*,?\s*/, '');
      continue;
    }
    let m: RegExpMatchArray | null;
    if (!from && (m = s.match(FROM_ADV))) {
      from = { noun: m[1], labels: m[2] };
    } else if (!through && (m = s.match(THROUGH_ADV))) {
      through = { noun: m[1], label: m[2], on: m[3] };
    } else if (!setting && (m = s.match(IN_ADV))) {
      setting = m[1];
    } else break;
    s = s.slice(m[0].length);
  }
  if (!verb) return [];

  const nm = s.match(NOUN_RE);
  if (!nm) return [];
  const noun = nm[2];
  const spec = CONSTRUCTION_NOUNS[noun];
  // «שני» counts a PLURAL noun («שני משיקים», «שני אנכים»); before a singular it is not this grammar.
  if (nm[1] && !spec.plural) return [];
  s = s.slice(nm[0].length);
  const lm = s.match(LABELS_AFTER_NOUN);
  const labels = lm ? lm[1] : '';
  if (lm) s = s.slice(lm[0].length);
  const rest = predicate(s.replace(/^,\s*/, ''));
  const join = (...parts: string[]) => parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();

  const out: string[] = [];
  const done = (): ImperativeCandidate[] => out.map((remainder) => ({ verb: verb as string, remainder, exam: true as const }));
  const fromNp = from ? anchorNp(from.noun, from.labels) : '';
  const throughNp = through ? anchorNp(through.noun, through.label) : '';

  if (spec.role) {
    // «במשולש OBC העבירו גבהים OD ו-BE לצלעות BC ו-OC בהתאמה» → «במשולש OBC, OD ו-BE הם גבהים …».
    if (!setting || !labels || from || through) return [];
    out.push(`${setting}, ${join(labels, spec.plural ? 'הם' : 'הוא', spec.def, rest)}`);
    return done();
  }
  const tail = setting ?? '';
  switch (noun) {
    case 'משיקים':
    case 'משיק': {
      /**
       * #1430 (ADR-AG-233) — a tangent FROM a point is the from-point sentence 2-D's catalog writes: «מהנקודה P העבירו
       * משיקים למעגל» → «מהנקודה P יוצאים שני משיקים למעגל», «… העבירו משיק למעגל» → «מהנקודה P יוצא משיק למעגל».
       * Through a point, the PLURAL can only be tangents from it (two tangents at one point are one line).
       */
      const single = from && !/,|ו-?/.test(from.labels);
      const anchor = single ? fromNp : spec.plural && through && !through.on ? throughNp : '';
      if (anchor && !labels) out.push(join(`מ${anchor}`, spec.plural ? 'יוצאים שני משיקים' : 'יוצא משיק', rest, tail));
      if (spec.plural) break;
      if (from) out.push(join(spec.def, labels, rest, `מ${fromNp}`, tail));
      else if (through) {
        // «דרך הנקודה D שעל המעגל העבירו משיק למעגל» — a tangent AT D puts D on that circle, so the
        // rider is implied by the sentence, not dropped; any other rider has no frame here.
        if (through.on && !(through.on === 'המעגל' && /מעגל/.test(rest))) return [];
        out.push(join(spec.def, labels, rest, /(?:^|\s)ב(?:ה)?נקודה\s/.test(rest) ? '' : `בנקודה ${through.label}`, tail));
      } else out.push(join(spec.def, labels, rest, tail));
      break;
    }
    case 'ישר':
    case 'קטע': {
      const anchor = from ? fromNp : through ? throughNp : '';
      const anchorLetters = from ? from.labels : through ? through.label : '';
      if ((from && through) || through?.on) return [];
      // «דרך E מעבירים קטע EF המקביל ל-DA» — a named segment that already starts at its anchor says it.
      if (labels && anchor && anchorLetters.split(/\s*(?:,|ו-?)\s*/).every((l) => labels.includes(l))) out.push(join(spec.def, labels, rest, tail));
      else out.push(join(spec.def, labels, anchor ? `העובר דרך ${anchor}` : '', rest, tail));
      break;
    }
    case 'אנך':
    case 'אנכים': {
      if (through || !from) return [];
      out.push(join(spec.def, labels, `מ${fromNp}`, rest, tail));
      break;
    }
    default: {
      if (from || through) return [];
      out.push(join(spec.def, labels, rest, tail));
    }
  }
  return done();
}

const HE_VERB = new Set<string>(IMPERATIVE_VERBS_HE);
const EN_VERB = new Set<string>(IMPERATIVE_VERBS_EN);
const HE_PARTICLE = new Set(PARTICLES_HE);
const EN_PARTICLE = new Set(PARTICLES_EN);

/**
 * Every reading of `raw` as «imperative + sentence», most-stripped first, or `[]` when it does not
 * open with a verb from the lexicon.
 *
 * Most-stripped first matters: «draw me a triangle ABC» should be read as «triangle ABC» before
 * «me a triangle ABC», so the first candidate the parser accepts is the tightest sentence.
 */
export function imperativeCandidates(raw: string): ImperativeCandidate[] {
  // The exam's construction frames first (#1620): their textbook sentence is the one to teach, and the
  // verb-first strip below would offer the bare indefinite «משיק למעגל בנקודה C» ahead of it.
  const framed = constructionCandidates(raw);
  const out: ImperativeCandidate[] = [...framed];
  const tokens = raw.trim().split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return out; // a bare verb states nothing to teach — it is not this rule's case
  const head = tokens[0];
  const lower = head.toLowerCase();
  const isHe = HE_VERB.has(head);
  const isEn = EN_VERB.has(lower);
  if (!isHe && !isEn) return out;

  const particles = isHe ? HE_PARTICLE : EN_PARTICLE;
  let after = 1;
  while (after < tokens.length - 1 && particles.has(isHe ? tokens[after] : tokens[after].toLowerCase())) after++;

  const push = (from: number) => {
    const remainder = tokens.slice(from).join(' ');
    if (remainder && !out.some((c) => c.remainder === remainder)) out.push({ verb: head, remainder });
  };
  push(after); // particles stripped — the tightest reading
  push(1); // the verb alone removed, in case a "particle" was really part of the sentence
  return out;
}

/**
 * #1357 — this builder's VOCABULARY for the shared construction-signal test
 * (`shell/llm/constructionSignal.ts`), which the LLM seam asks before paying for a call.
 *
 * A point label and a relation symbol are signals on their own, so this carries what an analytic
 * sentence can have without either: the coordinate letters `x` and `y`, a coordinate pair `(2, 3)`,
 * and the words of the analytic grammar. The catalog net asserts that no catalog line scores zero.
 */
export const VOCABULARY_ANALYTIC = new RegExp(
  [
    String.raw`(?<![A-Za-z])[xy](?![a-z])`,
    String.raw`\(\s*-?\d`,
    'ישר|מעגל|פרבול|אליפס|היפרבול|נקוד|שיפוע|ציר|משווא|מרחק|אמצע|משולש|מרובע|ריבוע|מלבן|מקבילית|מעוי?ין|טרפז|דלתון',
    'זו?וי|אנך|מאונך|מקביל|חיתוך|חותך|משיק|רדיוס|מרכז|קוטר|מיתר|אורך|שטח|היקף|קטע|תיכון|גובה|חוצה|אלכסון|מוקד|מדריך|קודקוד|שיעור|פרמטר',
    'line|circle|parabola|ellipse|hyperbola|point|slope|axis|equation|distance|midpoint|triangle|quadrilateral|square|rectangle|parallelogram|rhombus|trapezoid|kite',
    'angle|perpendicular|parallel|intersect|tangent|parameter|radius|cent(?:er|re)|diameter|chord|length|area|perimeter|segment|median|altitude|bisector|diagonal|focus|directrix|vertex',
  ].join('|'),
  'i',
);
