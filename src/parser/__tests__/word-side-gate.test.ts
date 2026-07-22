/**
 * #266 (ADR-387) — the SIDE-PAIR member of the word-relation honesty gate.
 *
 * Prod session m01ophid (2026-07-22): «נקודת C ו D נמצאות בצדדים שונים של AB» escalated to the LLM,
 * whose decomposition was two bare free points — the stated side relation entirely absent — and it
 * COMMITTED green (both points on the same side). Every older gate is structurally blind to a
 * word-form spatial side relation: the labels all land (ADR-089/240), no number (ADR-250), no symbol
 * relation (ADR-264), no action verb (ADR-292), no polygon-region tail (ADR-303). The widened
 * `droppedWordRelations` (already wired on BOTH commit paths) now names the dropped phrase, so the
 * grammar path escalates and the LLM path refuses instead of committing the drop.
 *
 * Rode along (same commit): 4 raw 0x08 bytes (a historical tool-escape corruption, the recorded
 * ADR-3D-006 trap class) sat where `\b` regex boundaries were intended in parse.ts, deadening the
 * gate's ENGLISH triggers (circles/disjoint/contained + the ordinal-circle rule). Restored; the
 * hygiene sweep below locks the whole class out of the source tree.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { droppedWordRelations, droppedRegionSubject } from '@/parser';
import type { AnyCommand } from '@/engine';

/** The LLM's logged lowering from the prod session, verbatim. */
const LLM_FREE_POINTS: AnyCommand[] = [
  { type: 'free-point', id: 'C', x: 3, y: 2, free: true, ifAbsent: true },
  { type: 'free-point', id: 'D', x: 3, y: 2, free: true, ifAbsent: true },
];

describe('#266 — word-form side relations must land in a side command or be named as dropped', () => {
  it.each([
    ['He, the prod utterance', 'נקודת C ו D נמצאות בצדדים שונים של AB'],
    ['He, מצדדים שונים', 'C ו-D מצדדים שונים של הישר AB'],
    ['He, משני צידי', 'C ו-D משני צידי AB'],
    ['He, same side', 'C ו-D באותו צד של AB'],
    ['En, different sides', 'points C and D are on different sides of AB'],
    ['En, opposite sides', 'C and D lie on opposite sides of line AB'],
    ['En, same side', 'C and D are on the same side of AB'],
  ])('%s — flagged when no command carries the side', (_t, u) => {
    expect(droppedWordRelations(u, LLM_FREE_POINTS)).toContain('צדדים');
  });

  it('satisfied by a side-family command — never false-blocks a lowering that carries the side', () => {
    const withSide: AnyCommand[] = [
      ...LLM_FREE_POINTS,
      { type: 'point-circle-side', id: 'C', circle: 'circle-O', side: 'outside' } as AnyCommand,
    ];
    expect(droppedWordRelations('C ו-D בצדדים שונים של AB', withSide)).not.toContain('צדדים');
  });

  it.each([
    ['polygon-SIDES word (צלעות) is not a spatial side', 'בריבוע ABCD כל הצלעות שוות'],
    ['inside-circle (owned by point-circle-side rule)', 'M מחוץ למעגל O'],
    ['a plain segment', 'AB'],
  ])('no false positive: %s', (_t, u) => {
    expect(droppedWordRelations(u, [])).not.toContain('צדדים');
  });

  it('the 0x08 restoration: the ENGLISH mutual-position triggers are live again', () => {
    // "disjoint" in a two-circle context with no encoding command must flag (was dead: the regex
    // contained a raw backspace byte where \b was intended, so the En alternative never matched).
    expect(droppedWordRelations('two disjoint circles', [])).toContain('זרים');
    expect(droppedWordRelations('circle P is contained in circle O', [])).toContain('מוכל');
  });

  it('droppedRegionSubject is exported for the LLM commit path and accepts a RAW utterance', () => {
    // subject M referenced nowhere in the lowering → the statement about it vanished
    const bareTriangle: AnyCommand[] = [{ type: 'triangle', ids: ['A', 'B', 'C'] } as AnyCommand];
    expect(droppedRegionSubject('M בתוך המשולש ABC', bareTriangle)).toBe(true);
    // subject referenced → this gate stays silent (its documented scope; the region-dropped-but-
    // subject-present case is owned by the deterministic region rules + the side-pair member)
    const withM: AnyCommand[] = [...bareTriangle, { type: 'free-point', id: 'M', x: 1, y: 1, free: true } as AnyCommand];
    expect(droppedRegionSubject('M בתוך המשולש ABC', withM)).toBe(false);
  });
});

describe('source hygiene — no raw control bytes in the source tree (the tool-escape corruption class)', () => {
  it('no file under src/ or server/ contains C0 control chars other than tab/newline/CR', () => {
    const roots = ['src', 'server'];
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        const p = path.join(dir, name);
        if (statSync(p).isDirectory()) {
          if (name === 'node_modules' || name === 'dist') continue;
          walk(p);
        } else if (/\.(ts|tsx|json|md)$/.test(name)) {
          const txt = readFileSync(p, 'utf8');
          // allow \t (09) \n (0a) \r (0d); flag every other C0 control including 0x08
          if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(txt)) offenders.push(p);
        }
      }
    };
    for (const r of roots) walk(r);
    expect(offenders).toEqual([]);
  });
});
