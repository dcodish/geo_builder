---
name: deploy-probe-the-sink
description: "A green deploy proves the ARTIFACT shipped, never that the capability works — exercise the new path end-to-end, because a swallowed error still answers 204"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: ab08da99-e9fb-42f8-9782-b9ed283c09b5
  modified: 2026-09-22T16:22:25.524Z
---

`deploy:preflight` compares artifact hashes. It says nothing about whether the thing you just shipped
actually *does* anything. On `prod/2026-09-22-3` all five artifacts read `MATCHES live`, every page
was 200 and `/healthz` was fine — and analytic's brand-new usage collection (#1243) was accepting
events with **204 and dropping every one of them**. Production declared only `EVENTS_LOG_PATH` and
`EVENTS_3D_LOG_PATH`, so the path fell back to `process.cwd()` (systemd sets no `WorkingDirectory`,
so `/`), the `mkdir` failed, and `eventLog`'s `catch {}` swallowed it and returned 204 anyway.

**Why:** the failure is invisible by construction from every vantage point we normally use. The client
sees success, the artifact check sees a match, the service is healthy, and the log file's absence
looks exactly like "no traffic yet". A sink that silently discards is indistinguishable from a sink
that is merely quiet — which is the same trap #1243 existed to remove, reappearing one layer down.
It is also the #903 class one artifact over: a product was added to `products.json` and its *wiring*
was never created, and nothing checks the difference.

**How to apply:** after deploying anything that WRITES somewhere new — an events sink, a log, a cache,
an upload path — send one real request through the deployed path and then **go look at the
destination**. `find / -name '<the file>'` beats any status code. Never accept a 2xx as evidence that
a write happened, especially where the writer has a `catch {}` around it (grep for one before
trusting the code). The same applies to a new route: `405`/`200` means routed, `404` means not, and
the RUNBOOK's per-builder `api/config` probe exists for exactly this reason.

Related: [[proxy-bundle-is-wider-than-server]] (what to rebuild), [[preflight-differs-means-different-commit]]
(what the hashes mean), [[gate-lines-are-read-not-matched]] (evidence produced is not evidence read),
[[measure-before-diagnosing]].
