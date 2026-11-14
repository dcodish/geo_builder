// Generates geo-bug-life.bpmn (BPMN 2.0 XML with DI) for the promo video (#2887).
// The diagram is the AS-IS dev process: a bug from report to production, its agents and the operator.
// Edit the model here, never the .bpmn by hand; then run build.mjs to refresh page.html (the published artifact).
// Layout is explicit: every node is placed by centre (cx, cy); edges are orthogonal.
import { writeFileSync } from 'node:fs';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ---------- model containers ----------
const containers = {}; // id -> { tag, attrs, items: [], lanes? }
const planes = {};     // planeId -> { element, shapes: [], edges: [] }
const nodes = {};      // id -> { id, kind, b: {x,y,w,h}, container, plane, incoming:[], outgoing:[], extra }
const flowsXml = {};   // container -> [xml]
let collabMsgs = [];   // message flow xml
const assocXml = {};   // container -> [] (text annotation associations)

function plane(id, element) { planes[id] = { element, shapes: [], edges: [] }; }
function container(id, tag, attrs = '') { containers[id] = { tag, attrs, items: [], lanes: null }; flowsXml[id] = []; assocXml[id] = []; }

const SIZE = {
  start: [36, 36], end: [36, 36], catch: [36, 36], boundary: [36, 36],
  task: [120, 70], sub: [120, 80], call: [120, 70],
  xor: [50, 50], eb: [50, 50], store: [50, 50], note: [170, 54],
};

// kind: start|end|catch|task|sub|call|xor|eb|store|boundary|note
// opts: { def: 'message'|'timer'|'conditional'|'escalation', task: 'userTask'|'sendTask'|..., mi, loop, called, lab, attached }
function N(c, pl, id, kind, name, cx, cy, opts = {}) {
  const [w, h] = opts.size || SIZE[kind];
  const n = { id, kind, name, c, pl, b: { x: cx - w / 2, y: cy - h / 2, w, h }, cx, cy, incoming: [], outgoing: [], opts, dataIn: [], dataOut: [] };
  nodes[id] = n;
  containers[c].items.push(n);
  return n;
}

// ---------- geometry ----------
const port = (n, s) => {
  const { x, y, w, h } = n.b;
  if (s === 'r') return [x + w, y + h / 2];
  if (s === 'l') return [x, y + h / 2];
  if (s === 't') return [x + w / 2, y];
  return [x + w / 2, y + h];
};

function autoRoute(a, b) {
  const sa = nodes[a], sb = nodes[b];
  if (Math.abs(sa.cy - sb.cy) < 1) return [port(sa, 'r'), port(sb, 'l')];
  const isGwA = sa.kind === 'xor' || sa.kind === 'eb';
  const isGwB = sb.kind === 'xor' || sb.kind === 'eb';
  if (isGwA) {
    const p = port(sa, sb.cy < sa.cy ? 't' : 'b');
    return [p, [p[0], sb.cy], port(sb, 'l')];
  }
  if (isGwB) {
    const p = port(sb, sa.cy < sb.cy ? 't' : 'b');
    const s = port(sa, 'r');
    return [s, [p[0], s[1]], p];
  }
  const s = port(sa, 'r'), t = port(sb, 'l');
  const mx = (s[0] + t[0]) / 2;
  return [s, [mx, s[1]], [mx, t[1]], t];
}

function labelFor(pts, text) {
  if (!text) return null;
  const [p0, p1] = pts;
  const w = Math.max(30, text.length * 6.2), h = 14;
  if (Math.abs(p0[0] - p1[0]) < 1) { // vertical first segment
    const down = p1[1] > p0[1];
    return { x: p0[0] + 5, y: down ? p0[1] + 4 : p0[1] - 18, w, h };
  }
  const right = p1[0] > p0[0];
  return { x: right ? p0[0] + 6 : p0[0] - w - 6, y: p0[1] - 17, w, h };
}

let sfCount = 0;
// S(from, to, { name, def, pts, via })
function S(a, b, o = {}) {
  const id = o.id || `Flow_${++sfCount}`;
  const na = nodes[a], nb = nodes[b];
  if (na.c !== nb.c) throw new Error(`sequence flow across containers ${a} -> ${b}`);
  let pts = o.pts;
  if (o.via) pts = [port(na, o.from || 'r'), ...o.via, port(nb, o.to || 'l')];
  if (!pts) pts = autoRoute(a, b);
  na.outgoing.push(id); nb.incoming.push(id);
  if (o.def) na.defaultFlow = id;
  flowsXml[na.c].push(`<bpmn:sequenceFlow id="${id}"${o.name ? ` name="${esc(o.name)}"` : ''} sourceRef="${a}" targetRef="${b}" />`);
  const lb = labelFor(pts, o.name); if (lb && o.lp) { lb.x = o.lp[0]; lb.y = o.lp[1]; }
  planes[na.pl].edges.push({ id, pts, label: lb });
  return id;
}

let mfCount = 0;
const msgEdges = [];
// M(fromId, toId, name, pts)  — ids may be participant ids for black-box pools
function M(a, b, name, pts, side = 'r') {
  const id = `Msg_${++mfCount}`;
  collabMsgs.push(`<bpmn:messageFlow id="${id}" name="${esc(name)}" sourceRef="${a}" targetRef="${b}" />`);
  const L = pts.length;
  // label beside the longest vertical segment
  let best = 0, bi = 0;
  for (let i = 0; i < L - 1; i++) {
    const len = Math.abs(pts[i + 1][1] - pts[i][1]);
    if (Math.abs(pts[i + 1][0] - pts[i][0]) < 1 && len > best) { best = len; bi = i; }
  }
  const mid = [pts[bi][0], (pts[bi][1] + pts[bi + 1][1]) / 2];
  const w = Math.max(40, name.length * 6.2);
  const lab = Array.isArray(side) ? { x: side[0], y: side[1], w, h: 14 } : { x: side === 'r' ? mid[0] + 5 : mid[0] - w - 5, y: mid[1] - 7, w, h: 14 };
  msgEdges.push({ id, pts, label: lab });
}

// data associations: D(taskId, storeId, 'read'|'write', pts)
let daCount = 0;
function D(t, s, dir, pts) {
  const id = `DataAssoc_${++daCount}`;
  const nt = nodes[t];
  if (dir === 'read') nt.dataIn.push({ id, store: s }); else nt.dataOut.push({ id, store: s });
  planes[nt.pl].edges.push({ id, pts });
}
// text annotation association
let anCount = 0;
function A(note, target, pts) {
  const id = `Assoc_${++anCount}`;
  const nn = nodes[note];
  assocXml[nn.c].push(`<bpmn:association id="${id}" sourceRef="${note}" targetRef="${target}" />`);
  planes[nn.pl].edges.push({ id, pts });
}

// ---------- semantic xml ----------
function evDef(n) {
  const d = n.opts.def;
  if (!d) return '';
  if (d === 'message') return `<bpmn:messageEventDefinition id="${n.id}_ed" />`;
  if (d === 'timer') return `<bpmn:timerEventDefinition id="${n.id}_ed"><bpmn:timeCycle xsi:type="bpmn:tFormalExpression">${esc(n.opts.cycle || 'R/P1D')}</bpmn:timeCycle></bpmn:timerEventDefinition>`;
  if (d === 'conditional') return `<bpmn:conditionalEventDefinition id="${n.id}_ed"><bpmn:condition xsi:type="bpmn:tFormalExpression">${esc(n.opts.cond || '')}</bpmn:condition></bpmn:conditionalEventDefinition>`;
  if (d === 'escalation') return `<bpmn:escalationEventDefinition id="${n.id}_ed" escalationRef="Escalation_PlanFails" />`;
  return '';
}
function ioXml(n) {
  let s = '';
  if (n.dataIn.length) s += `<bpmn:property id="${n.id}_prop" name="__targetRef_placeholder" />`;
  for (const d of n.dataIn) s += `<bpmn:dataInputAssociation id="${d.id}"><bpmn:sourceRef>${d.store}</bpmn:sourceRef><bpmn:targetRef>${n.id}_prop</bpmn:targetRef></bpmn:dataInputAssociation>`;
  for (const d of n.dataOut) s += `<bpmn:dataOutputAssociation id="${d.id}"><bpmn:targetRef>${d.store}</bpmn:targetRef></bpmn:dataOutputAssociation>`;
  return s;
}
function nodeXml(n) {
  const nm = n.name ? ` name="${esc(n.name)}"` : '';
  const io = n.incoming.map((f) => `<bpmn:incoming>${f}</bpmn:incoming>`).join('') + n.outgoing.map((f) => `<bpmn:outgoing>${f}</bpmn:outgoing>`).join('');
  switch (n.kind) {
    case 'start': return `<bpmn:startEvent id="${n.id}"${nm}>${io}${evDef(n)}</bpmn:startEvent>`;
    case 'end': return `<bpmn:endEvent id="${n.id}"${nm}>${io}${evDef(n)}</bpmn:endEvent>`;
    case 'catch': return `<bpmn:intermediateCatchEvent id="${n.id}"${nm}>${io}${evDef(n)}</bpmn:intermediateCatchEvent>`;
    case 'boundary': return `<bpmn:boundaryEvent id="${n.id}"${nm} cancelActivity="false" attachedToRef="${n.opts.attached}">${io}${evDef(n)}</bpmn:boundaryEvent>`;
    case 'xor': return `<bpmn:exclusiveGateway id="${n.id}"${nm}${n.defaultFlow ? ` default="${n.defaultFlow}"` : ''}>${io}</bpmn:exclusiveGateway>`;
    case 'eb': return `<bpmn:eventBasedGateway id="${n.id}"${nm}>${io}</bpmn:eventBasedGateway>`;
    case 'task': { const t = n.opts.task || 'task'; return `<bpmn:${t} id="${n.id}"${nm}>${io}${ioXml(n)}</bpmn:${t}>`; }
    case 'call': return `<bpmn:callActivity id="${n.id}"${nm} calledElement="${n.opts.called}">${io}${ioXml(n)}</bpmn:callActivity>`;
    case 'store': return `<bpmn:dataStoreReference id="${n.id}"${nm} dataStoreRef="${n.opts.store}" />`;
    case 'note': return `<bpmn:textAnnotation id="${n.id}"><bpmn:text>${esc(n.name)}</bpmn:text></bpmn:textAnnotation>`;
    case 'sub': {
      const loop = n.opts.mi ? `<bpmn:multiInstanceLoopCharacteristics id="${n.id}_mi" />` : n.opts.loop ? `<bpmn:standardLoopCharacteristics id="${n.id}_loop" />` : '';
      return `<bpmn:subProcess id="${n.id}"${nm}>${io}${ioXml(n)}${loop}${containerBody(n.id)}</bpmn:subProcess>`;
    }
  }
  throw new Error(n.kind);
}
function containerBody(cid) {
  const c = containers[cid];
  let s = '';
  if (c.lanes) {
    s += `<bpmn:laneSet id="${cid}_lanes">` + c.lanes.map((l) => `<bpmn:lane id="${l.id}" name="${esc(l.name)}">` + l.refs.map((r) => `<bpmn:flowNodeRef>${r}</bpmn:flowNodeRef>`).join('') + `</bpmn:lane>`).join('') + `</bpmn:laneSet>`;
  }
  s += c.items.filter((n) => n.kind !== 'note').map(nodeXml).join('');
  s += flowsXml[cid].join('');
  s += c.items.filter((n) => n.kind === 'note').map(nodeXml).join('');
  s += assocXml[cid].join('');
  return s;
}

// ---------- DI ----------
const B = (b) => `<dc:Bounds x="${Math.round(b.x)}" y="${Math.round(b.y)}" width="${Math.round(b.w)}" height="${Math.round(b.h)}" />`;
function shapeDi(n) {
  const extra = n.kind === 'sub' ? ' isExpanded="false"' : '';
  let lab = '';
  if (['start', 'end', 'catch', 'boundary', 'xor', 'eb', 'store'].includes(n.kind) && n.name) {
    const w = 110, h = n.name.length > 18 ? 27 : 14;
    const pos = n.opts.lab || 'b';
    let x = n.cx - w / 2, y = n.b.y + n.b.h + 4;
    if (pos === 't') y = n.b.y - h - 4;
    if (pos === 'r') { x = n.b.x + n.b.w + 4; y = n.cy - h / 2; }
    if (pos === 'l') { x = n.b.x - w - 4; y = n.cy - h / 2; }
    if (pos === 'tl') { x = n.b.x - w + 8; y = n.b.y - h - 2; }
    if (pos === 'br') { x = n.b.x + n.b.w - 8; y = n.b.y + n.b.h + 2; }
    if (n.opts.labXY) { x = n.opts.labXY[0]; y = n.opts.labXY[1]; }
    lab = `<bpmndi:BPMNLabel>${B({ x, y, w, h })}</bpmndi:BPMNLabel>`;
  }
  return `<bpmndi:BPMNShape id="${n.id}_di" bpmnElement="${n.id}"${extra}>${B(n.b)}${lab}</bpmndi:BPMNShape>`;
}
const W = (pts) => pts.map(([x, y]) => `<di:waypoint x="${Math.round(x)}" y="${Math.round(y)}" />`).join('');
function edgeDi(e) {
  const lab = e.label ? `<bpmndi:BPMNLabel>${B(e.label)}</bpmndi:BPMNLabel>` : '';
  return `<bpmndi:BPMNEdge id="${e.id}_di" bpmnElement="${e.id}">${W(e.pts)}${lab}</bpmndi:BPMNEdge>`;
}

// =====================================================================
//                              LEVEL 0
// =====================================================================
plane('Plane_Overview', 'Collaboration_BugLife');
const pools = []; // {id, name, process, b, lanes:[{id,name,y,h}]}
const POOL_W = 1800;
function pool(id, name, process, y, h, lanes) {
  pools.push({ id, name, process, b: { x: 0, y, w: POOL_W, h }, lanes });
  if (process) {
    container(process, 'process');
    if (lanes) containers[process].lanes = lanes.map((l) => ({ ...l, refs: [] }));
  }
}
const inLane = (proc, laneId, ...ids) => containers[proc].lanes.find((l) => l.id === laneId).refs.push(...ids);

// --- Operator ------------------------------------------------------------
pool('P_Operator', 'Operator (David)', 'Process_Operator', 0, 240);
const OP = 'Process_Operator', P0 = 'Plane_Overview';
const rA = 60, rB = 180;
N(OP, P0, 'op_s4', 'start', 'Play sheet received', 110, rA, { def: 'message', lab: 't' });
N(OP, P0, 'op_t5', 'task', 'Play the 🎮 cases and the spot audits', 230, rA, { task: 'userTask' });
N(OP, P0, 'op_g1', 'xor', 'All pass?', 360, rA, { lab: 't' });
N(OP, P0, 'op_t6', 'task', 'Approve the batch', 490, rA, { task: 'userTask' });
N(OP, P0, 'op_e4', 'end', 'Batch validated', 610, rA);
N(OP, P0, 'op_s1', 'start', 'Testing session started', 110, rB);
N(OP, P0, 'op_t1', 'task', 'Play the builders', 230, rB, { task: 'userTask' });
N(OP, P0, 'op_gm', 'xor', '', 360, rB);
N(OP, P0, 'op_t2', 'task', 'Report a bug', 490, rB, { task: 'sendTask' });
N(OP, P0, 'op_e1', 'end', '', 610, rB);
N(OP, P0, 'op_s2', 'start', 'Question received', 1000, rA, { def: 'message', lab: 't' });
N(OP, P0, 'op_t3', 'task', 'Rule on the question', 1120, rA, { task: 'userTask' });
N(OP, P0, 'op_e2', 'end', 'Ruling sent', 1240, rA, { def: 'message' });
N(OP, P0, 'op_s3', 'start', 'Armed plans waiting', 1420, rA, { def: 'conditional', cond: 'open issues labelled auto-ok' });
N(OP, P0, 'op_t4', 'task', 'Start a fix round', 1540, rA, { task: 'userTask' });
N(OP, P0, 'op_e3', 'end', 'Round requested', 1660, rA, { def: 'message' });
S('op_s4', 'op_t5'); S('op_t5', 'op_g1'); S('op_g1', 'op_t6', { name: 'yes', def: true }); S('op_t6', 'op_e4');
S('op_g1', 'op_gm', { name: 'no', pts: [port(nodes.op_g1, 'b'), port(nodes.op_gm, 't')] });
S('op_s1', 'op_t1'); S('op_t1', 'op_gm'); S('op_gm', 'op_t2'); S('op_t2', 'op_e1');
S('op_s2', 'op_t3'); S('op_t3', 'op_e2');
S('op_s3', 'op_t4'); S('op_t4', 'op_e3');

// --- Prod-log scan --------------------------------------------------------
pool('P_Scan', 'Prod-log scan · log-triage agent', 'Process_Scan', 270, 150);
const SC = 'Process_Scan'; const sy = 345;
N(SC, P0, 'sc_s', 'start', 'Scan due (scheduled)', 190, sy, { def: 'timer', cycle: 'R/P1D' });
N(SC, P0, 'sc_t1', 'task', 'Pull the prod usage logs', 300, sy, { task: 'serviceTask' });
N(SC, P0, 'sc_t2', 'task', 'Re-run each failure on the current code', 440, sy);
N(SC, P0, 'sc_t3', 'task', 'Cluster what still fails', 580, sy);
N(SC, P0, 'sc_g', 'xor', 'Bug clusters?', 700, sy, { lab: 't' });
N(SC, P0, 'sc_t4', 'task', 'Report each bug cluster', 820, sy, { task: 'sendTask' });
N(SC, P0, 'sc_gm', 'xor', '', 905, sy);
N(SC, P0, 'sc_e', 'end', '', 965, sy);
N(SC, P0, 'ds_logs', 'store', 'Prod usage logs', 1140, sy, { store: 'Store_Logs' });
S('sc_s', 'sc_t1'); S('sc_t1', 'sc_t2'); S('sc_t2', 'sc_t3'); S('sc_t3', 'sc_g');
S('sc_g', 'sc_t4', { name: 'yes' });
S('sc_g', 'sc_gm', { name: 'no', def: true, pts: [port(nodes.sc_g, 'b'), [700, 405], [905, 405], port(nodes.sc_gm, 'b')] });
S('sc_t4', 'sc_gm'); S('sc_gm', 'sc_e');
D('sc_t1', 'ds_logs', 'read', [[300, 310], [300, 288], [1140, 288], [1140, 320]]);

// --- Bug lifecycle --------------------------------------------------------
const BY = 450;
pool('P_Bug', 'Bug lifecycle (one per bug)', 'Process_Bug', BY, 350, [
  { id: 'L_Triage', name: 'Triage session', y: BY, h: 240 },
  { id: 'L_Judge', name: 'Judge agent', y: BY + 240, h: 110 },
]);
const BG = 'Process_Bug';
const tTop = 505, tMain = 580, tBot = 650, jRow = 745;
N(BG, P0, 'b_s', 'start', 'Bug report received', 110, tMain, { def: 'message', lab: 'b' });
N(BG, P0, 'b_gm0', 'xor', '', 190, tMain);
N(BG, P0, 'b_sp', 'sub', 'Triage the report', 300, tMain);
N(BG, P0, 'b_g1', 'xor', 'Outcome?', 430, tMain, { labXY: [440, 545] });
N(BG, P0, 'b_e1', 'end', 'Commented on the existing issue', 530, tTop, { lab: 'r' });
N(BG, P0, 'b_e2', 'end', 'Rerouted as a feature (PR route)', 530, tBot, { lab: 'r' });
N(BG, P0, 'b_g2', 'xor', 'Every outcome line ruled?', 700, tMain, { lab: 't' });
N(BG, P0, 'b_ca', 'call', 'Rule on the question', 760, jRow, { called: 'Process_Judge' });
N(BG, P0, 'b_g3', 'xor', 'Judge ruled?', 890, jRow, { lab: 'b' });
N(BG, P0, 'b_t1', 'task', 'Ask the operator (needs-operator)', 1000, tTop, { task: 'sendTask' });
N(BG, P0, 'b_ic1', 'catch', 'Ruling received', 1150, tTop, { def: 'message' });
N(BG, P0, 'b_gm2', 'xor', '', 1230, tMain);
N(BG, P0, 'b_t2', 'task', 'Arm the plan (auto-ok)', 1340, tMain);
N(BG, P0, 'b_eg', 'eb', '', 1460, tMain);
N(BG, P0, 'b_ic2', 'catch', 'Fix landed in production', 1560, tMain, { def: 'message', lab: 't' });
N(BG, P0, 'b_e3', 'end', 'Bug closed', 1670, tMain);
N(BG, P0, 'b_ic3', 'catch', 'Item returned by the round', 1610, tTop, { def: 'message', lab: 'r' });
inLane(BG, 'L_Triage', 'b_s', 'b_gm0', 'b_sp', 'b_g1', 'b_e1', 'b_e2', 'b_g2', 'b_t1', 'b_ic1', 'b_gm2', 'b_t2', 'b_eg', 'b_ic2', 'b_e3', 'b_ic3');
inLane(BG, 'L_Judge', 'b_ca', 'b_g3');
S('b_s', 'b_gm0'); S('b_gm0', 'b_sp'); S('b_sp', 'b_g1');
S('b_g1', 'b_e1', { name: 'duplicate' });
S('b_g1', 'b_e2', { name: 'missing capability' });
S('b_g1', 'b_g2', { name: 'bug', def: true });
S('b_g2', 'b_gm2', { name: 'yes', pts: [port(nodes.b_g2, 'r'), port(nodes.b_gm2, 'l')] });
S('b_g2', 'b_ca', { name: 'no', def: true, pts: [port(nodes.b_g2, 'b'), [700, jRow], port(nodes.b_ca, 'l')] });
S('b_ca', 'b_g3');
S('b_g3', 'b_t1', { name: 'escalated', def: true, pts: [port(nodes.b_g3, 't'), [890, tTop], port(nodes.b_t1, 'l')] });
S('b_g3', 'b_gm2', { name: 'ruled', pts: [port(nodes.b_g3, 'r'), [1230, jRow], port(nodes.b_gm2, 'b')] });
S('b_t1', 'b_ic1');
S('b_ic1', 'b_gm2', { pts: [port(nodes.b_ic1, 'r'), [1230, tTop], port(nodes.b_gm2, 't')] });
S('b_gm2', 'b_t2'); S('b_t2', 'b_eg'); S('b_eg', 'b_ic2'); S('b_ic2', 'b_e3');
S('b_eg', 'b_ic3', { pts: [port(nodes.b_eg, 't'), [1460, tTop], port(nodes.b_ic3, 'l')] });
S('b_ic3', 'b_gm0', { name: 'plan failed — re-triage', pts: [port(nodes.b_ic3, 't'), [1610, BY + 10], [190, BY + 10], port(nodes.b_gm0, 't')] });

// --- Fix round --------------------------------------------------------------
const RY = 940;
pool('P_Round', 'Fix round (one per round, N bugs)', 'Process_Round', RY, 410, [
  { id: 'L_Orch', name: 'Orchestrator', y: RY, h: 170 },
  { id: 'L_Fixer', name: 'Fixer agents', y: RY + 170, h: 130 },
  { id: 'L_Review', name: 'Blind reviewer', y: RY + 300, h: 110 },
]);
const RD = 'Process_Round';
const oTop = 985, oMain = 1025, oBot = 1068, fRow = 1175, vRow = 1295;
N(RD, P0, 'r_s', 'start', 'Round requested', 110, oMain, { def: 'message', lab: 'b' });
N(RD, P0, 'r_t1', 'task', 'Collect the armed issues, open the round issue', 230, oMain);
N(RD, P0, 'r_gm', 'xor', '', 370, oMain);
N(RD, P0, 'r_mi', 'sub', 'Fix item', 480, fRow, { mi: true });
N(RD, P0, 'r_bnd', 'boundary', 'Plan fails against the code', 520, fRow - 40, { def: 'escalation', attached: 'r_mi', lab: 'r' });
N(RD, P0, 'r_t2', 'task', 'Return the item to triage', 640, oTop, { task: 'sendTask' });
N(RD, P0, 'r_e1', 'end', '', 750, oTop);
N(RD, P0, 'r_ca', 'call', 'Blind-review the 👁 cases', 640, vRow, { called: 'Process_Review' });
N(RD, P0, 'r_g1', 'xor', 'All pass?', 780, vRow, { lab: 'tl' });
N(RD, P0, 'r_sp', 'sub', 'Ship a wave', 910, oMain, { loop: true });
N(RD, P0, 'r_t3', 'task', 'Notify: fix landed', 1060, oMain, { task: 'sendTask' });
N(RD, P0, 'r_g2', 'xor', 'Any 🎮 case?', 1190, oMain, { lab: 'r' });
N(RD, P0, 'r_t4', 'task', 'Send the play sheet (awaiting-play)', 1380, oTop, { task: 'sendTask' });
N(RD, P0, 'r_e2', 'end', '', 1510, oTop);
N(RD, P0, 'r_t5', 'task', 'Close the round issue', 1380, oBot);
N(RD, P0, 'r_e3', 'end', 'Done without the operator', 1510, oBot, { lab: 'r' });
inLane(RD, 'L_Orch', 'r_s', 'r_t1', 'r_gm', 'r_t2', 'r_e1', 'r_sp', 'r_t3', 'r_g2', 'r_t4', 'r_e2', 'r_t5', 'r_e3');
inLane(RD, 'L_Fixer', 'r_mi', 'r_bnd');
inLane(RD, 'L_Review', 'r_ca', 'r_g1');
S('r_s', 'r_t1'); S('r_t1', 'r_gm');
S('r_gm', 'r_mi', { pts: [port(nodes.r_gm, 'b'), [370, fRow], port(nodes.r_mi, 'l')] });
S('r_bnd', 'r_t2', { pts: [port(nodes.r_bnd, 't'), [520, oTop], port(nodes.r_t2, 'l')] });
S('r_t2', 'r_e1');
S('r_mi', 'r_ca', { pts: [port(nodes.r_mi, 'r'), [640, fRow], port(nodes.r_ca, 't')] });
S('r_ca', 'r_g1');
S('r_g1', 'r_gm', { name: 'no', pts: [port(nodes.r_g1, 'b'), [780, RY + 400], [305, RY + 400], [305, RY + 12], [370, RY + 12], port(nodes.r_gm, 't')] });
S('r_g1', 'r_sp', { name: 'yes', def: true, pts: [port(nodes.r_g1, 'r'), [830, vRow], [830, oMain + 20], [850, oMain + 20]] });
S('r_sp', 'r_t3'); S('r_t3', 'r_g2');
S('r_g2', 'r_t4', { name: 'yes' });
S('r_g2', 'r_t5', { name: 'no', def: true });
S('r_t4', 'r_e2'); S('r_t5', 'r_e3');

// --- Production server (black box) -----------------------------------------
pool('P_Prod', 'Production server', null, 1380, 60);

// --- data store between Bug and Round --------------------------------------
N(BG, P0, 'ds_gh', 'store', 'GitHub Issues', 1300, 870, { store: 'Store_GitHub', lab: 'r' });
D('b_t2', 'ds_gh', 'write', [[1300, 615], [1300, 845]]);
D('r_t1', 'ds_gh', 'read', [[250, 990], [250, 870], [1275, 870]]);

// --- message flows ------------------------------------------------------------
M('op_t2', 'b_s', 'bug report', [[490, 215], [490, 255], [104, 255], [104, 563]]);
M('sc_t4', 'b_s', 'bug cluster', [[820, 380], [820, 435], [116, 435], [116, 563]]);
M('r_mi', 'b_s', 'found bug (other cause)', [[450, 1135], [450, 918], [76, 918], [76, 580], [92, 580]]);
M('b_t1', 'op_s2', 'question', [[1000, 470], [1000, 78]]);
M('op_e2', 'b_ic1', 'ruling', [[1240, 78], [1240, 440], [1150, 440], [1150, 487]]);
M('op_e3', 'r_s', 'start round', [[1660, 78], [1660, 255], [1740, 255], [1740, 930], [110, 930], [110, 1007]], [116, 948]);
M('r_t4', 'op_s4', 'play sheet + spot audits', [[1380, 950], [1380, 905], [1770, 905], [1770, 120], [110, 120], [110, 78]], [118, 100]);
M('r_t2', 'b_ic3', 'item returned', [[640, 950], [640, 825], [1610, 825], [1610, 523]]);
M('r_t3', 'b_ic2', 'fix landed', [[1060, 990], [1060, 812], [1560, 812], [1560, 598]], 'l');
M('r_sp', 'P_Prod', 'deploy (prod/… tag)', [[890, 1065], [890, 1380]], 'l');
M('P_Prod', 'r_sp', 'smoke-test result', [[930, 1380], [930, 1065]]);

// =====================================================================
//                         LEVEL 1 — Triage the report
// =====================================================================
container('b_sp', 'sub'); plane('Plane_Triage', 'b_sp');
{
  const C = 'b_sp', P = 'Plane_Triage', top = 90, main = 220, bot = 350;
  N(C, P, 't_s', 'start', 'Report received', 100, main);
  N(C, P, 't_t1', 'task', 'Search GitHub for a fitting issue', 220, main);
  N(C, P, 't_g1', 'xor', 'Fits an existing issue?', 360, main, { lab: 'b' });
  N(C, P, 't_t2', 'task', 'Comment on that issue (its parent)', 480, top);
  N(C, P, 't_e1', 'end', 'Duplicate', 620, top, { lab: 'b' });
  N(C, P, 't_t3', 'task', 'File the issue: type, priority, product, reported', 480, main);
  N(C, P, 't_t4', 'task', 'Diagnose the root cause (docs/17)', 640, main);
  N(C, P, 't_g2', 'xor', 'Bug or missing capability?', 790, main, { lab: 't' });
  N(C, P, 't_t5', 'task', 'Relabel as a feature', 920, bot);
  N(C, P, 't_e2', 'end', 'Missing capability', 1060, bot, { lab: 'b' });
  N(C, P, 't_t6', 'task', 'Write the fix plan and «What the student will see»', 920, main);
  N(C, P, 't_e3', 'end', 'Plan written', 1060, main, { lab: 'b' });
  N(C, P, 't_gh', 'store', 'GitHub Issues', 480, 470, { store: 'Store_GitHub', lab: 'b' });
  N(C, P, 't_git', 'store', 'Code repository (git)', 640, 360, { store: 'Store_Git', lab: 'r' });
  N(C, P, 't_note', 'note', 'Every line ends in a tag: [asked] [ruled] [2-D] [judged] or [proposed]. A [proposed] line waits for the operator.', 1060, 80, { size: [230, 54] });
  S('t_s', 't_t1'); S('t_t1', 't_g1');
  S('t_g1', 't_t2', { name: 'yes' }); S('t_t2', 't_e1');
  S('t_g1', 't_t3', { name: 'no', def: true });
  S('t_t3', 't_t4'); S('t_t4', 't_g2');
  S('t_g2', 't_t5', { name: 'missing capability' }); S('t_t5', 't_e2');
  S('t_g2', 't_t6', { name: 'bug', def: true }); S('t_t6', 't_e3');
  D('t_t1', 't_gh', 'read', [[220, 255], [220, 470], [455, 470]]);
  D('t_t3', 't_gh', 'write', [[480, 255], [480, 445]]);
  D('t_t5', 't_gh', 'write', [[920, 385], [920, 470], [505, 470]]);
  D('t_t4', 't_git', 'read', [[640, 255], [640, 335]]);
  A('t_note', 't_t6', [[1000, 107], [950, 185]]);
}

// =====================================================================
//                         LEVEL 1 — Fix item (one per issue, in parallel)
// =====================================================================
container('r_mi', 'sub'); plane('Plane_FixItem', 'r_mi');
{
  const C = 'r_mi', P = 'Plane_FixItem', top = 90, main = 230, bot = 370;
  N(C, P, 'f_s', 'start', 'Item received', 90, main);
  N(C, P, 'f_t1', 'task', 'Create a worktree from main', 200, main);
  N(C, P, 'f_t2', 'task', 'Re-measure the plan against the code', 350, main);
  N(C, P, 'f_g1', 'xor', 'Plan holds?', 490, main, { lab: 'tl' });
  N(C, P, 'f_e1', 'end', 'Plan fails against the code', 590, top, { def: 'escalation', lab: 'r' });
  N(C, P, 'f_e2', 'end', 'Already fixed', 590, bot, { lab: 'b' });
  N(C, P, 'f_gm', 'xor', '', 610, main);
  N(C, P, 'f_t3', 'task', 'Fix at the root', 730, main);
  N(C, P, 'f_t4', 'task', 'Lock the bug with a regression test', 880, main);
  N(C, P, 'f_t5', 'task', 'Run the gates (tsc, tests)', 1030, main);
  N(C, P, 'f_g2', 'xor', 'Green?', 1160, main, { lab: 't' });
  N(C, P, 'f_t6', 'task', 'Pre-play the cases in a browser', 1290, main);
  N(C, P, 'f_g3', 'xor', 'Play result?', 1430, main, { lab: 'tl' });
  N(C, P, 'f_t7', 'task', 'Report the found bug', 1550, bot, { task: 'sendTask' });
  N(C, P, 'f_gm4', 'xor', '', 1680, main);
  N(C, P, 'f_e3', 'end', 'Item green', 1780, main);
  N(C, P, 'f_git', 'store', 'Code repository (git)', 200, 400, { store: 'Store_Git', lab: 'r' });
  S('f_s', 'f_t1'); S('f_t1', 'f_t2'); S('f_t2', 'f_g1');
  S('f_g1', 'f_e1', { name: 'no' });
  S('f_g1', 'f_e2', { name: 'already fixed', lp: [500, 300] });
  S('f_g1', 'f_gm', { name: 'yes', def: true });
  S('f_gm', 'f_t3'); S('f_t3', 'f_t4'); S('f_t4', 'f_t5'); S('f_t5', 'f_g2');
  S('f_g2', 'f_gm', { name: 'no', pts: [port(nodes.f_g2, 'b'), [1160, 300], [610, 300], port(nodes.f_gm, 'b')] });
  S('f_g2', 'f_t6', { name: 'yes', def: true });
  S('f_t6', 'f_g3');
  S('f_g3', 'f_gm', { name: 'red case or same-cause bug', pts: [port(nodes.f_g3, 't'), [1430, 150], [610, 150], port(nodes.f_gm, 't')], lp: [1000, 132] });
  S('f_g3', 'f_t7', { name: 'bug with another cause', lp: [1440, 300] });
  S('f_g3', 'f_gm4', { name: 'all green', def: true, lp: [1500, 212] });
  S('f_t7', 'f_gm4'); S('f_gm4', 'f_e3');
  D('f_t1', 'f_git', 'read', [[200, 265], [200, 375]]);
}

// =====================================================================
//                         LEVEL 1 — Ship a wave
// =====================================================================
container('r_sp', 'sub'); plane('Plane_Ship', 'r_sp');
{
  const C = 'r_sp', P = 'Plane_Ship', main = 200, bot = 330;
  N(C, P, 'w_s', 'start', 'Wave ready', 90, main);
  N(C, P, 'w_t1', 'task', 'Merge the green items into the staging tip', 210, main);
  N(C, P, 'w_gm', 'xor', '', 350, main);
  N(C, P, 'w_t2', 'task', 'Run the full suite on the tip', 470, main);
  N(C, P, 'w_g', 'xor', 'Green?', 610, main, { lab: 't' });
  N(C, P, 'w_t3', 'task', 'Bisect and drop the breaking item', 470, bot);
  N(C, P, 'w_t4', 'task', 'Fast-forward main and push', 740, main);
  N(C, P, 'w_t5', 'task', 'Deploy with a prod tag', 890, main, { task: 'sendTask' });
  N(C, P, 'w_t6', 'task', 'Receive the smoke-test result', 1040, main, { task: 'receiveTask' });
  N(C, P, 'w_t7', 'task', 'Write the DEPLOY-LOG entry', 1190, main);
  N(C, P, 'w_e', 'end', 'Wave live', 1310, main);
  N(C, P, 'w_git', 'store', 'Code repository (git)', 740, 60, { store: 'Store_Git', lab: 'r' });
  S('w_s', 'w_t1'); S('w_t1', 'w_gm'); S('w_gm', 'w_t2'); S('w_t2', 'w_g');
  S('w_g', 'w_t3', { name: 'no', pts: [port(nodes.w_g, 'b'), [610, bot], port(nodes.w_t3, 'r')] });
  S('w_t3', 'w_gm', { pts: [port(nodes.w_t3, 'l'), [350, bot], port(nodes.w_gm, 'b')] });
  S('w_g', 'w_t4', { name: 'yes', def: true });
  S('w_t4', 'w_t5'); S('w_t5', 'w_t6'); S('w_t6', 'w_t7'); S('w_t7', 'w_e');
  D('w_t1', 'w_git', 'write', [[210, 165], [210, 60], [715, 60]]);
  D('w_t4', 'w_git', 'write', [[740, 165], [740, 85]]);
}

// =====================================================================
//                 Called processes — Judge, Blind review
// =====================================================================
container('Process_Judge', 'process'); plane('Plane_Judge', 'Process_Judge');
{
  const C = 'Process_Judge', P = 'Plane_Judge', top = 90, main = 220;
  N(C, P, 'j_s', 'start', 'Question received (no recommendation)', 100, main);
  N(C, P, 'j_t1', 'task', "Search the operator's dated rulings", 230, main);
  N(C, P, 'j_g1', 'xor', 'Reserved for the operator?', 380, main, { lab: 'b' });
  N(C, P, 'j_g2', 'xor', 'A dated ruling covers it?', 510, main, { lab: 'b' });
  N(C, P, 'j_t2', 'task', 'Return a verdict quoting the ruling', 650, main);
  N(C, P, 'j_e1', 'end', 'Ruled [judged]', 790, main, { lab: 'b' });
  N(C, P, 'j_gm', 'xor', '', 510, top);
  N(C, P, 'j_t3', 'task', 'Return an escalation with the nearest quotes', 650, top);
  N(C, P, 'j_e2', 'end', 'Escalated', 790, top, { lab: 'b' });
  N(C, P, 'j_ds', 'store', 'Precedent index (rulings, ADRs)', 230, 360, { store: 'Store_Rulings', lab: 'r' });
  N(C, P, 'j_note', 'note', 'Reserved: reverses a shipped promise · kept by the operator · a feature\'s scope or priority · a demoted class', 230, 110, { size: [230, 54] });
  S('j_s', 'j_t1'); S('j_t1', 'j_g1');
  const jYes = S('j_g1', 'j_gm', { name: 'yes', pts: [port(nodes.j_g1, 't'), [380, top], port(nodes.j_gm, 'l')], lp: [386, 160] });
  S('j_g1', 'j_g2', { name: 'no', def: true });
  S('j_g2', 'j_t2', { name: 'yes' });
  S('j_g2', 'j_gm', { name: 'no', def: true, pts: [port(nodes.j_g2, 't'), port(nodes.j_gm, 'b')] });
  S('j_t2', 'j_e1'); S('j_gm', 'j_t3'); S('j_t3', 'j_e2');
  D('j_t1', 'j_ds', 'read', [[230, 255], [230, 335]]);
  A('j_note', jYes, [[345, 110], [380, 110]]);
}
container('Process_Review', 'process'); plane('Plane_Review', 'Process_Review');
{
  const C = 'Process_Review', P = 'Plane_Review', main = 200;
  N(C, P, 'v_s', 'start', 'Review file received', 100, main);
  N(C, P, 'v_t1', 'task', 'Read only the lines, the look-for and the screenshot', 230, main);
  N(C, P, 'v_t2', 'task', 'Decide pass or fail for each case', 380, main);
  N(C, P, 'v_t3', 'task', 'Write the verdicts', 530, main);
  N(C, P, 'v_e', 'end', 'Verdicts returned', 660, main, { lab: 'b' });
  N(C, P, 'v_note', 'note', 'Never sees the fix, the plan or the expected outcome. About 1 in 10 closed cases goes to the operator as a spot audit.', 330, 70, { size: [300, 54] });
  S('v_s', 'v_t1'); S('v_t1', 'v_t2'); S('v_t2', 'v_t3'); S('v_t3', 'v_e');
  A('v_note', 'v_t2', [[380, 97], [380, 165]]);
}

// ---------- assemble ----------
const xml = [];
xml.push(`<?xml version="1.0" encoding="UTF-8"?>`);
xml.push(`<bpmn:definitions xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Defs_GeoBugLife" targetNamespace="https://github.com/dcodish/geo_builder/issues/2887" exporter="geo_builder gen.mjs" exporterVersion="2">`);
xml.push(`<bpmn:escalation id="Escalation_PlanFails" name="Plan fails against the code" escalationCode="plan-fails" />`);
xml.push(`<bpmn:dataStore id="Store_GitHub" name="GitHub Issues" /><bpmn:dataStore id="Store_Git" name="Code repository (git)" /><bpmn:dataStore id="Store_Logs" name="Prod usage logs" /><bpmn:dataStore id="Store_Rulings" name="Precedent index" />`);
xml.push(`<bpmn:category id="Category_System"><bpmn:categoryValue id="CV_System" value="Geo Builder dev system" /></bpmn:category>`);
xml.push(`<bpmn:collaboration id="Collaboration_BugLife">`);
for (const p of pools) xml.push(`<bpmn:participant id="${p.id}" name="${esc(p.name)}"${p.process ? ` processRef="${p.process}"` : ''} />`);
xml.push(...collabMsgs);
xml.push(`<bpmn:group id="Group_System" categoryValueRef="CV_System" />`);
xml.push(`</bpmn:collaboration>`);
for (const pid of ['Process_Operator', 'Process_Scan', 'Process_Bug', 'Process_Round', 'Process_Judge', 'Process_Review']) {
  const PN = { Process_Operator: 'Operator', Process_Scan: 'Prod-log scan', Process_Bug: 'Bug lifecycle', Process_Round: 'Fix round', Process_Judge: 'Judge: rule on a question', Process_Review: 'Blind review' };
  xml.push(`<bpmn:process id="${pid}" name="${PN[pid]}" isExecutable="false">${containerBody(pid)}</bpmn:process>`);
}
// diagrams
const diagram = (id, name, planeId, inner) => `<bpmndi:BPMNDiagram id="${id}" name="${esc(name)}"><bpmndi:BPMNPlane id="${planeId}" bpmnElement="${planes[planeId].element}">${inner}</bpmndi:BPMNPlane></bpmndi:BPMNDiagram>`;
{
  let inner = '';
  for (const p of pools) {
    inner += `<bpmndi:BPMNShape id="${p.id}_di" bpmnElement="${p.id}" isHorizontal="true">${B(p.b)}</bpmndi:BPMNShape>`;
    for (const l of p.lanes || []) inner += `<bpmndi:BPMNShape id="${l.id}_di" bpmnElement="${l.id}" isHorizontal="true">${B({ x: 30, y: l.y, w: POOL_W - 30, h: l.h })}</bpmndi:BPMNShape>`;
  }
  inner += Object.values(nodes).filter((n) => n.pl === 'Plane_Overview').map(shapeDi).join('');
  inner += planes.Plane_Overview.edges.map(edgeDi).join('');
  inner += msgEdges.map(edgeDi).join('');
  inner += `<bpmndi:BPMNShape id="Group_System_di" bpmnElement="Group_System">${B({ x: -14, y: 258, w: POOL_W + 28, h: 1104 })}<bpmndi:BPMNLabel>${B({ x: 1440, y: 257, w: 190, h: 14 })}</bpmndi:BPMNLabel></bpmndi:BPMNShape>`;
  xml.push(diagram('Diagram_Overview', 'Overview', 'Plane_Overview', inner));
}
const sub = [['Diagram_Triage', 'Triage the report', 'Plane_Triage'], ['Diagram_FixItem', 'Fix item', 'Plane_FixItem'], ['Diagram_Ship', 'Ship a wave', 'Plane_Ship'], ['Diagram_Judge', 'Judge: rule on a question', 'Plane_Judge'], ['Diagram_Review', 'Blind review', 'Plane_Review']];
for (const [id, name, pl] of sub) {
  const inner = Object.values(nodes).filter((n) => n.pl === pl).map(shapeDi).join('') + planes[pl].edges.map(edgeDi).join('');
  xml.push(diagram(id, name, pl, inner));
}
xml.push(`</bpmn:definitions>`);
const out = xml.join('\n');
writeFileSync(new URL('./geo-bug-life.bpmn', import.meta.url), out);
console.log('written', out.length, 'chars;', Object.keys(nodes).length, 'nodes;', mfCount, 'message flows');
