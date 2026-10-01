/**
 * #1154 — A POINT'S LETTER CAN BE CHANGED: «שנה שם A ל-G», and the click menu's «שנה אות».
 *
 * Operator, 2026-09-16: *"we want to allow changing a node letter by clicking on it like the 2d tools
 * mechanism."* — and 2026-10-01, on a right trapezoid lettered with the right angle on the wrong
 * vertex: *"the ability to click on a node and change its name … would have solved this"*.
 *
 * Every lock here calls the REAL decision (`decideSubmit` → `decideRename` / `dispatchRename`) and the
 * real store action, never a reproduction of them (the #1102 lesson). Rename sentences are passed as
 * plain strings, never inside an array literal: `analyticCorpus` harvests every string array in this
 * directory as a FIGURE, and a rename is a session edit, not a figure line.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { derive, type Derivation } from '../engine/derive';
import { decideSubmit } from '../app/submit';
import { decideRename, dispatchRename, relabelText, renameDraftOf, rewriteLine, type RenameState } from '../app/rename';
import { errorText } from '../app/errorText';
import { ask } from '../app/ask';
import { analyticI18n } from '../i18n';
import { useAnalyticStore, type InputError } from '../store/useAnalyticStore';

type T = (k: string, o?: Record<string, unknown>) => string;
/** The locale wraps Latin runs in bidi isolates; the locks read the words. */
const plain = (f: T): T => (k, o) => f(k, o).replace(/[\u2066-\u2069]/g, '');
const t = plain(analyticI18n.getFixedT('he') as unknown as T);
const tEn = plain(analyticI18n.getFixedT('en') as unknown as T);

/** A session with nothing but lines — the common case. */
const session = (lines: string[], extra: Partial<RenameState> = {}): RenameState => ({
  lines,
  disabled: [],
  queries: [],
  spokenFor: {},
  seed: 0,
  ...extra,
});

/** The typed sentence through the REAL submit decision, then the real rename decision. */
function typed(sentence: string, state: RenameState) {
  const v = decideSubmit(sentence, state.lines, state.seed);
  if (v.kind !== 'rename') throw new Error(`not read as a rename: ${sentence} → ${v.kind}`);
  return decideRename(v.from, v.to, state);
}

const refusal = (sentence: string, state: RenameState): InputError => {
  const r = typed(sentence, state);
  if (r.kind !== 'refused') throw new Error(`expected a refusal for ${sentence}`);
  return r.error;
};

/** Every point of a figure, by id, at full precision. */
const pointsOf = (d: Derivation) => Object.fromEntries(d.figure.points.map((p) => [p.id, [p.x, p.y]]));

// A DETERMINED figure: a shape, a midpoint, a coordinate line per vertex, a named line by equation,
// and an equation line full of x/y with no point in it.
const FIGURE = [
  'נתונה הנקודה A(2,6)',
  'נתונה הנקודה B(8,2)',
  'נתונה הנקודה C(4,10)',
  'משולש ABC',
  'M אמצע AB',
  'משוואת הישר AC היא y=2x+2',
  'הישר y=x',
];
const RENAMED = [
  'נתונה הנקודה G(2,6)',
  'נתונה הנקודה B(8,2)',
  'נתונה הנקודה C(4,10)',
  'משולש GBC',
  'M אמצע GB',
  'משוואת הישר GC היא y=2x+2',
  'הישר y=x',
];

describe('#1154 — the typed rename rewrites every line that names the letter', () => {
  it('reads the Hebrew and English spellings as a rename, before any grammar', () => {
    // A `|`-joined string, not an array literal — see the header (`analyticCorpus`).
    for (const s of 'שנה שם A ל-G|שנה את האות A ל-G|שנה את שם הנקודה A ל־G|החלף A ב-G|rename A to G|rename point A to G|change the letter of A to G'.split('|')) {
      expect(decideSubmit(s, FIGURE, 0), s).toEqual({ kind: 'rename', from: 'A', to: 'G' });
    }
    // The swap («החלף בין») is #1303's sentence, not this one — it must not be read as a rename.
    expect(decideSubmit('החלף בין A ל-B', FIGURE, 0).kind).not.toBe('rename');
  });

  it('renames A inside runs and names, and touches no equation, no x/y and no Hebrew word', () => {
    const r = typed('שנה שם A ל-G', session(FIGURE));
    expect(r.kind).toBe('apply');
    if (r.kind !== 'apply') return;
    expect(r.lines).toEqual(RENAMED);
  });

  it('the figure after the rename is the same figure, up to the name', () => {
    const before = derive(FIGURE, 0);
    const r = typed('rename A to G', session(FIGURE));
    if (r.kind !== 'apply') throw new Error('refused');
    const after = derive(r.lines, 0);
    expect(after.faults).toEqual([]);
    const b = pointsOf(before);
    const a = pointsOf(after);
    expect(a.G).toEqual(b.A);
    expect(a.A).toBeUndefined();
    for (const id of ['B', 'C', 'M']) expect(a[id], id).toEqual(b[id]);
    expect(after.figure.curves.length).toBe(before.figure.curves.length);
    expect(after.figure.segments.length).toBe(before.figure.segments.length);
  });

  it('a coefficient beside a run is kept: «AB = 2AC» becomes «GB = 2GC»', () => {
    expect(rewriteLine('AB = 2AC', 'A', 'G')).toEqual({ line: 'GB = 2GC', count: 2 });
  });

  it('a letter with a digit is its own token: renaming A leaves A1 alone', () => {
    expect(relabelText('A(1,2) A1(3,4) A₁ BA', 'A', 'G')).toBe('G(1,2) A1(3,4) A₁ BG');
  });

  it('a lowercase target is the capital, as in the sibling builders', () => {
    const r = typed('rename A to g', session(FIGURE));
    expect(r.kind === 'apply' && r.to).toBe('G');
  });

  it('a MUTED line is rewritten too — it is still the student’s', () => {
    const r = typed('שנה שם A ל-G', session(FIGURE, { disabled: [4] }));
    expect(r.kind === 'apply' && r.lines[4]).toBe('M אמצע GB');
  });
});

describe('#1154 — the data panel follows the letter (operator ruling 2026-09-21)', () => {
  it('ask rows are rewritten in the same decision, and each answers what it answered before', () => {
    const queries = [
      { sentence: 'AB', shown: true },
      { sentence: 'שיפוע AB', shown: false },
      { sentence: 'המרחק מ-B לישר AC', shown: true },
    ];
    const r = typed('שנה שם B ל-K', session(FIGURE, { queries }));
    if (r.kind !== 'apply') throw new Error('refused');
    expect(r.queries.map((q) => q.sentence)).toEqual(['AK', 'שיפוע AK', 'המרחק מ-K לישר AC']);
    expect(r.queries.map((q) => q.shown)).toEqual([true, false, true]);
    const before = derive(FIGURE, 0);
    const after = derive(r.lines, 0);
    const fmt = (v: number) => v.toFixed(4);
    queries.forEach((q, i) => {
      const was = ask(before, q.sentence, fmt);
      const now = ask(after, r.queries[i].sentence, fmt);
      expect(now.missing, r.queries[i].sentence).toBeUndefined();
      expect(now.value, r.queries[i].sentence).toBe(was.value);
      expect(now.value).not.toBeNull();
    });
  });

  it('the AI lane’s display sentences follow the letter too', () => {
    const r = typed('שנה שם A ל-G', session(FIGURE, { spokenFor: { 4: 'האמצע של AB' } }));
    expect(r.kind === 'apply' && r.spokenFor).toEqual({ 4: 'האמצע של GB' });
  });
});

describe('#1154 — refusals name what the student wrote', () => {
  it('a TAKEN letter is refused, naming the line that holds it', () => {
    const e = refusal('שנה שם A ל-B', session(FIGURE));
    expect(e).toEqual({ key: 'rename-taken', detail: 'B', holder: 'נתונה הנקודה B(8,2)' });
    expect(errorText(e, t)).toBe('האות B כבר תפוסה: "נתונה הנקודה B(8,2)". בחרו אות פנויה.');
    expect(errorText(e, tEn)).toContain('already taken');
  });

  it('a letter the TOOL holds (the canonical centre O) is taken too', () => {
    const e = refusal('שנה שם P ל-O', session(['נתון מעגל שמשוואתו x^2+y^2=9', 'נקודה P']));
    expect(e.key).toBe('rename-taken');
    expect(errorText(e, t)).toBe('האות O כבר תפוסה בשרטוט. בחרו אות פנויה.');
  });

  it('an UNKNOWN point is refused by name', () => {
    const e = refusal('שנה שם Q ל-G', session(FIGURE));
    expect(e).toEqual({ key: 'rename-unknown', detail: 'Q' });
    expect(errorText(e, t)).toBe('אין בשרטוט נקודה בשם Q, ולכן אין מה לשנות.');
  });

  it('an INVALID name is refused by name — understood, never sent to the LLM', () => {
    for (const bad of 'AB|5|גימל'.split('|')) {
      const e = refusal(`שנה שם A ל-${bad}`, session(FIGURE));
      expect(e).toEqual({ key: 'rename-bad-name', detail: bad });
    }
    expect(errorText({ key: 'rename-bad-name', detail: 'AB' }, t)).toContain('"AB" אינו שם של נקודה');
  });

  it('the same letter is refused as nothing to change', () => {
    expect(refusal('שנה שם A ל-A', session(FIGURE))).toEqual({ key: 'rename-same', detail: 'A' });
  });

  it('a letter the tool CHOSE, named by no line, is refused — there is no line of theirs to rewrite', () => {
    const e = refusal('שנה שם O ל-Q', session(['נתון מעגל שמשוואתו x^2+y^2=9']));
    expect(e).toEqual({ key: 'rename-not-typed', detail: 'O' });
  });

  it('a rename that would shift a TOOL-chosen name is refused rather than silently moving it', () => {
    // The student's O holds the letter the canonical centre would take; freeing it would hand O to
    // the tool's centre — a different figure behind the student's back.
    const e = refusal('שנה שם O ל-Q', session(['נקודה O', 'נתון מעגל שמשוואתו x^2+y^2=9']));
    expect(e).toEqual({ key: 'rename-unsafe', detail: '', holder: 'O' });
  });
});

describe('#1154 — the store commits a rename as ONE step', () => {
  const store = () => useAnalyticStore.getState();
  const temporal = () => useAnalyticStore.temporal.getState();
  beforeEach(() => {
    store().clearAll();
    temporal().clear();
  });

  it('dispatch → applyRename rewrites lines and ask rows; one undo restores both', () => {
    for (const l of FIGURE) store().recordLine(l);
    store().setQueries([{ sentence: 'AB', shown: true }]);
    const s = store();
    const v = decideSubmit('שנה שם A ל-G', s.lines, s.seed);
    if (v.kind !== 'rename') throw new Error(v.kind);
    const r = dispatchRename(v.from, v.to, { lines: s.lines, disabled: s.disabled, queries: s.queries, spokenFor: s.spokenFor, seed: s.seed }, store());
    expect(r.kind).toBe('apply');
    expect(store().lines).toEqual(RENAMED);
    expect(store().queries).toEqual([{ sentence: 'GB', shown: true }]);
    expect(store().seed).toBe(s.seed); // a letter is a name, not a configuration

    store().undo();
    expect(store().lines).toEqual(FIGURE);
    expect(store().queries).toEqual([{ sentence: 'AB', shown: true }]);
  });

  it('a refused rename writes nothing and shows its error', () => {
    for (const l of FIGURE) store().recordLine(l);
    const s = store();
    const r = dispatchRename('A', 'B', { lines: s.lines, disabled: s.disabled, queries: s.queries, spokenFor: s.spokenFor, seed: s.seed }, store());
    expect(r.kind).toBe('refused');
    expect(store().lines).toEqual(FIGURE);
    expect(store().error?.key).toBe('rename-taken');
  });
});

describe('#1154 — the click menu offers «שנה אות» for a point the student lettered', () => {
  it('fills the input with the typed sentence, and that sentence completes to a rename', () => {
    const d = derive(FIGURE, 0);
    const draft = renameDraftOf(FIGURE, d.construction, { kind: 'point', id: 'A' });
    expect(draft).toBe('שנה שם A ל-');
    expect(typed(`${draft}G`, session(FIGURE)).kind).toBe('apply');
    expect(t('menuRename')).toBe('שנה אות');
  });

  it('a derived point the student named is offered too', () => {
    const d = derive(FIGURE, 0);
    expect(renameDraftOf(FIGURE, d.construction, { kind: 'point', id: 'M' })).toBe('שנה שם M ל-');
  });

  it('is not offered for a letter the tool chose, nor for a curve or a segment', () => {
    const lines = ['נתון מעגל שמשוואתו x^2+y^2=9'];
    const d = derive(lines, 0);
    expect(renameDraftOf(lines, d.construction, { kind: 'point', id: 'O' })).toBeNull();
    const f = derive(FIGURE, 0);
    expect(renameDraftOf(FIGURE, f.construction, { kind: 'curve', id: 'line-AC' })).toBeNull();
    expect(renameDraftOf(FIGURE, f.construction, { kind: 'segment', id: 'seg-AB' })).toBeNull();
  });
});

describe('#1154 — a FREE figure: the givens still hold after a rename', () => {
  it('a free triangle renamed keeps every given and its freedom (its default sample is keyed by the letter)', () => {
    const lines = ['משולש ABC', 'M אמצע AB', 'AB = 4'];
    const before = derive(lines, 3);
    const r = typed('שנה שם A ל-G', session(lines, { seed: 3 }));
    if (r.kind !== 'apply') throw new Error('refused');
    expect(r.lines).toEqual(['משולש GBC', 'M אמצע GB', 'GB = 4']);
    const after = derive(r.lines, 3);
    expect(after.faults).toEqual([]);
    expect(after.figure.unsatisfied).toEqual([]);
    expect(after.figure.carrierDof).toBe(before.figure.carrierDof);
  });
});
