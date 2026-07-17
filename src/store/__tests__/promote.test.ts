/**
 * Anonymous promotable points (#32 / ADR-297).
 *
 * A decomposition's touch/tangency points (an incircle's three feet) are minted ANONYMOUS — `@`-prefixed
 * ids that never occupy a student letter and render as clickable dots — so a student who later reaches for
 * a letter (`G על המשך CA`) gets a fresh point, not the invisible foot. Clicking a dot PROMOTES it to the
 * next free capital letter. This suite locks the store `promote` action + the scene's promotable dots.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { parse, buildParseCtx } from '@/parser';
import { replay, useGeoStore } from '../geoStore';
import { isGeoPoint } from '@/engine';
import { buildScene } from '@/render/scene';

const s = () => useGeoStore.getState();
const ctx = () => { const f = replay(s().facts, s().seed); return buildParseCtx(f.construction, f.positions); };
const submit = (u: string) => { const r = parse(u, ctx()); if (!r.ok) throw new Error(`parse failed: ${u}`); for (const cmd of r.commands) s().execute(cmd, u, `g-${u}`); };
const pointIds = () => replay(s().facts, s().seed).construction.objects.filter(isGeoPoint).map((o) => o.id);

beforeEach(() => s().clear());

describe('anonymous promotable incircle feet (#32)', () => {
  it('the incircle mints anonymous @-feet — no F/G/H letter is consumed', () => {
    submit('מעגל חסום במשולש ABC');
    const ids = pointIds();
    const anon = ids.filter((id) => id.startsWith('@f-'));
    expect(anon.length, `three anonymous feet (got ${ids.join(',')})`).toBe(3);
    // the student's namespace is intact: F, G, H are all free
    for (const letter of ['F', 'G', 'H']) expect(ids.includes(letter), `${letter} not consumed`).toBe(false);
  });

  it('the feet render as promotable dots with NO label (a clickable dot, not a named point)', () => {
    submit('מעגל חסום במשולש ABC');
    const f = replay(s().facts, s().seed);
    const scene = buildScene(f.construction, f.positions);
    const dots = scene.points.filter((p) => p.promotable);
    expect(dots.length, 'three promotable dots').toBe(3);
    expect(dots.every((p) => p.label === ''), 'promotable dots carry no label').toBe(true);
    // and no scaffold `@` id leaks into a LABELED scene point
    expect(scene.points.some((p) => !p.promotable && p.id.startsWith('@')), 'no labeled @-point').toBe(false);
  });

  it('promote() assigns the next free letter and rewrites the @-id everywhere', () => {
    submit('מעגל חסום במשולש ABC');
    const anonId = pointIds().find((id) => id.startsWith('@f-'))!; // a FOOT (the centre is anonymous too now — ADR-342)
    const letter = s().promote(anonId);
    expect(letter, 'the next free letter (A,B,C,O taken ⇒ D)').toBe('D');
    const after = pointIds();
    expect(after.includes('D'), 'the promoted point exists as D').toBe(true);
    expect(after.includes(anonId), 'the @-id is gone').toBe(false);
    expect(after.filter((id) => id.startsWith('@f-')).length, 'the other two feet stay anonymous').toBe(2);
  });

  it('promote is ONE undoable step', () => {
    submit('מעגל חסום במשולש ABC');
    const anonId = pointIds().find((id) => id.startsWith('@f-'))!; // a FOOT (the centre is anonymous too now — ADR-342)
    s().promote(anonId);
    expect(pointIds().filter((id) => id.startsWith('@f-')).length).toBe(2);
    useGeoStore.temporal.getState().undo();
    expect(pointIds().filter((id) => id.startsWith('@f-')).length, 'undo restores all three anonymous feet').toBe(3);
  });

  it('promote is a no-op on a non-anonymous id', () => {
    submit('מעגל חסום במשולש ABC');
    expect(s().promote('A'), 'a real letter is not promotable').toBeNull();
  });

  it('the anonymous feet do not hijack a later student point (the reported #32 bug)', () => {
    submit('מעגל חסום במשולש ABC');
    submit('G על המשך CA');
    const G = replay(s().facts, s().seed).construction.objects.find((o) => o.id === 'G');
    expect(G, 'G exists').toBeTruthy();
    expect(G!.kind, 'G is the student’s own on-segment extension point, not the incircle foot').toBe('on-segment');
  });
});
