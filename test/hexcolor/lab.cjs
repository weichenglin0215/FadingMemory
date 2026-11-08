/* ═══════════════════════════════════════════════════════════════════
   lab.cjs — 六角著色的「難度實驗室」（研究工具，不會被網頁載入）
   ───────────────────────────────────────────────────────────────────
   提供：
     · makeEngine   ：解題引擎（規則推理、數解、回溯）
     · rate         ：「難度量尺」——模擬一個只用規則＋假設的解題者，看他要假設幾層才解得完
     · sudokuEngine ：同一把尺用在數獨上（校準用：世界級難題在這把尺上是幾分？）
     · minimizeClues：從完整解開始拿掉預填格，直到每一格預填都不能再少
     · 形狀／隨機解等小工具

   【難度量尺的定義】（越下面越難）
     L0 規則直推：相鄰排除、只剩一色就填、某色用完、某色的空位剛好等於剩餘數量。
     D1 假設一層：「假設這格是某色」→ 只用 L0 推下去 → 矛盾 → 這個顏色可以排除。
     D2 假設兩層：「假設這格是某色」→ 在這個假設底下還要再用 D1 → 才矛盾。
     D3 假設三層：依此類推。
     量尺一律「先用便宜的」：能用 L0 就不用 D1，能用 D1 就不用 D2，
     最後記錄：每一層被迫用了幾次（uses）、最深用到第幾層（depth）。
     depth = 0：只靠規則就解完；depth = 1：要一層假設；depth ≥ 2：人腦已經很難追蹤。
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const Core = require('../../js/hexcolor_core.js');

/* ───────── 六角著色的引擎 ───────── */
function makeEngine(G, k, useCounts) {
    if (useCounts === undefined) useCounts = true;
    const n = G.n, nb = G.nbrs;
    const FULL = (1 << k) - 1;
    const POP = new Uint8Array(1 << k);
    for (let x = 1; x < (1 << k); x++) POP[x] = POP[x >> 1] + (x & 1);

    function newState(counts) {
        return {
            dom: new Int32Array(n).fill(FULL), col: new Int8Array(n).fill(-1),
            rem: useCounts ? Int32Array.from(counts) : new Int32Array(k).fill(1e9), assigned: 0,
        };
    }
    function clone(s) { return { dom: s.dom.slice(), col: s.col.slice(), rem: s.rem.slice(), assigned: s.assigned }; }

    function assign(s, i, c, q) {
        if (!((s.dom[i] >> c) & 1)) return false;
        if (s.col[i] !== -1) return s.col[i] === c;
        s.col[i] = c; s.dom[i] = 1 << c; s.assigned++;
        if (--s.rem[c] < 0) return false;
        const a = nb[i];
        for (let t = 0; t < a.length; t++) {
            const j = a[t];
            if (s.col[j] === c) return false;
            if (s.col[j] === -1 && ((s.dom[j] >> c) & 1)) {
                s.dom[j] &= ~(1 << c);
                if (s.dom[j] === 0) return false;
                if (POP[s.dom[j]] === 1) q.push(j);
            }
        }
        return true;
    }
    function propagate(s, q) {
        for (;;) {
            while (q.length) {
                const i = q.pop();
                if (s.col[i] !== -1) continue;
                if (!assign(s, i, 31 - Math.clz32(s.dom[i]), q)) return false;
            }
            if (!useCounts) return true;
            let progressed = false;
            for (let c = 0; c < k; c++) {
                const r = s.rem[c];
                let cand = 0;
                for (let i = 0; i < n; i++) if (s.col[i] === -1 && ((s.dom[i] >> c) & 1)) cand++;
                if (cand < r) return false;
                if (r === 0) {
                    if (cand > 0) {
                        for (let i = 0; i < n; i++) if (s.col[i] === -1 && ((s.dom[i] >> c) & 1)) {
                            s.dom[i] &= ~(1 << c);
                            if (s.dom[i] === 0) return false;
                            if (POP[s.dom[i]] === 1) q.push(i);
                        }
                        progressed = true;
                    }
                } else if (cand === r) {
                    for (let i = 0; i < n; i++) if (s.col[i] === -1 && ((s.dom[i] >> c) & 1)) {
                        if (!assign(s, i, c, q)) return false;
                    }
                    progressed = true;
                }
            }
            if (!progressed && !q.length) return true;
        }
    }
    function start(givens, counts) {
        const s = newState(counts), q = [];
        for (let i = 0; i < n; i++) if (givens[i] >= 0 && !assign(s, i, givens[i], q)) return null;
        if (!propagate(s, q)) return null;
        return s;
    }
    /* 排除候選色（給量尺用） */
    function eliminate(s, i, c) {
        s.dom[i] &= ~(1 << c);
        if (s.dom[i] === 0) return false;
        const q = [];
        if (POP[s.dom[i]] === 1) q.push(i);
        return propagate(s, q);
    }
    /* 回溯數解；rng 有給就隨機挑分支（用來量「搜尋節點數」的分布） */
    function count(givens, counts, cap, nodeLimit, rng) {
        const s0 = start(givens, counts);
        if (!s0) return { found: 0, aborted: false, nodes: 0, first: null };
        let found = 0, nodes = 0, aborted = false, first = null, second = null;
        (function dfs(s) {
            if (found >= cap || aborted) return;
            if (++nodes > nodeLimit) { aborted = true; return; }
            if (s.assigned === n) {
                if (found === 0) first = s.col.slice();
                else if (found === 1) second = s.col.slice();
                found++;
                return;
            }
            let best = -1, bs = 99, ties = 0;
            for (let i = 0; i < n; i++) {
                if (s.col[i] !== -1) continue;
                const p = POP[s.dom[i]];
                if (p < bs) { bs = p; best = i; ties = 1; }
                else if (rng && p === bs) { ties++; if (rng() * ties < 1) best = i; }
            }
            const d = s.dom[best];
            const cs = [];
            for (let c = 0; c < k; c++) if ((d >> c) & 1) cs.push(c);
            if (rng) for (let i = cs.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = cs[i]; cs[i] = cs[j]; cs[j] = t; }
            for (const c of cs) {
                const t = clone(s), q = [];
                if (assign(t, best, c, q) && propagate(t, q)) dfs(t);
                if (found >= cap || aborted) return;
            }
        })(s0);
        return { found, aborted, nodes, first, second };
    }
    return { n, k, POP, newState, clone, assign, propagate, start, eliminate, count };
}

/* ───────── 數獨的引擎（介面相同，規則：裸單＋隱單）───────── */
function sudokuEngine() {
    const n = 81, k = 9, FULL = 511;
    const POP = new Uint8Array(512);
    for (let x = 1; x < 512; x++) POP[x] = POP[x >> 1] + (x & 1);
    const houses = [];
    for (let i = 0; i < 9; i++) {
        const row = [], col = [], box = [];
        for (let j = 0; j < 9; j++) {
            row.push(i * 9 + j); col.push(j * 9 + i);
            box.push((Math.floor(i / 3) * 3 + Math.floor(j / 3)) * 9 + (i % 3) * 3 + (j % 3));
        }
        houses.push(row, col, box);
    }
    const peers = Array.from({ length: 81 }, () => new Set());
    for (const h of houses) for (const a of h) for (const b of h) if (a !== b) peers[a].add(b);
    const nb = peers.map(s => Array.from(s));
    function newState() { return { dom: new Int32Array(81).fill(FULL), col: new Int8Array(81).fill(-1), rem: new Int32Array(9), assigned: 0 }; }
    function clone(s) { return { dom: s.dom.slice(), col: s.col.slice(), rem: s.rem, assigned: s.assigned }; }
    function assign(s, i, c, q) {
        if (!((s.dom[i] >> c) & 1)) return false;
        if (s.col[i] !== -1) return s.col[i] === c;
        s.col[i] = c; s.dom[i] = 1 << c; s.assigned++;
        const a = nb[i];
        for (let t = 0; t < a.length; t++) {
            const j = a[t];
            if (s.col[j] === c) return false;
            if (s.col[j] === -1 && ((s.dom[j] >> c) & 1)) {
                s.dom[j] &= ~(1 << c);
                if (s.dom[j] === 0) return false;
                if (POP[s.dom[j]] === 1) q.push(j);
            }
        }
        return true;
    }
    function propagate(s, q) {
        for (;;) {
            while (q.length) {
                const i = q.pop();
                if (s.col[i] !== -1) continue;
                if (!assign(s, i, 31 - Math.clz32(s.dom[i]), q)) return false;
            }
            let progressed = false;
            for (const h of houses) {
                for (let c = 0; c < 9; c++) {
                    let cnt = 0, last = -1, placed = false;
                    for (const i of h) {
                        if (s.col[i] === c) { placed = true; break; }
                        if (s.col[i] === -1 && ((s.dom[i] >> c) & 1)) { cnt++; last = i; }
                    }
                    if (placed) continue;
                    if (cnt === 0) return false;
                    if (cnt === 1) { if (!assign(s, last, c, q)) return false; progressed = true; }
                }
            }
            if (!progressed && !q.length) return true;
        }
    }
    function start(givens) {
        const s = newState(), q = [];
        for (let i = 0; i < n; i++) if (givens[i] >= 0 && !assign(s, i, givens[i], q)) return null;
        if (!propagate(s, q)) return null;
        return s;
    }
    function eliminate(s, i, c) {
        s.dom[i] &= ~(1 << c);
        if (s.dom[i] === 0) return false;
        const q = [];
        if (POP[s.dom[i]] === 1) q.push(i);
        return propagate(s, q);
    }
    function count(givens, _c, cap, nodeLimit, rng) {
        const s0 = start(givens);
        if (!s0) return { found: 0, aborted: false, nodes: 0, first: null };
        let found = 0, nodes = 0, aborted = false, first = null;
        (function dfs(s) {
            if (found >= cap || aborted) return;
            if (++nodes > nodeLimit) { aborted = true; return; }
            if (s.assigned === n) { if (!found) first = s.col.slice(); found++; return; }
            /* 跟六角著色的引擎同樣：有 rng 時，同分的格子與顏色順序都隨機（比較兩邊才公平） */
            let best = -1, bs = 99, ties = 0;
            for (let i = 0; i < n; i++) if (s.col[i] === -1) {
                const p = POP[s.dom[i]];
                if (p < bs) { bs = p; best = i; ties = 1; }
                else if (rng && p === bs) { ties++; if (rng() * ties < 1) best = i; }
            }
            const d = s.dom[best];
            const cs = [];
            for (let c = 0; c < k; c++) if ((d >> c) & 1) cs.push(c);
            if (rng) shuffle(cs, rng);
            for (const c of cs) {
                const t = clone(s), q = [];
                if (assign(t, best, c, q) && propagate(t, q)) dfs(t);
                if (found >= cap || aborted) return;
            }
        })(s0);
        return { found, aborted, nodes, first };
    }
    return { n, k, POP, newState, clone, assign, propagate, start, eliminate, count };
}

/* ───────── 難度量尺 ───────── */
/* 在狀態 s 上找一個「depth 層假設就能排除的候選色」。找到就排除並回傳 true。
   矛盾（整個狀態不可能）回傳 'dead'。deadline 是時間上限（超過丟例外）。 */
function closure(E, s, d, deadline) {
    /* 在 s 上反覆做 d 層假設直到沒有新排除；回傳 false＝s 本身矛盾 */
    for (;;) {
        const r = stepAt(E, s, d, deadline);
        if (r === 'dead') return false;
        if (!r) return true;
        if (s.assigned === E.n) return true;
    }
}
function stepAt(E, s, d, deadline) {
    if (Date.now() > deadline) throw new Error('budget');
    for (let i = 0; i < E.n; i++) {
        if (s.col[i] !== -1) continue;
        for (let c = 0; c < E.k; c++) {
            if (!((s.dom[i] >> c) & 1)) continue;
            const t = E.clone(s), q = [];
            let ok = E.assign(t, i, c, q) && E.propagate(t, q);
            if (ok && d > 1 && t.assigned < E.n) {
                /* 更深一層：先把淺層的都做完，才算這個假設「活著」 */
                for (let dd = 1; dd < d && ok; dd++) ok = closure(E, t, dd, deadline);
            }
            if (!ok) {
                if (!E.eliminate(s, i, c)) return 'dead';
                return true;
            }
        }
    }
    return false;
}
/* 評分。回傳 { solved, depth, uses:[,D1,D2,D3..], l0: 規則直推填了幾格, assignedStart, timedOut } */
function rate(E, givens, counts, opts) {
    opts = opts || {};
    const maxDepth = opts.maxDepth === undefined ? 3 : opts.maxDepth;
    const deadline = Date.now() + (opts.ms || 20000);
    const s = E.start(givens, counts);
    if (!s) return { solved: false, contradiction: true };
    let clues = 0;
    for (let i = 0; i < E.n; i++) if (givens[i] >= 0) clues++;
    const l0 = s.assigned - clues;
    const uses = new Array(maxDepth + 1).fill(0);
    let depth = 0, timedOut = false, stuck = false;
    try {
        while (s.assigned < E.n) {
            let progressed = false;
            for (let d = 1; d <= maxDepth; d++) {
                const r = stepAt(E, s, d, deadline);
                if (r === 'dead') return { solved: false, contradiction: true };
                if (r) { uses[d]++; if (d > depth) depth = d; progressed = true; break; }
            }
            if (!progressed) { stuck = true; break; }
        }
    } catch (e) {
        if (e.message !== 'budget') throw e;
        timedOut = true;
    }
    return { solved: s.assigned === E.n, depth, uses, l0, clues, assignedEnd: s.assigned, timedOut, stuck, col: s.col };
}

/* ───────── 小工具 ───────── */
function shuffle(a, rng) {
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
}
function tally(col, k) { const c = new Array(k).fill(0); for (const x of col) c[x]++; return c; }
function hexPatch(R) {
    const cells = [];
    for (let r = -R; r <= R; r++) for (let q = -R; q <= R; q++) if (Math.abs(q + r) <= R) cells.push([q, r]);
    return cells;
}
function largestComponent(cells) {
    const G = Core.buildGraph(cells), seen = new Uint8Array(G.n);
    let best = [];
    for (let s = 0; s < G.n; s++) if (!seen[s]) {
        const comp = [s]; seen[s] = 1;
        for (let h = 0; h < comp.length; h++) for (const j of G.nbrs[comp[h]]) if (!seen[j]) { seen[j] = 1; comp.push(j); }
        if (comp.length > best.length) best = comp;
    }
    return best.map(i => cells[i]);
}
/* 隨機合法著色（可用權重做出不平均的數量） */
function randomColoring(G, k, weights, rng) {
    const n = G.n, nb = G.nbrs;
    for (let attempt = 0; attempt < 30; attempt++) {
        const order = [], seen = new Uint8Array(n), start = Math.floor(rng() * n), queue = [start];
        seen[start] = 1;
        while (queue.length) {
            const i = queue.splice(Math.floor(rng() * queue.length), 1)[0];
            order.push(i);
            for (const j of nb[i]) if (!seen[j]) { seen[j] = 1; queue.push(j); }
        }
        const col = new Int8Array(n).fill(-1);
        let nodes = 0;
        const dfs = t => {
            if (t === n) return true;
            if (++nodes > 200000) return false;
            const v = order[t];
            let forbid = 0;
            for (const j of nb[v]) if (col[j] >= 0) forbid |= 1 << col[j];
            const cand = [];
            for (let c = 0; c < k; c++) if (!((forbid >> c) & 1)) cand.push([-Math.log(rng()) / weights[c], c]);
            cand.sort((a, b) => a[0] - b[0]);
            for (const pr of cand) { col[v] = pr[1]; if (dfs(t + 1)) return true; col[v] = -1; }
            return false;
        };
        if (dfs(0)) return col;
    }
    return null;
}
/* 從完整解開始，隨機順序拿掉預填格，保持唯一解。回傳 { givens, aborted } */
function minimizeClues(E, sol, counts, rng, nodeLimit, startGivens) {
    const g = startGivens ? Int8Array.from(startGivens) : Int8Array.from(sol);
    const order = shuffle(Array.from({ length: E.n }, (_, i) => i), rng);
    let aborted = 0;
    for (const i of order) {
        if (g[i] < 0) continue;
        const keep = g[i]; g[i] = -1;
        const r = E.count(g, counts, 2, nodeLimit);
        if (r.aborted) aborted++;
        if (r.found !== 1 || r.aborted) g[i] = keep;
    }
    return { givens: g, aborted };
}
function clueCount(g) { let c = 0; for (const x of g) if (x >= 0) c++; return c; }
function nodesStats(E, givens, counts, rng, runs, limit) {
    const a = [];
    for (let t = 0; t < runs; t++) {
        const r = E.count(givens, counts, 2, limit, rng);
        a.push(r.aborted ? limit : r.nodes);
    }
    a.sort((x, y) => x - y);
    return { median: a[Math.floor(a.length / 2)], max: a[a.length - 1], min: a[0] };
}

module.exports = { Core, makeEngine, sudokuEngine, rate, closure, stepAt, shuffle, tally, hexPatch, largestComponent, randomColoring, minimizeClues, clueCount, nodesStats };
