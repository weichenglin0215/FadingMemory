const { game } = require('./load.js');
const G = game('reaction_heartbeat.js'); const T = G.test;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; if (bad < 20) console.log('FAIL', m); } };
// 間隔：線性 1.0 → 0.3
ok(Math.abs(T.baseInterval(1) - 1.0) < 1e-9, 'start 1.0'); ok(Math.abs(T.baseInterval(60) - 0.3) < 1e-9 && Math.abs(T.baseInterval(200) - 0.3) < 1e-9, 'end 0.3');
ok(Math.abs(T.baseInterval(30.5) - 0.65) < 1e-9, 'mid');
let prev = 2; for (let b = 1; b <= 70; b++) { const v = T.baseInterval(b); ok(v <= prev + 1e-12, 'monotone'); prev = v; }
ok(Math.abs(T.spacingFor(1, 2) - 1.1) < 1e-9 && Math.abs(T.spacingFor(60, 3) - 0.5) < 1e-9 && Math.abs(T.spacingFor(5, 1) - T.baseInterval(5)) < 1e-12, 'extra time');
// 組合解鎖
ok(T.pool(1).length === 3 && T.pool(9).length === 3 && T.pool(10).length === 5 && T.pool(24).length === 5 && T.pool(25).length === 6, 'pool unlock');
// 產生一大串拍子，統計
const gen = new T.Generator(); const seq = [];
const N = 6000;
for (let i = 0; i < N; i++) seq.push(gen.next(Math.min(i, 200)));
let breaks = 0, nones = 0, runs = [], run = 0, valid = true, doubles = 0, triples = 0, early = { none: 0, br: 0 };
seq.forEach((b, i) => {
  if (b.combo !== 'none' && !T.COMBOS[b.combo]) valid = false;
  if (b.kind === 'break') { breaks++; if (b.combo === 'none') nones++; runs.push(run); run = 0; if (i < 100 && b.combo === 'none') early.none++; if (i < 100) early.br++; }
  else run++;
  if (b.combo === 'CL' || b.combo === 'CR') doubles++; if (b.combo === 'LCR') triples++;
});
ok(valid, 'valid combos');
// 打破的那一拍不等於預期
let eq = 0; seq.forEach(b => { if (b.kind === 'break' && b.combo === b.seg.expected) eq++; }); ok(eq === 0, 'break != expected');
// 規律在打破前至少 3 拍；循環相鄰不同
let short = 0; seq.forEach(b => { if (b.kind === 'break' && b.seg.body.length < 3) short++; }); ok(short === 0, 'body>=3');
let adj = 0; seq.forEach(b => { if (b.kind === 'break') { const c = b.seg.cycle; for (let k = 0; k < c.length; k++) if (c.length > 1 && c[k] === c[(k + 1) % c.length]) adj++; } }); ok(adj === 0, 'cycle adjacent differ');
console.log('beats', N, 'breaks', breaks, 'none breaks', nones, ('(' + (nones / breaks * 100).toFixed(0) + '%)'), 'avg run before break', (runs.reduce((a, b) => a + b, 0) / runs.length).toFixed(2), 'doubles', doubles, 'triples', triples);
// 隨進度的 avg run
function avgRun(from, to) { const g2 = new T.Generator(); let r = 0, rs = []; for (let i = 0; i < 40000; i++) { const b = g2.next(from + (i % 1) * 0); if (b.kind === 'break') { rs.push(r); r = 0; } else r++; } return rs.reduce((a, b) => a + b, 0) / rs.length; }
console.log('avg body length at beat 1:', avgRun(1).toFixed(2), ' beat 30:', avgRun(30).toFixed(2), ' beat 60:', avgRun(60).toFixed(2), ' (target 3→7)');
// 前 12 拍長相
const g3 = new T.Generator(); console.log(Array.from({ length: 24 }, (_, i) => g3.next(i)).map(b => (b.kind === 'break' ? '*' : '') + b.combo).join(' '));
const g4 = new T.Generator(); console.log(Array.from({ length: 40 }, (_, i) => g4.next(40 + i)).map(b => (b.kind === 'break' ? '*' : '') + b.combo).join(' '));
console.log(bad ? 'FAILED ' + bad : 'ALL PASS');
