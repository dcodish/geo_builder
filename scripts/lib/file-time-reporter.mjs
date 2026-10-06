/**
 * #1813 (ADR-W-113) — a vitest reporter that records each test FILE's TRUE duration.
 *
 * WHY NOT THE JSON REPORTER'S TIMES: its per-file `endTime - startTime` spans the first test's start to
 * the last test's end, so work done in `beforeAll`/`afterAll` is invisible. The #1395 parity shards do ALL
 * their work in `beforeAll`: shard 4 reads as 0 s in the JSON report and takes 207 s alone. Tier
 * membership was derived from that span, so every hook-heavy file sat in the "fast" tier and `test:fast`
 * grew from ~60 s to 6 min (measured 2026-10-06) with nothing noticing.
 *
 * What a file costs a run is its suite run INCLUDING hooks (`file.result.duration` — the runner times the
 * file suite around its hooks) plus the collect, setup and prepare phases that precede it.
 *
 * Wired by `scripts/test-tiers.mjs` via `--reporter=<this file>`; the output path comes from
 * `GEO_FILE_TIMES_OUT`. Best-effort: a failure here must never fail a suite run.
 */
import { writeFileSync } from 'node:fs';

/** Pure: what one file cost the run, in ms. Exported for `server/__tests__/test-tiers.test.ts`. */
export function fileDurationMs(file) {
  return (
    (file?.result?.duration ?? 0) +
    (file?.collectDuration ?? 0) +
    (file?.setupDuration ?? 0) +
    (file?.prepareDuration ?? 0)
  );
}

export default class FileTimeReporter {
  onFinished(files) {
    const dest = process.env.GEO_FILE_TIMES_OUT;
    if (!dest) return;
    try {
      const out = {};
      for (const f of files ?? []) out[f.filepath] = fileDurationMs(f);
      writeFileSync(dest, JSON.stringify(out));
    } catch (e) {
      console.error(`file-time reporter: could not write ${dest} (${e.message}) — tiers fall back to the JSON span.`);
    }
  }
}
