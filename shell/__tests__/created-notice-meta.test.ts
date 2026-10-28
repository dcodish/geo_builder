/**
 * #1467 (ADR-W-162) — the meta-lock: the shared created-notice rows must FAIL against adapters that break the
 * contract, so a builder's lock cannot pass by checking nothing. A reference adapter that honours it passes.
 */
import { describe, expect, it } from 'vitest';
import type { CreatedNotice, CreatedPointsAdapter } from '../session/createdPoints';
import { createdNoticeText, createdNoticeTextOf } from '../session/createdPoints';
import { CREATED_NOTICE_ROWS, createdNoticeFaults, type CreatedNoticeSentences } from './fixtures/created-notice-rows';

const S: CreatedNoticeSentences = {
  referenceLine: 'M mid AB',
  referenceNames: ['A', 'B'],
  typoSetup: ['tri ABC'],
  typoLine: 'M mid AX',
  typoName: 'X',
  declarationLine: 'tri ABC',
  circle: { setup: ['tri ABC', 'A ctr'], line: 'K ctr', centre: 'K' },
};

/**
 * A toy builder: «tri XYZ» declares, «M mid PQ» refers, «K ctr» centres a circle on K (#2552 D9: a circle on a new
 * letter announces the circle). Its flaws are switched on per test.
 */
function toy(flaw: 'none' | 'never-reports' | 'undo-noop' | 'announces-declaration' | 'sticky' | 'circle-as-point'): CreatedPointsAdapter {
  let lines: { points: string[]; created: string[] }[] = [];
  let notice: CreatedNotice | null = null;
  const have = () => new Set(lines.flatMap((l) => l.points));
  return {
    reset() {
      lines = [];
      notice = null;
    },
    submit(line) {
      const tri = /^tri ([A-Z])([A-Z])([A-Z])$/.exec(line);
      const mid = /^([A-Z]) mid ([A-Z])([A-Z])$/.exec(line);
      const ctr = /^([A-Z]) ctr$/.exec(line);
      const before = have();
      if (ctr) {
        const fresh = !before.has(ctr[1]);
        lines.push({ points: [ctr[1]], created: [] });
        notice = !fresh || flaw === 'never-reports' ? null : flaw === 'circle-as-point' ? { names: [ctr[1]] } : { names: [], circle: ctr[1] };
      } else if (tri) {
        const pts = [tri[1], tri[2], tri[3]];
        lines.push({ points: pts, created: [] });
        if (flaw === 'announces-declaration') notice = { names: pts.filter((p) => !before.has(p)) };
        else if (flaw !== 'sticky') notice = null;
      } else if (mid) {
        const created = [mid[2], mid[3]].filter((p) => !before.has(p));
        lines.push({ points: [mid[1], mid[2], mid[3]], created });
        notice = flaw === 'never-reports' || created.length === 0 ? null : { names: created };
      }
    },
    lastCreated: () => notice,
    undoLastLine() {
      if (flaw !== 'undo-noop') lines.pop();
      notice = null;
    },
    pointNames: () => [...have()],
    lineCount: () => lines.length,
  };
}

describe('#1467 — the created-notice rows catch a broken adapter', () => {
  it('a faithful adapter passes every row', async () => {
    expect(await createdNoticeFaults(toy('none'), S)).toEqual([]);
  });
  it.each(['never-reports', 'undo-noop', 'announces-declaration', 'sticky', 'circle-as-point'] as const)('%s fails at least one row', async (flaw) => {
    expect((await createdNoticeFaults(toy(flaw), S)).length).toBeGreaterThan(0);
  });
  it('the rows are the six the rulings need (five of #1467, the circle of #2552 D9)', () => {
    expect(CREATED_NOTICE_ROWS).toHaveLength(6);
  });
  it('a circle reads its own sentence, naming the centre', () => {
    expect(createdNoticeTextOf({ names: [], circle: 'P' })).toEqual({ key: 'suite.notice.createdCircle', params: { centre: 'P' } });
    expect(createdNoticeTextOf({ names: ['X'] }).key).toBe('suite.notice.createdPoint');
  });
  it('one point reads singular, several plural', () => {
    expect(createdNoticeText(['X']).key).toBe('suite.notice.createdPoint');
    expect(createdNoticeText(['A', 'B'])).toEqual({ key: 'suite.notice.createdPoints', params: { names: 'A, B' } });
  });
});
