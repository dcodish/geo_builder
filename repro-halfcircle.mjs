// Throwaway repro — prod sessions p3du4l9p / z57b5nd0 / fxp24nna: half-circle on square sides.
// Run: npx vite-node repro-halfcircle.mjs
import { parse, buildParseCtx, droppedNewLabels, droppedGivenNumbers } from './src/parser/index.ts';
import { replay, firstSatisfyingSeed } from './src/store/geoStore.ts';

const SESSIONS = {
  'p3du4l9p (operator, 2026-07-11)': [
    'ריבוע',
    'על כל צלע של ריבוע יש חצי מעגל',
    'על צלע CD יש חצי מעגל',
    'CD קוטר',
    'CB קוטר',
  ],
  'z57b5nd0 (2026-07-02)': ['חצי מעגל', 'ריבוע ABCD', 'חצי מעגל שהקוטר שלו CD', 'CD קוטר '],
  'fxp24nna (2026-07-02)': ['חצי מעגל O', 'ABCD ריבוע', 'חצי מעגל P שהקוטר של CD', 'CD קוטר מעגל P'],
};

for (const [name, steps] of Object.entries(SESSIONS)) {
  console.log(`\n========== ${name} ==========`);
  const facts = [];
  let g = 0;
  for (const u of steps) {
    const { construction, positions } = replay(facts);
    const ctx = buildParseCtx(construction, positions);
    const r = parse(u, ctx);
    console.log(`\n--- "${u}"`);
    if (!r.ok) {
      console.log(`  NOT PARSED: ${JSON.stringify(r)}`);
      continue;
    }
    console.log(`  commands: ${JSON.stringify(r.commands)}`);
    const dropped = droppedNewLabels(u, r.commands, ctx.points ?? []);
    const droppedNums = droppedGivenNumbers(u, r.commands);
    if (dropped.length) console.log(`  ! droppedNewLabels: ${dropped}`);
    if (droppedNums.length) console.log(`  ! droppedGivenNumbers: ${droppedNums}`);
    const group = `g${g++}`;
    for (const cmd of r.commands) facts.push({ id: `${group}.${facts.length}`, utterance: u, group, cmd, enabled: true });
    const fig = replay(facts, firstSatisfyingSeed(facts));
    const bad = Object.entries(fig.status).filter(([, s]) => s !== 'ok');
    console.log(`  step status: ${bad.length ? JSON.stringify(bad) : 'all ok'}  lastError: ${fig.lastError ? JSON.stringify(fig.lastError) : 'none'}`);
    if (fig.violations?.length) console.log(`  verifier violations: ${JSON.stringify(fig.violations)}`);
  }
  const fig = replay(facts, firstSatisfyingSeed(facts));
  console.log(`\nFINAL positions:`);
  for (const [id, p] of fig.positions) console.log(`  ${id}: (${p.x.toFixed(2)}, ${p.y.toFixed(2)})`);
  console.log(`objects: ${JSON.stringify([...fig.construction.objects.keys?.() ?? []])}`);
}
