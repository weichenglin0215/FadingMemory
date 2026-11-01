/* 數獨引擎（純函式部分）：幾何、解題計數、技巧推理器、出題器。UI 另外接。 */
(function (root) {
    'use strict';
    var SL = {};

    function bitCount(m) { var c = 0; while (m) { m &= m - 1; c++; } return c; }
    function lowDigit(m) { for (var d = 1; d <= 16; d++) if (m === (1 << d)) return d; return 0; }
    function shuffle(a, rand) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rand() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

    /* ═══ 幾何：宮是 boxR 排 × boxC 欄（4×4＝2×2、6×6＝2×3、9×9＝3×3）═══ */
    SL.geom = function (boxR, boxC) {
        var N = boxR * boxC, g = { R: boxR, C: boxC, N: N, cells: N * N, ALL: 0, units: [], peers: [], unitsOf: [] }, i, j;
        for (i = 1; i <= N; i++) g.ALL |= (1 << i);
        g.rowOf = function (c) { return Math.floor(c / N); };
        g.colOf = function (c) { return c % N; };
        g.boxOf = function (c) { return Math.floor(g.rowOf(c) / boxR) * (N / boxC) + Math.floor(g.colOf(c) / boxC); };
        var rows = [], cols = [], boxes = [];
        for (i = 0; i < N; i++) { rows.push([]); cols.push([]); boxes.push([]); }
        for (i = 0; i < N * N; i++) { rows[g.rowOf(i)].push(i); cols[g.colOf(i)].push(i); boxes[g.boxOf(i)].push(i); }
        g.rows = rows; g.cols = cols; g.boxes = boxes;
        g.units = rows.concat(cols, boxes);
        for (i = 0; i < N * N; i++) {
            var p = [], us = [];
            for (j = 0; j < g.units.length; j++) if (g.units[j].indexOf(i) >= 0) us.push(j);
            g.unitsOf.push(us);
            for (j = 0; j < N * N; j++) if (j !== i && (g.rowOf(j) === g.rowOf(i) || g.colOf(j) === g.colOf(i) || g.boxOf(j) === g.boxOf(i))) p.push(j);
            g.peers.push(p);
        }
        return g;
    };

    /* ═══ 回溯法：最多數到 limit 個解；random 有給就用亂數順序試（造完整盤用）═══ */
    SL.solve = function (g, givens, limit, rand) {
        var N = g.N, cells = g.cells, grid = givens.slice(), cand = new Array(cells), found = 0, first = null, i;
        function ok() { return true; }
        for (i = 0; i < cells; i++) cand[i] = g.ALL;
        for (i = 0; i < cells; i++) if (grid[i]) {
            if (!(cand[i] & (1 << grid[i]))) return { count: 0, solution: null };
            cand[i] = 1 << grid[i];
            for (var k = 0; k < g.peers[i].length; k++) { var p = g.peers[i][k]; if (grid[p] === grid[i]) return { count: 0, solution: null }; cand[p] &= ~(1 << grid[i]); }
        }
        function rec(grid, cand) {
            var best = -1, bc = 99, c;
            for (var q = 0; q < cells; q++) if (!grid[q]) { c = bitCount(cand[q]); if (c === 0) return; if (c < bc) { bc = c; best = q; if (c === 1) break; } }
            if (best < 0) { found++; if (!first) first = grid.slice(); return; }
            var ds = [];
            for (var d = 1; d <= N; d++) if (cand[best] & (1 << d)) ds.push(d);
            if (rand) ds = shuffle(ds, rand);
            for (var x = 0; x < ds.length; x++) {
                var dg = ds[x], g2 = grid.slice(), c2 = cand.slice();
                g2[best] = dg; c2[best] = 1 << dg;
                var bad = false;
                for (var y = 0; y < g.peers[best].length; y++) { var pp = g.peers[best][y]; if (!g2[pp]) { c2[pp] &= ~(1 << dg); if (!c2[pp]) { bad = true; break; } } }
                if (bad) continue;
                rec(g2, c2);
                if (found >= limit) return;
            }
        }
        rec(grid, cand);
        return { count: found, solution: first };
    };
    SL.randomSolution = function (g, rand) { return SL.solve(g, new Array(g.cells).fill(0), 1, rand).solution; };

    /* ═══ 技巧推理器 ═══
       等級 1：唯一候選（格子只剩一個數字能放）、唯一位置（單位裡某數字只剩一格能放）
       等級 2：數對（兩格只剩同兩個數字）、鎖定（某數字在宮裡只出現在同一排／欄，或在排／欄裡只出現在同一宮）
       等級 3：隱性數對、三數組、X 翼（X-Wing）
       回傳 { solved, grid, level（用到的最高等級）, used（各技巧用了幾次）}；contradiction＝推到矛盾（題目有問題） */
    SL.TECH = { single: 1, hidden: 1, nakedPair: 2, locked: 2, hiddenPair: 3, nakedTriple: 3, xwing: 3 };
    SL.logic = function (g, givens, maxLevel) {
        maxLevel = maxLevel || 1;
        var N = g.N, cells = g.cells, grid = givens.slice(), cand = new Array(cells), used = {}, level = 0, dead = false, order = [], i, d;
        for (i = 0; i < cells; i++) cand[i] = grid[i] ? (1 << grid[i]) : g.ALL;
        function use(name) { used[name] = (used[name] || 0) + 1; if (SL.TECH[name] > level) level = SL.TECH[name]; }
        var recording = false;
        function place(c, dg) {
            if (recording) order.push(c);
            grid[c] = dg; cand[c] = 1 << dg;
            for (var k = 0; k < g.peers[c].length; k++) { var p = g.peers[c][k]; if (grid[p] === dg) dead = true; if (cand[p] & (1 << dg)) { cand[p] &= ~(1 << dg); if (!cand[p]) dead = true; } }
        }
        function elim(c, mask) { if (cand[c] & mask) { cand[c] &= ~mask; if (!cand[c]) dead = true; return true; } return false; }
        for (i = 0; i < cells; i++) if (grid[i]) { var gv = grid[i]; grid[i] = 0; place(i, gv); }
        recording = true;                         /* 從這裡開始記下「推理依序填出了哪些格」（提示用） */
        function singles() {
            var did = false, c;
            for (c = 0; c < cells; c++) if (!grid[c] && bitCount(cand[c]) === 1) { place(c, lowDigit(cand[c])); use('single'); did = true; }
            for (var u = 0; u < g.units.length; u++) {
                var un = g.units[u];
                for (d = 1; d <= N; d++) {
                    var bit = 1 << d, spots = [], has = false;
                    for (var k = 0; k < un.length; k++) { if (grid[un[k]] === d) { has = true; break; } if (!grid[un[k]] && (cand[un[k]] & bit)) spots.push(un[k]); }
                    if (has) continue;
                    if (spots.length === 1) { place(spots[0], d); use('hidden'); did = true; } else if (!spots.length) dead = true;
                }
            }
            return did;
        }
        function combos(arr, k, fn) {
            var idx = [];
            (function rec(start) { if (idx.length === k) { fn(idx.map(function (x) { return arr[x]; })); return; } for (var x = start; x < arr.length; x++) { idx.push(x); rec(x + 1); idx.pop(); } })(0);
        }
        function nakedSubset(k, name) {
            var did = false;
            g.units.forEach(function (un) {
                var open = un.filter(function (c) { return !grid[c] && bitCount(cand[c]) <= k; });
                combos(open, k, function (cs) {
                    var uni = 0; cs.forEach(function (c) { uni |= cand[c]; });
                    if (bitCount(uni) !== k) return;
                    var ch = false;
                    un.forEach(function (c) { if (!grid[c] && cs.indexOf(c) < 0 && elim(c, uni)) ch = true; });
                    if (ch) { did = true; use(name); }
                });
            });
            return did;
        }
        function hiddenPair() {
            var did = false;
            g.units.forEach(function (un) {
                var pos = {}, ds = [];
                for (var dg = 1; dg <= N; dg++) {
                    var placed = un.some(function (c) { return grid[c] === dg; }); if (placed) continue;
                    var sp = un.filter(function (c) { return !grid[c] && (cand[c] & (1 << dg)); });
                    if (sp.length === 2) { pos[dg] = sp; ds.push(dg); }
                }
                combos(ds, 2, function (pr) {
                    var a = pos[pr[0]], b = pos[pr[1]];
                    if (a[0] === b[0] && a[1] === b[1]) {
                        var keep = (1 << pr[0]) | (1 << pr[1]), ch = false;
                        a.forEach(function (c) { if (cand[c] & ~keep) { cand[c] &= keep; ch = true; } });
                        if (ch) { did = true; use('hiddenPair'); }
                    }
                });
            });
            return did;
        }
        function locked() {
            var did = false;
            for (var u = 0; u < g.units.length; u++) {
                var un = g.units[u];
                for (var dg = 1; dg <= N; dg++) {
                    var bit = 1 << dg, sp = un.filter(function (c) { return !grid[c] && (cand[c] & bit); });
                    if (sp.length < 2) continue;
                    var us = g.unitsOf[sp[0]];
                    for (var x = 0; x < us.length; x++) {
                        var v = us[x]; if (v === u) continue;
                        var vu = g.units[v];
                        if (!sp.every(function (c) { return vu.indexOf(c) >= 0; })) continue;
                        var ch = false;
                        vu.forEach(function (c) { if (!grid[c] && un.indexOf(c) < 0 && elim(c, bit)) ch = true; });
                        if (ch) { did = true; use('locked'); }
                    }
                }
            }
            return did;
        }
        function xwing() {
            var did = false;
            [[g.rows, g.cols], [g.cols, g.rows]].forEach(function (pair) {
                var lines = pair[0], cross = pair[1];
                for (var dg = 1; dg <= N; dg++) {
                    var bit = 1 << dg, two = [];
                    lines.forEach(function (ln, li) {
                        var sp = ln.filter(function (c) { return !grid[c] && (cand[c] & bit); });
                        if (sp.length === 2) two.push({ li: li, sp: sp });
                    });
                    for (var a = 0; a < two.length; a++) for (var b = a + 1; b < two.length; b++) {
                        var A = two[a].sp, B = two[b].sp;
                        var ca = A.map(function (c) { return lines === g.rows ? g.colOf(c) : g.rowOf(c); }), cb = B.map(function (c) { return lines === g.rows ? g.colOf(c) : g.rowOf(c); });
                        if (ca[0] !== cb[0] || ca[1] !== cb[1]) continue;
                        var ch = false;
                        ca.forEach(function (ci) { cross[ci].forEach(function (c) { if (!grid[c] && A.indexOf(c) < 0 && B.indexOf(c) < 0 && elim(c, bit)) ch = true; }); });
                        if (ch) { did = true; use('xwing'); }
                    }
                }
            });
            return did;
        }
        var guard = 0;
        while (!dead && guard++ < 500) {
            var done = true; for (i = 0; i < cells; i++) if (!grid[i]) { done = false; break; }
            if (done) break;
            if (singles()) continue;
            if (maxLevel >= 2 && (nakedSubset(2, 'nakedPair') || locked())) continue;
            if (maxLevel >= 3 && (hiddenPair() || nakedSubset(3, 'nakedTriple') || xwing())) continue;
            break;
        }
        var solved = !dead && grid.every(function (v) { return v > 0; });
        return { solved: solved, grid: grid, level: level, used: used, dead: dead, cand: cand, order: order };
    };

    /* 提示：玩家目前填的格子裡「跟答案一樣」的才算數（填錯的當作沒填），再用推理器往下推，回傳「現在可以確定、而且玩家還沒填對」的第一格；
       沒有就回傳 -1。只標位置，不說數字、不說理由。 */
    SL.hintCell = function (g, givens, player, solution, maxLevel) {
        var base = givens.slice(), i;
        for (i = 0; i < g.cells; i++) if (!base[i] && player[i] && player[i] === solution[i]) base[i] = player[i];
        var r = SL.logic(g, base, maxLevel);
        for (i = 0; i < r.order.length; i++) if (!player[r.order[i]] || player[r.order[i]] !== solution[r.order[i]]) return r.order[i];
        for (i = 0; i < g.cells; i++) if (!player[i] || player[i] !== solution[i]) return i;
        return -1;
    };

    /* ═══ 出題：spec = { maxLevel, minLevel, floor（提示數降到這個以下就停）, tries, ms } ═══
       做法：造完整盤 → 照亂數順序一格一格挖，挖掉後「只准用 maxLevel 以內的技巧」仍然解得完才真的挖（＝免猜、而且唯一）。
       minLevel：整題至少要用到這個等級的技巧才收，否則重挖（用不到就太簡單）；試到 tries 次或 ms 毫秒還不行，就用最接近的那題。 */
    SL.make = function (g, spec, rand) {
        rand = rand || Math.random;
        var best = null, t0 = Date.now(), tr;
        for (tr = 0; tr < (spec.tries || 20); tr++) {
            var sol = SL.randomSolution(g, rand), givens = sol.slice(), count = g.cells;
            var order = shuffle(Array.apply(null, Array(g.cells)).map(function (_, i) { return i; }), rand);
            var cur = 0;
            for (var k = 0; k < order.length; k++) {
                if (count <= (spec.floor || 0) && cur >= (spec.minLevel || 0)) break;     /* 提示數夠少、而且用到的技巧夠高級，才停手 */
                var c = order[k], save = givens[c];
                givens[c] = 0;
                var r = SL.logic(g, givens, spec.maxLevel);
                if (r.solved) { count--; cur = r.level; } else givens[c] = save;
            }
            var res = SL.logic(g, givens, spec.maxLevel);
            var pz = { solution: sol, givens: givens, count: count, level: res.level, used: res.used };
            var okLevel = res.level >= (spec.minLevel || 0);
            if (okLevel && count <= (spec.maxCount || 999)) return pz;
            if (!best || (okLevel && !best.okLevel) || (okLevel === best.okLevel && (count < best.count))) { best = pz; best.okLevel = okLevel; }
            if (spec.ms && Date.now() - t0 > spec.ms) break;
        }
        return best;
    };

    root.SudokuEngine = SL;
    if (typeof module !== 'undefined' && module.exports) module.exports = SL;
})(typeof window !== 'undefined' ? window : this);
