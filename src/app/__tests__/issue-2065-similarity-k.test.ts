/**
 * #2065 item 3 ([ADR-700](../../../docs/06-decisions.md#adr-700)) — the similarity's RATIO in words, and a letter k that is
 * never the ratio. Driven through the real pre-LLM decision (`decideDeterministic2D` → `commitVerdict` → `replay`), the
 * LLM mocked to throw.
 *
 * (a) Operator ruling 2026-10-14 (his note: "nowhere will k represent the ratio") and 2026-10-15 (card 10, option A):
 *     «ABC ∽ DEF, k = 2» commits the similarity, never scales it, and the k row keeps today's message
 *     (`errors.unboundVariable`). A LOCK, no behaviour change. #2085 item 8 (the own-line «k = 2») cites this test.
 * (b) His note: "if a ratio is given, it will be in words: ביחס של 1:2 or something similar". Measured at `main`
 *     4b0b4592, «ביחס 1 ל-2» / «ביחס של 1 ל-2» / «ביחס 2 ל-3» escalated `not-handled` (the AI) while «ביחס 1:2» built.
 *     The similarity slot now reads the lexicon's two-term ratio (`RATIO_SEP`: «:» or «ל-»), which the number gates
 *     compose too. Number words («אחד לשניים») wait on #2068's word atom and still escalate.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { decideDeterministic2D } from '../decideDeterministic';
import { commitVerdict } from '../submitPipeline';
import { replay, useGeoStore } from '@/store/geoStore';
import { humanizeError } from '@/i18n/humanizeError';
import i18n from '@/i18n';

const st = () => useGeoStore.getState();
const tHe = (k: string, o?: Record<string, unknown>) => i18n.t(k, { ...o, lng: 'he' }) as string;

async function decideHere(line: string) {
  const f = replay(st().facts, st().seed);
  return decideDeterministic2D({ facts: st().facts, seed: st().seed, view: { construction: f.construction, positions: f.positions } }, line, /[א-ת]/.test(line) ? 'he' : 'en');
}
/** Commit every line through the real decision; each must commit. */
async function drive(lines: readonly string[]) {
  st().clear();
  for (const p of lines) {
    const v = await decideHere(p);
    expect(v.kind, `«${p}» commits: ${JSON.stringify(v).slice(0, 300)}`).toBe('commit');
    commitVerdict(v, p);
  }
}
type P = Map<string, { x: number; y: number }>;
const len = (p: P, a: string, b: string) => Math.hypot(p.get(a)!.x - p.get(b)!.x, p.get(a)!.y - p.get(b)!.y);
const cmdsOf = (v: Awaited<ReturnType<typeof decideHere>>) => (v.kind === 'commit' ? v.commands : []);

beforeEach(() => {
  st().clear();
  llmParseMock.mockReset();
  llmParseMock.mockRejectedValue(new Error('the LLM is never called here'));
});

const TRIS = ['משולש ABC', 'משולש DEF'];

describe('#2065 (a) — «, k = 2» never sets the ratio; the k row keeps its message (ruled 2026-10-15)', () => {
  const unbound = tHe('errors.unboundVariable', { name: 'k' });
  it.each([
    [['ABC ∽ DEF, k = 2']],
    [['ABC ~ DEF, k = 2']],
    [['ABC ∽ DEF', 'k = 2']], // #2085 item 8: «k = 2» on its own line
  ])('%j: the similarity stands, k is red with errors.unboundVariable, the triangles are not scaled', async (lines) => {
    await drive([...TRIS, ...lines]);
    const facts = st().facts;
    expect(facts.some((f) => f.cmd.type === 'set-ratio'), 'no ratio is committed').toBe(false);
    const fig = replay(facts, st().seed);
    const kRow = facts.find((f) => f.cmd.type === 'set-var');
    expect(kRow, 'the k row exists').toBeDefined();
    expect(humanizeError(fig.status[kRow!.id], tHe)).toBe(unbound);
    const sim = facts.filter((f) => f.cmd.type === 'set-angle-ratio');
    expect(sim.length, 'the similarity\'s two angle equalities').toBe(2);
    for (const f of sim) expect(fig.status[f.id], 'the similarity rows are ok').toBe('ok');
    // |AB|/|DE| is a free quantity, not 2: it differs across seeds
    const ratios = [0, 1, 2, 3].map((seed) => { const r = replay(facts, seed).positions as P; return len(r, 'A', 'B') / len(r, 'D', 'E'); });
    expect(Math.max(...ratios) - Math.min(...ratios), `ratios ${ratios.join(', ')}`).toBeGreaterThan(1e-3);
    expect(llmParseMock).not.toHaveBeenCalled();
  });
});

describe('#2065 (b) — «ביחס p ל-q» is the same similarity ratio as «ביחס p:q»', () => {
  it.each([
    ['ABC ∽ DEF ביחס 1 ל-2', 'ABC ∽ DEF ביחס 1:2', 0.5],
    ['ABC ∽ DEF ביחס של 1 ל-2', 'ABC ∽ DEF ביחס של 1:2', 0.5],
    ['ABC ∽ DEF ביחס 1 ל 2', 'ABC ∽ DEF ביחס 1:2', 0.5],
    ['ABC ∽ DEF ביחס דמיון 1 ל-2', 'ABC ∽ DEF ביחס דמיון 1:2', 0.5],
    ['המשולשים ABC ו-DEF דומים ביחס 1 ל-2', 'המשולשים ABC ו-DEF דומים ביחס 1:2', 0.5],
    ['ABC ∽ DEF ביחס 2 ל-3', 'ABC ∽ DEF ביחס 2:3', 2 / 3],
    ['ABC ~ DEF ביחס של 3 ל-5', 'ABC ~ DEF ביחס של 3:5', 0.6],
  ])('«%s» commits what «%s» commits (k = %d) and draws it', async (line, twin, k) => {
    await drive(TRIS);
    const a = await decideHere(line);
    const b = await decideHere(twin);
    expect(a.kind, line).toBe('commit');
    expect(b.kind, twin).toBe('commit');
    expect(cmdsOf(a)).toEqual(cmdsOf(b));
    const r = cmdsOf(a).find((c) => c.type === 'set-ratio') as { k: number } | undefined;
    expect(r?.k).toBeCloseTo(k, 9);
    commitVerdict(a, line);
    const fig = replay(st().facts, st().seed);
    expect(fig.violations).toEqual([]);
    const p = fig.positions as P;
    expect(len(p, 'A', 'B') / len(p, 'D', 'E')).toBeCloseTo(k, 3);
    expect(len(p, 'B', 'C') / len(p, 'E', 'F')).toBeCloseTo(k, 3);
    expect(llmParseMock).not.toHaveBeenCalled();
  });

  it.each(['ABC ∽ DEF ביחס של אחד לשניים', 'ABC ∽ DEF ביחס של שניים לשלושה', 'ABC ∽ DEF ביחס של 1 לשניים'])(
    'number words wait on #2068: «%s» still escalates (nothing drawn without its ratio)',
    async (line) => {
      await drive(TRIS);
      expect((await decideHere(line)).kind).toBe('escalate');
    },
  );

  it('the divider keeps the colon-only reading (not in this ruling): «G מחלקת את BC ביחס 1 ל-2» still escalates', async () => {
    await drive(TRIS);
    expect((await decideHere('G מחלקת את BC ביחס 1 ל-2')).kind).toBe('escalate');
    const colon = await decideHere('G מחלקת את BC ביחס 1:2');
    expect(colon.kind).toBe('commit');
    expect(cmdsOf(colon)).toContainEqual({ type: 'point-on-segment', id: 'G', a: 'B', b: 'C', t: 1 / 3 });
  });

  it('the forms that built before are unchanged', async () => {
    await drive(TRIS);
    for (const [line, k] of [['ABC ∽ DEF ביחס של 1:2', 0.5], ['ABC ∽ DEF ביחס 2', 2], ['ABC ∽ DEF ביחס של 1/2', 0.5], ['המשולשים ABC ו-DEF דומים ביחס 2:1', 2], ['triangle ABC is similar to triangle DEF with ratio 1:2', 0.5]] as const) {
      const v = await decideHere(line);
      expect(v.kind, line).toBe('commit');
      expect((cmdsOf(v).find((c) => c.type === 'set-ratio') as { k: number }).k).toBeCloseTo(k, 9);
    }
  });
});
