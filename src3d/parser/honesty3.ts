/**
 * Honesty gates on the 3-D LLM commit path (S2.3 of docs/24-foundation-hardening-plan.md — the 2-D
 * gate battery COPIED as a pattern per docs/20 §12, never imported).
 *
 * The seam they guard: out-of-grammar input escalates to the LLM (`llm3.ts`), whose canonical lines are
 * re-parsed by `parse3` and committed as ONE fact (`store3.submitSteps`). Nothing there compared the
 * committed commands against the student's ORIGINAL utterance, so a decomposition that silently lost a
 * stated point, vector, or magnitude committed a partial figure with a green row — the exact 2-D class
 * ADR-089/ADR-240 (dropped labels) and ADR-250 (dropped numbers) closed. These are the two
 * highest-value gates, 3-D edition; the docs/23 cross-product review found the 3-D seam had none.
 *
 * Doctrine (the 2-D gates' own): the utterance-side extraction is CONSERVATIVE (only unambiguous
 * labels/magnitudes are demanded) and the command-side accounting is GENEROUS (any plausible lowering
 * accounts) — a false account only suppresses a warning, while a false drop would refuse a working
 * input.
 *
 * 3-D token specifics the 2-D gates never faced:
 *  - point labels are uppercase + optional digits + optional PRIME (`A'` — canonical after normalize3);
 *  - named VECTORS are single lowercase letters (u/v/w by convention), also stated glued to a
 *    coefficient (`tw`, `0.5v`, `βv`);
 *  - ℓ-line names (ℓ/ℓ1/ℓ2), π-plane names (π1) and Greek scalars (α β γ θ) are NOT labels;
 *  - lowercase k/m/t are figure symbols, x/y/z are axes — never point or vector names;
 *  - name subscripts (`π1`, `ℓ2`, `O1`) are NOT magnitudes;
 *  - coordinates `(2,-2,6)` state several signed numbers; π-sizes (`100π`), radicals (`√35/10`,
 *    `5√5`), fractions, ratios (`2:1`, glued `AK = 2KA'` → t = 2/3) and degree values all lower to
 *    derived numeric payloads.
 */

import type { Command3, Id } from '../engine/types';
import { QUAD_PYRAMIDS, type QuadBase } from '../engine/baseShapes';
import { CONSTRUCT_NOUNS, labelTokens, normalize3 } from './parse3';

/**
 * Uppercase point labels (and conventional vector names) the utterance STATES but the committed
 * commands neither reference nor the figure already has — the sign the LLM decomposition silently
 * DROPPED a stated object. Returns the lost names (empty = pass).
 *
 * `existingPoints` / `existingVectors`: ids already on the figure — a stated label that already exists
 * but isn't re-referenced is CONTEXT (e.g. a relation about existing points), never a drop.
 */
/**
 * A stated BASE-SHAPE noun whose DEFINING property the committed solid does not carry — the sign the
 * decomposition SILENTLY changed the base into a different shape (the ADR-3D-084 class: a pyramid/prism
 * base noun the LLM lowers to a CONTRADICTING kind, e.g. rhombus → rectangle, dropping the equal-sides
 * given). Returns the lost base nouns (empty = pass).
 *
 * Scoped to a prism/pyramid CONSTRUCTION utterance — the ONLY place a base-shape noun carries this
 * meaning; a bare `ABEC מלבן` rectangle-completion or a flat `מרובע ABCD` polygon means something else
 * and is owned by its own rule (the §2.4 word-presence-is-not-semantics discipline).
 *
 * Base properties (a general quad has none): `eqAdj` = adjacent base sides equal; `right` = a right base
 * angle. They come from the solid KIND (square ⇒ both, rectangle ⇒ right, rhombus ⇒ eqAdj,
 * parallelogram/general ⇒ none) OR an explicit constraint (`length-rel` c=1 ⇒ eqAdj, `cos-angle` 0 ⇒
 * right — command-side GENEROUS per the gate doctrine, so a false account only suppresses a warning while
 * a false drop would refuse a working input). rhombus needs eqAdj, rectangle needs right, square needs
 * both; kite/trapezoid have no 3-D base template ⇒ always unaccounted (an honest refusal, never a silent
 * substitute). parallelogram/quadrilateral/triangle are generic (no defining property) — not checked.
 */
export function droppedShapeNoun3(utterance: string, commands: Command3[]): string[] {
  const s = normalize3(utterance);
  // #587: the FLAT lane is the same event. A stated quad noun on a bare polygon — `המרובע ABCD הוא
  // ריבוע` — committed a green ARBITRARY quadrilateral, because the flat rules carry `TriSpec` only and
  // this gate watched solid BASES exclusively. The drop is identical in kind to the solid one it already
  // catches, so it is the same question asked in one more context, never a second gate.
  const solidCtx = /מנסרה|פירמידה|\bprism\b|\bpyramid\b/i.test(s);
  const flatCtx = commands.some(
    (c) =>
      (c.type === 'solid' && (c.kind === 'polygon3' || c.kind === 'polygon4' || c.kind === 'polygon5')) ||
      // #587 (ADR-3D-152): `quad-shape` reaches apply WITHOUT a sibling `solid` when the rule is a
      // corner completion (`ABEC מלבן`) — still a flat quad-noun statement, so still this gate's event.
      c.type === 'quad-shape',
  );
  if (!solidCtx && !flatCtx) return [];
  // #305 (ADR-3D-090): which base a KIND stands on comes from the ONE registry, so this gate can
  // never drift behind the parser again (it used to keep its own kind lists and marked kite /
  // trapezoid permanently `unsupported` — both are real bases now).
  const BASE_OF_PRISM: Partial<Record<string, QuadBase>> = {
    cube: 'square', prism4sq: 'square', box: 'rectangle', prism4r: 'rhombus',
    prism4: 'parallelogram', parallelepiped: 'parallelogram', prism4g: 'quad',
  };
  const baseOf = (kind: string): QuadBase | undefined =>
    (QUAD_PYRAMIDS as Partial<Record<string, { base: QuadBase; right: boolean }>>)[kind]?.base ?? BASE_OF_PRISM[kind];
  /** The defining properties a base GUARANTEES by construction. */
  const BASE_PROPS: Partial<Record<QuadBase, Array<'eqAdj' | 'right'>>> = {
    square: ['eqAdj', 'right'], rectangle: ['right'], rhombus: ['eqAdj'],
  };
  const props = new Set<'eqAdj' | 'right'>();
  const built = new Set<QuadBase>();
  for (const c of commands) {
    if (c.type === 'solid') {
      const b = baseOf(c.kind);
      if (b) {
        built.add(b);
        for (const pr of BASE_PROPS[b] ?? []) props.add(pr);
      }
    } else if (c.type === 'quad-shape') {
      // #587 (ADR-3D-152): the command that CARRIES the stated noun is the strongest account there is
      // — apply lowers `quadShapeConstraints(base)` from it. The issue's plan predicted no gate change
      // would be needed because the family's constraints would sit in the command list; the operator's
      // option-(a) ruling then moved the lowering to APPLY (the dispatch needs to know which corners
      // exist, and `parse3` is context-free), so the constraints are no longer visible here. Accounting
      // the carrier is the same question asked of the command that actually answers it.
      built.add(c.base);
      for (const pr of BASE_PROPS[c.base] ?? []) props.add(pr);
    } else if (c.type === 'length-rel' && c.c === 1) props.add('eqAdj');
    else if (c.type === 'cos-angle' && c.cos === 0) props.add('right');
  }
  // A stated noun is honoured when the built base carries its defining property (rhombus / rectangle
  // / square — which several kinds can satisfy) or IS that base (kite / trapezoid / parallelogram /
  // quad, whose identity is the kind itself). A noun with neither is still an honest refusal.
  const need: [RegExp, Array<'eqAdj' | 'right'> | QuadBase][] = [
    [/מעויי?ן|\brhombus\b/i, ['eqAdj']],
    [/מלבן|\brectang\w*/i, ['right']],
    [/ריבוע|\bsquare\b/i, ['eqAdj', 'right']],
    [/דלתון|\bkite\b/i, 'kite'],
    [/טרפז\w*|\btrapez\w*/i, 'trapezoid'],
    // #587: a parallelogram IS defined by a property (parallel opposite sides) — it was left out only
    // because every SOLID whose base it names carries it structurally, which `built.has` still answers
    // true for. In the flat lane nothing carries it, so the same membership test catches the drop.
    [/מקבילית|\bparallelogram\b/i, 'parallelogram'],
  ];
  const lost: string[] = [];
  for (const [re, req] of need) {
    const m = s.match(re);
    if (!m) continue;
    const ok = typeof req === 'string' ? built.has(req) : req.every((pr) => props.has(pr));
    if (!ok) lost.push(m[0]);
  }

  return lost;
}

/**
 * A stated TRIANGLE-shape qualifier (`שווה צלעות` / `שווה שוקיים` / equilateral / isosceles) that no
 * committed command accounts for (#424). Returns the lost qualifiers (empty = pass).
 *
 * **This gate runs on BOTH commit paths, not just the LLM seam** — and that is the point. The drop it
 * exists to catch was a GRAMMAR rule's: `ABC משולש שווה צלעות` parsed `ok`, committed with no error,
 * and drew a scalene triangle byte-identical to the plain `משולש ABC`. The sibling gates guard only
 * `submitSteps` on the reasoning that "the rules parse the utterance itself" — but a rule that reads
 * the shape NOUN and ignores the qualifier loses a given exactly as an LLM decomposition can. A guard
 * bound to a PATH cannot see an event that happens on the other one; this one is bound to the event.
 *
 * Doctrine (the sibling gates'): the utterance side is CONSERVATIVE and the command side GENEROUS — a
 * false account only suppresses a warning, while a false drop would refuse a working input. So ANY
 * equal-length relation accounts for the qualifier (an isosceles TRAPEZOID's `equal-legs` lowering
 * accounts for its own `שווה שוקיים`), as does a kind whose triangular base is equilateral by
 * construction.
 */
const EQUILATERAL_BY_KIND = new Set(['prism3e', 'pyramid3e']);

export function droppedTriShape3(utterance: string, commands: Command3[]): string[] {
  const s = normalize3(utterance);
  // #435: right-angledness joins the vocabulary this gate watches. It is checked SEPARATELY from the
  // equal-sides family because the two are independent givens — a figure that accounts for the equal
  // pair while dropping the right angle (the reported defect) must still be caught.
  const eq = s.match(/שווה[\s-]?צלעות|שווה[\s-]?שוקיים|\bequilateral\b|\bisosceles\b/i);
  const rt = s.match(/ישר\s*[-\s]?\s*זו?וית|\bright[-\s]?(?:angled\s+)?triangle\b/i);
  if (!eq && !rt) return [];
  const lost: string[] = [];
  if (eq) {
    const accounted = commands.some(
      (c) =>
        (c.type === 'length-rel' && c.c === 1) ||
        c.type === 'concyclic' || // a cyclic-fix macro reshaped the base per its own stated noun
        (c.type === 'solid' && EQUILATERAL_BY_KIND.has(c.kind)),
    );
    if (!accounted) lost.push(eq[0]);
  }
  // A right angle is accounted for by any perpendicularity the commands assert (`cos-angle` 0), or by
  // a kind whose template carries a right angle of its own. Generous per the gate doctrine above.
  if (rt) {
    const accounted = commands.some((c) => c.type === 'cos-angle' && c.cos === 0);
    if (!accounted) lost.push(rt[0]);
  }
  return lost;
}

/**
 * A stated CONSTRUCT NOUN — an object the student asked to EXIST — that no committed command
 * materialised (#438/#440). Returns the lost nouns (empty = pass).
 *
 * **The class this gate exists for**: *a sentence states two objects, the one rule that recognises its
 * own noun claims the whole utterance, emits only its own object, and silently discards the rest.* Three
 * independent instances landed in a single triage — `cubeOrBox` reading `תיבה` and discarding
 * `עם אלכסון תיבה` (#438), the V8-g polygon rule reading `משולש` and discarding `חסום במעגל` (#440), and
 * the pyramid-base qualifier (#435) — and the sibling gates could see none of them: they ask about
 * labels, numbers, base-shape nouns and triangle qualifiers, and **nothing asked whether a stated
 * OBJECT materialised at all.** A rule can only drop what some gate is not watching, so the durable fix
 * is the missing question, asked once, for every rule at once.
 *
 * **Bound to the EVENT, not to a path** — like `droppedTriShape3` and for the same reason (`src3d/CLAUDE.md`:
 * "a guard bound to a code path rather than to the event it guards will be bypassed"). Both #438 and #440
 * were GRAMMAR-rule drops on the deterministic path, where the LLM-seam gates never run.
 *
 * Doctrine (the sibling gates'): the utterance side is CONSERVATIVE and the command side GENEROUS — a
 * false account only suppresses a warning, while a false drop would refuse a working input. So each noun
 * is accounted by any plausible lowering, and a noun already satisfied by the EXISTING figure (`המעגל`
 * referring to a circle drawn earlier) is context, never a drop.
 */
export function droppedConstructNoun3(utterance: string, commands: Command3[]): string[] {
  const s = normalize3(utterance);
  // The nouns that name an OBJECT OF THEIR OWN — something a bare shape declaration can never be. Each
  // is a construct the curriculum draws ON a figure, so stating one and committing nothing but the
  // figure is precisely the drop. (A shape's own PROPERTY — right-angled, isosceles, rhombic — is not
  // here: `droppedTriShape3` / `droppedShapeNoun3` own those, and they must not be double-gated.)
  // #498: the list lives in `parse3.ts` and is shared with the fail-closed declaration gate, so a noun
  // that gate lets THROUGH is exactly a noun this one is watching — neither can assume the other covers it.
  const m = s.match(CONSTRUCT_NOUNS);
  if (!m) return [];
  // ACCOUNTING — the class predicate itself, not a per-noun object map. The defect is always the same
  // event: *a rule claims the utterance on its shape noun and emits nothing but that shape*. So the
  // question is whether the commands carry ANYTHING beyond the bare shape declarations — any non-`solid`
  // command at all (a segment, a circle, a derived point, a perpendicularity, a constraint), or a
  // `solid` carrying payload past its own identity (a cone's `height`/`radius` — «וגובהו 12» states a
  // height as a FIELD of the solid, not as a separate object).
  //
  // Deliberately GENEROUS, per the gate doctrine and by measurement: an earlier draft mapped each noun
  // to the object kind it "should" produce and false-flagged 28 working inputs — `O נקודת חיתוך אלכסוני
  // הבסיס` lowers a diagonal to a POINT, `AS גובה` lowers a height to a PERPENDICULARITY. Enumerating
  // the lowerings recreates the enumeration-is-not-a-rule trap the parser already learned; asking
  // whether the sentence produced anything at all does not.
  const BARE_SHAPE_KEYS = new Set(['type', 'kind', 'ids', 'oblique']);
  const accounted = commands.some(
    (c) => c.type !== 'solid' || Object.keys(c).some((k) => !BARE_SHAPE_KEYS.has(k)),
  );
  // #463: report the student's WHOLE WORD, not the regex stem. `אלכסו[ןנ]` matching «אלכסונים» yields
  // `אלכסונ` — an error message naming OUR pattern instead of the student's statement, which the honesty
  // invariant forbids ("error messages name the conflicting statement, never internal state"). Extend
  // the match over the trailing Hebrew letters it stopped inside.
  const whole = (raw: string, at: number): string => {
    const tail = s.slice(at + raw.length).match(/^[א-ת]+/);
    return tail ? raw + tail[0] : raw;
  };
  return accounted ? [] : [whole(m[0], m.index ?? 0)];
}

export function droppedNewLabels3(
  utterance: string,
  commands: Command3[],
  existingPoints: Id[] = [],
  existingVectors: string[] = [],
): string[] {
  const s = normalize3(utterance); // the SAME text the rules parse (primes canonical, arrows stripped)
  const json = JSON.stringify(commands);
  // Every label the commands reference — including glued runs inside stored plane/face names ("BC'D"
  // decomposes to B, C', D). Command type strings and field keys are all-lowercase, so uppercase
  // matches in the JSON are labels and nothing else.
  const used = new Set(json.match(/[A-Z]\d*'?/g) ?? []);
  const have = new Set(existingPoints);
  const dropped: string[] = [...new Set(labelTokens(s))].filter((L) => !have.has(L) && !used.has(L));

  // Named vectors: the conventional basis letters u/v/w, stated standalone (`u ⊥ v`, `|w|`) or glued
  // to a coefficient (`tw`, `0.5v`, `αu`). Deliberately narrow — an exotic vector name is only a
  // missed warning, while matching arbitrary lowercase letters would trip on English words. Accounted
  // when the letter appears as a single-character JSON string VALUE (a name-vector's `name`, a
  // vec-rel/dot atom's `name`) — keys like `u:`/`v:` (cos-angle operand fields) don't account, hence
  // the `(?!\s*:)` value guard.
  const boundVecs = new Set([...json.matchAll(/"([a-z])"(?!\s*:)/g)].map((m) => m[1]));
  const haveVecs = new Set(existingVectors);
  for (const v of ['u', 'v', 'w']) {
    if (!new RegExp(`(?<![A-Za-z])(?:\\d+(?:\\.\\d+)?|[ktm])?${v}(?![A-Za-z0-9])`).test(s)) continue;
    if (!haveVecs.has(v) && !boundVecs.has(v)) dropped.push(v);
  }
  return dropped;
}

/**
 * Stated numeric magnitudes absent from every committed command's payload — the sign the LLM
 * decomposition silently DROPPED a given. Returns the lost numbers as the raw stated snippets
 * (empty = pass).
 */
export function droppedGivenNumbers3(utterance: string, commands: Command3[]): string[] {
  const q = (n: number): number => Math.round(n * 1e6) / 1e6;
  // ---- accounting side (generous): every numeric payload of every command ----
  // #457 — a MULTISET, not a set (the #437 fix ported per the docs/17 §1 sibling audit). The set form
  // asks *"does this VALUE appear among the payloads?"* as a proxy for the semantic fact it means to
  // test: *"is this OCCURRENCE consumed?"* (docs/17 §2.2). The two differ exactly when a number REPEATS
  // — one account then vouches for every occurrence, and a repeated given can vanish for free under a
  // green ✓. In 2-D that shipped: «ריבוע במידות 4*4» committed size-less because the square's own
  // `ids.length === 4` paid for both stated 4s, while «מלבן במידות 4*6» escalated honestly.
  //
  // Here the class was LATENT, not live: 3-D's array-length account is a solid's vertex count (8 or 4),
  // which rarely collides with a stated magnitude, and its payloads sit in named per-field slots that
  // carry each stated number separately. Latent is not fixed — a new rule whose payload happens to carry
  // a value the utterance states twice reopens it silently — and the honest reading of a sibling audit
  // is that the same predicate is the same defect wherever it is written.
  //
  // Generosity is unchanged and still per-occurrence: an occurrence may be accounted by any of its
  // candidate lowerings (−n, n·π, n/(n+1), cos n°…), but a candidate that already paid for an earlier
  // occurrence can no longer pay for this one.
  const acc = new Map<number, number>();
  const add = (n: number): void => { acc.set(q(n), (acc.get(q(n)) ?? 0) + 1); };
  const walk = (v: unknown): void => {
    if (typeof v === 'number' && Number.isFinite(v)) add(v);
    else if (typeof v === 'string') {
      for (const m of v.match(/\d+(?:\.\d+)?/g) ?? []) add(parseFloat(m));
    } else if (Array.isArray(v)) {
      if (v.length && v.every((x) => typeof x === 'string')) add(v.length); // a count lowered by structure
      for (const x of v) walk(x);
    } else if (v && typeof v === 'object') {
      for (const x of Object.values(v)) walk(x);
    }
  };
  for (const c of commands) walk(c);
  /** Account this occurrence against the first candidate lowering still unspent — and SPEND it. */
  const has = (vals: number[]): boolean => {
    for (const v of vals) {
      if (!Number.isFinite(v)) continue;
      const left = acc.get(q(v)) ?? 0;
      if (left > 0) {
        acc.set(q(v), left - 1);
        return true;
      }
    }
    return false;
  };

  // ---- utterance side (conservative): blank every token whose digits are NOT magnitudes ----
  let s = normalize3(utterance);
  // a comparison to ZERO is sign notation (`t > 0` / `k < 0`, ADR-3D-079 Am. 1), not a magnitude;
  // a non-zero bound (`> 0.5`, `< 90`) stays a real number the commands must account for
  s = s.replace(/[<>]\s*0(?![.\d])/g, ' ');
  // the RHS zero of a STANDARD-FORM equation («3x+2y-z-24=0») is the form's notation, never a stated
  // magnitude — the given's content is its coefficients, which still demand accounting. Guarded on a
  // coordinate variable actually appearing in an expression, so a zero equated to anything else
  // (a bare «AB = 0») stays a real magnitude. (#535 measurement: only payload-coincidence — a plane
  // whose normal happens to carry 0 components — kept this from flagging on the catalog rows.)
  if (/[xyz]\s*[-+=]/.test(s) || /[-+]\s*\d*\s*[xyz](?![A-Za-z])/.test(s)) s = s.replace(/=\s*0(?![.\d])/g, ' ');
  // name subscripts are names, not numbers: ℓ1/ℓ2 line names (typed l1 too), π1/π2 plane names
  s = s.replace(/[ℓπ]\d+/g, ' ').replace(/(?<![A-Za-z])l\d+(?![A-Za-z])/g, ' ');
  // label-glued digits are subscripts (O1, A2), and blanking every latin letter also removes words
  // (the 2-D discipline: each letter → space, so `x`, `t(...)`, `k/6` leave their digits behind)
  s = s.replace(/[A-Za-z]\d*/g, ' ');
  // after blanking, parentheses wrap only numeric content — `(√6/4)`, coordinate triples `(2,-2,6)` —
  // so drop them, letting the fraction/radical spans read whole
  s = s.replace(/[()]/g, ' ');

  const dropped: string[] = [];
  const seen = new Set<string>();
  const spans: [number, number][] = [];
  const inSpan = (i: number): boolean => spans.some(([x, y]) => i >= x && i < y);
  const flag = (raw: string): void => {
    const key = raw.replace(/\s+/g, '');
    if (!seen.has(key)) {
      seen.add(key);
      dropped.push(key);
    }
  };

  // 1) RATIO `a:b` — one statement, consumed whole: lowered as t = a/(a+b) (on-segment ratios),
  //    as the plain quotient (length-ratio claims), or kept as its two integers.
  for (const m of s.matchAll(/(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)/g)) {
    const i = m.index!;
    spans.push([i, i + m[0].length]);
    const a = parseFloat(m[1]);
    const b = parseFloat(m[2]);
    if (!has([a / (a + b), b / (a + b), b === 0 ? NaN : a / b, a === 0 ? NaN : b / a, a, b, -a, -b])) flag(m[0]);
  }

  // 2) RADICAL / FRACTION value expressions `[coef]√n [/ term]` or `a/b` — evaluated and consumed
  //    WHOLE (the value the parser lowers to is what must be accounted, not the raw digits).
  const RAD = String.raw`√\s*\d+(?:\.\d+)?`;
  const TERM = String.raw`(?:\d+(?:\.\d+)?\s*[*·]?\s*)?${RAD}|\d+(?:\.\d+)?`;
  const evalTerm = (t: string): number => {
    const r = t.trim().match(/^(?:(\d+(?:\.\d+)?)\s*[*·]?\s*)?√\s*(\d+(?:\.\d+)?)$/);
    if (!r) return parseFloat(t);
    return (r[1] ? parseFloat(r[1]) : 1) * Math.sqrt(parseFloat(r[2]));
  };
  for (const m of s.matchAll(new RegExp(`(${TERM})(?:\\s*/\\s*(${TERM}))?`, 'g'))) {
    if (!/√|\//.test(m[0])) continue; // a bare number → the single-number pass below (with its own lowering candidates)
    const i = m.index!;
    if (inSpan(i)) continue;
    spans.push([i, i + m[0].length]);
    const num = evalTerm(m[1]);
    const den = m[2] !== undefined ? evalTerm(m[2]) : 1;
    const val = den !== 0 ? num / den : num;
    if (!has([val, -val, num, den])) flag(m[0]);
  }

  // 3) bare numbers — accounted directly or via a standard lowering: a signed coordinate (−n), a
  //    π-size (n·π — volumes/areas of revolution solids), a glued ratio coefficient (`AK = 2KA'`
  //    → t = n/(n+1) or 1/(n+1)), a divided symbol (`k/6` → 1/n), a percent (n/100), or a degree
  //    value a rule lowered trigonometrically (cos/sin of n°).
  for (const m of s.matchAll(/\d+(?:\.\d+)?/g)) {
    const i = m.index!;
    if (inSpan(i)) continue;
    const n = parseFloat(m[0]);
    const cands = [
      n,
      -n,
      n * Math.PI,
      n / (n + 1),
      1 / (n + 1),
      n === 0 ? NaN : 1 / n,
      n / 100,
      Math.cos((n * Math.PI) / 180),
      Math.sin((n * Math.PI) / 180),
    ];
    if (!has(cands)) flag(m[0]);
  }
  return dropped;
}

/**
 * #555 (ADR-3D-173) — the SEQUENCE honesty gate, ported from the 2-D #536 fix (ADR-441): every
 * `dropped*` gate above asks what the LLM decomposition LOST; none asks whether a surviving
 * point-run was REORDERED — yet in 3-D the sequence IS the statement wherever order is semantic:
 * «∠SAB» puts the vertex at A, «פאה SBC» names a face cycle, a quad run «ABDC» is a different ring
 * from «ABCD», and a pyramid run carries its apex by position. In 2-D this exact hole let the model
 * alphabetize a stated betweenness («ADB» → «ישר ABD») and commit its NEGATION under a green ✓
 * (prod s0cr31nw, P1 #536).
 *
 * Like the 2-D gate it RESTORES rather than refuses — the student's own text carries the intended
 * sequence, and «I reordered your letters» is our fault, not theirs. Text-level on the canonical
 * lines, before the re-parse, because a command-level comparison cannot tell a grammar-derived
 * reorder from an LLM rewrite. A line-run using EXACTLY the labels of a stated run (same multiset)
 * in a different sequence is the model respelling the student's token → restore the stated
 * spelling and let `parse3` re-derive the semantics. A REVERSED run is left alone (it names the
 * same object), an ambiguous multiset (stated twice with different sequences) restores nothing,
 * and 2-token runs are exempt (a pair carries no order). Labels here are the 3-D token —
 * uppercase + digits + optional prime («A'», «O1») — the one vocabulary `labelTokens` reads.
 */
export function restoreStatedSequences3(
  utterance: string,
  lines: string[],
): { lines: string[]; restored: string[] } {
  const sameSeq = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i]);
  const rev = (a: readonly string[]) => [...a].reverse();
  const RUN = () => /(?<![A-Za-z])(?:[A-Z]\d*'?){3,}(?![a-z\d])/g;
  const split = (run: string): string[] => run.match(/[A-Z]\d*'?/g) ?? [];
  // the LINE side needs INDEX-STABLE matching, so only the length-preserving prime canonicalisation
  // is applied there; the student side takes the full normaliser (its indices are never used)
  const canonPrimes = (s: string) => s.replace(/[′’]/g, "'");
  const stated = new Map<string, string[] | null>();
  for (const m of normalize3(utterance).matchAll(RUN())) {
    const labels = split(m[0]);
    const key = [...labels].sort().join(',');
    const prev = stated.get(key);
    if (prev === undefined) stated.set(key, labels);
    else if (prev !== null && !sameSeq(prev, labels) && !sameSeq(prev, rev(labels))) stated.set(key, null);
  }
  if (stated.size === 0) return { lines, restored: [] };
  const restored: string[] = [];
  const out = lines.map((line) => {
    const canon = canonPrimes(line);
    let result = '';
    let last = 0;
    for (const m of canon.matchAll(RUN())) {
      const labels = split(m[0]);
      const want = stated.get([...labels].sort().join(','));
      if (!want || sameSeq(labels, want) || sameSeq(labels, rev(want))) continue;
      restored.push(`${labels.join('')}→${want.join('')}`);
      result += canon.slice(last, m.index) + want.join('');
      last = m.index! + m[0].length;
    }
    return result ? result + canon.slice(last) : line;
  });
  return { lines: out, restored };
}
