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
  it('the red row names X (the letter actually missing), never the S the pyramid declares', () => {
    submit('פירמידה SABCD שבסיסה ריבוע');
    submit('X על SA');
    submit('M אמצע SX');
    const f0 = useGeo3.getState().facts;
    useGeo3.getState().remove(f0[1].id); // delete the X row → M goes red
    useGeo3.getState().remove(f0[0].id); // delete the pyramid row
    submit('פירמידה SABCD שבסיסה ריבוע'); // retype it → M sits ABOVE the pyramid
    const st = useGeo3.getState();
    const d = derive3(st.facts, st.seed);
    const m = st.facts.find((f) => f.utterance === 'M אמצע SX')!;
    expect(d.status[m.id]).toEqual({ code: 'unknown-point', id: 'X' });
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
    submit('X על SA');
    submit('M אמצע SX');
    const f0 = useGeo3.getState().facts;
    useGeo3.getState().remove(f0[1].id); // X gone, M red
    const st = useGeo3.getState();
    const d = derive3(st.facts, st.seed);
    // the red fact contributed NOTHING: no M point, no half-built segment
    expect(d.resolved.positions.has('M')).toBe(false);
  });
});
