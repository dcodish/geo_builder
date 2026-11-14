// Builds player.html (Part 1 scene player, #2887) from player.src.html + the committed BPMN model.
// Run: node build.mjs && node record.cjs   → out/part1-look.mp4
import { readFileSync, writeFileSync } from 'node:fs';
const here = (p) => new URL(p, import.meta.url);
const BPMN_JS = 'https://unpkg.com/bpmn-js@18.31.1/dist';
const grab = async (p) => { const r = await fetch(`${BPMN_JS}/${p}`); if (!r.ok) throw new Error(`${p}: ${r.status}`); return r.text(); };
const css = (await grab('assets/diagram-js.css')) + '\n' + (await grab('assets/bpmn-js.css'));
const xml = readFileSync(here('../bpmn/geo-bug-life.bpmn'), 'utf8');
const src = readFileSync(here('./player.src.html'), 'utf8');
const out = src.replace('/*__BPMN_CSS__*/', () => css).replace('/*__BPMN_XML__*/null', () => JSON.stringify(xml));
writeFileSync(here('./player.html'), out);
console.log('player.html', out.length, 'bytes');
