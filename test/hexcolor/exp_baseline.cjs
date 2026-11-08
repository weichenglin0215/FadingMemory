/* 實驗一：目前的做法在難度量尺上是幾分？
   每組：長形狀 → 隨機解 → 拿掉預填到「剛好唯一解」→ 用量尺評分。
   比較：色數 k、形狀（緊密 1/2/3、隨機挖洞）、數量傾斜（權重）。
   執行：node test/hexcolor/exp_baseline.cjs */
'use strict';
const L = require('./lab.cjs');
const { Core, makeEngine, rate, randomColoring, minimizeClues, clueCount, nodesStats, tally, hexPatch, largestComponent } = L;
const rng = Core.makeRng(11);

function perc(R, p, maxN) {
    for (;;) {
        const cells = hexPatch(R).filter(() => rng() > p);
        let comp = largestComponent(cells);
        if (comp.length >= 30 && comp.length <= maxN) { comp.sort((a, b) => a[1] - b[1] || a[0] - b[0]); return comp; }
    }
}
const shapes = {
    '緊密3 N37': () => Core.makeShape(37, 3, rng).cells,
    '緊密3 N61': () => Core.makeShape(61, 3, rng).cells,
    '緊密3 N90': () => Core.makeShape(90, 3, rng).cells,
    '緊密2 N61': () => Core.makeShape(61, 2, rng).cells,
    '緊密1 N61': () => Core.makeShape(61, 1, rng).cells,
    '挖洞30% ≤90': () => perc(6, 0.30, 90),
    '挖洞40% ≤90': () => perc(6, 0.40, 90),
};
const weights = {
    3: { '平均': [1, 1, 1] },
    4: { '平均': [1, 1, 1, 1], '微傾': [3, 2, 1.5, 1], '稀有色': [1, 1, 1, 0.12] },
    5: { '平均': [1, 1, 1, 1, 1], '稀有兩色': [1, 1, 1, 0.2, 0.2] },
};
const T = Number(process.argv[2] || 8), LIMIT = 40000;
for (const sname of Object.keys(shapes)) {
    for (const k of [3, 4, 5]) {
        for (const wname of Object.keys(weights[k])) {
            const rows = [];
            const t0 = Date.now();
            for (let t = 0; t < T; t++) {
                const cells = shapes[sname]();
                const G = Core.buildGraph(cells), E = makeEngine(G, k);
                const sol = randomColoring(G, k, weights[k][wname], rng);
                if (!sol) continue;
                const counts = tally(sol, k);
                const m = minimizeClues(E, sol, counts, rng, LIMIT);
                const r = rate(E, m.givens, counts, { maxDepth: 3, ms: 8000 });
                const ns = nodesStats(E, m.givens, counts, rng, 5, 200000);
                rows.push({ n: G.n, clues: clueCount(m.givens), depth: r.solved ? r.depth : 9, d1: r.uses ? r.uses[1] : 0, d2: r.uses ? r.uses[2] : 0, d3: r.uses ? r.uses[3] : 0, l0: r.l0, nodes: ns.median, aborted: m.aborted, timed: r.timedOut });
            }
            const avg = f => rows.reduce((a, x) => a + f(x), 0) / rows.length;
            const hist = {};
            rows.forEach(x => { const key = x.depth === 9 ? '>3或逾時' : 'd' + x.depth; hist[key] = (hist[key] || 0) + 1; });
            console.log(`${sname} k=${k} ${wname}: N=${avg(x => x.n).toFixed(0)} 預填=${avg(x => x.clues).toFixed(1)}(${(100 * avg(x => x.clues / x.n)).toFixed(0)}%) 規則直推=${avg(x => x.l0).toFixed(1)} 深度${JSON.stringify(hist)} D1次=${avg(x => x.d1).toFixed(1)} D2次=${avg(x => x.d2).toFixed(1)} 節點中位=${avg(x => x.nodes).toFixed(1)} 上限觸發=${avg(x => x.aborted).toFixed(1)} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
        }
    }
}
