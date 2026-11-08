/* ═══════════════════════════════════════════════════════════════════
   rigid.cjs — 「剛體模型」：用人類會想的方式，重新描述 3 色盤面
   ───────────────────────────────────────────────────────────────────
   六角格可以用 (q - r) mod 3 分成三個子格（class 0/1/2）：相鄰的兩格子格一定不同。
   三格兩兩相鄰（三角形）一定是三種顏色；兩個三角形共用一條邊時，另外兩個尖端必須同色
   （菱形規則）。所以「三角形靠共用邊連起來的一塊」＝一個剛體：
     同子格的格子必定同色，整塊只有「三個子格各配哪個顏色」的 6 種可能（排列 π）。
   整個盤面就變成很小的問題：
     變數：每個剛體的 π
     接縫：共用同一格 → 該子格兩邊顏色要一樣；相鄰但不同塊 → 兩邊顏色要不同
     全域條件：把各塊的格數加起來，每種顏色的總數要剛好等於目標。
   這支提供：
     · buildModel   ：把形狀拆成剛體與接縫
     · arithSearch  ：人類「列表湊數」式的搜尋（用每色的上下限剪枝），回傳要試幾個節點
                      ——節點少＝一眼算得出來；節點多＝真的要想破頭
     · enumerate    ：窮舉所有著色，得到「各色數量 → 有幾種著色」的分布
     這也是獨立於 lab.cjs 回溯法的第二種解法，可以交叉驗證唯一解。
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const PERMS = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
function clsOf(cell) { return (((cell[0] - cell[1]) % 3) + 3) % 3; }

function buildModel(G) {
    const n = G.n, cells = G.cells;
    const adj = G.nbrs.map(a => new Set(a));
    const tris = [];
    for (let i = 0; i < n; i++) for (const j of G.nbrs[i]) if (j > i) for (const m of G.nbrs[j]) if (m > j && adj[i].has(m)) tris.push([i, j, m]);
    const parent = tris.map((_, i) => i);
    const find = x => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
    const edgeOwner = new Map();
    tris.forEach((t, ti) => {
        [[t[0], t[1]], [t[0], t[2]], [t[1], t[2]]].forEach(e => {
            const key = e[0] * 1000 + e[1];
            if (edgeOwner.has(key)) parent[find(ti)] = find(edgeOwner.get(key)); else edgeOwner.set(key, ti);
        });
    });
    const bm = new Map();
    tris.forEach((t, ti) => {
        const r = find(ti);
        if (!bm.has(r)) bm.set(r, new Set());
        t.forEach(v => bm.get(r).add(v));
    });
    const blocks = Array.from(bm.values()).map(s => Array.from(s));
    const inBlock = Array.from({ length: n }, () => []);
    blocks.forEach((b, bi) => b.forEach(v => inBlock[v].push(bi)));
    /* 不在任何三角形裡的格子：自成一塊 */
    for (let v = 0; v < n; v++) if (!inBlock[v].length) { inBlock[v].push(blocks.length); blocks.push([v]); }
    /* 每一格只算進第一個所屬的剛體（計數才不會重複） */
    const own = new Array(n);
    for (let v = 0; v < n; v++) own[v] = inBlock[v][0];
    const size = blocks.map(() => [0, 0, 0]);
    for (let v = 0; v < n; v++) size[own[v]][clsOf(cells[v])]++;
    /* 每個剛體用到哪些子格（沒用到的子格換色沒有差別，用來去掉重複的排列） */
    const used = blocks.map(b => { const u = [0, 0, 0]; b.forEach(v => { u[clsOf(cells[v])] = 1; }); return u; });
    /* 接縫 */
    const same = [], diff = [];
    for (let v = 0; v < n; v++) {
        const c = clsOf(cells[v]);
        for (let t = 1; t < inBlock[v].length; t++) same.push([inBlock[v][0], inBlock[v][t], c]);
    }
    const seen = new Set();
    for (let v = 0; v < n; v++) for (const w of G.nbrs[v]) if (w > v) {
        let common = false;
        for (const b of inBlock[v]) if (inBlock[w].includes(b)) common = true;
        if (common) continue;
        const a = inBlock[v][0], b = inBlock[w][0], ca = clsOf(cells[v]), cb = clsOf(cells[w]);
        const key = [a, b, ca, cb].join();
        if (seen.has(key)) continue;
        seen.add(key);
        diff.push([a, b, ca, cb]);
    }
    /* 每個剛體不重複的排列：只看「用到的子格」配到的顏色 */
    const domains = blocks.map((b, bi) => {
        const out = [], sig = new Set();
        PERMS.forEach(p => {
            const key = [0, 1, 2].map(c => used[bi][c] ? p[c] : 'x').join();
            if (!sig.has(key)) { sig.add(key); out.push(p); }
        });
        return out;
    });
    return { n, cells, blocks, inBlock, own, size, used, same, diff, domains, tris: tris.length };
}

/* 把排列組的接縫約束整理成鄰接表 */
function links(model) {
    const m = model.blocks.length;
    const L = Array.from({ length: m }, () => []);
    model.same.forEach(([a, b, c]) => { L[a].push({ other: b, kind: 's', ca: c, cb: c }); L[b].push({ other: a, kind: 's', ca: c, cb: c }); });
    model.diff.forEach(([a, b, ca, cb]) => { L[a].push({ other: b, kind: 'd', ca, cb }); L[b].push({ other: a, kind: 'd', ca: cb, cb: ca }); });
    return L;
}

/* 列表湊數：逐塊決定 π，用「每色的上下限」剪枝。回傳 { solutions, nodes, first }
   opts.order：'size'（格數差大的先決定＝人會先看的）或 'bfs'；givens：預填（-1 表示沒有） */
function arithSearch(model, counts, givens, opts) {
    opts = opts || {};
    const m = model.blocks.length, L = links(model);
    const cap = opts.cap || 1e9, nodeLimit = opts.nodeLimit || 5e7;
    /* 預填先把各塊的排列篩一次 */
    const baseDom = model.domains.map((d, bi) => d.filter(p => {
        for (const v of model.blocks[bi]) {
            if (givens && givens[v] >= 0 && p[clsOf(model.cells[v])] !== givens[v]) return false;
        }
        return true;
    }));
    /* 每塊每個排列對三色總數的貢獻 */
    const contrib = model.domains.map((d, bi) => null);
    const contribOf = (bi, p) => { const s = model.size[bi], out = [0, 0, 0]; for (let c = 0; c < 3; c++) out[p[c]] += s[c]; return out; };
    /* 順序：彼此相連優先（才能早點檢查接縫），同時偏好影響大的塊 */
    const spread = bi => { const s = model.size[bi]; return Math.max(s[0], s[1], s[2]) - Math.min(s[0], s[1], s[2]); };
    const order = [], placed = new Uint8Array(m);
    while (order.length < m) {
        let best = -1, bestScore = -1;
        for (let b = 0; b < m; b++) {
            if (placed[b]) continue;
            const conn = L[b].some(e => placed[e.other]) ? 1 : 0;
            const score = conn * 1000 + spread(b) * 10 + model.blocks[b].length;
            if (score > bestScore) { bestScore = score; best = b; }
        }
        placed[best] = 1; order.push(best);
    }
    const chosen = new Array(m).fill(null);
    const compatible = (bi, p) => {
        for (const e of L[bi]) {
            const q = chosen[e.other];
            if (!q) continue;
            if (e.kind === 's' && p[e.ca] !== q[e.cb]) return false;
            if (e.kind === 'd' && p[e.ca] === q[e.cb]) return false;
        }
        return true;
    };
    let solutions = 0, nodes = 0, first = null, aborted = false;
    const sum = [0, 0, 0];
    (function dfs(t) {
        if (solutions >= cap || aborted) return;
        if (t === m) {
            if (sum[0] === counts[0] && sum[1] === counts[1] && sum[2] === counts[2]) {
                if (!solutions) first = chosen.slice();
                solutions++;
            }
            return;
        }
        /* 上下限：剩下每塊（只看還相容的排列）能貢獻多少 */
        const lo = sum.slice(), hi = sum.slice();
        for (let u = t; u < m; u++) {
            const bi = order[u];
            const mn = [1e9, 1e9, 1e9], mx = [-1, -1, -1];
            let any = false;
            for (const p of baseDom[bi]) {
                if (!compatible(bi, p)) continue;
                any = true;
                const c = contribOf(bi, p);
                for (let x = 0; x < 3; x++) { if (c[x] < mn[x]) mn[x] = c[x]; if (c[x] > mx[x]) mx[x] = c[x]; }
            }
            if (!any) return;
            for (let x = 0; x < 3; x++) { lo[x] += mn[x]; hi[x] += mx[x]; }
        }
        for (let x = 0; x < 3; x++) if (counts[x] < lo[x] || counts[x] > hi[x]) return;
        const bi = order[t];
        for (const p of baseDom[bi]) {
            if (!compatible(bi, p)) continue;
            if (++nodes > nodeLimit) { aborted = true; return; }
            const c = contribOf(bi, p);
            for (let x = 0; x < 3; x++) sum[x] += c[x];
            chosen[bi] = p;
            dfs(t + 1);
            chosen[bi] = null;
            for (let x = 0; x < 3; x++) sum[x] -= c[x];
            if (solutions >= cap || aborted) return;
        }
    })(0);
    return { solutions, nodes, first, aborted };
}

/* 由剛體的排列還原整個盤面的顏色 */
function colorsFromChoice(model, chosen) {
    const col = new Int8Array(model.n);
    for (let v = 0; v < model.n; v++) col[v] = chosen[model.own[v]][clsOf(model.cells[v])];
    return col;
}

/* 窮舉所有著色（在剛體層級），回傳 { map: 數量→著色數, total }；超過 cap 回傳 null。 */
function enumerate(model, cap, givens) {
    const m = model.blocks.length, L = links(model);
    const baseDom = model.domains.map((d, bi) => d.filter(p => {
        for (const v of model.blocks[bi]) if (givens && givens[v] >= 0 && p[clsOf(model.cells[v])] !== givens[v]) return false;
        return true;
    }));
    const order = [], placed = new Uint8Array(m);
    while (order.length < m) {
        let best = -1, bestScore = -1;
        for (let b = 0; b < m; b++) {
            if (placed[b]) continue;
            const conn = L[b].some(e => placed[e.other]) ? 1 : 0;
            const score = conn * 1000 + model.blocks[b].length;
            if (score > bestScore) { bestScore = score; best = b; }
        }
        placed[best] = 1; order.push(best);
    }
    const chosen = new Array(m).fill(null), sum = [0, 0, 0], map = new Map();
    let total = 0, over = false;
    (function dfs(t) {
        if (over) return;
        if (t === m) {
            if (++total > cap) { over = true; return; }
            const key = sum[0] * 10000 + sum[1] * 100 + sum[2];
            map.set(key, (map.get(key) || 0) + 1);
            return;
        }
        const bi = order[t], s = model.size[bi];
        outer: for (const p of baseDom[bi]) {
            for (const e of L[bi]) {
                const q = chosen[e.other];
                if (!q) continue;
                if (e.kind === 's' && p[e.ca] !== q[e.cb]) continue outer;
                if (e.kind === 'd' && p[e.ca] === q[e.cb]) continue outer;
            }
            for (let c = 0; c < 3; c++) sum[p[c]] += s[c];
            chosen[bi] = p;
            dfs(t + 1);
            chosen[bi] = null;
            for (let c = 0; c < 3; c++) sum[p[c]] -= s[c];
            if (over) return;
        }
    })(0);
    return over ? null : { map, total };
}

/* ═══════════════════════════════════════════════════════════════════
   blobRate：「已經知道秘訣的高手」要假設幾層？
   ───────────────────────────────────────────────────────────────────
   假設玩家已經看穿剛體，把每塊的格數列成表。他能做的推理：
     B0：接縫檢查（這塊的排列跟鄰塊的所有排列都衝突 → 刪掉）
         ＋上下限（這塊選這個排列之後，其他塊就算全取最大／最小也湊不到目標 → 刪掉）
     B1：假設某塊選某排列 → 用 B0 推 → 矛盾 → 刪掉
     B2：假設裡面再假設一層……
   回傳 { solved, depth, uses, remaining }。
   depth=0 代表「看穿秘訣後直接算就解完」——那題目只有觀念難，算不上想破頭。
   ═══════════════════════════════════════════════════════════════════ */
function blobRate(model, counts, givens, opts) {
    opts = opts || {};
    const maxDepth = opts.maxDepth === undefined ? 3 : opts.maxDepth;
    const deadline = Date.now() + (opts.ms || 5000);
    const m = model.blocks.length, L = links(model);
    const contribOf = (bi, p) => { const s = model.size[bi], out = [0, 0, 0]; for (let c = 0; c < 3; c++) out[p[c]] += s[c]; return out; };
    const init = model.domains.map((d, bi) => d.filter(p => {
        for (const v of model.blocks[bi]) if (givens && givens[v] >= 0 && p[clsOf(model.cells[v])] !== givens[v]) return false;
        return true;
    }));
    const compat = (e, p, q) => e.kind === 's' ? p[e.ca] === q[e.cb] : p[e.ca] !== q[e.cb];
    /* B0：做到不動點；回傳 false＝矛盾 */
    function closeB0(D) {
        for (;;) {
            let changed = false;
            /* 接縫 */
            for (let b = 0; b < m; b++) {
                const keep = D[b].filter(p => L[b].every(e => D[e.other].some(q => compat(e, p, q))));
                if (keep.length !== D[b].length) { D[b] = keep; changed = true; }
                if (!keep.length) return false;
            }
            /* 上下限 */
            const lo = [0, 0, 0], hi = [0, 0, 0];
            const mn = [], mx = [];
            for (let b = 0; b < m; b++) {
                const a = [1e9, 1e9, 1e9], z = [-1, -1, -1];
                for (const p of D[b]) { const c = contribOf(b, p); for (let x = 0; x < 3; x++) { if (c[x] < a[x]) a[x] = c[x]; if (c[x] > z[x]) z[x] = c[x]; } }
                mn.push(a); mx.push(z);
                for (let x = 0; x < 3; x++) { lo[x] += a[x]; hi[x] += z[x]; }
            }
            for (let x = 0; x < 3; x++) if (counts[x] < lo[x] || counts[x] > hi[x]) return false;
            for (let b = 0; b < m; b++) {
                const keep = D[b].filter(p => {
                    const c = contribOf(b, p);
                    for (let x = 0; x < 3; x++) {
                        if (lo[x] - mn[b][x] + c[x] > counts[x]) return false;
                        if (hi[x] - mx[b][x] + c[x] < counts[x]) return false;
                    }
                    return true;
                });
                if (keep.length !== D[b].length) { D[b] = keep; changed = true; }
                if (!keep.length) return false;
            }
            if (!changed) return true;
        }
    }
    const cloneD = D => D.map(a => a.slice());
    function done(D) { return D.every(a => a.length === 1); }
    function step(D, d) {
        if (Date.now() > deadline) throw new Error('budget');
        for (let b = 0; b < m; b++) {
            if (D[b].length < 2) continue;
            for (let pi = 0; pi < D[b].length; pi++) {
                const T = cloneD(D);
                T[b] = [D[b][pi]];
                let ok = closeB0(T);
                for (let dd = 1; dd < d && ok && !done(T); dd++) {
                    for (;;) {
                        const r = step(T, dd);
                        if (r === 'dead') { ok = false; break; }
                        if (!r) break;
                        if (done(T)) break;
                    }
                }
                if (!ok) {
                    D[b].splice(pi, 1);
                    if (!closeB0(D)) return 'dead';
                    return true;
                }
            }
        }
        return false;
    }
    const D = cloneD(init);
    if (!closeB0(D)) return { solved: false, contradiction: true };
    const uses = new Array(maxDepth + 1).fill(0);
    let depth = 0, timedOut = false;
    const startFree = D.reduce((a, x) => a + (x.length > 1 ? 1 : 0), 0);
    const startLog = D.reduce((a, x) => a + Math.log10(x.length), 0);
    try {
        while (!done(D)) {
            let progressed = false;
            for (let d = 1; d <= maxDepth; d++) {
                const r = step(D, d);
                if (r === 'dead') return { solved: false, contradiction: true };
                if (r) {
                    uses[d]++; if (d > depth) depth = d; progressed = true;
                    if (opts.trace) opts.trace.push({ depth: d, free: D.reduce((a, x) => a + (x.length > 1 ? 1 : 0), 0), log: D.reduce((a, x) => a + Math.log10(x.length), 0) });
                    break;
                }
            }
            if (!progressed) break;
        }
    } catch (e) {
        if (e.message !== 'budget') throw e;
        timedOut = true;
    }
    return { solved: done(D), depth, uses, timedOut, startFree, startLog, choice: done(D) ? D.map(a => a[0]) : null };
}

module.exports = { clsOf, buildModel, arithSearch, colorsFromChoice, enumerate, blobRate, PERMS, links };
