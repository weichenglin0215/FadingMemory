/* 搜尋極難盤面（≤90 格、唯一解）：在「形狀」上做局部搜尋
   每輪：改動幾格形狀 → 窮舉所有 3 色著色 → 找解很少的數量組合 → 補最少預填到唯一解 → 打分。
   分數同時看：
     高手層（已看穿剛體）要假設幾層 blobRate ← 最重要：防止「知道秘訣就秒破」
     列表湊數節點 arith、回溯節點 bt（人亂試的工作量）、規則直推要是 0、預填越少越好
   執行：node test/hexcolor/search_hard.cjs <種子> <秒數> <輸出檔> */
'use strict';
const fs = require('fs');
const L = require('./lab.cjs');
const R = require('./rigid.cjs');
const { Core, makeEngine, rate, nodesStats, hexPatch, largestComponent, minimizeClues, clueCount } = L;
const SEED = Number(process.argv[2] || 1), SECONDS = Number(process.argv[3] || 300);
const OUT = process.argv[4] || (__dirname + '/hard_' + SEED + '.json');
const rng = Core.makeRng(SEED * 7919 + 13);
const MAXN = 90;
const DIRS = Core.DIRS;
const key = c => (c[0] + 64) * 256 + (c[1] + 64);
function decode(k) { return [Math.floor(k / 10000), Math.floor(k / 100) % 100, k % 100]; }

function isConnected(cells) {
    if (!cells.length) return false;
    const set = new Set(cells.map(key)), seen = new Set([key(cells[0])]), st = [cells[0]];
    while (st.length) {
        const c = st.pop();
        for (const d of DIRS) { const n = [c[0] + d[0], c[1] + d[1]], k = key(n); if (set.has(k) && !seen.has(k)) { seen.add(k); st.push(n); } }
    }
    return seen.size === cells.length;
}
function mutate(cells) {
    const ops = 1 + Math.floor(rng() * 3);
    let cur = cells.map(c => c.slice());
    for (let t = 0; t < ops; t++) {
        const r = rng();
        if (r < 0.45 && cur.length > 45) {
            const i = Math.floor(rng() * cur.length);
            const nx = cur.filter((_, j) => j !== i);
            if (isConnected(nx)) cur = nx;
        } else if (r < 0.85 && cur.length < MAXN) {
            const set = new Set(cur.map(key)), fr = [];
            for (const c of cur) for (const d of DIRS) { const n = [c[0] + d[0], c[1] + d[1]]; if (!set.has(key(n))) fr.push(n); }
            cur.push(fr[Math.floor(rng() * fr.length)]);
        } else {
            const i = Math.floor(rng() * cur.length);
            const nx = cur.filter((_, j) => j !== i);
            if (!isConnected(nx)) continue;
            const set = new Set(nx.map(key)), fr = [];
            for (const c of nx) for (const d of DIRS) { const n = [c[0] + d[0], c[1] + d[1]]; if (!set.has(key(n))) fr.push(n); }
            nx.push(fr[Math.floor(rng() * fr.length)]);
            cur = nx;
        }
    }
    return cur;
}
function randomShape() {
    for (;;) {
        const p = 0.22 + rng() * 0.26, Rd = 5 + Math.floor(rng() * 3);
        const c = largestComponent(hexPatch(Rd).filter(() => rng() > p));
        if (c.length >= 50 && c.length <= MAXN) return c;
    }
}
function evaluate(cellsIn, quick) {
    const cells = cellsIn.slice().sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    const G = Core.buildGraph(cells), M = R.buildModel(G);
    const sp = R.enumerate(M, 3000000);
    if (!sp) return null;
    let mx = 0, mn = 1e9;
    for (const k of sp.map.keys()) { const v = decode(k); for (const x of v) { if (x > mx) mx = x; if (x < mn) mn = x; } }
    const cand = [];
    for (const [k, v] of sp.map) {
        const c = decode(k);
        if (!(c[0] > c[1] && c[1] > c[2]) || v > 16) continue;
        cand.push({ c, v, inter: Math.min(mx - c[0], c[2] - mn) });
    }
    if (!cand.length) return null;
    /* 依內部度＋隨機挑幾個來評 */
    cand.sort((a, b) => (b.inter - a.inter) || (a.v - b.v) || (rng() - 0.5));
    const E = makeEngine(G, 3);
    const none = new Int8Array(G.n).fill(-1);
    let best = null;
    for (const ca of cand.slice(0, 5)) {
        let givens = none;
        if (ca.v > 1) {
            const r0 = R.arithSearch(M, ca.c, null, { cap: 1 });
            if (!r0.first) continue;
            givens = minimizeClues(E, R.colorsFromChoice(M, r0.first), ca.c, rng, 40000).givens;
        }
        const clues = clueCount(givens);
        if (clues > 6) continue;
        const u = R.arithSearch(M, ca.c, givens, { nodeLimit: 2e6 });
        if (u.aborted || u.solutions !== 1) continue;
        const br = R.blobRate(M, ca.c, givens, { maxDepth: 3, ms: 1500 });
        const bd = br.solved ? br.depth : 4;
        const hiUses = br.uses ? (br.uses[3] * 4 + br.uses[2] * 2 + br.uses[1] * 0.5) : 0;
        const s0 = 1.6 * bd + Math.min(2, 0.04 * hiUses) + Math.log10(u.nodes + 1) - 0.12 * clues;
        if (best && s0 < best.s0 - 1.2) continue;
        const ns = nodesStats(E, givens, ca.c, rng, 3, quick ? 30000 : 120000);
        const score = s0 + 0.5 * Math.log10(ns.median + 1);
        if (!best || score > best.score) {
            best = { score, s0, cells, counts: ca.c, givens: Array.from(givens), clues, n: G.n, blocks: M.blocks.length, total: sp.total, inter: ca.inter, range: [mn, mx], solsNoClue: ca.v, arith: u.nodes, bt: ns.median, blobDepth: bd, blobUses: br.uses, blobFree: br.startFree, blobLog: br.startLog };
        }
    }
    return best;
}
const t0 = Date.now();
let cur = null, best = null, evals = 0, restarts = 0, sinceImprove = 0;
/* 第二階段：環境變數 START 指定從哪些既有結果繼續爬（逗號分隔的 JSON 路徑，依種子輪流挑） */
const STARTS = process.env.START ? process.env.START.split(',') : null;
while ((Date.now() - t0) / 1000 < SECONDS) {
    if (!cur || sinceImprove > 250) {
        /* 重新開始（保留最佳）；第二階段時回到目前最佳，繼續從那裡換方向爬 */
        let e = null;
        if (STARTS && !cur) e = evaluate(JSON.parse(fs.readFileSync(STARTS[SEED % STARTS.length], 'utf8')).cells, true);
        else if (STARTS && best) e = best;
        while (!e && (Date.now() - t0) / 1000 < SECONDS) { e = evaluate(randomShape(), true); evals++; }
        if (!e) break;
        cur = e; sinceImprove = 0; restarts++;
    }
    const nx = mutate(cur.cells);
    const e = evaluate(nx, true);
    evals++;
    if (e && (e.score >= cur.score || rng() < 0.01)) {
        if (e.score > cur.score) sinceImprove = 0;
        cur = e;
    } else sinceImprove++;
    if (cur && (!best || cur.score > best.score)) {
        best = JSON.parse(JSON.stringify(cur));
        fs.writeFileSync(OUT, JSON.stringify(best));
    }
}
console.log(`種子${SEED} 評估${evals} 次 重啟${restarts} 最佳分=${best && best.score.toFixed(2)} N=${best && best.n} 預填=${best && best.clues} 數量=${best && best.counts} 剛體=${best && best.blocks} 高手層深度=${best && best.blobDepth} uses=${best && JSON.stringify(best.blobUses)} 湊數=${best && best.arith} 回溯=${best && best.bt}`);
