// Stub of 'vitest' for scenarios-export.ts (#2867): the scenario corpus is read outside the runner, and its files
// import `expect` at module level. Nothing here asserts anything; it is aliased in by vite.scenarios.config.mjs only.
const chain: any = new Proxy(function () {}, { get: () => chain, apply: () => chain });
export const expect: any = chain;
export const describe: any = () => {};
export const it: any = () => {};
export const test: any = () => {};
export const vi: any = chain;
export const beforeEach: any = () => {};
export const afterEach: any = () => {};
export const beforeAll: any = () => {};
export const afterAll: any = () => {};
