/**
 * #1467 ([ADR-AG-342](../../docs/06c-decisions-analytic.md#adr-ag-342), ADR-W-162; operator ruling 2026-09-27 "Create
 * everywhere + notice"; #2048 card d5-2048-tools "every builder that has these objects creates them the same way") —
 * analytic creates every point a line refers to, as 2-D does, and says so.
 *
 * Measured at d9494206 through `decideSubmit`: «M אמצע AB», «AB = 5», «P על הישר AB» recorded SILENTLY (ADR-AG-210's
 * mint, gated by the forms 2-D minted for in 2026-10); «AB = 2 AD», «AD תיכון לצלע BC» and «שיפוע הישר AB שלילי» were
 * refused `unknown-reference`.
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit } from '../app/submit';
import { derive } from '../engine/derive';
import { analyticI18n } from '../i18n';
import { createdNoticeFaults } from '../../shell/__tests__/fixtures/created-notice-rows';
import type { CreatedPointsAdapter } from '../../shell/session/createdPoints';

let lines: string[] = [];
let notice: { index: number; names: string[] } | null = null;
const submit = (l: string) => {
  const v = decideSubmit(l, lines, 0);
  notice = null;
  if (v.kind === 'record') {
    lines = [...lines, v.line];
    if (v.created?.length) notice = { index: lines.length - 1, names: v.created };
  }
  return v;
};
const pointsOf = (ls: readonly string[], seed = 0) => derive(ls, seed).figure.points.map((p) => p.id);
const at = (id: string, seed = 0) => derive(lines, seed).figure.points.find((p) => p.id === id)!;

const adapter: CreatedPointsAdapter = {
  reset: () => {
    lines = [];
    notice = null;
  },
  submit: (l) => void submit(l),
  lastCreated: () => (notice && notice.index === lines.length - 1 ? { names: notice.names } : null),
  undoLastLine: () => {
    if (notice) lines = lines.filter((_, i) => i !== notice!.index);
    notice = null;
  },
  pointNames: () => pointsOf(lines),
  lineCount: () => lines.length,
};

describe('#1467 — analytic honours the shared created-notice contract', () => {
  it('every shared row', async () => {
    expect(await createdNoticeFaults(adapter, {
      referenceLine: 'M אמצע AB',
      referenceNames: ['A', 'B'],
      typoSetup: ['A(0,0)', 'B(4,0)'],
      typoLine: 'M אמצע AX',
      typoName: 'X',
      declarationLine: 'משולש ABC',
    })).toEqual([]);
  });
});

describe('#1467 — a line naming a point the figure lacks creates it', () => {
  it.each([
    ['AB = 2 AD', ['A', 'B', 'D']],
    ['AD תיכון לצלע BC', ['B', 'C']],
    ['שיפוע הישר AB שלילי', ['A', 'B']],
    ['M אמצע AB', ['A', 'B']],
    ['AB = 5', ['A', 'B']],
    ['P על הישר AB', ['A', 'B']],
  ] as const)('blank «%s» records, and the notice names %j', (line, names) => {
    adapter.reset();
    expect(submit(line).kind).toBe('record');
    expect(derive(lines, 0).faults).toEqual([]);
    expect(notice?.names).toEqual(names);
  });

  it('«AB = 2 AD» holds on the created points at every seed', () => {
    adapter.reset();
    submit('AB = 2 AD');
    for (const s of [0, 1, 2]) {
      const [A, B, D] = ['A', 'B', 'D'].map((id) => at(id, s));
      expect(Math.hypot(A.x - B.x, A.y - B.y)).toBeCloseTo(2 * Math.hypot(A.x - D.x, A.y - D.y), 6);
    }
  });

  it('mint is the last resort: «M אמצע AB» typed above «A(0,0)» · «B(4,0)» gives M = (2,0)', () => {
    adapter.reset();
    for (const l of ['M אמצע AB', 'A(0,0)', 'B(4,0)']) expect(submit(l).kind).toBe('record');
    expect(at('M')).toMatchObject({ x: 2, y: 0 });
    expect(derive(lines, 0).created).toEqual([]);
  });

  it('a radius capital is never a point: «R > r» stays refused, and creates nothing', () => {
    adapter.reset();
    expect(submit('R > r').kind).toBe('refused');
    expect(lines).toEqual([]);
  });

  it('a reference to a missing circle stays refused (circles are #2048 S3)', () => {
    adapter.reset();
    expect(submit('P על המעגל I').kind).toBe('refused');
  });

  it('the notice text is the suite sentence', () => {
    const t = (k: string, o: Record<string, string>) => (analyticI18n.getFixedT('he')(k, o) as string).replace(/[⁦-⁩]/g, '');
    expect(t('suite.notice.createdPoints', { names: 'A, B' })).toBe('נוצרו נקודות חדשות A, B — אם זו טעות הקלדה, לחצו ✕ לביטול השורה');
  });
});
