/**
 * EVERY PRODUCT'S EVENTS GO TO ITS OWN FILE (#1243).
 *
 * The defect: `handleLog` routed with `payload.tool === '3d' ? 3-D : 2-D`, so every tag that was not
 * `'3d'` — a third product's, or a typo — was appended to **2-D's** file. A wrong destination is
 * invisible from the client side, so analytic's and complex's events would have corrupted 2-D's
 * numbers rather than appearing as their own, and `/log-triage` would have gone on reporting nothing
 * for them.
 *
 * The rows below assert the routing **in both directions** — the event lands where it belongs AND does
 * not land anywhere else — because the bug was a wrong destination, not a missing one. A test that
 * only checked "the analytic file has the event" would have passed against the old code for 2-D.
 */
import { describe, it, expect, afterEach } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { handleLog } from '../eventLog';
import { PRODUCT_IDS, DEFAULT_TOOL, eventsLogPathForId, eventsLogPathForTool, eventsFileName, eventsEnvVar } from '../toolRouting';

const dirs: string[] = [];
function tmp() {
  const d = mkdtempSync(path.join(tmpdir(), 'ev-'));
  dirs.push(d);
  return d;
}
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

function mockRes() {
  return { statusCode: 0, setHeader() {}, end() {} } as unknown as ServerResponse & { statusCode: number };
}
async function* chunks(parts: string[]) { for (const p of parts) yield Buffer.from(p); }
let ipSeq = 0;
function mockReq(body: unknown) {
  const req = chunks([JSON.stringify(body)]) as AsyncGenerator<Buffer> & {
    method: string; socket: { remoteAddress: string }; headers: Record<string, string>;
  };
  req.method = 'POST';
  req.socket = { remoteAddress: `10.5.${Math.floor(ipSeq / 250) % 250}.${ipSeq++ % 250}` };
  req.headers = {};
  return req;
}

/** Post one event with every product's file pointed into a fresh temp dir. Returns each file's lines. */
async function postAndRead(payload: Record<string, unknown>) {
  const d = tmp();
  const logPaths = Object.fromEntries(PRODUCT_IDS.map((id) => [id, path.join(d, `${id}.jsonl`)]));
  const res = mockRes();
  await handleLog(mockReq(payload) as unknown as IncomingMessage, res, {
    ipSalt: 'test-salt',
    logPath: logPaths[DEFAULT_TOOL],
    log3Path: logPaths['3d'],
    logPaths,
  });
  const files = Object.fromEntries(
    PRODUCT_IDS.map((id) => [id, existsSync(logPaths[id]) ? readFileSync(logPaths[id], 'utf8').trim().split('\n').filter(Boolean) : []]),
  );
  return { status: res.statusCode, files };
}

const SUBMIT = { ev: 'submit', utterance: 'x', locale: 'he', source: 'parser', result: 'ok' };

describe('#1243 — an event lands in ITS product\'s file and nowhere else', () => {
  /**
   * TOTALITY — the lock that would have caught the original gap. Every product in the registry is
   * routable; a product added without a path fails here rather than silently becoming 2-D.
   */
  it('every registered product is routable', () => {
    expect(PRODUCT_IDS.length).toBeGreaterThanOrEqual(4);
    for (const id of PRODUCT_IDS) {
      expect(eventsLogPathForId(id), `${id} has no events path`).toBeTruthy();
      expect(eventsLogPathForTool(id), `${id} is not routable by tag`).toBeTruthy();
    }
  });

  it.each(PRODUCT_IDS.map((id) => [id]))('«%s» routes to its own file, and to no other', async (id) => {
    const { status, files } = await postAndRead({ ...SUBMIT, tool: id });
    expect(status).toBe(204);
    expect(files[id], `${id}'s own file`).toHaveLength(1);
    for (const other of PRODUCT_IDS.filter((x) => x !== id)) {
      expect(files[other], `${id}'s event leaked into ${other}'s file`).toHaveLength(0);
    }
  });

  /** The historical convention, and a regression guard on live behaviour: no tag means 2-D. */
  it('an UNTAGGED event is still 2-D', async () => {
    const { status, files } = await postAndRead(SUBMIT);
    expect(status).toBe(204);
    expect(files[DEFAULT_TOOL]).toHaveLength(1);
    for (const other of PRODUCT_IDS.filter((x) => x !== DEFAULT_TOOL)) expect(files[other]).toHaveLength(0);
  });

  /**
   * THE DEFECT ITSELF. Under the old boolean this wrote into 2-D's file and returned 204 — the event
   * was accepted, stored, and wrong. It must now be refused and written nowhere.
   */
  it.each([['nope'], ['2D'], ['analytics'], ['']])('an UNKNOWN tool «%s» is refused, not filed as 2-D', async (tool) => {
    const { status, files } = await postAndRead({ ...SUBMIT, tool });
    expect(status).toBe(400);
    for (const id of PRODUCT_IDS) expect(files[id], `leaked into ${id}`).toHaveLength(0);
  });

  it('a non-string tool is refused too', async () => {
    const { status, files } = await postAndRead({ ...SUBMIT, tool: 3 });
    expect(status).toBe(400);
    for (const id of PRODUCT_IDS) expect(files[id]).toHaveLength(0);
  });

  /**
   * The two LIVE filenames and env vars must be reproduced exactly — those files hold real production
   * data, and a derivation that renamed them would orphan it.
   */
  it('reproduces the two live filenames and env vars rather than renaming production data', () => {
    expect(eventsFileName('2d')).toBe('events.jsonl');
    expect(eventsFileName('3d')).toBe('events-3d.jsonl');
    expect(eventsEnvVar('2d')).toBe('EVENTS_LOG_PATH');
    expect(eventsEnvVar('3d')).toBe('EVENTS_3D_LOG_PATH');
    expect(eventsFileName('analytic')).toBe('events-analytic.jsonl');
    expect(eventsEnvVar('analytic')).toBe('EVENTS_ANALYTIC_LOG_PATH');
  });

  it('an unregistered id has no path at all — the caller cannot fall back by accident', () => {
    expect(eventsLogPathForId('nope')).toBeNull();
    expect(eventsLogPathForTool('nope')).toBeNull();
    expect(eventsLogPathForTool(42)).toBeNull();
  });
});
