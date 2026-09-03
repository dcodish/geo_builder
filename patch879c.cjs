// #879 — ONE quad-kind noun list, prefix-tolerant.
//
// Two problems, one cause. The list existed twice (I hoisted a copy rather than sharing the original),
// and its lookbehind `(?<![א-ת])` rejects the Hebrew one-letter prefixes — so «בטרפז» in
// «קטע אמצעים בטרפז» matched nothing and the missing-shape case escaped.
const fs = require('fs');
const p = 'src/parser/parse.ts';
let s = fs.readFileSync(p, 'utf8');

// 1 — the shared list allows the standard one-letter prefixes (ב ל מ ש כ ו ה), which is how a student
//     actually writes it: «בטרפז», «במקבילית». The trailing lookahead is unchanged, so a longer word
//     that merely starts with the noun still does not match.
const oldList = `const QUAD_KIND_NOUNS: [RegExp, string][] = [
  [/(?<![א-ת])ה?מעוין(?![א-ת])|\\brhombus\\b/i, 'rhombus'],
  [/(?<![א-ת])ה?טרפז(?![א-ת])|\\btrapezoid\\b/i, 'trapezoid'],
  [/(?<![א-ת])ה?מקבילית(?![א-ת])|\\bparallelogram\\b/i, 'parallelogram'],
  [/(?<![א-ת])ה?דלתון(?![א-ת])|\\bkite\\b/i, 'kite'],
];`;
const newList = `const QUAD_KIND_NOUNS: [RegExp, string][] = [
  [/(?<![א-ת])[בלמשכו]?ה?מעוין(?![א-ת])|\\brhombus\\b/i, 'rhombus'],
  [/(?<![א-ת])[בלמשכו]?ה?טרפז(?![א-ת])|\\btrapezoid\\b/i, 'trapezoid'],
  [/(?<![א-ת])[בלמשכו]?ה?מקבילית(?![א-ת])|\\bparallelogram\\b/i, 'parallelogram'],
  [/(?<![א-ת])[בלמשכו]?ה?דלתון(?![א-ת])|\\bkite\\b/i, 'kite'],
];`;
if (!s.includes(oldList)) throw new Error('hoisted list not found');
s = s.replace(oldList, newList);

// 2 — the diagonals rule reads that ONE list instead of its own copy
const localDecl = `    const QUAD_NOUNS: [RegExp, string][] = [
      [/(?<![א-ת])ה?מעוין(?![א-ת])|\\brhombus\\b/i, 'rhombus'],
      [/(?<![א-ת])ה?טרפז(?![א-ת])|\\btrapezoid\\b/i, 'trapezoid'],
      [/(?<![א-ת])ה?מקבילית(?![א-ת])|\\bparallelogram\\b/i, 'parallelogram'],
      [/(?<![א-ת])ה?דלתון(?![א-ת])|\\bkite\\b/i, 'kite'],
    ];
    const named = QUAD_NOUNS.map`;
if (!s.includes(localDecl)) throw new Error('local list not found');
s = s.replace(localDecl, `    const named = QUAD_KIND_NOUNS.map`);

// 3 — both sites strip the same prefix set when quoting the noun back to the student
s = s.split(`.replace(/^ה/, '')`).join(`.replace(/^[בלמשכו]?ה?/, '')`);
s = s.split(`.replace(/^\\u05d4/, '')`).join(`.replace(/^[בלמשכו]?ה?/, '')`);

fs.writeFileSync(p, s);
console.log('879c applied');
