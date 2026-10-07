/**
 * #1814 ([ADR-600](../../../docs/06-decisions.md#adr-600)) — a name's index is never a value, and the gates see
 * every name glyph.
 *
 * Measured on `main` e17a7d1e through `decideDeterministic2D` (LLM mocked): after «משולש ABC», «∠ABC = α1»
 * committed `set-angle value: 1` — a 1° angle the student never stated, drawn green. So did «β2» (2°), «Α1»
 * (capital alpha), «α_1», «α12» (12°), «α 1», the comparisons «∠ABC > α1» (an inequality committed as an
 * EQUALITY), the multi-statement and «נסמן» forms, and the symbolic expressions «π/3» (3°), «α + 40» (40°)
 * and «x + 10» (10°). Root cause: the angle reader's guard against a label's subscript digit (#267) was
 * spelled Latin-only and had no digit lookbehind; the positional value read (#969) left any symbol beside
 * the number unread; and every honesty gate defined "a name" as Latin, so the dropped glyph was invisible.
 *
 * The decisions here are CALLED (`decideDeterministic2D`, `accountUtterance`, `splitGuidance`), never
 * re-implemented.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { decideDeterministic2D } from '../decideDeterministic';
import { replay, useGeoStore } from '@/store/geoStore';
import { driveThroughGate } from '../../__tests__/submit-gate';
import { accountUtterance } from '@/parser/spanAccounting';
import { parse, splitGuidance } from '@/parser';
import type { AnyCommand } from '@/engine';

async function decide(prefix: string[], line: string) {
  const { refused } = driveThroughGate(prefix);
  expect(refused, 'the prefix builds').toEqual([]);
  const st = useGeoStore.getState();
  const d = replay(st.facts, st.seed);
  return decideDeterministic2D({ facts: st.facts, seed: st.seed, view: { construction: d.construction, positions: d.positions } }, line, 'he');
}
type V = Awaited<ReturnType<typeof decide>>;
const cmds = (v: V): readonly AnyCommand[] => (v.kind === 'commit' ? v.commands : []);
/** The commands the parse produced, committed or not (an escalation carries its weak parse in `logs`). */
const anyParse = (v: V): AnyCommand[] => [...cmds(v), ...('logs' in v ? v.logs.flatMap((l) => (l.commands ?? []) as AnyCommand[]) : [])];

const TRI = ['משולש ABC'];
const ALIAS = ['משולש ABC', 'M אמצע BC', 'נסמן זוית BAM כ-A1'];

beforeEach(() => {
  useGeoStore.getState().clear();
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ built: [], dropped: [] });
});

describe('#1814 — a symbol in an angle value slot is never read as its digits', () => {
  it.each([
    '∠ABC = α1',
    'זוית ABC = α1',
    'angle ABC is α1',
    'זווית ABC שווה ל-α1',
    '∠B = α1',
    '∠ABC = α1°',
    '∠ABC = β2',
    '∠ABC = θ1',
    '∠ABC = Α1',
    '∠ABC = α_1',
    '∠ABC = α12',
    '∠ABC = α 1',
    '∠ABC > α1',
    'זוית ABC גדולה מ-α1',
    '∠ABC = 40, ∠ACB = α1',
    'נסמן ∠ABC = α1',
    '∠ABC = π/3',
    '∠ABC = π/2',
    '∠ABC = α + 40',
    '∠ABC = x + 10',
    '∠ABC = X + 10',
    '∠ABC = α1 / 2',
  ])('after «משולש ABC», «%s» is not committed and no angle value is set', async (line) => {
    const v = await decide(TRI, line);
    expect(['escalate', 'refuse'], JSON.stringify(v).slice(0, 300)).toContain(v.kind);
    expect(cmds(v).some((c) => c.type === 'set-angle')).toBe(false);
  });

  it('«∠ABC = a12» escalates, and the reader no longer restarts inside the index (no `set-angle value: 2`)', async () => {
    const v = await decide(TRI, '∠ABC = a12');
    expect(v.kind).toBe('escalate');
    expect(anyParse(v).some((c) => c.type === 'set-angle' && c.value === 2)).toBe(false);
  });

  it('the operator’s sequence: both indexed angles are refused at the gate, the triangle stays free', () => {
    const { facts, refused } = driveThroughGate(['משולש ABC', '∠ABC = α1', '∠ACB = α2']);
    expect(refused.map((r) => r.index)).toEqual([1, 2]);
    expect(facts.some((f) => f.cmd.type === 'set-angle')).toBe(false);
  });

  it('an alias in angle position with an indexed value («זוית A1 = α1») never commits ∠BAM = 1°', async () => {
    const v = await decide(ALIAS, 'זוית A1 = α1');
    expect(v.kind).not.toBe('commit');
    expect(anyParse(v).some((c) => c.type === 'set-angle' && c.value === 1)).toBe(false);
  });
});

describe('#1814 — a measure of a named shape is one noun phrase, never split at its own labels', () => {
  it.each([
    [TRI, 'שטח המשולש ABC = S1'],
    [TRI, 'שטח המשולש ABC = A1'],
    [TRI, 'היקף המשולש ABC = P1'],
    [['משולש ABC', 'נקודה D על BC'], 'שטח המשולש ABD = S1'],
  ])('after %j, «%s» escalates (not-handled), never the split-statements note', async (prefix, line) => {
    const v = await decide(prefix, line);
    expect(v.kind).toBe('escalate');
    expect(JSON.stringify(v)).not.toMatch(/split-statements/);
  });

  it('a genuine shape + relation line still gets the split, the shape keeping its own labels', () => {
    expect(splitGuidance('משולש ABC שווה שוקיים AB=AC')).not.toBeNull();
    const g = splitGuidance('משולש ABC AB=AC');
    expect(g?.params).toMatchObject({ first: 'משולש ABC', second: 'AB=AC' });
    expect(splitGuidance('שטח המשולש ABC = S1')).toBeNull();
  });
});

describe('#1814 — the span accountant sees value symbols', () => {
  const setAngle1: AnyCommand[] = [
    { type: 'segment', a: 'B', b: 'A' },
    { type: 'segment', a: 'B', b: 'C' },
    { type: 'set-angle', vertex: 'B', ray1: 'A', ray2: 'C', value: 1 },
  ];
  it('«∠ABC = α 1» read as 1° reports the dropped α as a symbol span', () => {
    expect(accountUtterance('∠ABC = α 1', setAngle1)).toContainEqual({ kind: 'symbol', text: 'α' });
  });
  it('«∠ABC = α1» read as 1° reports α1 — the index pays for nothing', () => {
    expect(accountUtterance('∠ABC = α1', setAngle1)).toContainEqual({ kind: 'symbol', text: 'α1' });
  });
  it('«∠ABC = π/3» read as 3° reports π', () => {
    const three = setAngle1.map((c) => (c.type === 'set-angle' ? { ...c, value: 3 } : c));
    expect(accountUtterance('∠ABC = π/3', three)).toContainEqual({ kind: 'symbol', text: 'π' });
  });
  it('«∠ABC = α» lowered to `measure-angle var α` is clean of symbols', () => {
    const r = parse('∠ABC = α', {});
    expect(r.ok).toBe(true);
    if (r.ok) expect(accountUtterance('∠ABC = α', r.commands).filter((x) => x.kind === 'symbol')).toEqual([]);
  });
  it('«היקף מעגל O הוא 6π» on its real lowering is clean: the rule DECLARES the π it consumed', () => {
    const r = parse('היקף מעגל O הוא 6π', {});
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.commands.some((c) => c.consumed?.symbols?.includes('π'))).toBe(true);
    expect(accountUtterance('היקף מעגל O הוא 6π', r.commands).filter((x) => x.kind !== 'unknown-word')).toEqual([]);
  });
  it('«AB = 2π» on its real lowering is clean', () => {
    const r = parse('AB = 2π', {});
    expect(r.ok).toBe(true);
    if (r.ok) expect(accountUtterance('AB = 2π', r.commands).filter((x) => x.kind !== 'unknown-word')).toEqual([]);
  });
  it('π carried only as a NAME (`var: π`) does not pay for it — a constant is never a free variable', () => {
    const asVar: AnyCommand[] = [{ type: 'measure-angle', vertex: 'B', ray1: 'A', ray2: 'C', expr: { coef: 1, var: 'π' } } as AnyCommand];
    expect(accountUtterance('∠ABC = π', asVar)).toContainEqual({ kind: 'symbol', text: 'π' });
  });
});

describe('#1814 — must not change', () => {
  const angleOf = (v: V) => cmds(v).find((c) => c.type === 'set-angle') as { value: number } | undefined;
  const measureOf = (v: V) => cmds(v).find((c) => /^measure-/.test(c.type)) as { type: string; expr: Record<string, unknown> } | undefined;

  it.each([
    ['∠ABC = 40', 40],
    ['∠ABC = 40°', 40],
    ['∠ABC = 37.5', 37.5],
    ['∠ABC = 3/2', 1.5],
    ['∠ABC = 90/2', 45],
  ])('«%s» commits ∠ABC = %s°', async (line, value) => {
    const v = await decide(TRI, line);
    expect(v.kind).toBe('commit');
    expect(angleOf(v)?.value).toBe(value);
  });

  it.each([
    ['∠ABC = α', 'measure-angle', { coef: 1, var: 'α' }],
    ['∠ABC = 2α', 'measure-angle', { coef: 2, var: 'α' }],
    ['זוית ABC שווה ל-α', 'measure-angle', { coef: 1, var: 'α' }],
    ['נסמן זוית ABC ב-α', 'measure-angle', { coef: 1, var: 'α' }],
    ['∠ABC = 10x', 'measure-angle', { coef: 10, var: 'x' }],
    ['שטח המשולש ABC = S', 'measure-area', { coef: 1, var: 'S' }],
    ['שטח המשולש ABC = 2S', 'measure-area', { coef: 2, var: 'S' }],
    ['שטח המשולש ABC = B', 'measure-area', { coef: 1, var: 'B' }],
    ['שטח המשולש ABC = 12', 'measure-area', { value: 12 }],
    ['S_{ABC} = 12', 'measure-area', { value: 12 }],
  ])('«%s» commits %s %j', async (line, type, expr) => {
    const v = await decide(TRI, line);
    expect(v.kind).toBe('commit');
    expect(measureOf(v)?.type).toBe(type);
    expect(measureOf(v)?.expr).toEqual(expr);
  });

  it('«AB = 2π» commits |AB| = 2π', async () => {
    const v = await decide(TRI, 'AB = 2π');
    expect(v.kind).toBe('commit');
    expect(measureOf(v)?.expr).toEqual({ value: 2 * Math.PI, text: '2π' });
  });
  it('«∠ABC > 40» commits the bound, never an equality', async () => {
    const v = await decide(TRI, '∠ABC > 40');
    expect(v.kind).toBe('commit');
    expect(cmds(v).find((c) => c.type === 'set-angle-bound')).toMatchObject({ min: 40, minStrict: true });
    expect(angleOf(v)).toBeUndefined();
  });
  it('«נסמן ∠ABC = A1» still binds the alias A1', async () => {
    const v = await decide(TRI, 'נסמן ∠ABC = A1');
    expect(v.kind).toBe('commit');
    expect(cmds(v).find((c) => c.type === 'angle-alias')).toMatchObject({ name: 'A1', vertex: 'B' });
  });
  it('«היקף המשולש ABC = 12» commits the perimeter', async () => {
    const v = await decide(TRI, 'היקף המשולש ABC = 12');
    expect(v.kind).toBe('commit');
    expect(cmds(v).find((c) => c.type === 'set-perimeter')).toMatchObject({ value: 12 });
  });
  it('«היקף מעגל O הוא 6π» on an empty canvas commits r = 3', async () => {
    const v = await decide([], 'היקף מעגל O הוא 6π');
    expect(v.kind).toBe('commit');
    expect(cmds(v).find((c) => c.type === 'set-radius')).toMatchObject({ value: 3 });
  });
});
