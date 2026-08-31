/**
 * #829 — the post-parse escalation seams answer the two utterances the harness reported as LIVE gaps.
 *
 * The sibling guard (`triage-mirror.test.ts`) proves triage.mjs MENTIONS every seam. That is a text
 * check, and it is the anti-drift half. This file is the behavioural half: the two prod utterances
 * that produced 100% false signal in the 2026-08-30 window must be answered by a seam, deliberately,
 * before any LLM escalation.
 *
 * From prod sessions `a4x5zzq5` + `j7r7np51`:
 *
 *   משולש ABC וריבוע WERT            → the App answers `scope:split-statements:independent`
 *   משולש ABC שווה שוקיים AB=AC      → the App answers `scope:split-statements`
 *
 * Both students immediately did what the guidance told them and all four follow-ups built — the #763
 * teaching seam working exactly as designed. The harness called both LIVE grammar gaps.
 *
 * The suite must never import triage.mjs (it fetches logs and writes a report on import — the
 * standing reason the mirror guard compares TEXT). So the lock lives where it can: on the seam
 * predicates themselves, which are what the harness now calls.
 */
import { describe, expect, it } from 'vitest';
import { buildParseCtx, parse, splitGuidance, upperCasedLabelCandidate, wordRootMagnitude } from '@/parser';
import { independentConstructs } from '@/app/independence';
import { useGeoStore, replay } from '@/store/geoStore';

function ctxOf() {
  const st = useGeoStore.getState();
  const d = replay(st.facts, st.seed, st.radiusOverrides);
  return buildParseCtx(d.construction, d.positions);
}

/** The harness's own decision, reproduced: the App's four seams, in the App's order. */
function guidedAtSeam(u: string, parsed: boolean): string | null {
  if (wordRootMagnitude(u)) return 'scope:word-root';
  const split = splitGuidance(u);
  if (split) return `scope:${split.category}`;
  const independent = independentConstructs(u);
  if (independent) return `scope:${independent.category}:independent`;
  if (!parsed) {
    const lifted = upperCasedLabelCandidate(u);
    if (lifted) {
      const lr = parse(lifted, ctxOf());
      if (lr.ok && lr.commands.length > 0) return 'scope:lowercase-labels';
    }
  }
  return null;
}

describe('#829 — the reported utterances are GUIDED, not live gaps', () => {
  it('«משולש ABC וריבוע WERT» — the #763 independent-constructs teaching', () => {
    useGeoStore.getState().clear();
    const u = 'משולש ABC וריבוע WERT';
    // It must genuinely fail the grammar — otherwise the seam is not what answers it.
    expect(parse(u, ctxOf()).ok).toBe(false);
    expect(guidedAtSeam(u, false)).toBe('scope:split-statements:independent');
  });

  it('«משולש ABC שווה שוקיים AB=AC» — the #108 compound split', () => {
    useGeoStore.getState().clear();
    const u = 'משולש ABC שווה שוקיים AB=AC';
    expect(parse(u, ctxOf()).ok).toBe(false);
    expect(guidedAtSeam(u, false)).toBe('scope:split-statements');
  });

  it('what the students typed NEXT all builds — the teaching worked, which is why it is not a gap', () => {
    for (const u of ['משולש ABC', 'ריבוע WERT', 'משולש ABC שווה שוקיים', 'AB=AC']) {
      useGeoStore.getState().clear();
      const r = parse(u, ctxOf());
      expect(r.ok, `«${u}» should build`).toBe(true);
    }
  });

  it('a REAL gap is still a gap — the seams must not swallow everything', () => {
    // The inverse failure would be worse than the one being fixed: a harness that calls every
    // unparseable line "guided" reports zero gaps forever.
    useGeoStore.getState().clear();
    for (const u of ['קשקוש גמור שאין לו שום משמעות', 'מרובע ABCD שהוא גם מעוין וגם טרפז ישר זווית ועוד']) {
      if (parse(u, ctxOf()).ok) continue;
      expect(guidedAtSeam(u, false), `«${u}» must stay a real gap`).toBeNull();
    }
  });

  it('the lowercase nudge is PROOF-BASED and gated to a failed parse', () => {
    useGeoStore.getState().clear();
    // A lifted candidate that really parses → guided.
    expect(guidedAtSeam('משולש abc', false)).toBe('scope:lowercase-labels');
    // The same utterance on the WEAK-parse path (parsed = true) is not this guard's business.
    expect(guidedAtSeam('משולש abc', true)).toBeNull();
  });
});
