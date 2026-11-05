---
name: work-pc-slow-file-reads
description: "The work PC (COMP11229) reads files 7-18x slower than the home PC, so a test:full there takes ~87 min and two wall-clock tests fail; the cause is not yet known"
metadata:
  node_type: memory
  type: project
  originSessionId: 30e296ec-047e-418e-9609-5fc6edb0a778
  modified: 2026-11-05T15:10:26.549Z
---

Measured 2026-11-05: file reads are 7-18x slower on the work PC (`COMP11229`) than the home PC, CPU 1.8x, stat not slower. `test:full` took ~87 minutes at work and the home PC's last logged runs took ~26 (older commit). Inside a work-PC full run `issue-1815-collapse-attribution` and `scenarios-props-budget` fail on time limits and pass alone. Port 22 is also refused there, so deploys run from home.

**Why:** the cause is unknown. Suspects on the work PC are the `dbx` (Dropbox) and Google Drive file drivers; the operator parked that test on 2026-11-05 and works mostly from the home PC. See issue #2718.

**How to apply:** expect those two failures in a work-PC full run and read them against #2718, without calling them green. Prefer running `test:full` and deploys on the home PC.
