/* 實驗五：把前面看到的現象用「大樣本＋配對比較」再驗一次，避免被小樣本騙。
   模式 sweep  ：稀有色比例掃描（N=61、90），找倒 U 的頂點
   模式 paired ：同一個盤面比較預填策略（同形狀、同解，只換預填挑法），用配對比值
   輸出一行一筆 JSON，由 exp_verify_sum.cjs 彙總。
   執行：node test/hexcolor/exp_verify.cjs sweep|paired <種子> <秒數> */
'use strict';
const L = require('./lab.cjs');
const { Core, makeEngine, rate, minimizeClues, clueCount, nodesStats, randomColoring, tally } = L;
const MODE = process.argv[2] || 'sweep', SEED = Number(process.argv[3] || 1), SECONDS = Number(process.argv[4] || 120);
const rng = Core.makeRng(SEED * 31337 + 1);
const LIMIT = 40000, NODE_CAP = 300000;
const t0 = Date.now();
const alive = () => (Date.now() - t0) / 1000 < SECONDS;

function vec(N, k, scarce) {
    const rest = N - scarce.reduce((a, b) => a + b, 0), main = k - scarce.length, out = [];
    for (let i = 0; i < main; i++) out.push(Math.floor(rest / main) + (i < rest % main ? 1 : 0));
    return out.concat(scarce);
}
function dist(a, b) { const dq = a[0] - b[0], dr = a[1] - b[1]; return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2; }

if (MODE === 'sweep') {
    while (alive()) {
        const N = rng() < 0.5 ? 61 : 90;
        const k = rng() < 0.7 ? 4 : 5;
        /* 破格率 rho：最多的三色之外的格子比例 */
        const rho = [0, 0.03, 0.06, 0.09, 0.12, 0.15, 0.18, 0.21, 0.25, 0.3, 0.35, 0.4][Math.floor(rng() * 12)];
        const total = Math.round(rho * N);
        const scarce = k === 4 ? [total] : [Math.floor(total / 2), total - Math.floor(total / 2)];
        const cells = Core.makeShape(N, 3, rng).cells;
        const G = Core.buildGraph(cells), E = makeEngine(G, k);
        const counts = vec(N, k, scarce);
        /* 超過 N/3 的主色一定無解，也算一筆「無解」 */
        const none = new Int8Array(N).fill(-1);
        const found = E.count(none, counts, 1, 60000, rng);
        if (!found.first) { console.log(JSON.stringify({ N, k, rho, ok: 0 })); continue; }
        const m = minimizeClues(E, found.first, counts, rng, LIMIT);
        const ns = nodesStats(E, m.givens, counts, rng, 5, NODE_CAP);
        const r = rate(E, m.givens, counts, { maxDepth: 2, ms: 4000 });
        console.log(JSON.stringify({ N, k, rho, ok: 1, clues: clueCount(m.givens), nodes: ns.median, d: r.solved ? r.depth : 3, l0: r.l0 }));
    }
} else {
    /* 配對：預填策略 */
    function ordered(E, cells, sol, counts, pick) {
        const g = Int8Array.from(sol), tried = new Uint8Array(E.n);
        for (let s = 0; s < E.n; s++) {
            const i = pick(g, tried);
            if (i < 0) break;
            tried[i] = 1;
            const keep = g[i]; g[i] = -1;
            const r = E.count(g, counts, 2, LIMIT);
            if (r.found !== 1 || r.aborted) g[i] = keep;
        }
        return g;
    }
    const nearest = (cells, g, i) => { let b = 1e9; for (let j = 0; j < g.length; j++) if (j !== i && g[j] >= 0) { const d = dist(cells[i], cells[j]); if (d < b) b = d; } return b; };
    const S = {
        random: (E, c, s, n) => minimizeClues(E, s, n, rng, LIMIT).givens,
        spread: (E, c, s, n) => ordered(E, c, s, n, (g, t) => { let b = -1, v = 1e9; for (let i = 0; i < E.n; i++) if (g[i] >= 0 && !t[i]) { const d = nearest(c, g, i) + rng() * 0.3; if (d < v) { v = d; b = i; } } return b; }),
        cluster: (E, c, s, n) => { const o = c[Math.floor(rng() * c.length)]; return ordered(E, c, s, n, (g, t) => { let b = -1, v = -1; for (let i = 0; i < E.n; i++) if (g[i] >= 0 && !t[i]) { const d = dist(c[i], o) + rng() * 0.3; if (d > v) { v = d; b = i; } } return b; }); },
        hideRare: (E, c, s, n) => { const rare = n.indexOf(Math.min.apply(null, n)); return ordered(E, c, s, n, (g, t) => { const p = []; for (let i = 0; i < E.n; i++) if (g[i] >= 0 && !t[i] && s[i] === rare) p.push(i); if (!p.length) for (let i = 0; i < E.n; i++) if (g[i] >= 0 && !t[i]) p.push(i); return p.length ? p[Math.floor(rng() * p.length)] : -1; }); },
        showRare: (E, c, s, n) => { const rare = n.indexOf(Math.min.apply(null, n)); return ordered(E, c, s, n, (g, t) => { const p = []; for (let i = 0; i < E.n; i++) if (g[i] >= 0 && !t[i] && s[i] !== rare) p.push(i); if (!p.length) for (let i = 0; i < E.n; i++) if (g[i] >= 0 && !t[i]) p.push(i); return p.length ? p[Math.floor(rng() * p.length)] : -1; }); },
    };
    const CASES = [
        { name: '61格4色稀有8', N: 61, k: 4, scarce: [8] },
        { name: '61格4色平均', N: 61, k: 4, scarce: [15] },
        { name: '90格4色稀有12', N: 90, k: 4, scarce: [12] },
        { name: '61格5色稀有4,4', N: 61, k: 5, scarce: [4, 4] },
    ];
    while (alive()) {
        const cs = CASES[Math.floor(rng() * CASES.length)];
        const cells = Core.makeShape(cs.N, 3, rng).cells;
        const G = Core.buildGraph(cells), E = makeEngine(G, cs.k);
        const counts = vec(cs.N, cs.k, cs.scarce);
        const found = E.count(new Int8Array(cs.N).fill(-1), counts, 1, 60000, rng);
        if (!found.first) continue;
        const row = { c: cs.name };
        for (const key of Object.keys(S)) {
            const g = S[key](E, cells, found.first, counts);
            const ns = nodesStats(E, g, counts, rng, 5, NODE_CAP);
            const r = rate(E, g, counts, { maxDepth: 1, ms: 1500 });
            row[key] = { clues: clueCount(g), nodes: ns.median, l0: r.l0 };
        }
        /* 多給預填：隨機極小解再多 1／3／5 格 */
        const base = S.random(E, cells, found.first, counts);
        row.base = nodesStats(E, base, counts, rng, 5, NODE_CAP).median;
        for (const add of [1, 3, 5]) {
            const g = Int8Array.from(base), emp = [];
            for (let i = 0; i < E.n; i++) if (g[i] < 0) emp.push(i);
            L.shuffle(emp, rng);
            emp.slice(0, add).forEach(i => { g[i] = found.first[i]; });
            row['plus' + add] = nodesStats(E, g, counts, rng, 5, NODE_CAP).median;
        }
        console.log(JSON.stringify(row));
    }
}
