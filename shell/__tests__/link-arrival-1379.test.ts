/**
 * The ARRIVAL bounds on a shared link (#1379) — `shell/session/link` and `shell/save`.
 *
 * A link is a stranger's input. Before this, the decoder inflated whatever bytes arrived with no
 * output ceiling (measured 768:1 — a 1,416-character fragment became 1 MB), and nothing bounded how
 * many statements a figure could ask the engine to replay. The emit-side `LINK_MAX_CHARS` protected
 * nobody: an attacker builds the fragment by hand.
 *
 * The rows are the attacker's inputs, measured on time as well as on verdict, because "refused, but
 * only after inflating 64 MB" would pass a verdict-only test and still freeze the tab.
 */
import { deflateSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { MAX_FIGURE_STATEMENTS, figureTooLarge, readEnvelope } from '../save';
import {
  LINK_ARRIVAL_MAX_CHARS,
  LINK_MAX_CHARS,
  PAYLOAD_MAX_BYTES,
  decodeFigurePayload,
  encodeFigurePayload,
  readFigurePayload,
} from '../session/link';

const toBase64Url = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64url');

/** A decompression bomb: `mb` megabytes of zeros, deflated — what a hand-built fragment carries. */
const bomb = (mb: number) => toBase64Url(deflateSync(new Uint8Array(mb * 1024 * 1024)));

describe('#1379 — a decompression bomb is refused, and refused FAST', () => {
  it('the issue\'s 1 MB bomb (a ~1,400-character link) is refused as too large in well under 50 ms', () => {
    const fragment = bomb(1);
    expect(fragment.length, 'the bomb fits in an ordinary-looking link').toBeLessThan(LINK_MAX_CHARS);
    const t0 = performance.now();
    const r = readFigurePayload(fragment);
    const ms = performance.now() - t0;
    expect(r).toEqual({ ok: false, reason: 'too-large' });
    expect(ms, 'the inflate stopped at the ceiling instead of expanding the whole bomb').toBeLessThan(50);
  });

  it('a 64 MB bomb costs about the same as a 1 MB one — the work is bounded by the CEILING, not the bomb', () => {
    const fragment = bomb(64);
    const t0 = performance.now();
    expect(readFigurePayload(`#${fragment}`)).toEqual({ ok: false, reason: 'too-large' });
    expect(performance.now() - t0).toBeLessThan(50);
  });

  it('a fragment over the character ceiling is refused before it is decoded at all', () => {
    // 'A' repeated is valid base64url of zero bytes — decoded, it would inflate-FAIL (malformed). The
    // too-large verdict proves the length check ran first and nothing reached the inflater.
    expect(readFigurePayload('A'.repeat(LINK_ARRIVAL_MAX_CHARS + 1))).toEqual({ ok: false, reason: 'too-large' });
    expect(readFigurePayload('A'.repeat(LINK_ARRIVAL_MAX_CHARS))).toEqual({ ok: false, reason: 'malformed' });
  });

  it('the ceilings are generous to every real figure: the arrival cap is 4× the emit cap, the byte cap 40× the biggest corpus figure', () => {
    expect(LINK_ARRIVAL_MAX_CHARS).toBe(LINK_MAX_CHARS * 4);
    expect(PAYLOAD_MAX_BYTES).toBeGreaterThanOrEqual(40 * 6 * 1024);
  });

  it('an expansion exactly AT the byte ceiling still opens — the bound is not off by one', () => {
    const text = `{"a":"${'x'.repeat(PAYLOAD_MAX_BYTES - 8)}"}`;
    expect(text.length).toBe(PAYLOAD_MAX_BYTES);
    expect(decodeFigurePayload(encodeFigurePayload(text))).toBe(text);
    const over = `{"a":"${'x'.repeat(PAYLOAD_MAX_BYTES - 7)}"}`;
    expect(readFigurePayload(encodeFigurePayload(over))).toEqual({ ok: false, reason: 'too-large' });
  });

  it('a broken link is still called broken, not too large — they are different messages to the student', () => {
    expect(readFigurePayload('not-our-payload')).toEqual({ ok: false, reason: 'malformed' });
    expect(readFigurePayload('')).toEqual({ ok: false, reason: 'malformed' });
    const real = encodeFigurePayload(JSON.stringify({ app: 'x', lines: ['z = 1'] }));
    expect(readFigurePayload(real.slice(0, Math.floor(real.length * 0.6)))).toEqual({ ok: false, reason: 'malformed' });
  });

  it('a real payload still round-trips through the bounded inflate, Hebrew and all', () => {
    const env = JSON.stringify({ app: 'geo-builder', facts: [{ utterance: 'ריבוע ABCD' }] });
    expect(readFigurePayload(encodeFigurePayload(env))).toEqual({ ok: true, text: env });
    // a payload spread over many inflate slices (> 512 input bytes) reassembles in order
    const long = JSON.stringify({ app: 'x', lines: Array.from({ length: 400 }, (_, i) => `z${i} = ${i * 7919 % 1000}+${i}i`) });
    const enc = encodeFigurePayload(long);
    expect(Buffer.from(enc, 'base64url').length).toBeGreaterThan(512);
    expect(decodeFigurePayload(enc)).toBe(long);
  });
});

describe('#1379 — the statement ceiling is checked by the shared envelope, before anything replays', () => {
  const env = (n: number) => ({ app: 'stub', version: 1, lines: Array.from({ length: n }, (_, i) => `z${i} = ${i}`) });

  it('refuses one statement past the ceiling as too-large, and accepts the ceiling itself', () => {
    const spec = { app: 'stub', maxVersion: 1, statements: 'lines' };
    expect(readEnvelope(env(MAX_FIGURE_STATEMENTS + 1), spec)).toEqual({ ok: false, reason: 'too-large' });
    expect(readEnvelope(env(MAX_FIGURE_STATEMENTS), spec).ok).toBe(true);
  });

  it('the ceiling is well above every real figure (corpus max 23, logs max 26) and below the 96-fact attack link', () => {
    expect(figureTooLarge(26)).toBe(false);
    expect(figureTooLarge(96)).toBe(true);
    expect(MAX_FIGURE_STATEMENTS).toBeGreaterThanOrEqual(2 * 26);
  });

  it('a caller that names no statement list is unaffected — the check is opt-in per envelope, never guessed', () => {
    expect(readEnvelope(env(500), { app: 'stub', maxVersion: 1 }).ok).toBe(true);
  });
});
