/**
 * The figure LINK encoding (#1189, ADR-W-079) — `shell/session/link`.
 *
 * The rows are the properties a link has to hold in a chat client, not the shape of the encoder:
 * it survives a link detector (base64url only), it survives what clients do to a URL (a stray `#`,
 * a tracking tail), it round-trips a real save envelope, and — the one that protects a student —
 * anything that is not one of our payloads is REFUSED rather than half-decoded.
 */
import { describe, expect, it } from 'vitest';
import {
  LINK_MAX_CHARS,
  decodeFigurePayload,
  encodeFigurePayload,
  figureLinkUrl,
  linkFits,
} from '../session/link';

const ENVELOPE = JSON.stringify({
  app: 'geo-builder',
  schemaVersion: 1,
  seed: 3,
  facts: [
    { utterance: 'ריבוע ABCD', cmd: { type: 'square', ids: ['A', 'B', 'C', 'D'] }, enabled: true },
    { utterance: 'נקודה G על AD', cmd: { type: 'point-on-segment', id: 'G', a: 'A', b: 'D', t: 0.4 }, enabled: true },
  ],
});

describe('#1189 — the payload survives a chat client', () => {
  it('round-trips a save envelope byte for byte, Hebrew included', () => {
    expect(decodeFigurePayload(encodeFigurePayload(ENVELOPE))).toBe(ENVELOPE);
  });

  it('emits base64url ONLY — a link detector cannot chop it mid-blob', () => {
    expect(encodeFigurePayload(ENVELOPE)).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('compresses: the fragment is shorter than the envelope it carries', () => {
    expect(encodeFigurePayload(ENVELOPE).length).toBeLessThan(ENVELOPE.length);
  });

  it('tolerates what clients do to a URL — a leading #, a tracking tail, whitespace', () => {
    const payload = encodeFigurePayload(ENVELOPE);
    for (const variant of [`#${payload}`, `${payload}?utm=whatsapp`, `  ${payload}  `, `##${payload}`])
      expect(decodeFigurePayload(variant), variant.slice(0, 12)).toBe(ENVELOPE);
  });

  it('the URL puts the payload in the FRAGMENT — it never reaches a server', () => {
    const url = figureLinkUrl('https://themathbible.com/geo-builder/', ENVELOPE);
    expect(url.split('#')[0]).toBe('https://themathbible.com/geo-builder/');
    expect(url).toContain('#');
    expect(url.split('#')[1]).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe('#1189 — anything that is not our payload is REFUSED', () => {
  it.each([
    ['an empty fragment', ''],
    ['just a hash', '#'],
    ['a foreign fragment', 'section-3'],
    ['base64 with illegal characters', 'abc+def/ghi='],
    ['well-formed base64url that is not deflate', 'aGVsbG8gd29ybGQ'],
  ])('%s decodes to null, never a partial figure', (_label, fragment) => {
    expect(decodeFigurePayload(fragment)).toBeNull();
  });

  it('a TRUNCATED payload is refused — the case a silent half-load would come from', () => {
    const payload = encodeFigurePayload(ENVELOPE);
    expect(decodeFigurePayload(payload.slice(0, Math.floor(payload.length * 0.6)))).toBeNull();
  });
});

describe('#1189 — the length refusal', () => {
  it('a typical figure fits with room to spare', () => {
    expect(linkFits(figureLinkUrl('https://themathbible.com/geo-builder/', ENVELOPE))).toBe(true);
  });

  it('an over-long link does NOT fit — the button refuses instead of emitting it', () => {
    expect(linkFits('x'.repeat(LINK_MAX_CHARS + 1))).toBe(false);
    expect(linkFits('x'.repeat(LINK_MAX_CHARS))).toBe(true);
  });
});
