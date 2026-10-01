/**
 * #1631 (analytic core) + #1303 — SWAP TWO LETTERS, a taken letter's HOLDER as data, the tool's own
 * letters renamable through the student's sentence, and a renamed free vertex that does not move.
 *
 * Operator, 2026-10-01, playing PR #1630: *"if a letter is occupied, it offers to switch letters …
 * we want that same mechanism now for analytics"*. The popover that offers the swap is shared chrome
 * (`shell/`, wired by the integrator); this file locks the CORE it calls — `decideRename`'s holder,
 * `decideSwap` / `dispatchSwap`, the store's `applySwap`, and the typed «החלף בין A ל-B».
 *
 * Every lock calls the REAL decision and the real store action, never a reproduction (the #1102
 * lesson). Session-edit sentences are passed as plain strings or `|`-joined, never inside an array
 * literal: `analyticCorpus` harvests every string array in this directory as a FIGURE.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { derive, type Derivation } from '../engine/derive';
import { decideSubmit } from '../app/submit';
import {
  decideRename,
  decideSwap,
  dispatchSwap,
  letterHolder,
  transposeSeedNames,
  type RenameState,
} from '../app/rename';
import { errorText } from '../app/errorText';
import { ask } from '../app/ask';
import { analyticI18n } from '../i18n';
import { useAnalyticStore } from '../store/useAnalyticStore';
import { analyticCorpus } from './analyticCorpus';

type T = (k: string, o?: Record<string, unknown>) => string;
const plain = (f: T): T => (k, o) => f(k, o).replace(/[\u2066-\u2069]/g, '');
const t = plain(analyticI18n.getFixedT('he') as unknown as T);
const tEn = plain(analyticI18n.getFixedT('en') as unknown as T);

const session = (lines: string[], extra: Partial<RenameState> = {}): RenameState => ({
  lines,
  disabled: [],
  queries: [],
  spokenFor: {},
  seed: 0,
  ...extra,
});

/** Every point of a figure, by id, at full precision. */
const pointsOf = (d: Derivation) => Object.fromEntries(d.figure.points.map((p) => [p.id, [p.x, p.y]]));

// A DETERMINED figure: a shape, a midpoint, a coordinate line per vertex, a named line by equation, and
// an equation line full of x/y with no point in it — #1154's figure, so the two locks read alike.
const FIGURE = [
  'נתונה הנקודה A(2,6)',
  'נתונה הנקודה B(8,2)',
  'נתונה הנקודה C(4,10)',
  'משולש ABC',
  'M אמצע AB',
  'משוואת הישר AC היא y=2x+2',
  'הישר y=x',
];
const SWAPPED_AB = [
  'נתונה הנקודה B(2,6)',
  'נתונה הנקודה A(8,2)',
  'נתונה הנקודה C(4,10)',
  'משולש BAC',
  'M אמצע BA',
  'משוואת הישר BC היא y=2x+2',
  'הישר y=x',
];

describe('#1631 — a taken letter carries its HOLDER as data: the line to quote and the row to highlight', () => {
  it('a student’s line holds it: text as typed, index in the full list', () => {
    const r = decideRename('A', 'B', session(FIGURE));
    expect(r.kind).toBe('refused');
    if (r.kind !== 'refused') return;
    expect(r.error).toEqual({ key: 'rename-taken', detail: 'B', holder: 'נתונה הנקודה B(8,2)' });
    expect(r.holder).toEqual({ text: 'נתונה הנקודה B(8,2)', index: 1 });
  });

  it('the index is the row in the FULL list — a muted row before it is counted', () => {
    const r = decideRename('A', 'C', session(FIGURE, { disabled: [1] }));
    expect(r.kind === 'refused' && r.holder).toEqual({ text: 'נתונה הנקודה C(4,10)', index: 2 });
  });

  it('a letter the TOOL gave is held by the sentence that made it name the point', () => {
    const lines = ['נקודה P', 'נתון מעגל שמשוואתו x^2+y^2=16'];
    const r = decideRename('P', 'O', session(lines));
    expect(r.kind === 'refused' && r.holder).toEqual({ text: 'נתון מעגל שמשוואתו x^2+y^2=16', index: 1 });
    expect(letterHolder(session(lines), 'O')).toEqual({ text: 'נתון מעגל שמשוואתו x^2+y^2=16', index: 1 });
    expect(letterHolder(session(lines), 'Q')).toBeNull();
  });
});

describe('#1303 — the typed swap: «החלף בין A ל-B», both directions, read before the grammar', () => {
  it('reads the Hebrew and English spellings as a swap', () => {
    for (const s of 'החלף בין A ל-B|החליפו בין A ל-B|החלף בין A לבין B|החלף בין הנקודה A לנקודה B|swap A and B|switch A with B|swap the letters A and B'.split('|')) {
      expect(decideSubmit(s, FIGURE, 0), s).toEqual({ kind: 'swap', a: 'A', b: 'B' });
    }
  });

  it('«החלף A ב-G» is STILL a rename — «בין» is what marks a swap', () => {
    expect(decideSubmit('החלף A ב-G', FIGURE, 0)).toEqual({ kind: 'rename', from: 'A', to: 'G' });
    expect(decideSubmit('שנה שם A ל-G', FIGURE, 0)).toEqual({ kind: 'rename', from: 'A', to: 'G' });
  });
});

describe('#1303 — the swap rewrites every line and ask row, and the figure is the same with labels exchanged', () => {
  const queries = [
    { sentence: 'AB', shown: true },
    { sentence: 'שיפוע AC', shown: false },
    { sentence: 'המרחק מ-B לישר AC', shown: true },
  ];

  it('rewrites a shape, a midpoint, coordinate lines and a named line; the x/y equation is untouched', () => {
    const r = decideSwap('A', 'B', session(FIGURE));
    expect(r.kind).toBe('apply');
    expect(r.kind === 'apply' && r.lines).toEqual(SWAPPED_AB);
  });

  it('both directions commit the same session', () => {
    const ab = decideSwap('A', 'B', session(FIGURE, { queries }));
    const ba = decideSwap('B', 'A', session(FIGURE, { queries }));
    if (ab.kind !== 'apply' || ba.kind !== 'apply') throw new Error('refused');
    expect(ba.lines).toEqual(ab.lines);
    expect(ba.queries).toEqual(ab.queries);
    expect(ba.seedNames).toEqual(ab.seedNames);
  });

  it('through the PARSER: the typed sentence reaches the same decision (ADR-W-053)', () => {
    const v = decideSubmit('החלף בין A ל-B', FIGURE, 0);
    if (v.kind !== 'swap') throw new Error(v.kind);
    const r = decideSwap(v.a, v.b, session(FIGURE));
    expect(r.kind === 'apply' && r.lines).toEqual(SWAPPED_AB);
  });

  it('every point sits where its old partner sat; nothing else moved', () => {
    const r = decideSwap('A', 'B', session(FIGURE));
    if (r.kind !== 'apply') throw new Error('refused');
    const b = pointsOf(derive(FIGURE, 0));
    const after = derive(r.lines, 0, r.seedNames);
    expect(after.faults).toEqual([]);
    const a = pointsOf(after);
    expect(a.B).toEqual(b.A);
    expect(a.A).toEqual(b.B);
    for (const id of ['C', 'M']) expect(a[id], id).toEqual(b[id]);
  });

  it('ask rows follow the letters and each answers what it answered before — no missing object', () => {
    const r = decideSwap('A', 'B', session(FIGURE, { queries }));
    if (r.kind !== 'apply') throw new Error('refused');
    expect(r.queries.map((q) => q.sentence)).toEqual(['BA', 'שיפוע BC', 'המרחק מ-A לישר BC']);
    expect(r.queries.map((q) => q.shown)).toEqual([true, false, true]);
    const before = derive(FIGURE, 0);
    const after = derive(r.lines, 0, r.seedNames);
    const fmt = (v: number) => v.toFixed(4);
    queries.forEach((q, i) => {
      const was = ask(before, q.sentence, fmt);
      const now = ask(after, r.queries[i].sentence, fmt);
      expect(now.missing, r.queries[i].sentence).toBeUndefined();
      expect(now.value, r.queries[i].sentence).toBe(was.value);
      expect(now.value).not.toBeNull();
    });
  });

  it('a PARAMETER and the plane’s x/y are never letters: a swap leaves `a`, `x` and `y` alone', () => {
    const lines = ['a הוא פרמטר חיובי', 'נתונה הנקודה A(a,2)', 'נתונה הנקודה B(3,a)', 'הישר y=ax+1'];
    const r = decideSwap('A', 'B', session(lines));
    expect(r.kind === 'apply' && r.lines).toEqual(['a הוא פרמטר חיובי', 'נתונה הנקודה B(a,2)', 'נתונה הנקודה A(3,a)', 'הישר y=ax+1']);
  });

  it('the AI lane’s display sentences follow both letters at once', () => {
    const r = decideSwap('A', 'B', session(FIGURE, { spokenFor: { 4: 'האמצע של AB' } }));
    expect(r.kind === 'apply' && r.spokenFor).toEqual({ 4: 'האמצע של BA' });
  });
});

describe('#1303 — the swap refuses by name', () => {
  const refusal = (a: string, b: string, lines: string[]) => {
    const r = decideSwap(a, b, session(lines));
    if (r.kind !== 'refused') throw new Error(`expected a refusal for ${a}<->${b}`);
    return r.error;
  };

  it('a letter the figure does not have', () => {
    const e = refusal('A', 'Q', FIGURE);
    expect(e).toEqual({ key: 'swap-unknown', detail: 'Q' });
    expect(errorText(e, t)).toBe('אין בשרטוט נקודה בשם Q, ולכן אין עם מה להחליף.');
    expect(errorText(e, tEn)).toContain('nothing to swap with');
  });

  it('a letter with itself, and a name that is not a point name', () => {
    expect(refusal('A', 'A', FIGURE)).toEqual({ key: 'swap-same', detail: 'A' });
    expect(errorText({ key: 'swap-same', detail: 'A' }, t)).toBe('אי אפשר להחליף את A בעצמה — בחרו שתי אותיות שונות.');
    expect(refusal('A', 'AB', FIGURE)).toEqual({ key: 'swap-bad-name', detail: 'AB' });
  });

  it('the typed refusal comes back through the real submit path', () => {
    const v = decideSubmit('החלף בין A ל-Q', FIGURE, 0);
    if (v.kind !== 'swap') throw new Error(v.kind);
    expect(decideSwap(v.a, v.b, session(FIGURE))).toEqual({ kind: 'refused', error: { key: 'swap-unknown', detail: 'Q' } });
  });
});

describe('#1631 sub-decision (a) — a letter the TOOL chose is renamed through the student’s own sentence', () => {
  it('the canonical circle’s O: «נתון מעגל שמשוואתו …» becomes «נתון מעגל G שמשוואתו …»', () => {
    const lines = ['נתון מעגל שמשוואתו x^2+y^2=16', 'נתונה הנקודה A(4,0)'];
    const v = decideSubmit('שנה שם O ל-G', lines, 0);
    if (v.kind !== 'rename') throw new Error(v.kind);
    const r = decideRename(v.from, v.to, session(lines, { queries: [{ sentence: 'OA', shown: true }] }));
    if (r.kind !== 'apply') throw new Error(JSON.stringify(r));
    expect(r.lines).toEqual(['נתון מעגל G שמשוואתו x^2+y^2=16', 'נתונה הנקודה A(4,0)']);
    expect(r.queries).toEqual([{ sentence: 'GA', shown: true }]);
    const before = pointsOf(derive(lines, 0));
    const after = derive(r.lines, 0, r.seedNames);
    expect(after.faults).toEqual([]);
    expect(pointsOf(after).G).toEqual(before.O);
    expect(pointsOf(after).O).toBeUndefined();
  });

  it('a minted coordinate point: «נתונה הנקודה (-3,7)» becomes «נתונה הנקודה G(-3,7)»', () => {
    const r = decideRename('P₁', 'G', session(['נתונה הנקודה (-3,7)']));
    expect(r.kind === 'apply' && r.lines).toEqual(['נתונה הנקודה G(-3,7)']);
  });

  it('a swap with the tool’s O names it in its sentence too', () => {
    const r = decideSwap('A', 'O', session(['נתון מעגל שמשוואתו x^2+y^2=16', 'נתונה הנקודה A(1,1)']));
    expect(r.kind === 'apply' && r.lines).toEqual(['נתון מעגל A שמשוואתו x^2+y^2=16', 'נתונה הנקודה O(1,1)']);
  });

  it('REFUSED only where the sentence has no form that names it — a coordinate inside a longer sentence', () => {
    const lines = ['טרפז ABCD', 'הבסיס CD נמצא על ישר העובר דרך הנקודה (-3,7)'];
    const r = decideRename('P₁', 'G', session(lines));
    expect(r).toEqual({ kind: 'refused', error: { key: 'rename-not-typed', detail: 'P₁' } });
    expect(errorText({ key: 'rename-not-typed', detail: 'P₁' }, t)).toContain('בחר הכלי');
  });
});

describe('#1631 sub-decision (b) — a renamed FREE vertex does not move', () => {
  const FREE = ['משולש ABC', 'M אמצע AB', 'AB = 4'];

  it('rename: the figure is identical point by point up to the name, at several configurations', () => {
    for (const seed of [0, 1, 3, 7]) {
      const before = pointsOf(derive(FREE, seed));
      const r = decideRename('A', 'G', session(FREE, { seed }));
      if (r.kind !== 'apply') throw new Error('refused');
      const after = pointsOf(derive(r.lines, seed, r.seedNames));
      expect(after.G, `seed ${seed}`).toEqual(before.A);
      for (const id of ['B', 'C', 'M']) expect(after[id], `seed ${seed} ${id}`).toEqual(before[id]);
    }
  });

  it('swap: the labels exchange and the triangle stays put', () => {
    const before = pointsOf(derive(FREE, 3));
    const r = decideSwap('A', 'B', session(FREE, { seed: 3 }));
    if (r.kind !== 'apply') throw new Error('refused');
    const after = pointsOf(derive(r.lines, 3, r.seedNames));
    expect(after.B).toEqual(before.A);
    expect(after.A).toEqual(before.B);
    expect(after.C).toEqual(before.C);
  });

  it('a renamed-then-renamed-back figure needs no map at all — the transposition is its own inverse', () => {
    expect(transposeSeedNames(transposeSeedNames({}, 'A', 'G'), 'G', 'A')).toEqual({});
    expect(transposeSeedNames({}, 'A', 'G')).toEqual({ A: 'G', G: 'A' });
  });

  it('the freed letter, reused, never lands on the renamed vertex (the map stays a permutation)', () => {
    const r = decideRename('A', 'G', session(['משולש ABC']));
    if (r.kind !== 'apply') throw new Error('refused');
    const p = pointsOf(derive([...r.lines, 'נקודה A'], 0, r.seedNames));
    expect(p.A).not.toEqual(p.G);
  });

  it('no letter changed ⇒ no map ⇒ every corpus figure folds exactly as before', () => {
    const corpus = analyticCorpus();
    expect(corpus.length).toBeGreaterThan(100);
    // A map naming letters the figure does not use is the identity on it, and an empty one adds no field.
    let swept = 0;
    for (const lines of corpus.slice(0, 120)) {
      const d = derive(lines, 0);
      expect(d.construction.seedNames, lines.join(' | ')).toBeUndefined();
      if (lines.some((l) => /[YZ]/.test(l))) continue;
      const other = derive(lines, 0, { Y: 'Z', Z: 'Y' });
      expect(pointsOf(other), lines.join(' | ')).toEqual(pointsOf(d));
      swept++;
    }
    expect(swept).toBeGreaterThan(80);
  });
});

describe('#1631 — the store commits a swap as ONE step; one undo restores everything', () => {
  const store = () => useAnalyticStore.getState();
  const temporal = () => useAnalyticStore.temporal.getState();
  const slice = () => {
    const s = store();
    return { lines: s.lines, disabled: s.disabled, queries: s.queries, spokenFor: s.spokenFor, seed: s.seed, seedNames: s.seedNames };
  };
  beforeEach(() => {
    store().clearAll();
    temporal().clear();
  });

  it('typed swap → dispatchSwap → applySwap; one undo puts back lines, ask rows, display sentences and seed names', () => {
    for (const l of FIGURE) store().recordLine(l);
    store().recordLlmLines('האמצע של AB', ['N אמצע AB']);
    store().setQueries([{ sentence: 'AB', shown: true }]);
    store().goToSeed(2);
    const before = slice();

    const v = decideSubmit('החלף בין A ל-B', before.lines, before.seed);
    if (v.kind !== 'swap') throw new Error(v.kind);
    const r = dispatchSwap(v.a, v.b, before, store());
    expect(r.kind).toBe('apply');
    expect(store().lines.slice(0, 7)).toEqual(SWAPPED_AB);
    expect(store().queries).toEqual([{ sentence: 'BA', shown: true }]);
    expect(store().spokenFor).toEqual({ 7: 'האמצע של BA' });
    expect(store().seedNames).toEqual({ A: 'B', B: 'A' });
    expect(store().seed).toBe(2); // a letter is a name, not a configuration

    store().undo();
    expect(slice()).toEqual(before);
    store().redo();
    expect(store().lines.slice(0, 7)).toEqual(SWAPPED_AB);
    expect(store().spokenFor).toEqual({ 7: 'האמצע של BA' });
  });

  it('the seed names are SAVED with the lines and restored (absent when no letter changed)', () => {
    for (const l of ['משולש ABC']) store().recordLine(l);
    expect(store().serialize().seedNames).toBeUndefined();
    const r = decideRename('A', 'G', slice());
    if (r.kind !== 'apply') throw new Error('refused');
    store().applyRename(r);
    const saved = store().serialize();
    expect(saved.seedNames).toEqual({ A: 'G', G: 'A' });
    store().clearAll();
    store().restore(saved);
    expect(store().seedNames).toEqual({ A: 'G', G: 'A' });
  });

  it('the class the undo slice closes: undoing a DELETE puts each display sentence back on its own row', () => {
    store().recordLine('נתונה הנקודה A(2,6)');
    store().recordLlmLines('נקודה שנייה', ['נתונה הנקודה B(8,2)']);
    store().removeLine(0);
    expect(store().spokenFor).toEqual({ 0: 'נקודה שנייה' });
    store().undo();
    expect(store().lines).toEqual(['נתונה הנקודה A(2,6)', 'נתונה הנקודה B(8,2)']);
    expect(store().spokenFor).toEqual({ 1: 'נקודה שנייה' });
  });

  it('a refused swap writes nothing and shows its error', () => {
    for (const l of FIGURE) store().recordLine(l);
    const r = dispatchSwap('A', 'Q', slice(), store());
    expect(r.kind).toBe('refused');
    expect(store().lines).toEqual(FIGURE);
    expect(store().error?.key).toBe('swap-unknown');
  });
});
