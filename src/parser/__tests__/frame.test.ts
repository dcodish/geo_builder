/**
 * The sentence frame (`src/parser/frame.ts`) — #2062 ([ADR-819](../../../docs/06-decisions.md#adr-819)): the subject
 * frame «הנקודה M מקיימת …» comes off at the boundary every rule and every honesty gate reads, so a framed statement
 * lowers exactly as the bare one does; a frame whose statement does not mention its point stays as typed.
 */
import { describe, expect, it } from 'vitest';
import { readFrame, readSubjectFrame } from '../frame';
import { normalizeUtterance, parse, subjectFrameOf } from '..';

const BARE = ['AM = 3', 'AM = MB', '∠AMB = 90', 'M אמצע BC', 'M על AB'];
const FRAMES = ['הנקודה M מקיימת ', 'נקודה M מקיימת ', 'M מקיימת ', 'M מקיים ', 'הנקודה M מקיימת: ', 'M מקיימת: ', 'the point M satisfies ', 'M satisfies ', 'point M satisfies: '];

describe('#2062 — the subject frame', () => {
  it('reads off in every spelling, in front of every statement about its point', () => {
    for (const bare of BARE) for (const frame of FRAMES) expect(readFrame(frame + bare), frame + bare).toBe(bare);
  });

  it('a framed line normalises to, and parses as, the bare line', () => {
    const ctx = { points: ['A', 'B', 'C', 'M'] };
    for (const bare of BARE) {
      expect(normalizeUtterance(`הנקודה M מקיימת ${bare}`)).toBe(normalizeUtterance(bare));
      expect(parse(`הנקודה M מקיימת: ${bare}`, ctx), bare).toEqual(parse(bare, ctx));
    }
  });

  it('a statement that does not mention the point is not this frame — left as typed', () => {
    expect(readSubjectFrame('הנקודה D מקיימת AB = 3')).toBeNull();
    expect(readFrame('הנקודה D מקיימת AB = 3')).toBe('הנקודה D מקיימת AB = 3');
    expect(readSubjectFrame("הנקודה M מקיימת AM' = 3")).toBeNull(); // M' is not M
  });

  it('the subject is read off the text before the frame comes off (the read-extent exemption)', () => {
    expect(subjectFrameOf('הנקודה M מקיימת AM = 3')).toEqual({ subject: 'M', rest: 'AM = 3' });
    expect(subjectFrameOf('AM = 3')).toBeNull();
  });
});
