/**
 * #1995 batch 1 ([ADR-W-155](../../docs/06w-decisions-workspace.md#adr-w-155)) — analytic's "no such point / line"
 * answers in the ask box and its two bisector-on-a-side refusals now give one next step (the operator's rule of
 * 2026-10-13, card 18 B). The bisector pair stays 2-D's sentence (ADR-W-118 B1; byte-equal lock:
 * `shell/__tests__/cevian-side-wording-parity.test.ts`).
 *
 * The refusals go through `decideSubmit` + `errorText`, the ask answers through `ask` and the App's frame
 * («{{question}} — …»). A row that teaches a step submits it and asserts it is taken (docs/17 §9); the point
 * example is read OUT OF the sentence, so the message and the accepted spelling come from one source.
 */
import { describe, expect, it } from 'vitest';
import { ask } from '../app/ask';
import { derive } from '../engine/derive';
import { decideSubmit, type SubmitVerdict } from '../app/submit';
import { errorText } from '../app/errorText';
import { analyticI18n } from '../i18n';

type T = (k: string, o?: Record<string, unknown>) => string;
const plain = (f: T): T => (k, o) => f(k, o).replace(/[⁦-⁩]/g, '');
const he = plain(analyticI18n.getFixedT('he') as unknown as T);
const en = plain(analyticI18n.getFixedT('en') as unknown as T);

const decide = (prefix: readonly string[], line: string): SubmitVerdict => {
  for (let i = 0; i < prefix.length; i++) {
    expect(decideSubmit(prefix[i], prefix.slice(0, i), 0).kind, `«${prefix[i]}» builds`).toBe('record');
  }
  return decideSubmit(line, prefix, 0);
};
const textOf = (v: SubmitVerdict, t: T): string | null => (v.kind === 'refused' ? errorText(v.error, t) : null);

const fmt = (v: number) => String(Math.round(v * 100) / 100);
/** The ask box's line for a missing object — App.tsx's frame, with the same key choice. */
const askLine = (lines: string[], question: string, t: T): string | null => {
  const a = ask(derive(lines, 0), question, fmt);
  if (!a.missing || a.missing.used) return null;
  return `${a.question} — ${t(a.missing.kind === 'point' ? 'askMissingPoint' : 'askMissingCurve', { name: a.missing.name })}`;
};
const FIG = ['A(0,0)', 'B(6,0)', 'C(3,5)', 'משולש ABC'];

describe('#1995 batch 1 — analytic: the ask box says what to add', () => {
  it('a missing point: add it — the taught «D(1,2)» is taken, and the question is then answered', () => {
    const s = askLine(FIG, 'המרחק מ-D לישר AB', he)!;
    expect(s).toBe('המרחק מ-D לישר AB — אין בשרטוט נקודה בשם D. הוסיפו אותה לשרטוט, למשל «D(1,2)», ושאלו שוב.');
    const example = /למשל «([^»]+)»/.exec(s)![1];
    expect(decideSubmit(example, FIG, 0).kind).toBe('record');
    const a = ask(derive([...FIG, example], 0), 'המרחק מ-D לישר AB', fmt);
    expect(a.missing).toBeFalsy();
    expect(a.value).not.toBeNull();
  });
  it('a missing line: define it first', () => {
    expect(askLine(FIG, 'משוואת הישר l9', he)).toBe('משוואת הישר l9 — אין בשרטוט ישר או מעגל בשם l9. הגדירו אותו קודם, ושאלו שוב.');
  });
  it('the English twins take the same shape', () => {
    expect(askLine(FIG, 'המרחק מ-D לישר AB', en)).toBe('המרחק מ-D לישר AB — there is no point D in your figure. Add it to the figure, for example «D(1,2)», and ask again.');
    expect(askLine(FIG, 'משוואת הישר l9', en)).toBe('משוואת הישר l9 — there is no line or circle named l9 in your figure. Define it first, and ask again.');
  });
});

describe('#1995 batch 1 — analytic: a bisector named by a side teaches the line that builds', () => {
  it('the triangle: give its other end a new letter — «AD חוצה זווית A» is taken', () => {
    const fig = ['A(0,0)', 'B(4,0)', 'C(1,3)', 'משולש ABC'];
    expect(textOf(decide(fig, 'AB חוצה זווית'), he)).toBe('AB היא צלע של המשולש ולכן אינה יכולה לחצות את זווית A. חוצה זווית יוצא מקודקוד אל הצלע שמולו — תנו לקצה השני שלו אות חדשה.');
    expect(decideSubmit('AD חוצה זווית A', fig, 0).kind).toBe('record');
  });
  it('a quadrilateral: give the bisector’s other end a new letter — «AE חוצה זווית A» is taken', () => {
    const fig = ['A(0,0)', 'B(4,0)', 'C(5,3)', 'D(0,3)', 'מרובע ABCD'];
    expect(textOf(decide(fig, 'AB חוצה זווית'), he)).toBe('AB היא צלע של המרובע ולכן אינה יכולה לחצות את זווית A. תנו לקצה השני של חוצה הזווית אות חדשה.');
    expect(decideSubmit('AE חוצה זווית A', fig, 0).kind).toBe('record');
  });
});
