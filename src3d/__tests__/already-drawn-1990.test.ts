/**
 * #1990 (ADR-3D-377, ADR-W-152; operator ruling 2026-10-10, option A) — 3-D's restatement notice is 2-D's sentence,
 * `suite.notice.alreadyDrawn`, no longer «הנתון הזה כבר נאמר («…») — הציור לא השתנה ולא נוספה שורה». A muted twin
 * the line re-ticks was not on the figure: 2-D re-ticks it silently (FR-EN-9, #1748), and so does 3-D now.
 * The shared assertions: `shell/__tests__/fixtures/already-drawn-1990.ts`.
 */
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import i18n3d from '../i18n';
import { decideSubmit3, useGeo3 } from '../store/store3';
import { lockAlreadyDrawn, RULED_ALREADY_DRAWN } from '../../shell/__tests__/fixtures/already-drawn-1990';

const st = () => useGeo3.getState();
beforeEach(() => {
  useGeo3.setState({ facts: [], seed: 0, lastError: null, lastNotice: null });
  useGeo3.temporal.getState().clear();
});

describe('#1990 — a restated 3-D line', () => {
  it.each([
    [['ריבוע ABCD', 'ריבוע ABCD']], // the ruling's own line
    [['פירמידה SABC', 'משולש ABC', 'משולש ABC']],
    [['פירמידה SABC', 'זווית ABC = 90', 'זווית ABC = 90']],
    [['ריבוע ABCD', 'מרובע ADCB']], // a ring restated in another reading (#1953)
  ])('%j → the note, no row', (lines) => {
    for (const l of lines.slice(0, -1)) st().submit(l);
    const rows = st().facts.length;
    expect(decideSubmit3(st(), lines.at(-1)!).kind).toBe('already-stated');
    st().submit(lines.at(-1)!);
    expect(st().facts.length, 'no row').toBe(rows);
    expect(st().lastError).toBeNull();
    expect(st().lastNotice).toEqual({ code: 'already-stated' });
  });

  it("a MUTED twin is re-ticked with no note (2-D's FR-EN-9: it was not on the figure)", () => {
    st().submit('פירמידה SABC');
    st().submit('משולש ABC');
    const twin = st().facts.at(-1)!;
    st().toggle(twin.id);
    st().submit('משולש ABC');
    expect(st().facts.find((f) => f.id === twin.id)!.enabled).toBe(true);
    expect(st().facts.length).toBe(2);
    expect(st().lastNotice).toBeNull();
  });
});

lockAlreadyDrawn(
  '3d',
  (lng) => (i18n3d.getFixedT(lng) as (k: string) => string)(RULED_ALREADY_DRAWN.key),
  readFileSync(new URL('../App3.tsx', import.meta.url), 'utf8'),
);
