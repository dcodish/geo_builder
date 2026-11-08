/**
 * #1973 ([ADR-797](../../../docs/06-decisions.md#adr-797)) — THE SHAPE A CEVIAN WAS RESOLVED IN, reported beside the
 * parse's commands.
 *
 * «משולש ABC» · «AE גובה» · «מרובע ABCD»: when «AE גובה» was accepted the triangle was the only shape A belonged to, and
 * the altitude rule chose BC from it. The operator's ruling of 2026-10-10 (option C): that host is recorded at accept
 * time and shown BESIDE the student's words. This file is the unit test of the parser half — `parse` reports `host`
 * exactly when the side came from the figure, and the commands are the ones it always lowered to (the host is
 * metadata, never part of a command). The store, the file and the row are locked in
 * `src/store/__tests__/issue-1973-host-persist.test.ts`; the operator's sequence is the fixture
 * `issue-1973-cevian-host.geo.json`.
 *
 * The figure context is built from the ENGINE (`build` + `evaluate`), the way `buildParseCtx` reads a figure, so the
 * test asks the parser alone.
 */
import { describe, expect, it } from 'vitest';
import { build, evaluate, type AnyCommand } from '@/engine';
import { buildParseCtx, parse } from '@/parser';

/** Parse each line against the figure the lines before it built; return the last line's result. */
function readLast(lines: readonly string[]) {
  const cmds: AnyCommand[] = [];
  let last: ReturnType<typeof parse> | null = null;
  for (const line of lines) {
    const { construction } = build(cmds);
    const e = evaluate(construction);
    if (!e.ok) throw new Error(`the prefix of «${line}» does not evaluate`);
    last = parse(line, buildParseCtx(construction, e.positions));
    if (!last.ok) return last;
    cmds.push(...last.commands);
  }
  return last!;
}
const hostOf = (lines: readonly string[]) => {
  const r = readLast(lines);
  expect(r.ok, `«${lines.join(' · ')}» parses`).toBe(true);
  return r.ok ? (r.host ?? null) : null;
};
const commandsOf = (lines: readonly string[]) => {
  const r = readLast(lines);
  return r.ok ? r.commands : null;
};

describe('#1973 — a cevian whose sentence named no shape reports the shape it was resolved in', () => {
  const TRIANGLE = { ring: ['A', 'B', 'C'], kind: 'triangle' };
  it.each([
    ['the operator’s «AE גובה»', ['משולש ABC', 'AE גובה']],
    ['the median «AE תיכון»', ['משולש ABC', 'AE תיכון']],
    ['the apex-only height «גובה מ-A» (the foot minted)', ['משולש ABC', 'גובה מ-A']],
    ['the apex-only median «תיכון מ-A»', ['משולש ABC', 'תיכון מ-A']],
    ['the copula «AE הוא גובה»', ['משולש ABC', 'AE הוא גובה']],
    ['English «AE is an altitude»', ['triangle ABC', 'AE is an altitude']],
    ['the plural «AD BE ו-CF הם גבהים» — one shape for all three', ['משולש ABC', 'AD BE ו-CF הם גבהים']],
  ])('%s → triangle ABC', (_why, lines) => {
    expect(hostOf(lines)).toEqual(TRIANGLE);
  });

  it.each([
    ['a trapezoid’s height lands on its own base (ADR-665)', ['טרפז ABCD', 'AE גובה'], 'trapezoid'],
    ['an isosceles trapezoid is named by its base noun', ['טרפז שווה שוקיים ABCD', 'AE גובה'], 'trapezoid'],
    ['a foot the student placed (ADR-665) — the same trapezoid', ['טרפז ABCD', 'E על BC', 'AE גובה'], 'trapezoid'],
    ['a parallelogram’s first opposite side (ADR-263)', ['מקבילית ABCD', 'AE גובה'], 'parallelogram'],
    ['a plain quadrilateral', ['מרובע ABCD', 'AE גובה'], 'quadrilateral'],
  ])('%s', (_why, lines, kind) => {
    expect(hostOf(lines)).toEqual({ ring: ['A', 'B', 'C', 'D'], kind });
  });

  it('a larger ring is named by its size', () => {
    expect(hostOf(['מחומש ABCDE', 'AF גובה'])).toEqual({ ring: ['A', 'B', 'C', 'D', 'E'], kind: 'n5' });
  });

  it('a shape declared in the same line is the host (the noun read in this parse’s own context)', () => {
    expect(hostOf(['טרפז ABCD ו-AE גובה'])).toEqual({ ring: ['A', 'B', 'C', 'D'], kind: 'trapezoid' });
  });
});

describe('#1973 — a sentence that says its side or its triangle records nothing extra', () => {
  it.each([
    ['a stated side', ['משולש ABC', 'AE גובה לצלע BC']],
    ['a stated triangle', ['משולש ABC', 'AE גובה במשולש ABC']],
    ['a stated triangle, the median', ['משולש ABC', 'AE תיכון במשולש ABC']],
    ['the vertex-less side form', ['משולש ABC', 'גובה לצלע BC']],
    ['a stated side, the median', ['משולש ABC', 'AE תיכון לצלע BC']],
  ])('%s → no host', (_why, lines) => {
    expect(hostOf(lines)).toBeNull();
  });

  it('a side two shapes share names no single shape → no host, never a guess', () => {
    // E placed on BC: the foot narrows the altitude to BC, which is opposite A in the triangle AND in the quadrilateral
    expect(hostOf(['משולש ABC', 'מרובע ABCD', 'E על BC', 'AE גובה'])).toBeNull();
  });

  it('a bisector names its angle, not a shape → no host (the angle reading is #1445’s, said at commit)', () => {
    expect(hostOf(['משולש ABC', 'AE חוצה זווית A'])).toBeNull();
  });
});

describe('#1973 — the host is METADATA: the commands are the ones the line always lowered to', () => {
  it('«AE גובה» lowers byte-identically to «AE גובה לצלע BC» — only the report differs', () => {
    expect(commandsOf(['משולש ABC', 'AE גובה'])).toEqual(commandsOf(['משולש ABC', 'AE גובה לצלע BC']));
  });
  it('the trapezoid’s height lowers as its stated-base form does', () => {
    expect(commandsOf(['טרפז ABCD', 'AE גובה'])).toEqual(commandsOf(['טרפז ABCD', 'AE גובה לצלע CD']));
  });
  it('a second shape after the line is the ambiguity the host prevents: re-reading «AF גובה» then ASKS', () => {
    const r = readLast(['משולש ABC', 'AE גובה', 'מרובע ABCD', 'AF גובה']);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toBe('ambiguous-cevian');
  });
});
