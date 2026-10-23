/**
 * #2305 ([ADR-755](../../docs/06-decisions.md#adr-755)) — lock (d), the SOURCE RATCHET on spelling a circle's name
 * from its id.
 *
 * A circle in student text is named through `circleRefs` → `circleText` (docs/17 §3, "A circle named in student
 * text"). Stripping the `circle-` prefix off an id is how every site that leaked «O-2» built its name. The sites
 * that remain do so legitimately, each for the reason below; the count may only go DOWN. A new site fails here:
 * route it through `circleText` (or `circleMenuTitle`/`violationText`), or add it with a reason the review accepts.
 * The parser (`src/parser/`) mints and reads ids — it is grammar, not student text — and is not scanned.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..');
const STRIP = /replace\(\/\^circle-\/|slice\('circle-'\.length\)/g;

const ALLOWED: Record<string, { max: number; why: string }> = {
  'engine/inkCrossings.ts': { max: 1, why: 'crossingUtterance: the centre letter of a circle with NO role (circleRefs is read first)' },
  'engine/step.ts': { max: 1, why: 'danglingCircleError: an undefined circle has no reference to word' },
  'engine/structure.ts': { max: 1, why: 'circleName: the engine statement token («on circle O-2»); the display resolves it as a circle slot' },
  'engine/verify.ts': { max: 2, why: 'the English `message` and the param fallback letter; `circleSlots` carries the id the display words' },
  'i18n/circleText.ts': { max: 1, why: 'the seam itself: a circle with no role keeps today\'s «⊙ O» title' },
  'i18n/violationText.ts': { max: 1, why: 'the seam: the fallback letter handed to circleText' },
  'render/Figure.tsx': { max: 1, why: 'the menu title when the App passes no wording (a Figure rendered alone)' },
  'replay/core.ts': { max: 2, why: 'internal letter swap of a concentric pair (never student text)' },
};

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return n === '__tests__' || n === 'parser' ? [] : files(p);
    return /\.tsx?$/.test(n) ? [p] : [];
  });
}

describe('#2305 — a circle name is never spelled from its id outside the seam', () => {
  it('the id-stripping sites only go down', () => {
    const found: Record<string, number> = {};
    for (const f of files(ROOT)) {
      const n = (readFileSync(f, 'utf8').match(STRIP) ?? []).length;
      if (n) found[relative(ROOT, f).replace(/\\/g, '/')] = n;
    }
    for (const [file, n] of Object.entries(found)) {
      expect(ALLOWED[file], `${file} spells a circle name from its id (${n}×) — word it through circleText`).toBeDefined();
      expect(n, `${file}: ${ALLOWED[file].why}`).toBeLessThanOrEqual(ALLOWED[file].max);
    }
  });
});
