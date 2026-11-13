// vite-node config for scenarios-export.ts ONLY (#2867): the repo's '@' alias, and 'vitest' aliased to a stub so the
// scenario corpus files (which import `expect` at module level) can be read outside the test runner. Not an entry
// point; scripts/perf/2d/driver.mjs passes it with `-c`. It deliberately does not load the repo's vite.config.ts
// (no dev-server plugins are needed to read four arrays).
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..', '..');

export default {
  root: REPO,
  resolve: {
    alias: [
      { find: /^vitest$/, replacement: path.join(HERE, 'vitest-stub.ts').split(path.sep).join('/') },
      { find: '@', replacement: path.join(REPO, 'src').split(path.sep).join('/') },
    ],
  },
};
