/* 校準：用同一把難度量尺量數獨。
   執行：node test/hexcolor/calibrate_sudoku.cjs
   目的：知道「世界級難題」在這把尺上大約是幾分，六角著色的成績才有比較基準。
   數獨題目：一般隨機產生的（拿掉提示到極小）＋公認最難的幾題（憑記憶輸入，先驗證它們真的是唯一解）。 */
'use strict';
const { sudokuEngine, rate, shuffle, nodesStats, Core } = require('./lab.cjs');
const E = sudokuEngine();
const rng = Core.makeRng(2026);

function parse(str) { return Int8Array.from(str.split('').map(ch => (ch === '.' || ch === '0') ? -1 : Number(ch) - 1)); }

const famous = {
    'AI Escargot (Inkala 2006)': '100007090030020008009600500005300900010080002600004000300000010040000007007000300',
    'Inkala 2012 「世界最難」': '800000000003600000070090200050007000000045700000100030001000068008500010090000400',
    'Golden Nugget': '000000039000001005003050800008090006070002000100400000009080050020000600400700000',
};
for (const name of Object.keys(famous)) {
    const g = parse(famous[name]);
    const u = E.count(g, null, 2, 2000000);
    const t0 = Date.now();
    const r = rate(E, g, null, { maxDepth: 3, ms: 120000 });
    /* 隨機順序跑 31 次取中位數：跟六角著色的「回溯節點」用同一種量法才能比 */
    const ns = nodesStats(E, g, null, rng, 31, 5000000);
    console.log(`${name}: 提示${g.filter(x => x >= 0).length} 解數=${u.found}${u.aborted ? '(未窮舉)' : ''} 固定順序節點=${u.nodes} 隨機順序節點 中位=${ns.median} 最少=${ns.min} 最多=${ns.max} | 量尺 depth=${r.depth} uses=${JSON.stringify(r.uses)} 規則直推=${r.l0} 解完=${r.solved}${r.timedOut ? ' 逾時' : ''} (${Date.now() - t0}ms)`);
}

/* 隨機產生極小提示的數獨，看一般題的分布 */
function randomSolved() {
    const s = E.newState(), q = [];
    function dfs(st) {
        if (st.assigned === 81) return st;
        let best = -1, bs = 99;
        for (let i = 0; i < 81; i++) if (st.col[i] === -1) { const p = E.POP[st.dom[i]]; if (p < bs) { bs = p; best = i; } }
        const cs = [];
        for (let c = 0; c < 9; c++) if ((st.dom[best] >> c) & 1) cs.push(c);
        shuffle(cs, rng);
        for (const c of cs) {
            const t = E.clone(st), qq = [];
            if (E.assign(t, best, c, qq) && E.propagate(t, qq)) { const r = dfs(t); if (r) return r; }
        }
        return null;
    }
    return dfs(s).col;
}
const hist = {};
let cluesSum = 0, nodeSum = 0, T = 60;
for (let t = 0; t < T; t++) {
    const sol = randomSolved();
    const g = Int8Array.from(sol);
    for (const i of shuffle(Array.from({ length: 81 }, (_, i) => i), rng)) {
        const keep = g[i]; g[i] = -1;
        const r = E.count(g, null, 2, 200000);
        if (r.found !== 1 || r.aborted) g[i] = keep;
    }
    const r = rate(E, g, null, { maxDepth: 3, ms: 30000 });
    const key = r.solved ? 'depth' + r.depth : (r.timedOut ? 'timeout' : 'stuck');
    hist[key] = (hist[key] || 0) + 1;
    cluesSum += g.filter(x => x >= 0).length;
    nodeSum += E.count(g, null, 2, 200000).nodes;
}
console.log(`隨機極小數獨 ${T} 題：平均提示 ${(cluesSum / T).toFixed(1)}，平均搜尋節點 ${(nodeSum / T).toFixed(1)}，難度分布 ${JSON.stringify(hist)}`);
