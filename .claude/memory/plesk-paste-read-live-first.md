---
name: plesk-paste-read-live-first
description: "Before handing the operator a Plesk paste block, read the LIVE vhost_ssl.conf (read-only over ssh) and diff it against deploy/apache-*.conf, then check his pasted draft line by line — he dropped the one line that mattered on the first try"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 6c8406cf-7250-4f0c-80ba-7ffd817e1cc0
  modified: 2026-09-30T08:44:30.783Z
---

Plesk's "Additional directives for HTTPS" holds all four builders' confs appended into ONE field, and the tracked `deploy/apache-*.conf` files are only the source of truth for what SHOULD be there (2026-09-30, #1572/#1380).

**Why:** the operator edits that field by hand. On the first draft he deleted the stale comment AND the two `ProxyPass /analytic-builder/admin` lines it described; only a line-by-line read of his draft caught it. A paste block computed from the repo alone would also duplicate lines already live.

**How to apply:**
1. `ssh root@themathbible.com` and read `/var/www/vhosts/system/themathbible.com/conf/vhost_ssl.conf` (read-only; never edit it — Plesk regenerates it).
2. Give him ONLY the missing directives, appended at the end, and say which stale comments may go.
3. When he pastes his draft back, check every required line is present before he applies.
4. After he applies: `npm run deploy:preflight` (the route rows) + `curl -sI` per prefix, then close the issues and amend the DEPLOY-LOG row.

Related: [[deploys-are-mine-to-run]] (the deploy is mine, the Plesk field is his).
