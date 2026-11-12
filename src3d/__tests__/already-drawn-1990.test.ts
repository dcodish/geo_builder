/**
 * #1990 (ADR-3D-377) → #2790 ([ADR-3D-484](../../docs/06b-decisions-3d.md#adr-3d-484), ADR-W-200 / ADR-W-204) — 3-D's held row.
 *
 * A line the figure already holds is ACCEPTED as its own row with the one suite notice (`suite.notice.alreadyHeld`), moves
 * nothing (#2795, ADR-3D-483), and keeps the relation in force once the earlier row is unticked or deleted. The table is
 * shared: `shell/__tests__/fixtures/held-row-2790.ts`. Controls: a contradiction is refused; a muted twin re-ticks with no
 * notice; a pinning value records with no notice.
 */
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import i18n3d from '../i18n';
import { decideSubmit3, derive3, useGeo3 } from '../store/store3';
import { HELD_CASES_3D, HELD_NOTICE } from '../../shell/__tests__/fixtures/held-row-2790';

const st = () => useGeo3.getState();
beforeEach(() => {
  useGeo3.setState({ facts: [], seed: 0, lastError: null, lastNotice: null });
  useGeo3.temporal.getState().clear();
});

function maxMove(a: Map<string, { x: number; y: number; z: number }>, b: Map<string, { x: number; y: number; z: number }>): number {
  let m = 0;
  for (const [id, p] of a) {
    const q = b.get(id);
    if (q) m = Math.max(m, Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z));
  }
  return m;
}

describe('#2790 — 3-D accepts a held line as its own row, with the notice', () => {
  for (const c of HELD_CASES_3D) {
    it(`${c.lines.join(' · ')} — ${c.why}`, () => {
      for (const l of c.lines.slice(0, -1)) st().submit(l);
      const before = st().facts;
      const last = c.lines.at(-1)!;
      const v = decideSubmit3(st(), last);
      expect(v.kind === 'record' && v.held).toBe(true);
      st().submit(last);
      // (i) one row appended, (ii) the notice
      expect(st().lastError).toBeNull();
      expect(st().facts, 'exactly one row appended').toHaveLength(before.length + 1);
      expect(st().lastNotice).toEqual({ code: 'already-held' });
      const after = st().facts;
      // (iii) nothing moves, at 4 seeds; every row stays ok
      for (const seed of [0, 1, 2, 3]) {
        const a = derive3(before, seed);
        const b = derive3(after, seed);
        expect(maxMove(a.resolved.positions, b.resolved.positions), `seed ${seed}: no point moves`).toBeLessThanOrEqual(1e-9);
        for (const f of after) expect(b.status[f.id], `seed ${seed}: «${f.utterance}»`).toBe('ok');
      }
      // (iv) unticking, then deleting, the earlier row leaves the restated row holding
      if (c.earlier !== undefined) {
        const earlier = after[c.earlier];
        const mine = after.at(-1)!;
        st().toggle(earlier.id);
        expect(derive3(st().facts, st().seed).status[mine.id], 'unticked: the restated row holds').toBe('ok');
        st().remove(earlier.id);
        expect(derive3(st().facts, st().seed).status[mine.id], 'deleted: the restated row holds').toBe('ok');
      }
    });
  }

  it("control — a MUTED twin is re-ticked with no notice and no second row (2-D's FR-EN-9)", () => {
    st().submit('פירמידה SABC');
    st().submit('משולש ABC');
    const twin = st().facts.at(-1)!;
    st().toggle(twin.id);
    expect(decideSubmit3(st(), 'משולש ABC').kind).toBe('retick');
    st().submit('משולש ABC');
    expect(st().facts.find((f) => f.id === twin.id)!.enabled).toBe(true);
    expect(st().facts.length).toBe(2);
    expect(st().lastNotice).toBeNull();
  });

  it('control — a pinning value («AB = 3» on a free triangle) records with no notice', () => {
    st().submit('משולש ABC');
    st().submit('AB = 3');
    expect(st().facts).toHaveLength(2);
    expect(st().lastNotice).toBeNull();
  });

  it('control — a contradiction is refused («AB ∥ AD» on a cube)', () => {
    st().submit("קובייה ABCDA'B'C'D'");
    st().submit('AB ∥ AD');
    expect(st().lastError).toEqual({ code: 'claim-refuted' });
    expect(st().facts).toHaveLength(1);
  });
});

// Q-2790c (a) [judged], 2026-11-10, from the operator's 2026-11-06 «In all cases it should say כבר קיים» + ADR-W-200: a held
// relation row shows ONE note — the held notice; the older #396 / #842 / #850 «already known» notes retire for it.
describe('#2790 — a held relation row shows exactly one note', () => {
  it.each([
    [['המישור π1: z = 0', 'המישור π2: x = 0', 'π1 ניצב ל-π2']], // #396: two self-determined planes
    [["קובייה ABCDA'B'C'D'", 'מישור ABCD', 'E אמצע AC', 'BE מוכל במישור ABCD']], // #842: a containment
    [["קובייה ABCDA'B'C'D'", "AB מקביל למישור A'B'C'D'"]], // #850: an implied ∥
  ])('%j', (lines) => {
    for (const l of lines) st().submit(l);
    expect(st().lastError).toBeNull();
    expect(st().lastNotice).toEqual({ code: 'already-held' });
    const d = derive3(st().facts, st().seed);
    expect(d.notices.filter((n) => n.kind === 'already-known'), 'no second note').toEqual([]);
  });

  it('a row NOT recorded as held (loaded from a file) keeps its #396 note', () => {
    for (const l of ['המישור π1: z = 0', 'המישור π2: x = 0', 'π1 ניצב ל-π2']) st().submit(l);
    const loaded = st().facts.map(({ held: _held, ...f }) => f);
    expect(derive3(loaded, 0).notices.some((n) => n.kind === 'already-known' && n.rel === 'objects')).toBe(true);
  });
});

describe('#2790 — the notice text, and the App reads the suite key', () => {
  for (const lng of ['he', 'en'] as const) {
    it(lng, () => {
      expect((i18n3d.getFixedT(lng) as (k: string) => string)(HELD_NOTICE.key).replace(/[⁦-⁩]/g, '')).toBe(HELD_NOTICE[lng]);
    });
  }
  it('App3 reads `suite.notice.alreadyHeld` and no retired key', () => {
    const app = readFileSync(new URL('../App3.tsx', import.meta.url), 'utf8');
    expect(app).toContain(`t('${HELD_NOTICE.key}')`);
    expect(app).not.toContain("'suite.notice.alreadyDrawn'");
    expect(app).not.toContain("'notice.alreadyStated'");
  });
});

// #2790 ADR-3D-484 Am. 1 (judged 2026-11-11, `decisions-2026-11-11-2790-3d-definitional`, on ADR-W-200): a restatement of a
// DEFINITION — a plane's equation in another spelling, a point placed on the circle again — is its own held row. It stands
// aside while its twin is enabled (it is never refused `already-defined` / `not-on-circle`), and takes over, with the figure
// unchanged, when the twin is unticked or deleted. The rows are the escalation's measured table.
describe('#2790 — a held row that restates a definition stands aside for its twin, and takes over without it', () => {
  const drawing = (facts = st().facts, seed = st().seed) => {
    const d = derive3(facts, seed);
    const pts = [...d.resolved.positions].map(([id, p]) => `${id}:${p.x.toFixed(9)},${p.y.toFixed(9)},${p.z.toFixed(9)}`).sort();
    // one plane, one reading: «2x+2y+2z=2» is «x+y+z=1» (the scale of a spelling is not part of the figure)
    const planes = [...d.resolved.planes].map(([id, p]) => {
      const m = Math.hypot(p.n.x, p.n.y, p.n.z);
      return `${id}:${[p.n.x / m, p.n.y / m, p.n.z / m, p.d / m].map((v) => v.toFixed(9)).join(',')}`;
    }).sort();
    const circles = d.resolved.circles3.map((k) => JSON.stringify(k));
    return JSON.stringify({ pts, planes, circles });
  };
  it.each([
    [['משוואת המישור π היא x+y+z=1', 'המישור π: x+y+z-1=0']],
    [['משוואת המישור π היא x+y+z=1', 'המישור π הוא 2x+2y+2z=2']],
    [['D על המעגל', 'D נמצאת על המעגל']],
    [['D על המעגל', 'D is on the circle']],
    [['D על המעגל', 'D על המעגל']],
    [['מעגל שמרכזו O ורדיוסו 3', 'D על המעגל', 'D נמצאת על המעגל']],
  ])('%j', (lines) => {
    for (const l of lines.slice(0, -1)) st().submit(l);
    const seed = st().seed;
    const before = drawing();
    const twin = st().facts.at(-1)!;
    st().submit(lines.at(-1)!);
    expect(st().lastError, 'never refused').toBeNull();
    expect(st().lastNotice).toEqual({ code: 'already-held' });
    expect(st().facts).toHaveLength(lines.length);
    expect(st().seed, 'the configuration on screen is kept').toEqual(seed);
    const mine = st().facts.at(-1)!;
    for (const f of st().facts) expect(derive3(st().facts, st().seed).status[f.id], `«${f.utterance}»`).toBe('ok');
    expect(drawing(), 'nothing moves').toBe(before);
    st().toggle(twin.id);
    expect(st().lastError, 'unticking the twin breaks nothing').toBeNull();
    expect(derive3(st().facts, st().seed).status[mine.id]).toBe('ok');
    expect(drawing(), 'unticked: the held row holds the same figure').toBe(before);
    st().toggle(twin.id);
    st().remove(twin.id);
    expect(derive3(st().facts, st().seed).status[mine.id]).toBe('ok');
    expect(drawing(), 'deleted: the held row holds the same figure').toBe(before);
  });
});

// #2790 ADR-3D-484 Am. 1 — found at round #2822's wave-3 batch (the «מעוין» spellings lost the configuration the student
// chose): an INDEFINITE shape noun is a new ring each time (ADR-3D-351), so typed again it is never a twin and never
// stands aside — it draws a second rhombus, and the configuration search runs for it as on `main`.
describe('#2790 — an indefinite shape noun typed again is a new shape, not a held row', () => {
  it('«מעוין» · «מעויין» draws two rhombi, with no notice', () => {
    st().submit('מעוין');
    st().submit('מעויין');
    expect(st().lastError).toBeNull();
    expect(st().lastNotice).toBeNull();
    const d = derive3(st().facts, st().seed);
    expect(d.construction.solids.filter((s) => s.kind === 'polygon4')).toHaveLength(2);
    for (const f of st().facts) expect(d.status[f.id]).toBe('ok');
  });
});
