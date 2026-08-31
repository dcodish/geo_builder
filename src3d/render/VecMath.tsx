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
import { isolateLtrRuns3, textDir3 } from '../i18n/bidi';

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
    // #398 (ADR-3D-108): a run of THREE-plus labels is a POINT-RUN (a plane/polygon name like
    // ABC/ABCD), never a pair + leftovers. Without this, «למישור ABC» tokenized as text 'A' +
    // pair 'BC' and the plane wore a vector arrow — the operand's KIND is decided by the run
    // grammar (2 labels = pair, 3+ = run), not by whatever the pair regex can bite off.
    const mRun3 = s.match(/^(?:[A-Z]\d*'?){3,}/);
    if (mRun3 && !isLetter(s[mRun3[0].length])) {
      out.push({ k: 'text', text: mRun3[0] });
      s = s.slice(mRun3[0].length);
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
    if (vecNames.has(first) && !isLetter(s[1])) {
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
  /**
   * #482 (ADR-3D-184) — THE PROSE PATH MUST ISOLATE, because the reason the MathML path need not is
   * the structure it emits.
   *
   * ADR-3D-121 left VecMath rows un-isolated on a stated justification: «VecMath emits one element
   * per token, so bidi sees structure rather than one neutral run». That is true of the MathML path
   * below — and false here, where the tokenizer found nothing expression-like and the row passes
   * through as ONE neutral run under the caller's `dir="auto"`. The query lane renders every row
   * through this function, so the operator's own reported strings — «הישר l - x=(1,2,3)+t(m-2,m,m+2)»,
   * «מישור π1: x+(m-2)y+(m-1)z-5=0» — were still reordered there after the fact-row lane was fixed:
   * the same defect, on the surface the chokepoint had not reached.
   *
   * Isolating at the RENDER EVENT rather than at a caller is the #482 lesson itself. The function is
   * total, idempotent and byte-recoverable, so a caller that already isolated loses nothing.
   */
  if (!toks.some((t) => t.k === 'pair' || t.k === 'vec' || t.k === 'frac'))
    return React.createElement(React.Fragment, null, isolateLtrRuns3(text));
  /**
   * #838 (ADR-3D-190) — THE WRAPPER'S DIRECTION FOLLOWS THE ROW, NOT THE PRESENCE OF A MATH TOKEN.
   *
   * This element used to be hard-coded `dir="ltr"`, and it wraps the WHOLE row — the Hebrew prose
   * tokens included. So «BE מוכל במישור ABCD» was laid out left-to-right and a Hebrew reader, scanning
   * right-to-left, met «ABCD» first: the operator read their own statement as if ABCD were contained
   * in BE, and reported it as a containment bug (2026-08-31).
   *
   * ADR-3D-184 left this branch alone on the argument that «VecMath emits one element per token, so
   * bidi sees structure rather than one neutral run». That is true of a PURE EXPRESSION and false of a
   * Hebrew sentence containing expression tokens — the structure is there, and the wrapper was
   * overriding the direction it should have been ordered in. The tokens were checked; the wrapper
   * around them was not.
   *
   * `textDir3` is the same question the input preview asks («what direction is this string?»), so the
   * two seams cannot disagree. A pure expression row still reads `ltr` and is byte-identical; a Hebrew
   * sentence orders its islands right-to-left while each island stays internally LTR, which is what the
   * per-token elements already are.
   */
  /**
   * #838 Am. 1 — PROSE IS NOT MATHEMATICS, so it does not live inside the math element.
   *
   * ADR-3D-190 set `dir` on the `<math>` wrapper from the row's text. The operator reported the row
   * STILL reversed, so MathML's own `dir` is not reordering here — the residual risk that ADR named,
   * and the fallback it named is this one.
   *
   * A row with no Hebrew is untouched: one `<math dir="ltr">`, exactly as before, so every pure
   * expression («|AB| = 4», «u·v») renders byte-identically. A HEBREW row is split instead — each
   * expression island becomes its own `<math dir="ltr">`, the prose between them goes through
   * `isolateLtrRuns3` (the #482 chokepoint, which is what handles a Latin run the tokenizer left as
   * prose — «ABCD» is four letters and tokenizes as TEXT, not as a pair), and the container carries the
   * row's direction. Ordering is then HTML's bidi on a `<span dir=…>` — the mechanism that already lays
   * out every other row in this app correctly — instead of MathML's.
   */
  if (textDir3(text) === 'ltr')
    return m(
      'math',
      { dir: 'ltr', style: { fontSize: 'inherit' } },
      m('mrow', null, ...toks.map((t, i) => (t.k === 'op' && t.text === ' ' ? m('mspace', { key: i, width: '0.35em' }) : tokEl(t, i)))),
    );

  const groups: { math: Tok[] | null; text: string }[] = [];
  for (const t of toks) {
    const prose = t.k === 'text' || (t.k === 'op' && t.text === ' ');
    const last = groups[groups.length - 1];
    if (prose) {
      if (last && last.math === null) last.text += t.text;
      else groups.push({ math: null, text: t.text });
    } else if (last && last.math !== null) last.math.push(t);
    else groups.push({ math: [t], text: '' });
  }
  return m(
    'span',
    { dir: 'rtl', style: { unicodeBidi: 'isolate' } },
    ...groups.map((g, gi) =>
      g.math === null
        ? m('span', { key: gi }, isolateLtrRuns3(g.text))
        : m(
            'math',
            { key: gi, dir: 'ltr', style: { fontSize: 'inherit' } },
            m('mrow', null, ...g.math.map((t, i) => tokEl(t, i))),
          ),
    ),
  );
}
