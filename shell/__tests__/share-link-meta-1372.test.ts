/**
 * The META-lock for the share-link checks (#1372, docs/28 §5c rule 5).
 *
 * Four per-tree locks call `shareLinkFaults`, so a check that quietly stops checking turns four
 * green tests into four that prove nothing. This runs the SAME function against deliberately broken
 * builders and asserts each fault is caught — including the timestamp one, which is not a
 * hypothetical mutant: 3-D's save envelope really does stamp `savedAt`, and using it unchanged as
 * the link payload really did produce a different URL on every press.
 */
import { describe, expect, it } from 'vitest';
import { encodeFigurePayload } from '../session/link';
import { MAX_FIGURE_STATEMENTS } from '../save';
import { shareLinkFaults, type ShareSubject } from './fixtures/share-link-rows';

type Bug =
  | 'links-an-empty-canvas'
  | 'payload-in-the-query'
  | 'timestamped-payload'
  | 'accepts-anything'
  | 'cannot-read-its-own'
  | 'ignores-the-ceiling';

/** A miniature builder whose session is a list of lines — enough to drive every row. */
function stub(bug?: Bug): ShareSubject {
  let lines: string[] = [];
  const payloadOf = () =>
    JSON.stringify({ app: 'stub', lines, ...(bug === 'timestamped-payload' ? { at: Date.now() + Math.random() } : {}) });
  return {
    build: () => void (lines = ['z = 1 + i']),
    clear: () => void (lines = []),
    isEmpty: () => lines.length === 0,
    link: () => {
      if (lines.length === 0 && bug !== 'links-an-empty-canvas') return { ok: false, reason: 'empty' };
      const fragment = encodeFigurePayload(payloadOf());
      return bug === 'payload-in-the-query'
        ? { ok: true, url: `https://x/?d=${fragment}` }
        : { ok: true, url: `https://x/#${fragment}` };
    },
    open: (payload) => {
      if (bug === 'accepts-anything') {
        lines = ['whatever'];
        return true;
      }
      if (bug === 'cannot-read-its-own') return 'broken';
      try {
        const v = JSON.parse(payload) as { app?: string; lines?: unknown };
        if (v.app !== 'stub' || !Array.isArray(v.lines) || v.lines.length === 0) return 'broken';
        if (bug !== 'ignores-the-ceiling' && v.lines.length > MAX_FIGURE_STATEMENTS) return 'too-large';
        lines = v.lines.map(String);
        return true;
      } catch {
        return 'broken';
      }
    },
    statements: 'lines',
    foreign: JSON.stringify({ app: 'another-builder', lines: ['x'] }),
  };
}

describe('#1372 — the shared share checks really check', () => {
  it('a conforming builder reports no faults', async () => {
    expect(await shareLinkFaults(stub())).toEqual([]);
  });

  it('CATCHES a builder that offers a link for an empty canvas', async () => {
    expect((await shareLinkFaults(stub('links-an-empty-canvas'))).join(' | ')).toMatch(/EMPTY canvas produced a link/);
  });

  it('CATCHES a payload put in the QUERY, where it would reach the server', async () => {
    expect((await shareLinkFaults(stub('payload-in-the-query'))).join(' | ')).toMatch(/not in the FRAGMENT/);
  });

  it('CATCHES a timestamped payload — the same figure giving two different links', async () => {
    expect((await shareLinkFaults(stub('timestamped-payload'))).join(' | ')).toMatch(/DIFFERENT link on a second press/);
  });

  it('CATCHES a builder that accepts any payload as a figure', async () => {
    expect((await shareLinkFaults(stub('accepts-anything'))).join(' | ')).toMatch(/was ACCEPTED as a shared figure/);
  });

  it('CATCHES a builder that opens a figure past the statement ceiling (#1379)', async () => {
    expect((await shareLinkFaults(stub('ignores-the-ceiling'))).join(' | ')).toMatch(/not refused as too large/);
  });

  it('CATCHES a builder that cannot read the link it just wrote', async () => {
    expect((await shareLinkFaults(stub('cannot-read-its-own'))).join(' | ')).toMatch(/REFUSED a link it had just produced/);
  });
});
