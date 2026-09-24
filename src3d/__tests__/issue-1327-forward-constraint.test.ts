/**
 * #1327 ([ADR-3D-257](../../docs/06b-decisions-3d.md#adr-3d-257)) — A CONSTRAINT TYPED BEFORE ITS
 * POINTS IS HONOURED: the fold's post-pass retry covers every non-creating red row.
 *
 * Operator ruling on #1242 (2026-09-19): *"the idea of order is not relevant since the diagram should
 * either respect all input or refuse to build"*. Measured: «∠SAB = 70» above «פירמידה SABCD שבסיסה
 * ריבוע» was red with `unknown-point` and the pyramid was drawn WITHOUT the 70° — both halves failed.
 * ADR-3D-220 retried only `unknown-symbol` rows; this is the same rule one predicate wider, decided by
 * a dry run. (Its "a row that would introduce a point is never re-ordered" clause was withdrawn by #1339.)
 *
 * The list reaches that shape only by editing, so the facts are built directly (as the store's own
 * remove / replaceFact would leave them), not through `submit`'s gate.
 */
import { describe, expect, it } from 'vitest';
import { parse3 } from '../parser/parse3';
import { derive3, type Fact3 } from '../store/store3';

const PYR = 'פירמידה SABCD שבסיסה ריבוע';
const facts = (lines: string[]): Fact3[] =>
  lines.map((utterance, i) => {
    const r = parse3(utterance);
    if (!r.ok) throw new Error(`${utterance}: ${r.reason}`);
    return { id: `f${i}`, utterance, cmds: r.commands, enabled: true };
  });
const fold = (lines: string[]) => derive3(facts(lines), 0);
const statuses = (lines: string[]) => lines.map((_, i) => fold(lines).status[`f${i}`]);
const vangles = (lines: string[]) => fold(lines).construction.scalarPins.flatMap((p) => (p.kind === 'vangle' ? [p.deg] : []));

describe('#1327 — «∠SAB = 70» above the pyramid that declares A and B', () => {
  it('the reversed pair builds with the 70° pinned — parity with the working order', () => {
    expect(statuses([PYR, '∠SAB = 70']), 'the working order').toEqual(['ok', 'ok']);
    expect(statuses(['∠SAB = 70', PYR]), 'the reversed order').toEqual(['ok', 'ok']);
    expect(vangles(['∠SAB = 70', PYR])).toEqual(vangles([PYR, '∠SAB = 70']));
    expect(vangles(['∠SAB = 70', PYR])).toEqual([70]);
  });

  it('a constraint naming a point NO line declares stays red, naming it — nothing is invented to satisfy it', () => {
    const [first, second] = statuses(['∠SXB = 70', PYR]);
    expect(first).toEqual({ code: 'unknown-point', id: 'X' });
    expect(second).toBe('ok');
  });

  it('#926’s symbol retry is unchanged — «α = 70» before and after its definition', () => {
    expect(statuses([PYR, 'α = 70', '∠SAB = α'])).toEqual(['ok', 'ok', 'ok']);
    expect(statuses(['α = 70', PYR, '∠SAB = α'])).toEqual(['ok', 'ok', 'ok']);
    expect(vangles(['α = 70', PYR, '∠SAB = α'])).toEqual([70]);
  });

  it('a chain of forward references settles to a fixpoint — the value row, then the angle row, then the solid', () => {
    expect(statuses(['α = 70', '∠SAB = α', PYR])).toEqual(['ok', 'ok', 'ok']);
    expect(vangles(['α = 70', '∠SAB = α', PYR])).toEqual([70]);
  });

  it('#1339 (ADR-3D-259) withdrew the ADR-104 limit here: a row that INTRODUCES a point is retried too', () => {
    // This case used to lock the row red (T30 of round #1332). The operator ruled it should build; the
    // creating-row locks live in issue-1339-forward-creating-row.test.ts.
    expect(statuses(['M אמצע SA', PYR])).toEqual(['ok', 'ok']);
    expect(fold(['M אמצע SA', PYR]).construction.points.has('M')).toBe(true);
  });

  it('a green figure never changes: the retry touches only rows that were red', () => {
    const inOrder = fold([PYR, '∠SAB = 70', 'SA = 5']);
    expect(Object.values(inOrder.status)).toEqual(['ok', 'ok', 'ok']);
    const reversed = fold(['SA = 5', '∠SAB = 70', PYR]);
    expect(Object.values(reversed.status)).toEqual(['ok', 'ok', 'ok']);
    expect(reversed.construction.scalarPins.length).toBe(inOrder.construction.scalarPins.length);
  });
});
