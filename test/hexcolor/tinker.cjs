/* ═══════════════════════════════════════════════════════════════════
   tinker.cjs — 「微調玩家」測試：不推理，只是亂試再微調，能不能破解？
   ───────────────────────────────────────────────────────────────────
   前面的量尺只模擬推理。真人常用的是另一招：先隨便填完，再看哪裡不對，一點一點改。
   如果這招很快就成功，再高的推理分數也沒有意義。所以這裡做兩種攻擊：

   攻擊一 flipPlayer（已看穿剛體的高手）：
     先隨機合法填滿，看各色數量差多少，每次翻一塊（改一個剛體的排列），
     讓「差距」變小或不變；卡住就稍微亂走；很久沒進步就全部重來。
     也就是：「看顏色列差幾格，再翻一塊來補」。
   攻擊二 swapPlayer（完全不懂秘訣的一般人）：
     各色數量先照規定填滿（可能有相鄰同色），每次交換兩格的顏色讓相鄰同色變少。
   攻擊三 greedy（只用直覺的第一手）：
     每塊都把「最大的子格」配給「還缺最多的顏色」，看離答案差幾塊。

   回傳成功率與平均步數。步數上限內都找不到＝這盤很抗微調。
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const R = require('./rigid.cjs');
const { clsOf, links } = R;

/* 隨機產生一個合法的剛體配置（滿足所有接縫） */
function randomValid(model, baseDom, L, rng) {
    const m = model.blocks.length;
    const order = [], placed = new Uint8Array(m);
    let remaining = m;
    while (remaining) {
        let pick = -1;
        const cand = [];
        for (let b = 0; b < m; b++) if (!placed[b] && L[b].some(e => placed[e.other])) cand.push(b);
        if (cand.length) pick = cand[Math.floor(rng() * cand.length)];
        else { const rest = []; for (let b = 0; b < m; b++) if (!placed[b]) rest.push(b); pick = rest[Math.floor(rng() * rest.length)]; }
        placed[pick] = 1; order.push(pick); remaining--;
    }
    const chosen = new Array(m).fill(null);
    let tries = 0;
    function dfs(t) {
        if (t === m) return true;
        if (++tries > 20000) return false;
        const bi = order[t];
        const dom = baseDom[bi].slice();
        for (let i = dom.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const x = dom[i]; dom[i] = dom[j]; dom[j] = x; }
        for (const p of dom) {
            let ok = true;
            for (const e of L[bi]) {
                const q = chosen[e.other];
                if (!q) continue;
                if (e.kind === 's' && p[e.ca] !== q[e.cb]) { ok = false; break; }
                if (e.kind === 'd' && p[e.ca] === q[e.cb]) { ok = false; break; }
            }
            if (!ok) continue;
            chosen[bi] = p;
            if (dfs(t + 1)) return true;
            chosen[bi] = null;
        }
        return false;
    }
    return dfs(0) ? chosen : null;
}

/* 攻擊一：翻塊微調。budget＝總共可以翻幾次；restartAfter＝幾步沒進步就重來 */
function flipPlayer(model, counts, givens, rng, budget, restartAfter, noise) {
    const m = model.blocks.length, L = links(model);
    const baseDom = model.domains.map((d, bi) => d.filter(p => {
        for (const v of model.blocks[bi]) if (givens && givens[v] >= 0 && p[clsOf(model.cells[v])] !== givens[v]) return false;
        return true;
    }));
    const compat = (bi, p, chosen) => {
        for (const e of L[bi]) {
            const q = chosen[e.other];
            if (!q) continue;
            if (e.kind === 's' && p[e.ca] !== q[e.cb]) return false;
            if (e.kind === 'd' && p[e.ca] === q[e.cb]) return false;
        }
        return true;
    };
    const err = sum => Math.abs(sum[0] - counts[0]) + Math.abs(sum[1] - counts[1]) + Math.abs(sum[2] - counts[2]);
    let moves = 0, restarts = 0, bestEver = 1e9;
    const hist = {};
    while (moves < budget) {
        const chosen = randomValid(model, baseDom, L, rng);
        if (!chosen) return { solved: false, moves, restarts, bestEver, stuckHist: hist };
        restarts++;
        const sum = [0, 0, 0];
        for (let b = 0; b < m; b++) for (let c = 0; c < 3; c++) sum[chosen[b][c]] += model.size[b][c];
        let cur = err(sum), bestHere = cur, stale = 0;
        while (moves < budget && stale < restartAfter) {
            if (cur === 0) return { solved: true, moves, restarts, bestEver: 0, stuckHist: hist };
            /* 列出所有合法的翻法，挑讓差距最小的（同分隨機）；偶爾亂走一步 */
            const options = [];
            for (let b = 0; b < m; b++) {
                for (const p of baseDom[b]) {
                    if (p === chosen[b] || p.join() === chosen[b].join()) continue;
                    const saved = chosen[b];
                    chosen[b] = null;
                    const ok = compat(b, p, chosen);
                    chosen[b] = saved;
                    if (!ok) continue;
                    const s2 = sum.slice();
                    for (let c = 0; c < 3; c++) { s2[saved[c]] -= model.size[b][c]; s2[p[c]] += model.size[b][c]; }
                    options.push({ b, p, e: err(s2), s2 });
                }
            }
            if (!options.length) break;
            moves++;
            let pick;
            if (rng() < noise) pick = options[Math.floor(rng() * options.length)];
            else {
                const min = Math.min.apply(null, options.map(o => o.e));
                const pool = options.filter(o => o.e === min);
                pick = pool[Math.floor(rng() * pool.length)];
            }
            chosen[pick.b] = pick.p;
            sum[0] = pick.s2[0]; sum[1] = pick.s2[1]; sum[2] = pick.s2[2];
            cur = pick.e;
            if (cur < bestHere) { bestHere = cur; stale = 0; } else stale++;
        }
        if (bestHere < bestEver) bestEver = bestHere;
        hist[bestHere] = (hist[bestHere] || 0) + 1;
        if (cur === 0) return { solved: true, moves, restarts, bestEver: 0, stuckHist: hist };
    }
    return { solved: false, moves, restarts, bestEver, stuckHist: hist };
}

/* 攻擊二：交換兩格（各色數量永遠正確），讓相鄰同色變少。適用任何色數。 */
function swapPlayer(G, k, counts, givens, rng, budget, noise) {
    const n = G.n, nb = G.nbrs;
    const free = [];
    const col = new Int8Array(n);
    const left = counts.slice();
    for (let i = 0; i < n; i++) { if (givens[i] >= 0) { col[i] = givens[i]; left[givens[i]]--; } else free.push(i); }
    const fill = [];
    left.forEach((c, x) => { for (let t = 0; t < c; t++) fill.push(x); });
    for (let i = fill.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const x = fill[i]; fill[i] = fill[j]; fill[j] = x; }
    free.forEach((v, i) => { col[v] = fill[i]; });
    const cost = () => { let e = 0; for (let v = 0; v < n; v++) for (const w of nb[v]) if (w > v && col[v] === col[w]) e++; return e; };
    const localBad = (v, c) => { let e = 0; for (const w of nb[v]) if (col[w] === c) e++; return e; };
    let cur = cost(), best = cur, moves = 0;
    while (moves < budget) {
        if (cur === 0) return { solved: true, moves, best: 0 };
        /* 挑一個有衝突的格子，跟「換了之後最好」的另一格交換 */
        const bad = free.filter(v => localBad(v, col[v]) > 0);
        if (!bad.length) return { solved: cur === 0, moves, best };
        moves++;
        const v = bad[Math.floor(rng() * bad.length)];
        let bestD = 1e9, pool = [];
        for (const u of free) {
            if (u === v || col[u] === col[v]) continue;
            const a = col[v], b = col[u];
            let d = localBad(v, b) + localBad(u, a) - localBad(v, a) - localBad(u, b);
            if (nb[v].includes(u)) d += 2;      /* 互為鄰居時要扣掉重複算的部分（近似即可，下面會重算成本） */
            if (d < bestD) { bestD = d; pool = [u]; } else if (d === bestD) pool.push(u);
        }
        const u = (rng() < noise) ? free[Math.floor(rng() * free.length)] : pool[Math.floor(rng() * pool.length)];
        const t = col[u]; col[u] = col[v]; col[v] = t;
        cur = cost();
        if (cur < best) best = cur;
    }
    return { solved: false, moves, best };
}

/* 攻擊三：純直覺。依塊大小排序，每塊把最大的子格配給「還缺最多」的顏色（要符合接縫）。
   回傳跟真解差幾塊、各色差距。 */
function greedyGuess(model, counts, givens, solChoice) {
    const m = model.blocks.length, L = links(model);
    const baseDom = model.domains.map((d, bi) => d.filter(p => {
        for (const v of model.blocks[bi]) if (givens && givens[v] >= 0 && p[clsOf(model.cells[v])] !== givens[v]) return false;
        return true;
    }));
    const order = Array.from({ length: m }, (_, i) => i).sort((a, b) => {
        const sa = Math.max.apply(null, model.size[a]) - Math.min.apply(null, model.size[a]);
        const sb = Math.max.apply(null, model.size[b]) - Math.min.apply(null, model.size[b]);
        return sb - sa || model.blocks[b].length - model.blocks[a].length;
    });
    const chosen = new Array(m).fill(null), need = counts.slice();
    let ok = true;
    for (const bi of order) {
        let best = null, bestScore = -1e9;
        for (const p of baseDom[bi]) {
            let compat = true;
            for (const e of L[bi]) {
                const q = chosen[e.other];
                if (!q) continue;
                if (e.kind === 's' && p[e.ca] !== q[e.cb]) compat = false;
                if (e.kind === 'd' && p[e.ca] === q[e.cb]) compat = false;
            }
            if (!compat) continue;
            let score = 0;
            for (let c = 0; c < 3; c++) score += need[p[c]] * model.size[bi][c];
            if (score > bestScore) { bestScore = score; best = p; }
        }
        if (!best) { ok = false; break; }
        chosen[bi] = best;
        for (let c = 0; c < 3; c++) need[best[c]] -= model.size[bi][c];
    }
    if (!ok) return { ok: false };
    let diff = 0;
    if (solChoice) for (let b = 0; b < m; b++) {
        const a = chosen[b], s = solChoice[b];
        for (let c = 0; c < 3; c++) if (model.used[b][c] && a[c] !== s[c]) { diff++; break; }
    }
    return { ok: true, err: Math.abs(need[0]) + Math.abs(need[1]) + Math.abs(need[2]), blocksOff: diff, blocks: m };
}

module.exports = { flipPlayer, swapPlayer, greedyGuess };
