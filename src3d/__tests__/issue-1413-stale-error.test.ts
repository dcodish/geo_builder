/**
 * #1413 — A RED ROW'S MESSAGE IS ITS LATEST ATTEMPT (ADR-3D-273).
 *
 * Found by round #1408 (#1339's own ADR noted it): «M אמצע SX» edited ABOVE its pyramid stayed red
 * naming «unknown point S» — a letter the pyramid now declares — because a red row kept the error
 * from its first, in-order application. Two mechanisms, per the issue's fix direction:
 *
 *  1. ATOMICITY — a failing fact commits NOTHING (the analytic line-atomicity arriving in 3-D), so
 *     a half-applied statement leaves no orphans and a red row's dry run can no longer read
 *     «already defined» for its own earlier commands (what blocked ADR-3D-259's first attempt).
 *  2. REFRESH — after the retry fixpoint, every still-red row is re-judged against the COMPLETED
 *     figure and its status replaced with the latest verdict.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { useGeo3, derive3 } from '../store/store3';

const reset = () => {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
};
const submit = (u: string) => useGeo3.getState().submit(u);
beforeEach(reset);

describe('#1413 — the reported edit sequence', () => {
  // ⚠ REWRITTEN by #1467 (ADR-3D-382; operator ruling 2026-09-27 "Create everywhere + notice"): the row whose X a
  // deletion removed no longer stays red — X is created free, after the pyramid has bound S. The stale «unknown point
  // S» this lock was written against cannot come back: the row is green, and nothing names S.
  it('after the edit sequence the row builds: X is created, S binds to the retyped pyramid', () => {
    submit('פירמידה SABCD שבסיסה ריבוע');
    submit('X על SA');
    submit('M אמצע SX');
    const f0 = useGeo3.getState().facts;
    useGeo3.getState().remove(f0[1].id); // delete the X row
    useGeo3.getState().remove(f0[0].id); // delete the pyramid row
    submit('פירמידה SABCD שבסיסה ריבוע'); // retype it → M sits ABOVE the pyramid
    const st = useGeo3.getState();
    const d = derive3(st.facts, st.seed);
    const m = st.facts.find((f) => f.utterance === 'M אמצע SX')!;
    expect(d.status[m.id]).toBe('ok');
    expect(d.created[m.id]).toEqual(['X']);
    expect(d.status[st.facts.find((f) => f.utterance !== 'M אמצע SX')!.id]).toBe('ok');
  });

  it('the retry still HEALS: re-declaring the missing letter turns the row green (ADR-3D-259 kept)', () => {
    submit('פירמידה SABCD שבסיסה ריבוע');
    submit('X על SA');
    submit('M אמצע SX');
    const f0 = useGeo3.getState().facts;
    useGeo3.getState().remove(f0[1].id);
    submit('X על SA'); // the letter returns, BELOW the M row
    const st = useGeo3.getState();
    const d = derive3(st.facts, st.seed);
    const m = st.facts.find((f) => f.utterance === 'M אמצע SX')!;
    expect(d.status[m.id]).toBe('ok');
  });
});

describe('#1413 — atomicity: a failing fact commits nothing', () => {
  it('a refused midpoint leaves no orphan point on the figure', () => {
    submit('פירמידה SABCD שבסיסה ריבוע');
    // ⚠ #1467 (ADR-3D-382): the midpoint now creates X, so atomicity is asked of a line that still fails after the
    // mint pass: «המרחק בין X למישור ABE הוא 6» over a missing X and E — the mint creates them, the plane through
    // A, B, E then cannot be determined, and the line must keep NOTHING it created.
    submit('A(0,0,0)');
    submit('B(1,0,0)');
    submit('E(2,0,0)');
    submit('המרחק בין X למישור ABE הוא 6');
    const st = useGeo3.getState();
    const d = derive3(st.facts, st.seed);
    expect(st.lastError).not.toBeNull();
    // the red fact contributed NOTHING: no X point
    expect(d.resolved.positions.has('X')).toBe(false);
  });
});
