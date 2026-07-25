/**
 * MathML vector notation (#313, feature — the operator: «the vector arrow over SD should be over
 * ALL of SD; if we need MathML there, we should»).
 *
 * Renders a notation-row string (a step row, a panel decomposition, a query answer) as MathML
 * where it is expression-like, plain text where it is prose. What MathML buys over the combining
 * characters (⃗ / ̲) used until now:
 *  - `<mover>` with a STRETCHY arrow spans the WHOLE pair name (SD⃗ over both letters);
 *  - `<munder>` with a stretchy low line spans a declared vector name;
 *  - `u/6` renders as a real `<mfrac>` (vector atom over the number), likewise numeric fractions.
 *
 * The tokenizer here is DISPLAY-ONLY and conservative: it recognizes the constrained grammar the
 * rows actually carry (pair names, declared vector names, numbers, fractions, operators, parens,
 * ·, = and Hebrew/Latin prose words). Anything unrecognized passes through as text — this layer
 * never guesses semantics (the #312 lesson: the atom set comes from the DECLARED names, not from
 * lexical shape). MathML Core is supported by all evergreen browsers; a `<span>` fallback isn't
 * needed for the target platforms (tablets/desktop — ADR-207).
 */
import React from 'react';

type Tok =
  | { k: 'pair'; text: string }
  | { k: 'vec'; text: string }
  | { k: 'frac'; num: Tok; den: Tok }
  | { k: 'num'; text: string }
  | { k: 'op'; text: string }
  | { k: 'text'; text: string };

const PAIR = /^[A-Z]\d*'?[A-Z]\d*'?/;
const NUM = /^\d+(?:\.\d+)?/;

/** Tokenize one row into display tokens. `vecNames` = the declared vector letters (u, v, w…). */
export function tokenizeRow(row: string, vecNames: Set<string>): Tok[] {
  const out: Tok[] = [];
  let s = row;
  const isLetter = (ch: string | undefined) => !!ch && /[A-Za-z֐-׿]/.test(ch);
  while (s.length) {
    // prose word (Hebrew, or a Latin word that is not a pair/vector token) — longest letter run
    const mWord = s.match(/^[֐-׿]+/);
    if (mWord) {
      out.push({ k: 'text', text: mWord[0] });
      s = s.slice(mWord[0].length);
      continue;
    }
    const mPair = s.match(PAIR);
    if (mPair && mPair[0].length >= 2 && !isLetter(s[mPair[0].length])) {
      out.push({ k: 'pair', text: mPair[0].replace(/⃗/g, '') });
      s = s.slice(mPair[0].length);
      // swallow a trailing combining arrow — the MathML mover replaces it
      if (s.startsWith('⃗')) s = s.slice(1);
      continue;
    }
    const first = s[0];
    if (vecNames.has(first) && !isLetter(s[1]) && s[1] !== '̲') {
      const vecTok: Tok = { k: 'vec', text: first };
      s = s.slice(1);
      if (s.startsWith('̲')) s = s.slice(1); // combining underline replaced by munder
      // a/b fraction with a vector numerator: u/6
      const mDen = s.match(/^\/(\d+(?:\.\d+)?)/);
      if (mDen) {
        out.push({ k: 'frac', num: vecTok, den: { k: 'num', text: mDen[1] } });
        s = s.slice(mDen[0].length);
      } else out.push(vecTok);
      continue;
    }
    if (s.startsWith('̲')) { s = s.slice(1); continue; } // stray combining underline
    const mNum = s.match(NUM);
    if (mNum) {
      const numTok: Tok = { k: 'num', text: mNum[0] };
      s = s.slice(mNum[0].length);
      const mDen = s.match(/^\/(\d+(?:\.\d+)?)/);
      if (mDen && !isLetter(s[mDen[0].length])) {
        out.push({ k: 'frac', num: numTok, den: { k: 'num', text: mDen[1] } });
        s = s.slice(mDen[0].length);
      } else out.push(numTok);
      continue;
    }
    if (/^[A-Za-z]/.test(s)) {
      // a Latin run that isn't a pair/vector (a prose word, a single label, a symbol letter)
      const mRun = s.match(/^[A-Za-z]\d*'?/)!;
      out.push({ k: 'text', text: mRun[0] });
      s = s.slice(mRun[0].length);
      continue;
    }
    out.push({ k: 'op', text: first });
    s = s.slice(1);
  }
  return out;
}

const m = (tag: string, props: Record<string, unknown> | null, ...children: React.ReactNode[]) =>
  React.createElement(tag, props, ...children);

function tokEl(t: Tok, i: number): React.ReactNode {
  switch (t.k) {
    case 'pair':
      return m('mover', { key: i, accent: 'true' }, m('mi', { mathvariant: 'normal' }, t.text), m('mo', { stretchy: 'true' }, '→'));
    case 'vec':
      // a NAMED vector matches the canvas convention (ADR-3D-003): arrow above AND underline below
      return m(
        'mover',
        { key: i, accent: 'true' },
        m('munder', { accentunder: 'true' }, m('mi', null, t.text), m('mo', { stretchy: 'true' }, '_')),
        m('mo', { stretchy: 'true' }, '→'),
      );
    case 'frac':
      return m('mfrac', { key: i }, tokEl(t.num, 0), tokEl(t.den, 1));
    case 'num':
      return m('mn', { key: i }, t.text);
    case 'op':
      return m('mo', { key: i }, t.text === '-' ? '−' : t.text);
    case 'text':
      return m('mtext', { key: i }, t.text);
  }
}

/** A notation row as MathML. Prose-only rows (no pair/vec/frac token) render as plain text. */
export function VecMath({ text, vecNames }: { text: string; vecNames: Set<string> }): React.ReactElement {
  const toks = tokenizeRow(text, vecNames);
  if (!toks.some((t) => t.k === 'pair' || t.k === 'vec' || t.k === 'frac')) return React.createElement(React.Fragment, null, text);
  // group by whitespace-separated visual runs so prose keeps natural spacing
  return m(
    'math',
    { dir: 'ltr', style: { fontSize: 'inherit' } },
    m('mrow', null, ...toks.map((t, i) => (t.k === 'op' && t.text === ' ' ? m('mspace', { key: i, width: '0.35em' }) : tokEl(t, i)))),
  );
}
