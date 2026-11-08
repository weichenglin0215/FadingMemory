/* 逐格動態規劃：精確算出「有幾個解」，完全不用猜也不用推理（給唯一解當第三方驗證）。
   做法：照順序一格一格決定顏色，只記得「之後還會用到的邊界格子的顏色」＋「各色已用幾格」；
         同樣的記憶內容後面的走法都一樣，所以可以合併計數，不必一個一個列舉。
   唯一的剪枝只用到一個簡單事實：某色還要放的格數，不能超過「剩下的格子裡，彼此不相鄰、
   又允許放這色的格子最多幾格」（Core.maxIndependent）。
   回傳 { total, peak }：total 是精確解數（浮點數在這裡夠用，解數很小），peak 是狀態數高峰。 */
'use strict';
const Core = require('../../js/hexcolor_core.js');

function dpCount(G, k, counts, given, log) {
    const n = G.n;
    const lastUse = new Array(n);
    for (let i = 0; i < n; i++) { let m = i; for (const j of G.nbrs[i]) if (j > m) m = j; lastUse[i] = m; }
    /* 預先算好：處理完第 v 格之後，每種顏色最多還放得下幾格 */
    const room = Array.from({ length: n + 1 }, () => new Array(k).fill(0));
    for (let v = 0; v < n; v++) {
        for (let c = 0; c < k; c++) {
            const keep = [];
            for (let u = v + 1; u < n; u++) if (given[u] < 0 || given[u] === c) keep.push(u);
            if (!keep.length) { room[v][c] = 0; continue; }
            const idx = new Map(keep.map((u, i) => [u, i]));
            const sub = { n: keep.length, nbrs: keep.map(u => G.nbrs[u].filter(w => idx.has(w)).map(w => idx.get(w))) };
            const a = Core.maxIndependent(sub, 3000000);
            room[v][c] = a === null ? keep.length : a;
        }
    }
    const P = [1]; for (let c = 1; c < k; c++) P.push(P[c - 1] * 100);
    let active = [];
    let states = new Map([[0, new Map([[0, 1]])]]);
    let peak = 1;
    for (let v = 0; v < n; v++) {
        const pos = G.nbrs[v].filter(j => j < v).map(j => active.indexOf(j));
        const full = active.concat([v]), keepMask = full.map(x => lastUse[x] > v);
        const L = active.length;
        const next = new Map();
        let total = 0;
        for (const [front, inner] of states) {
            /* 把邊界解碼成陣列（第 0 個放最低位） */
            const colors = new Array(L);
            let tmp = front;
            for (let t = 0; t < L; t++) { colors[t] = tmp % k; tmp = Math.floor(tmp / k); }
            let forbid = 0;
            for (const p of pos) forbid |= 1 << colors[p];
            for (let c = 0; c < k; c++) {
                if ((forbid >> c) & 1) continue;
                if (given[v] >= 0 && given[v] !== c) continue;
                let nf = 0, mul = 1;
                for (let t = 0; t <= L; t++) {
                    if (!keepMask[t]) continue;
                    nf += (t === L ? c : colors[t]) * mul;
                    mul *= k;
                }
                let target = next.get(nf);
                if (!target) { target = new Map(); next.set(nf, target); }
                for (const [ck, cnt] of inner) {
                    const usedC = Math.floor(ck / P[c]) % 100;
                    if (usedC >= counts[c]) continue;
                    const nk = ck + P[c];
                    /* 剪枝：每色剩下的需求都要放得下 */
                    let ok = true;
                    for (let x = 0; x < k; x++) {
                        const u = Math.floor(nk / P[x]) % 100;
                        if (counts[x] - u > room[v][x]) { ok = false; break; }
                    }
                    if (!ok) continue;
                    target.set(nk, (target.get(nk) || 0) + cnt);
                }
                if (!target.size) next.delete(nf);
            }
        }
        for (const inner of next.values()) total += inner.size;
        active = full.filter((x, t) => keepMask[t]);
        states = next;
        if (total > peak) peak = total;
        if (log && v % 10 === 9) console.log(`    第 ${v + 1}/${n} 格：狀態 ${total}`);
    }
    let sum = 0;
    for (const inner of states.values()) for (const c of inner.values()) sum += c;
    return { total: sum, peak };
}
module.exports = { dpCount };
