---
name: deploy-transport-scp-tar
description: "Recursive scp of a dist/ tree can die mid-upload; check the server before retrying, and if you fall back to tar|ssh remember it carries the LOCAL uid — chown root:root after"
metadata: 
  node_type: memory
  type: project
  originSessionId: 50ff0a93-47c3-4538-9a88-e5dcbeafaa19
  modified: 2026-09-18T11:04:22.052Z
---

Deploying `dist-3d/` at `prod/2026-09-18`, the RUNBOOK's `scp -r dist-3d/* …` died with
`Connection closed by … port 22` — while `ssh` and a single-file `scp` to the same host both worked
before and after. Transient, and it recurs.

**Two things follow, in order:**

1. **Check the server before retrying.** A recursive `scp` that dies part-way can leave a half-written
   tree — some new assets, an old `index.html`. Here it had uploaded nothing (`index.html` still
   carried the previous deploy's date), so the retry was safe. Confirm that rather than assume it;
   a half-deployed static tree serves a page whose bundle 404s.

2. **`tar | ssh` is the robust fallback** — one stream instead of many connections:

   ```sh
   tar cz -C dist-3d . | ssh -o ServerAliveInterval=15 root@host 'tar xz -C /var/www/.../3d-builder'
   ```

   **But it carries the LOCAL uid/gid.** From Windows that lands as `197608:197608`, not `root:root`,
   and the RUNBOOK's step 3 (`chmod -R a+rX`) does not fix ownership. Restore it explicitly and verify:

   ```sh
   ssh root@host 'cd <dir> && chown -R root:root . && find . -type f -exec chmod 644 {} \;'
   ```

`scp` preserves the remote's ownership and needs none of this — the chown is the price of the fallback,
not a general deploy step. Related: [[proxy-bundle-is-wider-than-server]], [[deploys-are-mine-to-run]].
