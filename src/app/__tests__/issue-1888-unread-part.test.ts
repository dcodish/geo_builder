/**
 * #1888 / #1889 ([ADR-603](../../../docs/06-decisions.md#adr-603)) — a PART THE READING NEVER READ refuses the line.
 *
 * Operator rulings, 2026-10-08:
 *  - #1888: *"the syntax משולש ABC ישר זווית ב-B should be rejected. this is not how you define the right angle"*;
 *    follow-up *"Only when a part is lost"*, then *"Refuse it too"* (an unread part that happens to hold) and
 *    *"Teach the right form"*: «…כתבו קודם «משולש ABC», ואחר כך בשורה נפרדת «∠ABC = 90°».»
 *  - #1889: *"these are 2 inputs in one line and we should ask to separate"*.
 *
 * Measured at 5edeeca1 through `decideDeterministic2D`, the LLM mocked: every line below committed green with the
 * part gone («ב-B» → right angle at C; «שהיא אמצע BD» → E not the midpoint; «על AB» → E off AB). #1833's rows
 * (disarmed into #1888's plan) are here too.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { decideDeterministic2D } from '../decideDeterministic';
import { commitVerdict } from '../submitPipeline';
import { runEditCommit } from '../editPipeline';
import { groupKey, replay, useGeoStore } from '@/store/geoStore';
import { buildParseCtx, parse } from '@/parser';
import heLocale from '@/i18n/locales/he.json';
import enLocale from '@/i18n/locales/en.json';

const st = () => useGeoStore.getState();

/** The real decision on the current figure. */
async function decideHere(line: string) {
  const f = replay(st().facts, st().seed);
  return decideDeterministic2D({ facts: st().facts, seed: st().seed, view: { construction: f.construction, positions: f.positions } }, line, /[א-ת]/.test(line) ? 'he' : 'en');
}

/** Drive a prefix through the real decision, committing what the app commits. */
async function drive(prefix: readonly string[]) {
  st().clear();
  for (const p of prefix) {
    const v = await decideHere(p);
    expect(['commit', 'noop'], `the prefix line «${p}» builds: ${JSON.stringify(v).slice(0, 200)}`).toContain(v.kind);
    commitVerdict(v, p);
  }
}

async function expectRefused(prefix: readonly string[], line: string, note: { key: string; params: Record<string, string> }) {
  await drive(prefix);
  const before = st().facts.length;
  const v = await decideHere(line);
  expect(v.kind, `«${line}»: ${JSON.stringify(v).slice(0, 300)}`).toBe('refuse');
  if (v.kind !== 'refuse') return;
  expect(v.category).toBe('guided');
  expect(v.note).toEqual(note);
  expect(v.logs.at(-1)).toMatchObject({ source: 'scope', result: 'scope:split-statements:unread-part' });
  expect(v.binds, 'nothing changes on the figure').toEqual([]);
  commitVerdict(v, line);
  expect(st().facts.length, 'nothing is committed').toBe(before);
  expect(llmParseMock, 'never escalated').not.toHaveBeenCalled();
}

const split = (...parts: string[]) => ({
  key: 'input.scope.split-statements',
  params: { first: parts[0], second: parts[1], all: parts.map((p, i) => `(${i + 1}) ${p}`).join('  ') },
});
const taught = (triangle: string, angle: string) => ({ key: 'input.scope.right-angle-vertex', params: { triangle, angle } });

beforeEach(() => {
  st().clear();
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ built: [], dropped: [] });
});

describe('#1888 — «משולש ABC ישר זווית ב-<V>» is refused whole and TEACHES the two lines that build it', () => {
  it.each([
    [[], 'משולש ABC ישר זווית ב-B', 'ABC'],
    [[], 'משולש ABC ישר זווית ב-A', 'CAB'],
    [[], 'משולש ABC ישר זווית ב-C', 'BCA'],
    [['משולש ABC'], 'משולש ABC ישר זווית ב-B', 'ABC'],
    [['משולש ABC'], 'משולש ABC ישר זווית ב-A', 'CAB'],
    [['משולש ABC'], 'משולש ABC ישר זווית ב-C', 'BCA'],
    // the nondeterministic sequence the issue folded in: the third line is refused, every time
    [['משולש ABC', 'AB ⟂ BC'], 'משולש ABC ישר זווית ב-B', 'ABC'],
    // the class, by reading: any spelling whose lost tail names a vertex of the right triangle it built
    [[], 'משולש ABC ישר זווית שהזווית הישרה שלו ב-B', 'ABC'],
    [[], 'right triangle ABC at B', 'ABC'],
    [[], 'right triangle ABC at C', 'BCA'],
  ] as [string[], string, string][])('«%s» · «%s» → «∠%s = 90°»', async (prefix, line, angle) => {
    await expectRefused(prefix, line, taught('ABC', angle));
  });

  it('further parts of the line follow, numbered on', async () => {
    await expectRefused(['משולש ABC'], 'משולש ABC ישר זווית ב-B ו-AB = 4', {
      key: 'input.scope.right-angle-vertex-more',
      params: { triangle: 'ABC', angle: 'ABC', rest: '(3) AB = 4' },
    });
  });

  it('the message is the operator’s text, the letters filled in, in both locales', () => {
    const he = heLocale.input.scope as Record<string, string>;
    expect(he['right-angle-vertex'].replace('{{triangle}}', 'ABC').replace('{{angle}}', 'ABC')).toBe(
      'בכל שורה נתון אחד — כך הכלי יוכל לבנות ולאמת כל נתון בנפרד. כתבו קודם «משולש ABC», ואחר כך בשורה נפרדת «∠ABC = 90°».',
    );
    const en = enLocale.input.scope as Record<string, string>;
    for (const k of ['right-angle-vertex', 'right-angle-vertex-more']) {
      expect(en[k], k).toContain('{{triangle}}');
      expect(en[k], k).toContain('{{angle}}');
    }
    expect(he['right-angle-vertex-more']).toContain('{{rest}}');
    expect(en['right-angle-vertex-more']).toContain('{{rest}}');
  });

  // TAUGHT REMEDIES ARE HYPOTHESES (#1183): the two lines the message teaches must BUILD, with the right angle at
  // the vertex the student named — a message teaching a spelling the builder refuses is a red lock.
  it.each([
    ['B', 'ABC'],
    ['A', 'CAB'],
    ['C', 'BCA'],
  ])('the taught lines «משולש ABC» · «∠%s…» build the right angle at %s', async (vertex, angle) => {
    await drive(['משולש ABC', `∠${angle} = 90°`]);
    const f = replay(st().facts, st().seed);
    expect(Object.values(f.status).every((s) => s === 'ok')).toBe(true);
    const [P, V, Q] = [angle[0], angle[1], angle[2]].map((k) => f.positions.get(k)!);
    expect(angle[1]).toBe(vertex);
    const dot = (P.x - V.x) * (Q.x - V.x) + (P.y - V.y) * (Q.y - V.y);
    expect(Math.abs(dot) / (Math.hypot(P.x - V.x, P.y - V.y) * Math.hypot(Q.x - V.x, Q.y - V.y))).toBeLessThan(1e-6);
    expect(llmParseMock).not.toHaveBeenCalled();
  });
});

describe('#1889 / the class — a lost part refuses the line with the one-input-per-line message, its parts cut where the reading stops', () => {
  it.each([
    // #1889's two lines
    [['מרובע ABCD'], 'AC ו-BD נפגשים בנקודה E שהיא אמצע BD', ['AC ו-BD נפגשים בנקודה E', 'שהיא אמצע BD']],
    [['מרובע ABCD'], 'AC ו-BD נפגשים בנקודה E על AB', ['AC ו-BD נפגשים בנקודה E', 'על AB']],
    // "refuse it too": an unread part the drawing happens to satisfy
    [['מרובע ABCD'], 'AC ו-BD נפגשים בנקודה E שהיא על BD', ['AC ו-BD נפגשים בנקודה E', 'שהיא על BD']],
    // the measured real spellings
    [['מרובע ABCD'], 'AC ו-BD נחתכים בנקודה E שהיא אמצע BD', ['AC ו-BD נחתכים בנקודה E', 'שהיא אמצע BD']],
    [['מרובע ABCD'], 'האלכסונים AC ו-BD נפגשים בנקודה E שהיא אמצע BD', ['האלכסונים AC ו-BD נפגשים בנקודה E', 'שהיא אמצע BD']],
    [['מרובע ABCD'], 'AC חותך את BD בנקודה E שהיא אמצע BD', ['AC חותך את BD בנקודה E', 'שהיא אמצע BD']],
    [['מרובע ABCD'], 'E חיתוך AC ו-BD שהיא אמצע BD', ['E חיתוך AC ו-BD', 'שהיא אמצע BD']],
    [['מרובע ABCD'], 'AC ו-BD נפגשים בנקודה E שנמצאת על AB', ['AC ו-BD נפגשים בנקודה E', 'שנמצאת על AB']],
    [['מרובע ABCD'], 'AC ו-BD נפגשים בנקודה E על הצלע AB', ['AC ו-BD נפגשים בנקודה E', 'על הצלע AB']],
    [['מרובע ABCD'], 'AC ו-BD נפגשים בנקודה E ש-AE = EC', ['AC ו-BD נפגשים בנקודה E', 'ש-AE = EC']],
    [['מרובע ABCD'], 'AC ו-BD נפגשים בנקודה E, E אמצע BD', ['AC ו-BD נפגשים בנקודה E', 'E אמצע BD']],
    [['מרובע ABCD'], 'AC ו-BD נפגשים בנקודה E ו-E אמצע BD', ['AC ו-BD נפגשים בנקודה E', 'E אמצע BD']],
    [['מרובע ABCD'], 'AC and BD meet at E which is the midpoint of BD', ['AC and BD meet at E', 'which is the midpoint of BD']],
    [['מרובע ABCD'], 'AC and BD meet at E on AB', ['AC and BD meet at E', 'on AB']],
    [[], 'משולש ABC שווה שוקיים ב-A', ['משולש ABC שווה שוקיים', 'ב-A']],
    [[], 'משולש שווה שוקיים ABC ב-C', ['משולש שווה שוקיים ABC', 'ב-C']],
    [[], 'טרפז ABCD ישר זווית ב-B', ['טרפז ABCD ישר זווית', 'ב-B']],
    [[], 'טרפז ישר-זווית ABCD ב-D', ['טרפז ישר-זווית ABCD', 'ב-D']],
    [['משולש ABC'], 'AB מאונך ל-CD ב-D', ['AB מאונך ל-CD', 'ב-D']],
    [[], 'line through P perpendicular to AB at B', ['line through P perpendicular to AB', 'at B']],
    // #1833's tail rows (its plan sent them to the AI; the ruling refuses them)
    [['מרובע ABCD'], 'E חיתוך AC ו-BD ו-AB', ['E חיתוך AC ו-BD', 'ו-AB']],
    [['מרובע ABCD'], 'המשך AD חותך את BC בנקודה E ואת AB', ['המשך AD חותך את BC בנקודה E', 'ואת AB']],
    // ADR-598's flagship: its clause is lost whole, listed as before
    [['מרובע ABCD'], 'AB מקביל ל-CD ו-D על BC', ['AB מקביל ל-CD', 'D על BC']],
  ] as [string[], string, string[]][])('«%s» · «%s»', async (prefix, line, parts) => {
    await expectRefused(prefix, line, split(...parts));
  });

  it('typed as separate lines, each part works as it does today', async () => {
    await drive(['מרובע ABCD', 'AC ו-BD נפגשים בנקודה E', 'E אמצע BD']);
    const f = replay(st().facts, st().seed);
    const [B, D, E] = ['B', 'D', 'E'].map((k) => f.positions.get(k)!);
    expect(Math.hypot(E.x - (B.x + D.x) / 2, E.y - (B.y + D.y) / 2), 'E is the midpoint of BD').toBeLessThan(1e-6);
  });
});

describe('#1833 row 2 — an unread label INSIDE a statement is a lost operand: the AI path, as 2-D treats a dropped label today', () => {
  it('«AC ו-BD ו-AB נפגשים בנקודה E» escalates weak=dropped, nothing committed by the grammar', async () => {
    await drive(['מרובע ABCD']);
    const v = await decideHere('AC ו-BD ו-AB נפגשים בנקודה E');
    expect(v.kind).toBe('escalate');
    expect(v.kind === 'escalate' && v.weak).toBe('dropped');
  });
});

describe('still works — a compound whose every part is read commits as before (the ruling’s controls)', () => {
  it.each([
    [['משולש ABC'], 'AB = 4, AC = 3'],
    [['קטע AB', 'AB = 4'], 'D על AB כך ש-AD = 3'],
    [['משולש ABC'], 'D על BC כך ש-BD = DC'],
    [['מרובע ABCD'], 'AC ו-BD נפגשים בנקודה E'],
    // not ruled, out of scope: no vertex keeps the angle at C
    [[], 'משולש ABC ישר זווית'],
    // a SCENE name is context, never a lost part
    [['משולש ABC'], 'AD גובה במשולש ABC'],
    [['משולש ABC'], 'במשולש ABC, AD תיכון'],
    [['מעגל O', 'A על מעגל O', 'B על מעגל O'], 'AB מיתר במעגל O'],
    [['משולש ABC'], 'מעגל חוסם את המשולש ABC'],
    // round #1940 batch: angle-named bisectors of a centre sentence are READ (the rule used to build A's and B's
    // whatever was named, so the probe flagged them); the parity rows cat-2d-043 and meet-bisectors-cut-1715
    [['משולש ABC'], 'E חיתוך חוצי הזוויות BAC ו-BCA'],
    [['משולש ABC'], 'חוצה הזווית B וחוצה הזווית C נחתכים בנקודה E'],
    [['משולש ABC'], 'חוצי הזוויות A ו-C נחתכים בנקודה E'],
    [['משולש ABC'], 'E is where the bisectors of BAC and BCA meet'],
    [['משולש ABC'], 'I מפגש חוצי הזוויות במשולש ABC'],
  ] as [string[], string][])('«%s» · «%s» commits', async (prefix, line) => {
    await drive(prefix);
    const v = await decideHere(line);
    expect(v.kind, JSON.stringify(v).slice(0, 300)).toBe('commit');
    expect(llmParseMock).not.toHaveBeenCalled();
  });
});

describe('a centre sentence builds the bisectors of the angles it NAMES (the read-extent probe’s first catch in the grammar)', () => {
  it.each([
    ['E חיתוך חוצי הזוויות BAC ו-BCA', ['A', 'C']],
    ['חוצה הזווית B וחוצה הזווית C נחתכים בנקודה E', ['B', 'C']],
    ['חוצי הזוויות A ו-C נחתכים בנקודה E', ['A', 'C']],
    ['E is where the bisectors of BAC and BCA meet', ['A', 'C']],
  ])('«%s» → bisectors at %s', async (line, vertices) => {
    await drive(['משולש ABC']);
    const f = replay(st().facts, st().seed);
    const r = parse(line, buildParseCtx(f.construction, f.positions));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.commands.filter((c) => c.type === 'bisector').map((c) => (c as { vertex: string }).vertex)).toEqual(vertices);
  });
});

describe('the ✎ edit seam refuses the same lines inline, naming the unread part in the student’s words', () => {
  function submit(u: string): string {
    const v = replay(st().facts, st().seed);
    const r = parse(u, buildParseCtx(v.construction, v.positions));
    if (!r.ok) throw new Error(`no parse: ${u}`);
    st().executeMany(r.commands, u);
    const f = st().facts;
    return groupKey(f[f.length - 1]);
  }
  it.each([
    [['משולש ABC'], 'משולש ABC ישר זווית ב-B', 'ב-B'],
    [['מרובע ABCD', 'AC ו-BD נפגשים בנקודה E'], 'AC ו-BD נפגשים בנקודה E שהיא אמצע BD', 'שהיא אמצע BD'],
    [['מרובע ABCD', 'AC ו-BD נפגשים בנקודה E'], 'AC ו-BD נפגשים בנקודה E על AB', 'על AB'],
    // ADR-598's flagship — committed on this seam before, with D dropped
    [['מרובע ABCD', 'AB מקביל ל-CD'], 'AB מקביל ל-CD ו-D על BC', 'D על BC'],
  ])('editing «%s» into «%s» is refused: «%s»', (prefix, edit, item) => {
    st().clear();
    let key = '';
    for (const p of prefix) key = submit(p);
    const before = JSON.stringify(st().facts);
    const notes: string[] = [];
    const ok = runEditCommit(key, edit, {
      t: (k, o) => (o ? `${k}:${JSON.stringify(o)}` : k),
      setInputNote: (m) => notes.push(m),
      resolveAfterCommit: () => {},
    });
    expect(ok).toBe(false);
    expect(notes.at(-1)).toBe(`steps.editDropped:${JSON.stringify({ items: item })}`);
    expect(JSON.stringify(st().facts), 'the step is unchanged').toBe(before);
  });
});
