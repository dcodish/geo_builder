/**
 * #2064 ([ADR-643](../../../docs/06-decisions.md#adr-643)) — A HEIGHT NAMED BY TWO EXISTING POLYGON VERTICES IS THE
 * RIGHT ANGLE THE PAIR NAMES, NEVER A VERTEX REDEFINED AS A FOOT; AND A DECLARED POLYGON IS NEVER SQUASHED TO A POINT
 * OR GIVEN A STRAIGHT CORNER, GREEN.
 *
 * Measured at 939b160a through `decideDeterministic2D` → `commitVerdict` → `replay`: «ריבוע ABCD» · «AB גובה»
 * committed `foot{B from A onto CD}` and the square collapsed to A = B = C = D, every row green; «BC גובה ל-AB» was
 * refused «B נמצאת על הצלע AB…»; «מרובע ABCD» · «AC גובה» moved C onto BD; «ריבוע ABCD» · «B אמצע CD» drew one
 * point; «מרובע ABCD» · «זווית BCD = 180» drew three corners on one line. Operator rulings: 2026-10-13 (rulings 2
 * and 3 on #2064) and 2026-10-14 (#2064 items 1–4, #2085 item 2).
 *
 * Every lock calls the real decision and commit seams; the model is mocked and never asked (standing rule 2).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { decideDeterministic2D, ROLE_READING_WORK_CAP, type Verdict2D } from '../decideDeterministic';
import { commitVerdict } from '../submitPipeline';
import { runEditCommit } from '../editPipeline';
import { groupKey, replay, useGeoStore } from '@/store/geoStore';
import i18n from '@/i18n';
import { humanizeError, type Translate } from '@/i18n/humanizeError';
import { otherUtteranceForError } from '@/app/errorSubject';
import { vertexPairVerdict } from '../vertexPairCevian';
import { buildParseCtx } from '@/parser';

const st = () => useGeoStore.getState();
const t: Translate = (k, o) => i18n.t(k, o) as string;
const plain = (s: string) => s.replace(/[⁦-⁩]/g, '');

async function decideHere(line: string): Promise<Verdict2D> {
  const f = replay(st().facts, st().seed);
  return decideDeterministic2D({ facts: st().facts, seed: st().seed, view: { construction: f.construction, positions: f.positions } }, line, /[א-ת]/.test(line) ? 'he' : 'en');
}
async function drive(prefix: readonly string[]) {
  st().clear();
  for (const p of prefix) {
    const v = await decideHere(p);
    expect(v.kind, `«${p}» builds`).toBe('commit');
    commitVerdict(v, p);
  }
}
/** What the student reads under the box, in Hebrew. */
function textOf(v: Verdict2D, line: string): string {
  if (v.kind !== 'refuse' && v.kind !== 'noop') return '';
  const n = v.note;
  if (!n) return '';
  if ('explain' in n) return plain(humanizeError(n.explain, t, line, otherUtteranceForError(st().facts, n.explain)));
  const params = Object.fromEntries(Object.entries(n.params ?? {}).map(([k, x]) => [k, x && typeof x === 'object' && 't' in x ? i18n.t((x as { t: string }).t) : x]));
  return plain(i18n.t(n.key, params) as string);
}
const pos = () => replay(st().facts, st().seed).positions;
const snapshot = () => JSON.stringify([...pos()].filter(([k]) => /^[A-Z]$/.test(k)).map(([k, p]) => [k, p.x.toFixed(9), p.y.toFixed(9)]));
const len = (a: string, b: string) => Math.hypot(pos().get(a)!.x - pos().get(b)!.x, pos().get(a)!.y - pos().get(b)!.y);
/** |cos| of the angle at `b` between ba and bc — 0 is a right angle. */
const cosAt = (a: string, b: string, c: string) => {
  const p = pos();
  const u = { x: p.get(a)!.x - p.get(b)!.x, y: p.get(a)!.y - p.get(b)!.y };
  const w = { x: p.get(c)!.x - p.get(b)!.x, y: p.get(c)!.y - p.get(b)!.y };
  return Math.abs(u.x * w.x + u.y * w.y) / (Math.hypot(u.x, u.y) * Math.hypot(w.x, w.y));
};

const ALREADY = 'זה כבר קיים באיור — אין מה להוסיף.';
const DEFINED = (id: string) => `${id} כבר מוגדרת ולא ניתן להגדיר אותה מחדש כמשהו אחר. כדי לשנות, ערכו או מחקו את הצעד הקודם.`;

beforeEach(() => {
  st().clear();
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ built: [], dropped: [] });
});

describe('#2064 — a height that is already a height answers «כבר קיים», in every spelling (ruling 2, 2026-10-13)', () => {
  it.each([
    ['ריבוע ABCD', 'AB גובה'],
    ['ריבוע ABCD', 'AB הוא גובה'],
    ['ריבוע ABCD', 'הגובה AB'],
    ['ריבוע ABCD', 'BA גובה'],
    ['ריבוע ABCD', 'the altitude AB'],
    ['ריבוע ABCD', 'AB ו-CD הם גבהים'],
    ['ריבוע ABCD', 'BC גובה ל-AB'],
    ['ריבוע ABCD', 'BC גובה ל- AB'],
    ['ריבוע ABCD', 'AB גובה לצלע BC'],
    ['ריבוע ABCD', 'AD גובה'],
    ['מלבן ABCD', 'AB גובה'],
    ['מלבן ABCD', 'BA גובה'],
    ['מלבן ABCD', 'AB ו-CD הם גבהים'],
  ])('«%s» · «%s» → noop «כבר קיים», nothing moves', async (shape, line) => {
    await drive([shape]);
    const before = snapshot();
    const n = st().facts.length;
    const v = await decideHere(line);
    expect(v.kind).toBe('noop');
    expect(textOf(v, line)).toBe(ALREADY);
    commitVerdict(v, line);
    expect(st().facts.length, 'no row').toBe(n);
    expect(snapshot(), 'stability: no point moves').toBe(before);
    expect(llmParseMock).not.toHaveBeenCalled();
  });

  it('a right triangle at A: «AB גובה» is the height from B to AC — already true', async () => {
    await drive(['משולש ABC', 'זווית BAC = 90']);
    const v = await decideHere('AB גובה');
    expect(v.kind).toBe('noop');
    expect(textOf(v, 'AB גובה')).toBe(ALREADY);
  });

  it('«ריבוע ABCD» · «הגובה AB = 5»: the length is a new given — AB = 5 builds, the square keeps its shape', async () => {
    for (const line of ['הגובה AB = 5', 'AB גובה = 5', 'the altitude AB = 5']) {
      await drive(['ריבוע ABCD']);
      const v = await decideHere(line);
      expect(v.kind, line).toBe('commit');
      commitVerdict(v, line);
      expect(replay(st().facts, st().seed).status[st().facts.at(-1)!.id]).toBe('ok');
      expect(len('A', 'B'), line).toBeCloseTo(5, 6);
      expect(len('B', 'C'), 'still a square').toBeCloseTo(5, 6);
      expect(cosAt('A', 'B', 'C')).toBeLessThan(1e-6);
      expect(cosAt('B', 'C', 'D')).toBeLessThan(1e-6);
    }
  });
});

describe('#2064 — a stated side through one letter: the apex is the letter off the side, the foot the shared one', () => {
  it('«מרובע ABCD» · «BC גובה ל-AB» makes the angle at B right', async () => {
    await drive(['מרובע ABCD']);
    const v = await decideHere('BC גובה ל-AB');
    expect(v.kind).toBe('commit');
    if (v.kind !== 'commit') return;
    expect(v.commands).toContainEqual({ type: 'set-perpendicular', a: 'C', b: 'B', c: 'B', d: 'A' });
    expect(v.commands.some((c) => c.type === 'foot'), 'no foot is minted').toBe(false);
    commitVerdict(v, 'BC גובה ל-AB');
    expect(cosAt('A', 'B', 'C')).toBeLessThan(1e-6);
  });

  it('«משולש ABD» · «BD גובה לצלע AB» makes ∠ABD = 90° (an existing vertex pair; ADR-525 narrowed)', async () => {
    await drive(['משולש ABD']);
    const v = await decideHere('BD גובה לצלע AB');
    expect(v.kind).toBe('commit');
    commitVerdict(v, 'BD גובה לצלע AB');
    expect(cosAt('A', 'B', 'D')).toBeLessThan(1e-6);
  });
});

describe('#2064 Stage 2 (ADR-644) — a height that is not yet true BUILDS, its side a free choice; no vertex is redefined', () => {
  it.each([
    [['מרובע ABCD'], 'AC גובה', ['A', 'C', 'B']],
    [['מרובע ABCD'], 'AB גובה', ['A', 'B', 'C']],
    [['מקבילית ABCD'], 'AB גובה', ['A', 'B', 'C']],
    [['משולש ABC', 'משולש ACD'], 'AB גובה', ['A', 'B', 'C']],
    [['משולש ABC', 'משולש ACD'], 'AC גובה', ['A', 'C', 'B']],
  ] as [string[], string, [string, string, string]][])('%j · «%s» builds the first right angle the pair names (%j), green, no foot minted', async (prefix, line, [a, b, c]) => {
    await drive(prefix);
    const v = await decideHere(line);
    expect(v.kind).toBe('commit');
    if (v.kind !== 'commit') return;
    expect(v.commands.map((x) => x.type)).toEqual(['altitude-choice']);
    commitVerdict(v, line);
    expect(Object.values(replay(st().facts, st().seed).status).every((x) => x === 'ok')).toBe(true);
    expect(cosAt(a, b, c)).toBeLessThan(1e-6);
    expect(llmParseMock).not.toHaveBeenCalled();
  });

  it('the plural on a quadrilateral, «AB and CD are altitudes», builds one choice per segment', async () => {
    await drive(['מרובע ABCD']);
    const v = await decideHere('AB and CD are altitudes');
    expect(v.kind === 'commit' && v.commands.map((x) => x.type)).toEqual(['altitude-choice', 'altitude-choice']);
  });
});

describe('#2064 — a stated side through neither letter still never redefines a vertex (ruling 3)', () => {
  it.each([
    [['ריבוע ABCD'], 'AB גובה לצלע CD', 'B'],
    [['מרובע ABCD'], 'AB גובה לצלע CD', 'B'],
  ] as [string[], string, string][])('%j · «%s» → «%s כבר מוגדרת…», nothing committed, nothing moves', async (prefix, line, id) => {
    await drive(prefix);
    const before = snapshot();
    const n = st().facts.length;
    const v = await decideHere(line);
    expect(v.kind).toBe('refuse');
    expect(textOf(v, line)).toBe(DEFINED(id));
    commitVerdict(v, line);
    expect(st().facts.length).toBe(n);
    expect(snapshot()).toBe(before);
    expect(llmParseMock).not.toHaveBeenCalled();
  });
});

describe('#2064 — controls: what the ruling did not touch', () => {
  it('«משולש ABC» · «AB גובה» is still ADR-642’s right angle at B', async () => {
    await drive(['משולש ABC']);
    const v = await decideHere('AB גובה');
    expect(v.kind === 'commit' && v.commands).toContainEqual({ type: 'set-perpendicular', a: 'A', b: 'B', c: 'B', d: 'C' });
  });
  it('#2085 item 1 (ruled A): «משולש ABC» · «AB גובה» keeps its right angle fixed at B — «הציגו תצורה אחרת» never moves it', async () => {
    await drive(['משולש ABC']);
    const v = await decideHere('AB גובה');
    commitVerdict(v, 'AB גובה');
    expect(st().facts.some((f) => (f.cmd.type as string) === 'altitude-choice'), 'no cyclable choice').toBe(false);
    for (let press = 0; press < 3; press++) {
      st().resample();
      expect(cosAt('A', 'B', 'C'), `press ${press + 1}`).toBeLessThan(1e-6);
    }
  });
  it('«משולש ABC» · «BD גובה לצלע AB» with D new keeps ADR-525’s refusal', async () => {
    await drive(['משולש ABC']);
    const v = await decideHere('BD גובה לצלע AB');
    expect(v.kind === 'refuse' && 'key' in v.note && v.note.key).toBe('input.cevianApexOnSide');
  });
  it('«משולש ABC» · «D על BC» · «AD גובה» still places the foot D (a rider, not a polygon vertex)', async () => {
    await drive(['משולש ABC', 'D על BC']);
    const v = await decideHere('AD גובה');
    expect(v.kind === 'commit' && v.commands).toContainEqual({ type: 'foot', id: 'D', from: 'A', a: 'B', b: 'C', named: true });
  });
  it('«משולש ABC» · «משולש ACD» · «AB תיכון» still builds B as the midpoint of CD (ruling item 2: medians are not members)', async () => {
    await drive(['משולש ABC', 'משולש ACD']);
    const v = await decideHere('AB תיכון');
    expect(v.kind === 'commit' && v.commands).toContainEqual({ type: 'midpoint', id: 'B', a: 'C', b: 'D' });
  });
});

describe('#2064 B1 — a sentence that squashes the shape to a point: «B כבר מוגדרת…» (item 3, 2026-10-14)', () => {
  it.each([
    ['ריבוע ABCD', 'B אמצע CD'],
    ['ריבוע ABCD', 'B היא אמצע CD'],
    ['ריבוע ABCD', 'B אמצע הקטע CD'],
    ['ריבוע ABCD', 'AB תיכון'],
    ['ריבוע ABCD', 'התיכון AB'],
    ['ריבוע ABCD', 'AB תיכון לצלע CD'],
    ['ריבוע ABCD', 'the median AB'],
  ])('«%s» · «%s» → refused, the square stays', async (shape, line) => {
    await drive([shape]);
    const before = snapshot();
    const v = await decideHere(line);
    expect(v.kind).toBe('refuse');
    expect(textOf(v, line)).toBe(DEFINED('B'));
    commitVerdict(v, line);
    expect(snapshot()).toBe(before);
  });
});

describe('#2064 B2 / #2085 item 2 — a straight corner is refused with the ruled sentence', () => {
  it.each([
    [['מרובע ABCD'], 'זווית BCD = 180', 'לא ניתן: עם «זווית BCD = 180» המרובע ABCD היה נעשה קו ישר — הנקודות B, C, D היו על ישר אחד, וקו ישר אינו מרובע. בדקו את הנתונים.'],
    [['מרובע ABCD'], 'זווית BCD = 0', 'לא ניתן: עם «זווית BCD = 0» המרובע ABCD היה נעשה קו ישר — הנקודות B, C, D היו על ישר אחד, וקו ישר אינו מרובע. בדקו את הנתונים.'],
    [['מרובע ABCD'], '∠BCD = 180', 'לא ניתן: עם «∠BCD = 180» המרובע ABCD היה נעשה קו ישר — הנקודות B, C, D היו על ישר אחד, וקו ישר אינו מרובע. בדקו את הנתונים.'],
    [['מרובע ABCD'], 'C על BD', 'לא ניתן: עם «C על BD» המרובע ABCD היה נעשה קו ישר — הנקודות B, C, D היו על ישר אחד, וקו ישר אינו מרובע. בדקו את הנתונים.'],
    [['מרובע ABCD'], 'B אמצע CD', 'לא ניתן: עם «B אמצע CD» המרובע ABCD היה נעשה קו ישר — הנקודות B, C, D היו על ישר אחד, וקו ישר אינו מרובע. בדקו את הנתונים.'],
    [['מרובע ABCD'], 'AB תיכון', 'לא ניתן: עם «AB תיכון» המרובע ABCD היה נעשה קו ישר — הנקודות B, C, D היו על ישר אחד, וקו ישר אינו מרובע. בדקו את הנתונים.'],
    [['קטע BD', 'C על BD', 'נקודה A'], 'מרובע ABCD', 'לא ניתן: עם «מרובע ABCD» המרובע ABCD היה נעשה קו ישר — הנקודות B, C, D היו על ישר אחד, וקו ישר אינו מרובע. בדקו את הנתונים.'],
    [['מחומש ABCDE'], 'זווית BCD = 180', 'לא ניתן: עם «זווית BCD = 180» הנקודות B, C, D היו על ישר אחד, והמחומש ABCDE היה נעשה מרובע. בדקו את הנתונים.'],
    [['מחומש ABCDE'], '∠BCD = 180°', 'לא ניתן: עם «∠BCD = 180°» הנקודות B, C, D היו על ישר אחד, והמחומש ABCDE היה נעשה מרובע. בדקו את הנתונים.'],
    [['מחומש ABCDE'], 'זווית BCD = 0', 'לא ניתן: עם «זווית BCD = 0» הנקודות B, C, D היו על ישר אחד, והמחומש ABCDE היה נעשה מרובע. בדקו את הנתונים.'],
    [['מחומש ABCDE'], 'זווית EAB = 180', 'לא ניתן: עם «זווית EAB = 180» הנקודות E, A, B היו על ישר אחד, והמחומש ABCDE היה נעשה מרובע. בדקו את הנתונים.'],
    [['מחומש ABCDE'], 'C על BD', 'לא ניתן: עם «C על BD» הנקודות B, C, D היו על ישר אחד, והמחומש ABCDE היה נעשה מרובע. בדקו את הנתונים.'],
    [['משושה ABCDEF'], 'זווית BCD = 180', 'לא ניתן: עם «זווית BCD = 180» הנקודות B, C, D היו על ישר אחד, והמשושה ABCDEF היה נעשה מחומש. בדקו את הנתונים.'],
  ] as [string[], string, string][])('%j · «%s»', async (prefix, line, text) => {
    await drive(prefix);
    const before = snapshot();
    const v = await decideHere(line);
    expect(v.kind).toBe('refuse');
    expect(textOf(v, line)).toBe(text);
    commitVerdict(v, line);
    expect(snapshot()).toBe(before);
    expect(llmParseMock).not.toHaveBeenCalled();
  });

  it('English: the pentagon sentence names both polygons', async () => {
    await drive(['מחומש ABCDE']);
    const v = await decideHere('angle BCD = 180');
    expect(v.kind === 'refuse' && 'explain' in v.note && plain(humanizeError(v.note.explain, (k, o) => i18n.t(k, { ...o, lng: 'en' }) as string, 'angle BCD = 180'))).toBe(
      'Can\'t do that: with «angle BCD = 180», B, C, D would lie on one line, and the pentagon ABCDE would become a quadrilateral. Check the givens.',
    );
  });
});

describe('#2064 — the ✎ edit seam asks the same question (ADR-W-006)', () => {
  const submit = async (u: string) => {
    const v = await decideHere(u);
    commitVerdict(v, u);
    return groupKey(st().facts[st().facts.length - 1]);
  };
  const notes: string[] = [];
  const deps = { t: (k: string, o?: Record<string, unknown>) => (o ? `${k}:${JSON.stringify(o)}` : k), setInputNote: (m: string) => notes.push(m), resolveAfterCommit: () => {} };

  it('editing a row into «AB גובה» on a square answers «כבר קיים» and keeps the row', async () => {
    st().clear();
    await submit('ריבוע ABCD');
    const key = await submit('AB = 5');
    expect(runEditCommit(key, 'AB גובה', deps)).toBe(false);
    expect(notes.at(-1)).toBe('input.alreadyDrawn');
  });
  it('editing a row into «AC גובה» on a quadrilateral builds the right angle (ADR-644)', async () => {
    st().clear();
    await submit('מרובע ABCD');
    const key = await submit('AB = 5');
    expect(runEditCommit(key, 'AC גובה', deps)).toBe(true);
    expect(st().facts.some((f) => f.cmd.type === 'altitude-choice')).toBe(true);
  });
  it('editing a row into «AB גובה לצלע CD» on a quadrilateral is refused with the vertex', async () => {
    st().clear();
    await submit('מרובע ABCD');
    const key = await submit('AB = 5');
    expect(runEditCommit(key, 'AB גובה לצלע CD', deps)).toBe(false);
    expect(notes.at(-1)).toBe(`errors.alreadyDefined:${JSON.stringify({ id: 'B' })}`);
  });
});

describe('#2064 — the seam predicate itself (`vertexPairVerdict`)', () => {
  const verdictOn = async (prefix: string[], line: string) => {
    await drive(prefix);
    const d = replay(st().facts, st().seed);
    return vertexPairVerdict(line, buildParseCtx(d.construction, d.positions), [...st().facts], st().seed, ROLE_READING_WORK_CAP);
  };
  it('implied on a square, adopted long form with a tail, null where nothing holds or the line is not a vertex pair', async () => {
    expect(await verdictOn(['ריבוע ABCD'], 'AB גובה')).toEqual({ kind: 'implied' });
    expect(await verdictOn(['ריבוע ABCD'], 'הגובה AB = 5')).toEqual({ kind: 'adopt', reading: 'הגובה AB לצלע BC = 5' });
    expect(await verdictOn(['מרובע ABCD'], 'AC גובה')).toBeNull();
    expect(await verdictOn(['משולש ABC', 'D על BC'], 'AD גובה')).toBeNull();
    expect(await verdictOn(['ריבוע ABCD'], 'AB גובה לצלע BC')).toBeNull(); // a stated side: the rule's own reading
  });
});
