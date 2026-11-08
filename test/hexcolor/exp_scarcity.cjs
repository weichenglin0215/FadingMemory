/* 實驗三：「減少某個顏色的數量」到底怎麼影響難度？要找出規則。
   控制變因：形狀固定類型（緊密 3 實心、挖洞），只改稀有色的格數 s，其他色平分。
   量：唯一解需要的預填比例、規則直推、假設深度、回溯節點。
   另外檢驗假說「超額」：
     盤面的三個子格（(q-r) mod 3）大小 x≥y≥z。若最多的三色 a≥b≥c 都不超過 x,y,z，
     解可以是「三子格圖樣＋把部分格子換成稀有色」——稀有色很自由（這種解很鬆）；
     若 a>x（超額），就必須破壞規律，解的結構會完全不同。
   執行：node test/hexcolor/exp_scarcity.cjs [每組樣本數] */
'use strict';
const L = require('./lab.cjs');
const { Core, makeEngine, rate, minimizeClues, clueCount, nodesStats, hexPatch, shuffle, largestComponent } = L;
const T = Number(process.argv[2] || 10), LIMIT = 40000;
const rng = Core.makeRng(77);
function subSizes(cells) { const s = [0, 0, 0]; cells.forEach(c => { s[(((c[0] - c[1]) % 3) + 3) % 3]++; }); return s.sort((a, b) => b - a); }
function sorted(a) { return a.slice().sort((x, y) => y - x); }

function holes(R, p, lo, hi) {
    for (;;) {
        const c = largestComponent(hexPatch(R).filter(() => rng() > p));
        if (c.length >= lo && c.length <= hi) { c.sort((a, b) => a[1] - b[1] || a[0] - b[0]); return c; }
    }
}

function vec(N, k, scarce) {           /* k 色：後 scarce.length 色固定，其他平分 */
    const rest = N - scarce.reduce((a, b) => a + b, 0), main = k - scarce.length;
    const out = [];
    for (let i = 0; i < main; i++) out.push(Math.floor(rest / main) + (i < rest % main ? 1 : 0));
    return out.concat(scarce);
}

function runCase(label, mkCells, k, scarceList) {
    console.log(`\n── ${label} k=${k} ──`);
    for (const sc of scarceList) {
        const rows = [];
        let infeasible = 0, excessSum = 0;
        const t0 = Date.now();
        for (let t = 0; t < T; t++) {
            const cells = mkCells();
            const G = Core.buildGraph(cells), E = makeEngine(G, k);
            const counts = vec(G.n, k, sc);
            const none = new Int8Array(G.n).fill(-1);
            const found = E.count(none, counts, 1, 40000, rng);
            if (!found.first) { infeasible++; continue; }
            const sol = found.first;
            const sub = subSizes(cells), top = sorted(counts);
            excessSum += Math.max(0, top[0] - sub[0]) + Math.max(0, top[1] - sub[1]) + Math.max(0, top[2] - sub[2]);
            const m = minimizeClues(E, sol, counts, rng, LIMIT);
            const r = rate(E, m.givens, counts, { maxDepth: 3, ms: 5000 });
            const ns = nodesStats(E, m.givens, counts, rng, 5, 200000);
            rows.push({ pct: clueCount(m.givens) / G.n, clues: clueCount(m.givens), d: r.solved ? r.depth : 9, d2: r.uses[2], d3: r.uses[3], l0: r.l0, nodes: ns.median, ab: m.aborted });
        }
        if (!rows.length) { console.log(`  稀有=${sc}: 全部找不到解（${infeasible}/${T}）`); continue; }
        const avg = f => rows.reduce((a, x) => a + f(x), 0) / rows.length;
        const med = f => { const a = rows.map(f).sort((x, y) => x - y); return a[Math.floor(a.length / 2)]; };
        const hist = {};
        rows.forEach(x => { const key = x.d === 9 ? '>3' : 'd' + x.d; hist[key] = (hist[key] || 0) + 1; });
        console.log(`  稀有=${String(sc).padEnd(6)} 找不到解=${infeasible}/${T} 超額=${(excessSum / rows.length).toFixed(1)} 預填=${(100 * avg(x => x.pct)).toFixed(0)}% 規則直推=${avg(x => x.l0).toFixed(1)} 深度${JSON.stringify(hist)} D2次=${avg(x => x.d2).toFixed(1)} D3次=${avg(x => x.d3).toFixed(1)} 節點中位=${med(x => x.nodes)} 平均=${avg(x => x.nodes).toFixed(0)} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
    }
}

const N61 = () => Core.makeShape(61, 3, rng).cells;
const H = () => holes(6, 0.30, 60, 90);
runCase('實心 61 格', N61, 4, [[0], [1], [2], [3], [5], [8], [10], [12], [15]]);
runCase('挖洞 60–90 格', H, 4, [[1], [3], [5], [8], [12], [18]]);
runCase('實心 61 格（兩個稀有色）', N61, 5, [[1, 1], [2, 2], [3, 3], [5, 5], [8, 8], [12, 12]]);
