/**
 * #2201 phase 3b ([ADR-W-130](../../../docs/06w-decisions-workspace.md#adr-w-130) Am. 1) — THE INTERNAL-TEXT LEAK LOCK.
 *
 * The class (the 2026-10-23 amendment): *a matched message interpolates a value the engine or parser MADE — a scaffold
 * object, a minted point, a derived angle, rewritten arithmetic — and the only guard was a shape regex over text already
 * laundered by a prefix strip.* Four open issues showed it: #2151 (a scaffold circle and a minted point), #2132 and
 * #2048 (the engine's `1·R`, `0.5·|DB|`), #2345 (an angle the tool derived, «∠AAB»). Phase 3b checks every shown value
 * by provenance (`humanizeError`'s provenance check, `renderNote` for key notes).
 *
 * This lock asserts on RENDERED text only, through the paths a student's line takes — `runSubmit` with the model
 * mocked, App's own `figureExplainer`, and `replay`'s row statuses — with the shared predicate
 * `internalTextViolations` (`shell/studentText`). It covers:
 *   1. the four issues' exact sequences (rule 4) — each refusal is the floor or the d20 (c′) sentence, exactly, and
 *      clean. It does NOT assert that they build: their reading bugs are each issue's own fix;
 *   2. the class — every supported catalog row × he/en on a fresh figure: every note and row status is clean;
 *   3. every golden entry that carries its figure (the corpus scenarios ending in an error, the leak sequences);
 *   4. the verifier's rows over the 2-D fixtures folder (lock-only: a verifier row never floors at runtime);
 *   5. non-vacuity — the HEAD strings of the four issues are caught by the predicate, and the sweeps rendered messages.
 * Plus #2461: an id whose letters carry a mint suffix («O-2») is not a name the student can see, so a value showing it
 * reads the floor (resolver check (a)), while the same figure's drawn circle in a circle slot is worded by its role.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...args: unknown[]) => llmParseMock(...args) }));

import i18n from '@/i18n';
import he from '@/i18n/locales/he.json';
import en from '@/i18n/locales/en.json';
import { type Translate } from '@/i18n/humanizeError';
import { violationText } from '@/i18n/violationText';
import { circleRefs } from '@/engine';
import { COMMAND_CATALOG } from '@/parser/catalog';
import { deserializeFigure } from '@/store/figureFile';
import { replay, useGeoStore } from '@/store/geoStore';
import { runSubmit, type SubmitDeps } from '@/app/submitPipeline';
import { utteranceForError, otherUtteranceForError } from '@/app/errorSubject';
import { figureExplainer, figureVocabulary, studentVocabulary } from '@/app/studentVocabulary';
import { noteParamText, renderNote } from '@/app/renderNote';
import { internalTextViolations, labelsIn, type StudentVocabulary } from '../../../shell/studentText';
import { GOLDEN } from '@/i18n/__tests__/humanize-golden.test';
import { SCENARIOS, scenarioFacts } from '@/__tests__/scenarios-corpus';
import type { Fact } from '@/store/geoStore';

const T: Record<'he' | 'en', Translate> = {
  he: (k, o) => i18n.getFixedT('he')(k, o) as string,
  en: (k, o) => i18n.getFixedT('en')(k, o) as string,
};
const st = () => useGeoStore.getState();
const plain = (s: string) => s.replace(/[⁦-⁩]/g, '');
const FLOOR = { he: 'משהו השתבש בבניית השורה הזאת. נסו לנסח אותה אחרת, או לפרק אותה לשני צעדים.', en: 'Something went wrong building this line. Try wording it differently, or split it into two steps.' };
const HINT_HE = 'אפשר לנסות סדר אחר (להזין קודם את הנתונים), לנסח מחדש, או לבנות את זה בכמה צעדים קטנים.';

/**
 * The literal pieces of every locale template that spell a label as the template's own worked example («למשל AB = »):
 * the template's text, not a value. They are cut out of a rendered message before it is judged, so a label is judged
 * where a value put it, never where a template wrote it.
 */
const TEMPLATE_PIECES: readonly string[] = (() => {
  const out = new Set<string>();
  const walk = (o: unknown) => {
    if (typeof o === 'string') {
      for (const p of o.split(/\{\{[^}]*\}\}/)) {
        const q = plain(p).trim();
        if (q.length >= 4 && labelsIn(q).length) out.add(q);
      }
    } else if (o && typeof o === 'object') for (const v of Object.values(o)) walk(v);
  };
  walk([he, en]);
  return [...out].sort((a, b) => b.length - a.length);
})();

/** The predicate, as a rendered message is judged: the figure's vocabulary, the templates' own text cut out. */
function violations(text: string, vocab: StudentVocabulary, locale: 'he' | 'en', said?: string, other?: string): string[] {
  if (plain(text) === FLOOR[locale]) return [];
  let body = plain(text);
  for (const own of [said, other]) if (own?.trim()) body = body.split(`«${own.trim()}»`).join('«»');
  for (const p of TEMPLATE_PIECES) body = body.split(p).join(' ⋯ ');
  return internalTextViolations(body, vocab, said, other, { englishProse: locale === 'en' });
}

/** A student's lines through the real submit path, App's own explainer: every note shown, and the figure after. */
async function play(lines: readonly string[], locale: 'he' | 'en' = 'he') {
  st().clear();
  const notes: { text: string; said: string; vocab: StudentVocabulary }[] = [];
  for (const line of lines) {
    const view = () => { const s = st(); const d = replay(s.facts, s.seed); return { construction: d.construction, positions: d.positions }; };
    const vocabNow = () => studentVocabulary(view().construction, [...st().facts.filter((f) => f.enabled).map((f) => f.utterance), line]);
    const deps: SubmitDeps = {
      t: T[locale],
      locale,
      ui: { setInputNote: (m) => { if (m) notes.push({ text: m, said: line, vocab: vocabNow() }); }, setRenameNote: () => {}, setLlmDropped: () => {}, clearText: () => {}, setBusy: () => {} },
      view,
      isBusy: () => false,
      nextPaint: async () => {},
      resolveAfterCommit: () => {},
      llmAbortRef: { current: null },
      explainError: (raw, said, other) => figureExplainer(T[locale], view().construction, st().facts)(raw, said, other),
    };
    await runSubmit(line, deps);
  }
  const s = st();
  const fig = replay(s.facts, s.seed);
  const rows: { text: string; said?: string; other?: string }[] = [];
  const explain = figureExplainer(T[locale], fig.construction, s.facts);
  for (const f of s.facts) {
    const raw = fig.status[f.id];
    if (!raw || raw === 'ok' || raw === 'disabled') continue;
    const said = utteranceForError(s.facts, fig.status, raw);
    const other = otherUtteranceForError(s.facts, raw);
    rows.push({ text: explain(raw, said, other), said, other });
  }
  return { notes, rows, vocab: figureVocabulary(fig.construction, s.facts) };
}

beforeEach(() => {
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ ok: false, reason: 'test: no live calls' });
});

describe('#2201 3b — (1) the four leak issues’ exact sequences', () => {
  const CASES: { issue: string; lines: string[]; after: string }[] = [
    { issue: '#2151', lines: ['מעגל שמרכזו O', 'הנקודה P בתוך המעגל', 'מהנקודה P העבירו משיקים למעגל'], after: FLOOR.he },
    { issue: '#2132', lines: ['מעגל O ברדיוס r', 'OR=r'], after: `הנתון «OR=r» מתייחס לנקודה שעדיין לא הוגדרה (R). הגדירו אותה תחילה. ${HINT_HE}` },
    // #2345 (ADR-758) under #2486 (ADR-759): «רבע מעגל AOB» is centred at O (the middle letter), so AB is a real arc of
    // the quarter — «קשת AB = 40» contradicts its 90° and is refused as over-constrained (#2483), «קשת AB = 90» is
    // already true. Never the floor, never ∠AAB. Read from the locale table (one source).
    { issue: '#2345', lines: ['רבע מעגל AOB', 'קשת AB = 40'], after: plain(T.he('errors.overConstrained_said', { said: 'קשת AB = 40', what: '∠AOB = 40°' })) + ' ' + HINT_HE },
    { issue: '#2345', lines: ['חצי מעגל AOB', 'קשת AB = 40'], after: plain(T.he('errors.overConstrained_said', { said: 'קשת AB = 40', what: '∠AOB = 40°' })) + ' ' + HINT_HE },
    { issue: '#2345', lines: ['רבע מעגל AOB', 'קשת AB = 90'], after: plain(T.he('suite.notice.alreadyDrawn', {})) },
    // The arc-end-is-centre sentence itself, its letters re-based to the middle-letter centre (#2486): O is the centre.
    { issue: '#2345', lines: ['רבע מעגל AOB', 'קשת AO = 40'], after: plain(T.he('input.arcEndIsCentreNoStep', { detail: 'קשת AO = 40', end: 'O' })) },
    { issue: '#2345', lines: ['רבע מעגל BAO', 'קשת AB = 40'], after: plain(T.he('input.arcEndIsCentreNoStep', { detail: 'קשת AB = 40', end: 'A' })) },
    { issue: '#2048', lines: ['AD:DB = 1:2'], after: `הנתון «AD:DB = 1:2» מתייחס לנקודה שעדיין לא הוגדרה (A, D, B). הגדירו אותה תחילה. ${HINT_HE}` },
  ];
  for (const c of CASES) {
    it(`${c.issue} ${c.lines.join(' · ')} → ${c.after === FLOOR.he ? 'the floor' : 'the named refusal'}`, async () => {
      const { notes } = await play(c.lines);
      const last = notes.filter((n) => n.said === c.lines[c.lines.length - 1]);
      expect(last.map((n) => plain(n.text))).toContain(c.after);
      for (const n of notes) expect(violations(n.text, n.vocab, 'he', n.said), plain(n.text)).toEqual([]);
    }, 60_000);
  }

  it('[2-D] unchanged: a fragment of the student’s own letters and numbers keeps its bracket («AB = 2 AD»)', async () => {
    const { notes } = await play(['AB = 2 AD']);
    expect(notes.map((n) => plain(n.text))).toContain(`הנתון «AB = 2 AD» מתייחס לנקודה שעדיין לא הוגדרה (|AB| = 2·|AD|). הגדירו אותה תחילה. ${HINT_HE}`);
  }, 60_000);

  it('the English catalog line «S_{ABC}/S_{DEF} = 3/4» names its missing points too', async () => {
    const { notes } = await play(['S_{ABC}/S_{DEF} = 3/4'], 'en');
    expect(notes.map((n) => plain(n.text)).some((x) => x.includes("refers to a point that hasn't been defined yet (A, B, C, D, E, F)"))).toBe(true);
  }, 60_000);
});

describe('#2201 3b — (2) the class: every catalog row × he/en on a fresh figure', () => {
  it('every note and every row status is the floor or clean', async () => {
    const bad: string[] = [];
    let rendered = 0;
    let nonFloor = 0;
    for (const e of COMMAND_CATALOG) {
      if (!e.supported) continue;
      for (const [line, locale] of [[e.he, 'he'], [e.en, 'en']] as const) {
        if (!line) continue;
        const { notes, rows, vocab } = await play([line], locale);
        for (const n of notes) {
          rendered++;
          if (plain(n.text) !== FLOOR[locale]) nonFloor++;
          for (const v of violations(n.text, n.vocab, locale, n.said)) bad.push(`[${locale}] «${line}» note: ${v}`);
        }
        for (const r of rows) {
          rendered++;
          if (plain(r.text) !== FLOOR[locale]) nonFloor++;
          for (const v of violations(r.text, vocab, locale, r.said, r.other)) bad.push(`[${locale}] «${line}» row: ${v}`);
        }
      }
    }
    expect(bad, bad.join('\n')).toEqual([]);
    // non-vacuous: the sweep rendered messages, and messages that are not the floor
    expect(rendered).toBeGreaterThan(20);
    expect(nonFloor).toBeGreaterThan(0);
  }, 900_000);
});

describe('#2201 3b — (3) every golden entry that carries its figure', () => {
  it('the corpus scenarios ending in an error, and the leak sequences, render clean', () => {
    const bad: string[] = [];
    let n = 0;
    for (const e of GOLDEN) {
      if (!e.vocab) continue;
      const vocab = studentVocabulary({ objects: e.vocab.objects as never }, e.vocab.typed);
      for (const locale of ['he', 'en'] as const) {
        const text = figureExplainer(T[locale], { objects: e.vocab.objects as never, constraints: [] } as never, e.vocab.typed.map((u) => ({ enabled: true, utterance: u })))(e.raw, e.said, e.other);
        n++;
        for (const v of violations(text, vocab, locale, e.said, e.other)) bad.push(`[${locale}] ${e.source}: ${v}`);
      }
    }
    expect(bad, bad.join('\n')).toEqual([]);
    expect(n).toBeGreaterThan(40);
  });
});

describe('#2201 3b — (4) the verifier’s rows (lock-only)', () => {
  /** The corpus scenarios that END on a figure the verifier flags (`expectViolations`) — the rows a student reads. */
  const FLAGGED = SCENARIOS.filter((sc) => sc.expectViolations);

  it('no figure.v row of a 2-D fixture, or of a corpus figure the verifier flags, carries a value the student cannot see', () => {
    const fixtures = import.meta.glob('../../__tests__/fixtures/*.geo.json', { eager: true, query: '?raw', import: 'default' }) as Record<string, string>;
    expect(Object.keys(fixtures).length).toBeGreaterThan(100);
    const figures: [string, () => Fact[]][] = [
      ...Object.entries(fixtures).map(([file, raw]) => [file, () => { const r = deserializeFigure(raw); return r.ok ? r.file.facts : []; }] as [string, () => Fact[]]),
      ...FLAGGED.map((sc) => [sc.id, () => scenarioFacts(sc)] as [string, () => Fact[]]),
    ];
    const bad: string[] = [];
    let rows = 0;
    for (const [name, get] of figures) {
      const facts = get();
      const fig = replay(facts, 0);
      const vocab = figureVocabulary(fig.construction, facts);
      for (const v of fig.violations) {
        rows++;
        const text = violationText(v, T.he, circleRefs(fig.construction));
        for (const x of violations(text, vocab, 'he')) bad.push(`${name}: ${x}`);
      }
    }
    // a hit is FOUND WORK for the orchestrator: a verifier row never floors at runtime (a product question)
    expect(bad, bad.join('\n')).toEqual([]);
    // non-vacuous: the fixtures verify (no rows), so the flagged corpus figures are what the sweep reads
    expect(rows).toBeGreaterThan(0);
  }, 900_000);
});

describe('#2201 3b — (5) non-vacuity: the gate catches what HEAD showed', () => {
  const HEAD: { issue: string; text: string; said: string; vocab: StudentVocabulary }[] = [
    { issue: '#2151', text: 'לא ניתן לבנות את T: המעגלים O ו-OP אינם נחתכים. ייתכן שצריך להתאים את הגדלים.', said: 'מהנקודה P העבירו משיקים למעגל', vocab: { typed: 'מעגל שמרכזו O\nהנקודה P בתוך המעגל', names: ['O', 'P'] } },
    { issue: '#2132', text: 'הנתון «OR=r» מתייחס לנקודה שעדיין לא הוגדרה (|OR| = 1·R). הגדירו אותה תחילה.', said: 'OR=r', vocab: { typed: 'מעגל O ברדיוס r', names: ['O'] } },
    { issue: '#2345', text: 'זווית דורשת שלוש נקודות שונות — ב-«∠AAB» הקודקוד חוזר על עצמו.', said: 'קשת AB = 40', vocab: { typed: 'רבע מעגל AOB', names: ['A', 'O', 'B'] } },
    { issue: '#2048', text: 'הנתון «AD:DB = 1:2» מתייחס לנקודה שעדיין לא הוגדרה (|AD| = 0.5·|DB|). הגדירו אותה תחילה.', said: 'AD:DB = 1:2', vocab: { typed: '', names: [] } },
  ];
  for (const h of HEAD) {
    it(`${h.issue}: HEAD's text is a violation`, () => {
      expect(violations(h.text, h.vocab, 'he', h.said).length, h.text).toBeGreaterThan(0);
    });
  }
});

describe('#2201 3b — #2461: a minted id is not a name, by provenance', () => {
  const PAIR = ['שני מעגלים בעלי מרכז משותף O', 'רדיוס מעגל חיצוני הוא 10', 'רדיוס מעגל פנימי 9'];
  it('a value showing «O-2» reads the floor; the drawn inner circle in a circle slot is worded by its role', async () => {
    const { vocab } = await play(PAIR);
    const s = st();
    const fig = replay(s.facts, s.seed);
    const explain = figureExplainer(T.he, fig.construction, s.facts);
    expect(fig.construction.objects.some((o) => o.id === 'circle-O-2')).toBe(true);
    // an Id field (not a circle slot) carrying the minted circle: «O-2» is no name the student can see
    expect(plain(explain('unresolved dependencies for: circle-O-2', 'X'))).toBe(FLOOR.he);
    // the circle slot of the same circle: the role (#2305), never the id
    const slot = plain(explain('cannot take a tangent at the centre of circle-O-2', 'משיק למעגל הפנימי בנקודה O'));
    expect(slot).toContain('המעגל הפנימי');
    expect(slot).not.toContain('O-2');
    expect(violations(slot, vocab, 'he', 'משיק למעגל הפנימי בנקודה O')).toEqual([]);
    // a key note's object id resolves the same way
    expect(noteParamText('circle-O-2', vocab)).toBeNull();
    expect(noteParamText('poly-ABCD', { typed: 'ריבוע ABCD', names: [] })).toBe('ABCD');
  }, 60_000);

  it('renderNote: an id the student typed is named; an anonymous token is the floor', () => {
    const t = T.he;
    const vocab = { typed: 'ריבוע ABCD', names: [] };
    const self = renderNote({ key: 'input.sentenceSelfConflict', params: { sentence: 'ריבוע ABCD', id: 'poly-ABCD' } }, { t, explain: (r) => r, vocab, said: 'ריבוע ABCD' });
    expect(plain(self)).toBe(plain(t('input.sentenceSelfConflict', { sentence: 'ריבוע ABCD', id: 'ABCD' })));
    expect(renderNote({ key: 'input.sentenceSelfConflict', params: { sentence: 'x', id: '~tanmid-OE' } }, { t, explain: (r) => r, vocab })).toBe(t('errors.floor'));
  });
});
