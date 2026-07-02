# Experiment results

Machine-readable outputs of comparative runs (one JSON per run) + their generated human/paper reports. Governed by [`../PROTOCOL.md`](../PROTOCOL.md); indexed in [`../LEDGER.md`](../LEDGER.md).

**Naming:** `<family>/<benchVersion>__<methodSet>__<YYYY-MM-DD>.json` (+ a sibling `.md`/`.html` report).
Example: `EF-1/BENCH-v1__bisection-brent__2026-07-15.json`.

These are committed so results are reproducible and travel via Dropbox. They are **not** in the production bundle.

## JSON schema (v1 sketch)

```jsonc
{
  "family": "EF-1-root-finder",
  "benchVersion": "BENCH-v1",              // hashed/tagged corpus identity
  "harnessVersion": "1",
  "baseline": { "tag": "solver-baseline", "commit": "<sha>" },
  "env": { "node": "vXX", "os": "win32 …", "cpu": "…", "date": "2026-07-15" },
  "seeds": [0, 1, 2, 3, 4],
  "methods": ["classic-bisection", "brent"],
  "hypothesis": "brent reduces fnEvals >=30% with identical roots",
  "threshold": { "metric": "fnEvals", "direction": "lower", "minRelImprovement": 0.30 },

  "perFigure": [
    {
      "figureId": "coord/midpoint-0007",
      "regime": "determined",              // determined | under-determined
      "results": {
        "classic-bisection": { "verified": true, "oracleMatch": true, "invariantsHold": true,
                               "converged": true, "fnEvals": 812, "iterations": 60,
                               "wallClockMs": 0.41, "residualNorm": 3e-16, "stable": true },
        "brent":             { "verified": true, "oracleMatch": true, "invariantsHold": true,
                               "converged": true, "fnEvals": 47,  "iterations": 9,
                               "wallClockMs": 0.12, "residualNorm": 2e-16, "stable": true }
      }
    }
    // … one row per figure in the benchmark
  ],

  "summary": {
    "classic-bisection": { "n": 0, "correctnessPassRate": 1.0, "regressionsVsBaseline": 0,
                           "fnEvalsMedian": 0, "wallClockMedianMs": 0 },
    "brent": { "n": 0, "correctnessPassRate": 1.0, "regressionsVsBaseline": 0,
               "fnEvalsMedian": 0, "wallClockMedianMs": 0,
               "winsVsBaseline": 0, "lossesVsBaseline": 0, "ties": 0 }
  },

  "verdict": "adopt"                        // adopt | reject | inconclusive
}
```

Keep the schema stable; bump `harnessVersion` when it changes so old results stay interpretable.
