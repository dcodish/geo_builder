/**
 * #2092 ([ADR-3D-381](../../docs/06b-decisions-3d.md#adr-3d-381)) — «AB = k» IS A VECTOR NAME, AND SAYS SO; «|AB| = k» IS A LENGTH.
 *
 * Measured at d9494206 through the store's real `submit`:
 *   «תיבה ABCDA'B'C'D'» · «AB = k»   → recorded as the vector AB named k, with NO message
 *   «|AB| = k» (any host)             → not understood (no length letter in 3-D)
 *
 * Operator ruling 2026-10-14 (card d14b-2092-k, "A, with teaching"): *"the syntax should be as option A suggests but we
 * say that if the length was the meaning they should write |AB|=k. so we educate also."* — the vector reading stays and
 * is said aloud; the taught form must build.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import i18n3d from '../i18n';
import { derive3, useGeo3 } from '../store/store3';
import { buildScene3 } from '../render/scene3';
import { HOME_CAMERA } from '../render/camera';
import type { BuildNotice3 } from '../engine/notices';

const BOX = "תיבה ABCDA'B'C'D'";
const st = () => useGeo3.getState();
function reset() {
  useGeo3.setState({ facts: [], seed: 0, lastError: null } as never);
  useGeo3.temporal.getState().clear();
}
/** Submit every line; each must record. */
function build(lines: string[]) {
  reset();
  for (const l of lines) {
    st().submit(l);
    expect(st().lastError, `«${l}» in ${lines.join(' · ')}`).toBeNull();
  }
  return derive3(st().facts, st().seed);
}
const bareNotes = (n: readonly BuildNotice3[]) => n.filter((x) => x.kind === 'vector-named-bare');
/** The rendered note, bidi isolates stripped (i18n wraps each interpolated value in one). */
const noteText = (n: Extract<BuildNotice3, { kind: 'vector-named-bare' }>, lng: 'he' | 'en') =>
  (i18n3d.t('notice.vectorNamedBare', { name: n.name, from: n.from, to: n.to, lng }) as string).replace(/[⁦-⁩]/g, '');
const len = (d: ReturnType<typeof derive3>, a: string, b: string) => {
  const p = d.positions.get(a)!;
  const q = d.positions.get(b)!;
  return Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z);
};
const at = (lines: string[], seed: number) => {
  build(lines);
  return derive3(st().facts, seed);
};
const labels = (d: ReturnType<typeof derive3>) =>
  buildScene3(d.construction, d.resolved, HOME_CAMERA, { width: 640, height: 460 }, 1).measures.map((m) => `${[m.a, m.b].sort().join('')}:${m.text}`).sort();

beforeEach(reset);

describe('#2092 — a bare «AB = k» keeps the vector reading and says so', () => {
  it.each([[[BOX, 'AB = k']], [['משולש ABC', 'AB = k']], [[BOX, 'AB=k']]])('%j: the vector is named k, with the note', (lines) => {
    const d = build(lines as string[]);
    expect(d.construction.vectors.get('k')).toMatchObject({ from: 'A', to: 'B' });
    const notes = bareNotes(d.notices);
    expect(notes).toEqual([{ kind: 'vector-named-bare', name: 'k', from: 'A', to: 'B' }]);
    expect(noteText(notes[0] as never, 'he')).toBe('"AB = k" נקרא כווקטור: k הוא שם הווקטור AB. אם התכוונתם לאורך, כתבו במקום זה "|AB| = k".');
    expect(noteText(notes[0] as never, 'en')).toBe('"AB = k" is read as a vector: k is the name of the vector AB. If you meant a length, write "|AB| = k" instead.');
  });

  it('every letter, the u, v, w convention included («AB = u»)', () => {
    expect(bareNotes(build([BOX, 'AB = u']).notices)).toEqual([{ kind: 'vector-named-bare', name: 'u', from: 'A', to: 'B' }]);
  });

  it('«נסמן: AB = k» says "denote", so it is not ambiguous and shows nothing', () => {
    const d = build([BOX, 'נסמן: AB = k']);
    expect(d.construction.vectors.get('k')).toMatchObject({ from: 'A', to: 'B' });
    expect(bareNotes(d.notices)).toEqual([]);
  });
});

describe('#2092 — «|AB| = k» is a length named by a letter', () => {
  it.each([['|AB| = k'], ['|AB|=k']])('%s builds, AB wears «k» on the canvas, and the length stays free', (line) => {
    const d0 = at([BOX, line], 0);
    expect(d0.construction.lengthMarks).toEqual([{ a: 'A', b: 'B', label: 'k' }]);
    expect(labels(d0)).toEqual(['AB:k']);
    // a bare box's size is a gauge, so "free" is read against another edge: |AB| : |AD| moves with the seed
    const ratios = [0, 1, 2].map((s) => {
      const d = at([BOX, line], s);
      return len(d, 'A', 'B') / len(d, 'A', 'D');
    });
    expect(Math.max(...ratios) - Math.min(...ratios), `|AB|:|AD| across seeds ${ratios.join(', ')}`).toBeGreaterThan(1e-3);
  });

  it('the same letter on two edges makes them equal, at every seed', () => {
    for (const seed of [0, 1, 2]) {
      const d = at([BOX, '|AB| = k', '|AD| = k'], seed);
      expect(len(d, 'A', 'D'), `seed ${seed}`).toBeCloseTo(len(d, 'A', 'B'), 6);
    }
    expect(labels(at([BOX, '|AB| = k', '|AD| = k'], 0))).toEqual(['AB:k', 'AD:k']);
  });

  it('a coefficient states the ratio («|AB| = a» · «|AA\'| = 2a»)', () => {
    const d = build([BOX, '|AB| = a', "|AA'| = 2a"]);
    expect(len(d, 'A', "A'")).toBeCloseTo(2 * len(d, 'A', 'B'), 6);
  });

  it('«|AB| = 2k» · «k = 3» gives |AB| = 6, and the label becomes the value', () => {
    const d = build([BOX, '|AB| = 2k']);
    expect(labels(d)).toEqual(['AB:2k']);
    const v = build([BOX, '|AB| = 2k', 'k = 3']);
    expect(len(v, 'A', 'B')).toBeCloseTo(6, 6);
    expect(labels(v)).toEqual(['AB:6']);
  });

  it('the operator\'s fixture: «|AB| = k» · «|AD| = k» · «k = 3» — both edges 3', () => {
    const d = build([BOX, '|AB| = k', '|AD| = k', 'k = 3']);
    expect(len(d, 'A', 'B')).toBeCloseTo(3, 6);
    expect(len(d, 'A', 'D')).toBeCloseTo(3, 6);
  });
});

describe('#2092 — the taught remedy is accepted on the next Enter', () => {
  /** The spelling the note teaches, read out of the note itself (docs/17 §9: one source). */
  const taught = (d: ReturnType<typeof derive3>) => {
    const n = bareNotes(d.notices)[0] as Extract<BuildNotice3, { kind: 'vector-named-bare' }>;
    return /"(\|[^"]+)"/.exec(noteText(n, 'he'))![1];
  };

  it('typing the taught line after «AB = k» records the length too', () => {
    const d = build([BOX, 'AB = k']);
    const line = taught(d);
    expect(line).toBe('|AB| = k');
    st().submit(line);
    expect(st().lastError).toBeNull();
    const after = derive3(st().facts, st().seed);
    expect(after.construction.lengthMarks).toEqual([{ a: 'A', b: 'B', label: 'k' }]);
    expect(after.construction.vectors.get('k')).toMatchObject({ from: 'A', to: 'B' });
  });

  it('editing the «AB = k» row into the taught line builds, and the note goes with the old reading', () => {
    const d = build([BOX, 'AB = k']);
    const line = taught(d);
    const row = st().facts[1];
    expect(st().replaceFact(row.id, line)).toBe(true);
    const after = derive3(st().facts, st().seed);
    expect(after.status[st().facts[1].id]).toBe('ok');
    expect(after.construction.vectors.has('k')).toBe(false);
    expect(bareNotes(after.notices)).toEqual([]);
    expect(after.construction.lengthMarks).toEqual([{ a: 'A', b: 'B', label: 'k' }]);
  });
});

describe('#2092 — outside the ruled scope, unchanged', () => {
  it('a letter the figure already uses as a coordinate symbol keeps today\'s verdict (not understood)', () => {
    reset();
    for (const l of ['C(k,1,0)', 'A(0,0,0)', 'B(1,1,1)']) st().submit(l);
    expect(st().lastError).toBeNull();
    st().submit('|AB| = k');
    expect((st().lastError as { code: string } | null)?.code).toBe('not-understood');
  });

  it('«אורך AB הוא k» stays unread, as its 2-D twin is', () => {
    reset();
    st().submit(BOX);
    st().submit('אורך AB הוא k');
    expect((st().lastError as { code: string } | null)?.code).toBe('not-understood');
  });

  it('a numeric «|AB| = 4» is the ordinary length, as before', () => {
    const d = build([BOX, '|AB| = 4']);
    expect(len(d, 'A', 'B')).toBeCloseTo(4, 6);
    expect(d.construction.lengthMarks).toEqual([]);
  });
});
