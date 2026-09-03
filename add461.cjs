// #461 — «מלבן ABCD עם אלכסונים» BUILDS: the shape-plus-construct family, as a SPLITTER.
const fs = require('fs');
const p = 'src/parser/parse.ts';
let s = fs.readFileSync(p, 'utf8');

const rule = String.raw`/**
 * #461 — «<shape> ABCD עם <construct>» / "<shape> ABCD with <construct>": declare the shape AND the
 * construct in one line ([ADR-430](../../docs/06-decisions.md#adr-430)'s capability half).
 *
 * ADR-430 added the MECHANISM — `droppedConstructNoun` refuses rather than committing a bare rectangle
 * with a green ✓ — and deliberately not the capability, so «מלבן ABCD עם אלכסונים» refused and escalated.
 * Escalating is the right rung for input the grammar cannot represent, but it is not support: it is
 * unreliable and invisible to the student (ADR-428).
 *
 * A SPLITTER, not a shape×construct table. The left half goes through the real grammar, so every shape
 * that lane supports is supported here by construction; the right half is SYNTHESIZED with the shape's
 * own label run and parsed the same way, so every construct that lane supports comes along too. The
 * `compoundSuchThat` / `compoundAtDistance` pattern (#760), and the reason 3-D's ADR-3D-113 fix is
 * copied as a shape rather than imported.
 *
 * AMBIGUITY REFUSES, IT NEVER GUESSES (ADR-052). A bare «אלכסון» on a quad could be either diagonal and
 * a bare «גובה» on a triangle is one of three; choosing asserts a given the student never gave. Those
 * ask, naming the forms that would answer — the same `ambiguous-shape` question #519 built, one
 * construct over. The PLURAL «אלכסונים» is unambiguous: it is both.
 */
const WITH_SPLIT = rx(String.raw` + '`' + String.raw`^(?<left>.+?)\s+(?:עם|with)\s+(?:an?\s+|the\s+)?(?<right>.+?)\s*$` + '`' + String.raw`, 'i');
const shapeWithConstruct: Rule = (s, ctx) => {
  const m = s.match(WITH_SPLIT);
  if (!m) return null;
  const { left, right } = m.groups as { left: string; right: string };
  const lr = parse(left.trim(), ctx);
  if (!lr.ok) return null; // the left is not a shape this grammar reads — leave the line alone
  // the labels the shape declared, in order — what the construct half is about
  const ids = lr.commands.flatMap((c) => ('ids' in c && Array.isArray((c as { ids?: unknown }).ids) ? (c as { ids: string[] }).ids : []));
  if (ids.length < 3) return null;
  const run = ids.join(' ');
  const noun = right.trim();

  // BOTH diagonals of a quad — unambiguous, and the reported case
  if (/^(?:ה?אלכסונים|diagonals)$/i.test(noun)) {
    if (ids.length !== 4) return null;
    const rr = parse(` + '`' + `אלכסוני ${ids.join('')} נחתכים` + '`' + `, ctx);
    return rr.ok ? [...lr.commands, ...rr.commands] : null;
  }
  // ONE diagonal of a quad — which one is the student's to say
  if (/^(?:ה?אלכסון|diagonal)$/i.test(noun) && ids.length === 4) {
    return { clarify: 'ambiguous-shape', noun: 'diagonal', shapes: [` + '`' + `${ids[0]}${ids[2]}` + '`' + `, ` + '`' + `${ids[1]}${ids[3]}` + '`' + `] };
  }
  // A triangle's special lines: one PER VERTEX, so a bare noun names none of the three
  const perVertex = /^(?:ה?גובה|altitude)$/i.test(noun) ? 'גובה'
    : /^(?:ה?תיכון|median)$/i.test(noun) ? 'תיכון'
    : /^(?:ה?חוצה\s+זווית|angle\s+bisector|bisector)$/i.test(noun) ? 'חוצה זווית'
    : null;
  if (perVertex && ids.length === 3) {
    return { clarify: 'ambiguous-shape', noun: perVertex, shapes: ids.map((v) => ` + '`' + `${perVertex} מ-${v}` + '`' + `) };
  }
  // anything else: parse the construct half as written, against the shape's labels
  const rr = parse(noun.includes(run) || /[A-Z]/.test(noun) ? noun : ` + '`' + `${noun} ${run}` + '`' + `, ctx);
  return rr.ok ? [...lr.commands, ...rr.commands] : null;
};

`;

const anchor = 'const compoundSuchThat: Rule = (s, ctx) => {';
if (!s.includes(anchor)) throw new Error('anchor not found');
s = s.replace(anchor, rule + anchor);

// register it FIRST — before compoundSuchThat, so a «… עם …» line is split here
const reg = '  compoundSuchThat, //';
if (!s.includes(reg)) throw new Error('RULES anchor not found');
s = s.replace(reg, "  shapeWithConstruct, // #461: «<shape> ABCD עם <construct>» — split, so every shape and every construct come along by construction\n" + reg);

fs.writeFileSync(p, s);
console.log('461 rule added');
