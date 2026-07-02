/**
 * Orthography normalization at the parse boundary ([docs/15-hardening-plan.md] C1 / PAR-7).
 *
 * Word/PDF paste the Hebrew MAQAF `־` (U+05BE) where the grammar expects an ASCII hyphen, and copy
 * invisible bidi/zero-width control chars into mixed He/Latin text — both silently broke the parser's
 * optional-`-` / `\s*` adjacency (e.g. "נקודה E על AC ב־40%" dropped the ratio). `normalizeUtterance`
 * now maps `־`→`-` and strips the invisible controls, so pasted text parses like typed text.
 */

import { describe, it, expect } from 'vitest';
import { parse } from '../parse';

const ctx = { points: ['A', 'B', 'C', 'D'] };
/** The parsed commands, or throw. */
const cmds = (u: string) => {
  const r = parse(u, ctx);
  if (!r.ok) throw new Error(`did not parse: ${JSON.stringify(u)}`);
  return r.commands;
};

describe('PAR-7 — maqaf ־ (U+05BE) is normalized to an ASCII hyphen', () => {
  it('"נקודה E על AC ב־40%" keeps the ratio (t≈0.4), same as the ASCII-hyphen form', () => {
    const withMaqaf = cmds('נקודה E על AC ב־40%');
    const withHyphen = cmds('נקודה E על AC ב-40%');
    expect(withMaqaf).toEqual(withHyphen); // maqaf normalized → identical parse
    const seg = withMaqaf.find((c) => c.type === 'point-on-segment') as { t?: number } | undefined;
    expect(seg, 'a point-on-segment command').toBeTruthy();
    expect(seg!.t).toBeCloseTo(0.4, 5); // the ratio is NOT dropped
  });

  it('maqaf in a ל- connector ("מקביל ל־AD") parses like the ASCII form', () => {
    expect(cmds('BC מקביל ל־AD')).toEqual(cmds('BC מקביל ל-AD'));
  });
});

describe('PAR-7 — invisible bidi / zero-width controls are stripped', () => {
  const CONTROLS = ['‎', '‏', '‪', '‮', '⁦', '⁩', '​', '﻿', '؜'];
  it('a bidi-wrapped utterance parses identically to the clean one', () => {
    const clean = 'נקודה E על AC ב-40%';
    for (const c of CONTROLS) {
      // sprinkle the control char at the boundaries where it would otherwise break adjacency
      const dirty = `${c}נקודה E ${c}על AC ב${c}-40%${c}`;
      expect(cmds(dirty), `control U+${c.codePointAt(0)!.toString(16)}`).toEqual(cmds(clean));
    }
  });

  it('a control char glued to a keyword no longer breaks the match (segment AC)', () => {
    expect(cmds('‏קטע AC')).toEqual(cmds('קטע AC'));
  });
});
