/**
 * #780 — the TYPED crossing binds DRAWN INK, and is bounded by it.
 *
 * Operator report, playing fix-round #768: on «תיבה ABCDA'B'C'D'» + «E אמצע BB'» + «מישור ADE», the
 * line «G נקודת חיתוך של CC' עם מישור ADE» put G correctly on the edge — and grew a FULL-HEIGHT
 * vertical line labelled CC', running far above C' and far below C. CC' is already an edge of the
 * תיבה; the student was pointing at drawn ink, not asking for a new object. «הקטע CC'» made no
 * difference: the two spellings produced byte-identical commands.
 *
 * The lowering forked on the PLANE's form, which has nothing to do with the operand:
 *
 *     G … של CC' עם מישור π     → plane-cut                          (references the segment)
 *     G … של CC' עם מישור ADE   → line-through + line-plane-point    (mints an unbounded line)
 *
 * ADR-3D-164 (#755) taught the MATCHER that a student's crossing line is drawn ink; the lowering then
 * converted it back into a line object, undoing the fix at the last step — while #756's own offer half
 * already derived its candidates from the solids' edges and bounded segments to 0 < t < 1, "because a
 * crossing outside the ink is not on the figure". The two halves of one round disagreed about the same
 * operand. See ADR-3D-165.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { parse3 } from '../parser/parse3';
import { derive3, useGeo3 } from '../store/store3';

function reset() {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
}
const submit = (u: string) => useGeo3.getState().submit(u);
const state = () => useGeo3.getState();
const cmds = (u: string) => {
  const r = parse3(u);
  if (!r.ok) throw new Error(`not parsed: ${u} → ${r.reason}`);
  return r.commands;
};

beforeEach(reset);

describe('#780 — an operand that is already drawn ink is referenced, never re-created', () => {
  it('the reported lowering mints NO line object', () => {
    const out = cmds("G נקודת חיתוך של CC' עם מישור ADE");
    expect(out.some((c) => c.type === 'line-through'), 'no unbounded line is minted for an edge').toBe(false);
    expect(out.map((c) => c.type)).toEqual(['plane-through', 'plane-cut']);
    expect(out.at(-1)).toEqual({ type: 'plane-cut', id: 'G', plane: 'ADE', a: 'C', b: "C'" });
  });

  it('the PLANE\'s form no longer decides how the OPERAND is read', () => {
    // the π-named form was already right; the point-run form now matches it
    const named = cmds("G נקודת חיתוך של CC' עם מישור π").filter((c) => c.type !== 'plane-through');
    const run = cmds("G נקודת חיתוך של CC' עם מישור ADE").filter((c) => c.type !== 'plane-through');
    expect(named.map((c) => c.type)).toEqual(run.map((c) => c.type));
  });

  it('«הקטע» states the bounded reading that is now the default — it confirms, and is never contradicted', () => {
    const bare = cmds("G נקודת חיתוך של CC' עם מישור ADE");
    const said = cmds("G נקודת חיתוך של הקטע CC' עם מישור ADE");
    expect(said).toEqual(bare);
    // …and what they agree on is the SEGMENT-referencing lowering, which is what the word states.
    expect(said.at(-1)!.type).toBe('plane-cut');
  });

  it('a line the student DECLARED stays unbounded — the drawn-ink-vs-declared-line distinction', () => {
    const out = cmds('G נקודת חיתוך של הישר l עם מישור ADE');
    expect(out.map((c) => c.type)).toEqual(['plane-through', 'line-plane-point']);
  });
});

describe('#780 — the operator\'s figure, end to end', () => {
  it('G lands on the edge CC\' and the figure gains no new line', () => {
    for (const u of ["תיבה ABCDA'B'C'D'", 'E אמצע BB\'', 'מישור ADE', "G נקודת חיתוך של CC' עם מישור ADE"]) {
      submit(u);
      expect(state().lastError, `«${u}» must build`).toBeNull();
    }
    const d = derive3(state().facts, state().seed);
    for (const [id, st] of Object.entries(d.status)) expect(st, `step ${id}`).toBe('ok');

    // NO new line object — the defect the operator saw was ink that was never asked for
    expect([...d.construction.lines.keys()], 'no named line minted').toEqual([]);
    expect([...d.construction.pointLines.keys()], 'no point-line minted').toEqual([]);

    // G is ON segment CC', strictly between the endpoints (bounded to the ink, like #756's offer)
    const C = d.positions.get('C')!;
    const C2 = d.positions.get("C'")!;
    const G = d.positions.get('G')!;
    const dir = { x: C2.x - C.x, y: C2.y - C.y, z: C2.z - C.z };
    const len2 = dir.x ** 2 + dir.y ** 2 + dir.z ** 2;
    const t = ((G.x - C.x) * dir.x + (G.y - C.y) * dir.y + (G.z - C.z) * dir.z) / len2;
    expect(t, 'G is past C').toBeGreaterThan(0);
    expect(t, 'G is before C\'').toBeLessThan(1);
    const off = Math.hypot(G.x - (C.x + t * dir.x), G.y - (C.y + t * dir.y), G.z - (C.z + t * dir.z));
    expect(off / Math.sqrt(len2), 'G is ON the edge').toBeLessThan(1e-6);
  });
});
