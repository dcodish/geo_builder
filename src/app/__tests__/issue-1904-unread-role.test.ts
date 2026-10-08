/**
 * #1904 ([ADR-604](../../../docs/06-decisions.md#adr-604)) — a cevian ROLE the reading never read refuses the line,
 * teaching one line per role.
 *
 * Operator rulings, 2026-10-08: P1 (*"1902 and 1904 are P1"*), refused under #1888's *"a line that loses a part gets
 * the existing one-input-per-line message"* and *"Refuse it too"*; W22 *"Teach the lines"* — «…כתבו כל תפקיד בשורה
 * נפרדת: «AD גובה לצלע BC», ואחר כך «AD תיכון לצלע BC».»; W21 *"Check the AI's answer"* — the lines an older gate
 * already sends to the AI keep going there.
 *
 * Measured at 5edeeca1 (and at #1888's tip) through `decideDeterministic2D`, the LLM mocked: «משולש ABC» ·
 * «AD גובה לצלע BC שהוא גם תיכון» committed `midpoint, segment` — the altitude gone, AD not perpendicular to BC.
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

const st = () => useGeoStore.getState();

async function decideHere(line: string) {
  const f = replay(st().facts, st().seed);
  return decideDeterministic2D({ facts: st().facts, seed: st().seed, view: { construction: f.construction, positions: f.positions } }, line, /[א-ת]/.test(line) ? 'he' : 'en');
}
async function drive(prefix: readonly string[]) {
  st().clear();
  for (const p of prefix) {
    const v = await decideHere(p);
    expect(['commit', 'noop'], `«${p}» builds: ${JSON.stringify(v).slice(0, 200)}`).toContain(v.kind);
    commitVerdict(v, p);
  }
}

beforeEach(() => {
  st().clear();
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ built: [], dropped: [] });
});

const roles = (first: string, second: string) => ({ key: 'input.scope.split-roles', params: { first, second } });
const parts = (...p: string[]) => ({ key: 'input.scope.split-statements', params: { first: p[0], second: p[1], all: p.map((x, i) => `(${i + 1}) ${x}`).join('  ') } });

const ALT = 'AD גובה לצלע BC';
const MED = 'AD תיכון לצלע BC';
const BIS = 'AD חוצה זווית A';

describe('#1904 — a second role on the same segment that the reading drops is refused whole, teaching the lines', () => {
  it.each([
    // the ruling's two lines
    ['AD גובה לצלע BC שהוא גם תיכון', roles(ALT, MED)],
    ['AD תיכון לצלע BC שהוא גם גובה', roles(MED, ALT)],
    // the measured class (relative clause, conjunction, comma, a repeated subject, the definite noun first)
    ['AD גובה לצלע BC שהיא גם תיכון', roles(ALT, MED)],
    ['AD גובה במשולש ABC שהוא גם תיכון', roles(ALT, MED)],
    ['AD גובה לצלע BC, שהוא גם תיכון', roles(ALT, MED)],
    ['AD תיכון לצלע BC והוא גם גובה', roles(MED, ALT)],
    ['AD גובה לצלע BC וגם תיכון', roles(ALT, MED)],
    ['AD גובה ותיכון לצלע BC', roles(ALT, MED)],
    ['AD הוא גם גובה וגם תיכון', roles(ALT, MED)],
    ['AD גובה לצלע BC ו-AD תיכון לצלע BC', roles(ALT, MED)],
    ['הגובה AD הוא גם התיכון', roles(ALT, MED)],
    ['התיכון AD הוא גם הגובה', roles(MED, ALT)],
    ['AD חוצה זווית A שהוא גם גובה', roles(BIS, ALT)],
    ['AD תיכון לצלע BC שהוא גם חוצה זווית', roles(MED, BIS)],
    ['AD חוצה זווית וגובה', roles(BIS, ALT)],
    ['AD is an altitude to BC which is also a median', roles('AD altitude to BC', 'AD median to BC')],
    ['AD is a median to BC that is also an altitude', roles('AD median to BC', 'AD altitude to BC')],
    ['AD is both an altitude and a median', roles('AD altitude to BC', 'AD median to BC')],
    ['AD is the median to BC that is also the angle bisector', roles('AD median to BC', 'AD bisector of angle A')],
    // a bare bisect VERB names no angle: the parts, as the student wrote them — and "refuse it too" where it happens to hold
    ['AD תיכון לצלע BC שחוצה את זווית A', parts(MED, 'שחוצה את זווית A')],
    ['AD תיכון לצלע BC שהוא גם חוצה את BC', parts(MED, 'שהוא גם חוצה את BC')],
  ] as [string, { key: string; params: Record<string, string> }][])('«משולש ABC» · «%s»', async (line, note) => {
    await drive(['משולש ABC']);
    const before = st().facts.length;
    const v = await decideHere(line);
    expect(v.kind, JSON.stringify(v).slice(0, 300)).toBe('refuse');
    if (v.kind !== 'refuse') return;
    expect(v.category).toBe('guided');
    expect(v.note).toEqual(note);
    expect(v.logs.at(-1)).toMatchObject({ source: 'scope', result: 'scope:split-statements:unread-role' });
    commitVerdict(v, line);
    expect(st().facts.length, 'nothing committed').toBe(before);
    expect(llmParseMock).not.toHaveBeenCalled();
  });

  it('the message is the operator’s text', () => {
    const he = heLocale.input.scope as Record<string, string>;
    expect(he['split-roles'].replace('{{first}}', ALT).replace('{{second}}', MED)).toBe(
      'בכל שורה נתון אחד — כך הכלי יוכל לבנות ולאמת כל נתון בנפרד. כתבו כל תפקיד בשורה נפרדת: «AD גובה לצלע BC», ואחר כך «AD תיכון לצלע BC».',
    );
  });
});

describe('W21 — the lines an older gate already sends to the AI keep going there', () => {
  it.each(['AD גובה לצלע BC שהוא גם חוצה זווית', 'AD גובה לצלע BC שהוא גם חוצה זווית BAC', 'AD גובה וחוצה זווית', 'AD גובה לצלע BC וחוצה את זווית A'])(
    '«%s» escalates weak=dropped',
    async (line) => {
      await drive(['משולש ABC']);
      const v = await decideHere(line);
      expect(v.kind).toBe('escalate');
      expect(v.kind === 'escalate' && v.weak).toBe('dropped');
    },
  );

  it('the ⟂ twins: «…שהוא גם אנך» now takes «…שהוא גם מאונך»’s path (the ⟂ row reads «אנך»)', async () => {
    for (const line of ['AD תיכון לצלע BC שהוא גם אנך', 'AD תיכון לצלע BC שהוא גם מאונך']) {
      await drive(['משולש ABC']);
      const v = await decideHere(line);
      expect(v.kind, line).toBe('escalate');
      expect(v.kind === 'escalate' && v.weak, line).toBe('dropped');
    }
  });
});

describe('still works — every role read, or stated twice', () => {
  it.each([
    [['משולש ABC'], 'AD גובה לצלע BC'],
    [['משולש ABC'], 'AD תיכון לצלע BC'],
    [['משולש ABC'], 'AD חוצה זווית A'],
    [['משולש ABC'], 'AD גובה'],
    [['משולש ABC'], 'AD תיכון'],
    [['משולש ABC'], 'AD is a median to BC'],
    [['משולש ABC'], 'AD גובה לצלע BC שהוא גם אנך'],
    [['משולש ABC'], 'AD תיכון לצלע BC ו-AD ⟂ BC'],
    // a co-reference: the same role stated twice
    [['משולש ABC'], 'AD תיכון לצלע BC שהוא גם תיכון'],
    // the existing-segment ⊥-bisector declares its ⟂ (ADR-462), so the widened ⟂ row does not block it
    [['קטע AB', 'קטע CD'], 'CD אנך אמצעי ל AB'],
  ] as [string[], string][])('«%s» · «%s» commits', async (prefix, line) => {
    await drive(prefix);
    const v = await decideHere(line);
    expect(v.kind, JSON.stringify(v).slice(0, 300)).toBe('commit');
    expect(llmParseMock).not.toHaveBeenCalled();
  });

  // TAUGHT REMEDIES ARE HYPOTHESES (#1183): the lines the message teaches build, in either order, as both roles
  it.each([
    [ALT, MED],
    [MED, ALT],
    [BIS, MED],
    [MED, 'AD ⟂ BC'],
  ])('«משולש ABC» · «%s» · «%s» builds AD as both', async (a, b) => {
    await drive(['משולש ABC', a, b]);
    const f = replay(st().facts, st().seed);
    expect(Object.values(f.status).every((s) => s === 'ok')).toBe(true);
    const [A, B, C, D] = ['A', 'B', 'C', 'D'].map((k) => f.positions.get(k)!);
    const cos = ((D.x - A.x) * (C.x - B.x) + (D.y - A.y) * (C.y - B.y)) / (Math.hypot(D.x - A.x, D.y - A.y) * Math.hypot(C.x - B.x, C.y - B.y));
    expect(Math.abs(cos), 'AD ⟂ BC').toBeLessThan(1e-6);
    expect(Math.hypot(D.x - B.x, D.y - B.y), 'BD = DC').toBeCloseTo(Math.hypot(C.x - D.x, C.y - D.y), 6);
  });
});

describe('the ✎ edit seam refuses the same lines inline, naming the role word', () => {
  function submit(u: string): string {
    const v = replay(st().facts, st().seed);
    const r = parse(u, buildParseCtx(v.construction, v.positions));
    if (!r.ok) throw new Error(`no parse: ${u}`);
    st().executeMany(r.commands, u);
    const f = st().facts;
    return groupKey(f[f.length - 1]);
  }
  it.each([
    ['AD גובה לצלע BC', 'AD גובה לצלע BC שהוא גם תיכון', 'גובה'],
    ['AD גובה לצלע BC', 'AD גובה ותיכון לצלע BC', 'גובה'],
    ['AD תיכון לצלע BC', 'AD תיכון לצלע BC שהוא גם גובה', 'גובה'],
  ])('editing «%s» into «%s» is refused: «%s»', (first, edit, item) => {
    st().clear();
    submit('משולש ABC');
    const key = submit(first);
    const notes: string[] = [];
    const ok = runEditCommit(key, edit, { t: (k, o) => (o ? `${k}:${JSON.stringify(o)}` : k), setInputNote: (m) => notes.push(m), resolveAfterCommit: () => {} });
    expect(ok).toBe(false);
    expect(notes.at(-1)).toBe(`steps.editDropped:${JSON.stringify({ items: item })}`);
  });
});
