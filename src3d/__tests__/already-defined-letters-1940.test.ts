/**
 * ADR-3D-318 (round #1940): 3-D's `already-defined` refusal named an engine id («circle-ABCD» כבר מוגדר בציור),
 * found when #1902's test arrays fed student-text-1455 a re-inscribed ring. The refusal names the student's letters.
 */
import { describe, expect, it } from 'vitest';
import i18n3d from '../i18n';
import { errorText3, studentLetters3 } from '../i18n/errorText3';
import { useGeo3 } from '../store/store3';

describe('ADR-3D-318 — already-defined names letters, never an engine id', () => {
  it('strips a kind prefix and keeps a bare label', () => {
    expect(studentLetters3('circle-ABCD')).toBe('ABCD');
    expect(studentLetters3('circle-O')).toBe('O');
    expect(studentLetters3('M')).toBe('M');
  });
  it('a second circle through a ring is refused naming the ring, not «circle-ABCD»', () => {
    useGeo3.setState({ facts: [], seed: 0, lastError: null } as never);
    useGeo3.getState().submit('דלתון ABCD חסום במעגל');
    useGeo3.getState().submit('ריבוע ABCD חסום במעגל');
    const err = useGeo3.getState().lastError;
    expect(err?.code).toBe('already-defined');
    const text = errorText3((k, o) => i18n3d.t(k, o) as string, err!);
    expect(text).toContain('«ABCD»');
    expect(text).not.toContain('circle-');
  });
});
