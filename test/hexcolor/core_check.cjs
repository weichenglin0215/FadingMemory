/* 六角著色核心（js/hexcolor_core.js）的自動檢查
   執行：node test/hexcolor/core_check.cjs
   檢查項目：
     1. 形狀：格數正確、不重複、連通；統計「緊密度有沒有達標」與平均鄰居數
     2. 產生盤面：解合法（相鄰不同色、各色格數剛好）、預填來自解、預填格數正確、時間
     3. 解題器：與暴力列舉的解數一致（小盤面）
     4. 邊界情況：預填 0／全部、每色 1 格、數量過於極端 */
'use strict';
var Core = require('../../js/hexcolor_core.js');

var failures = 0;
function check(cond, msg) {
    if (!cond) { failures++; console.log('  ✗ 失敗：' + msg); }
}
function rngOf(seed) { return Core.makeRng(seed); }

/* ── 1. 形狀 ── */
console.log('【1】形狀：格數／連通／緊密度達成率');
var rng = rngOf(1);
[1, 2, 3].forEach(function (c) {
    var line = '  緊密度 ' + c + '：';
    [4, 8, 12, 24, 36, 60].forEach(function (n) {
        var ok = 0, sumAvg = 0, trials = 150, sumMin = 0;
        for (var t = 0; t < trials; t++) {
            var sh = Core.makeShape(n, c, rng);
            check(sh.cells.length === n, '格數不對 n=' + n);
            var keys = new Set(sh.cells.map(function (p) { return p[0] + ',' + p[1]; }));
            check(keys.size === n, '有重複格 n=' + n);
            /* 連通：從第一格走一遍 */
            var G = Core.buildGraph(sh.cells), seen = new Set([0]), st = [0];
            while (st.length) { var x = st.pop(); G.nbrs[x].forEach(function (y) { if (!seen.has(y)) { seen.add(y); st.push(y); } }); }
            check(seen.size === n, '形狀不連通 n=' + n + ' c=' + c);
            if (sh.below === 0) ok++;
            sumAvg += sh.avgDeg; sumMin += sh.minDeg;
        }
        line += 'N=' + n + ' 達標' + Math.round(100 * ok / trials) + '% 平均鄰居' + (sumAvg / trials).toFixed(2) + '(最小' + (sumMin / trials).toFixed(1) + ')  ';
    });
    console.log(line);
});

/* ── 2. 產生盤面 ── */
console.log('【2】產生盤面：解是否合法、預填是否來自解');
function validate(res, N, prefill, counts, label) {
    var nb = res.nbrs, sol = res.solution, bad = false;
    for (var i = 0; i < N; i++) for (var j = 0; j < nb[i].length; j++) if (sol[i] === sol[nb[i][j]]) bad = true;
    check(!bad, label + ' 解裡有相鄰同色');
    var cnt = counts.map(function () { return 0; });
    for (var i2 = 0; i2 < N; i2++) cnt[sol[i2]]++;
    check(cnt.join() === counts.join(), label + ' 各色格數不符 解=' + cnt + ' 要求=' + counts);
    var g = 0;
    for (var i3 = 0; i3 < N; i3++) if (res.givens[i3] >= 0) { g++; check(res.givens[i3] === sol[i3], label + ' 預填與解不一致'); }
    check(g === prefill, label + ' 預填格數不對 ' + g + ' vs ' + prefill);
}
var rng2 = rngOf(7), total = 0, okCount = 0, maxMs = 0, fails = {};
var configs = [];
[2, 3, 4, 5, 6, 8].forEach(function (k) {
    [8, 12, 18, 24, 36, 48, 60].forEach(function (N) {
        if (N < k) return;
        [1, 2, 3].forEach(function (c) { configs.push([k, N, c]); });
    });
});
configs.forEach(function (cfg) {
    var k = cfg[0], N = cfg[1], c = cfg[2];
    for (var rep = 0; rep < 3; rep++) {
        /* 隨機（不平均）的各色格數：每色至少 1，其餘隨機分配 */
        var counts = []; for (var i = 0; i < k; i++) counts.push(1);
        for (var left = N - k; left > 0; left--) counts[Math.floor(rng2() * k)]++;
        var prefill = Math.floor(rng2() * (N / 3));
        var t0 = Date.now();
        var res = Core.generate({ counts: counts, prefill: prefill, compact: c }, { rng: rng2 });
        var ms = Date.now() - t0; if (ms > maxMs) maxMs = ms;
        total++;
        if (res.ok) { okCount++; validate(res, N, prefill, counts, 'k=' + k + ' N=' + N + ' c=' + c); }
        else { var key = 'k=' + k; fails[key] = (fails[key] || 0) + 1; check(res.cells.length === N && res.nbrs.length === N, '失敗時應附上形狀'); }
    }
});
console.log('  隨機（不平均）數量共 ' + total + ' 組：找到解 ' + okCount + ' 組；最久 ' + maxMs + ' ms');
console.log('  找不到解的分布（依色數）：' + JSON.stringify(fails));
/* 平均分配的數量：k=4、5 色幾乎都該有解 */
var balOk = 0, balTotal = 0, balMax = 0;
[[4, 24], [4, 36], [4, 48], [5, 30], [5, 45], [6, 36]].forEach(function (kn) {
    var k = kn[0], N = kn[1];
    [1, 2, 3].forEach(function (c) {
        for (var rep = 0; rep < 8; rep++) {
            var counts = []; for (var i = 0; i < k; i++) counts.push(Math.floor(N / k) + (i < N % k ? 1 : 0));
            var t0 = Date.now();
            var res = Core.generate({ counts: counts, prefill: Math.floor(N / 5), compact: c }, { rng: rng2 });
            balMax = Math.max(balMax, Date.now() - t0);
            balTotal++; if (res.ok) { balOk++; validate(res, N, Math.floor(N / 5), counts, 'bal'); }
        }
    });
});
console.log('  平均分配的數量共 ' + balTotal + ' 組：找到解 ' + balOk + ' 組；最久 ' + balMax + ' ms');
check(balOk === balTotal, '平均分配的數量應該都找得到解');

/* ── 3. 解題器 vs 暴力列舉 ── */
console.log('【3】解題器對照暴力列舉');
function brute(G, k, counts, givens) {
    var n = G.n, col = new Int8Array(n).fill(-1), cnt = counts.map(function () { return 0; }), total = 0;
    (function dfs(v) {
        if (v === n) { for (var c = 0; c < k; c++) if (cnt[c] !== counts[c]) return; total++; return; }
        for (var c2 = 0; c2 < k; c2++) {
            if (givens[v] >= 0 && givens[v] !== c2) continue;
            if (cnt[c2] >= counts[c2]) continue;
            var bad = false;
            for (var t = 0; t < G.nbrs[v].length; t++) if (G.nbrs[v][t] < v && col[G.nbrs[v][t]] === c2) bad = true;
            if (bad) continue;
            col[v] = c2; cnt[c2]++; dfs(v + 1); cnt[c2]--; col[v] = -1;
        }
    })(0);
    return total;
}
var rng3 = rngOf(99), bt = 0, bbad = 0;
for (var t = 0; t < 120; t++) {
    var k3 = 3 + Math.floor(rng3() * 2), n3 = 6 + Math.floor(rng3() * 6);
    var sh = Core.makeShape(n3, 1 + Math.floor(rng3() * 3), rng3), G3 = Core.buildGraph(sh.cells);
    var cs = []; for (var q = 0; q < k3; q++) cs.push(1);
    for (var l = n3 - k3; l > 0; l--) cs[Math.floor(rng3() * k3)]++;
    var gv = new Int8Array(n3).fill(-1);
    if (rng3() < 0.5) gv[Math.floor(rng3() * n3)] = Math.floor(rng3() * k3);
    var sv = Core.makeSolver(G3, k3);
    var a = sv.search(gv, cs, { cap: 1e9, nodeLimit: 1e9 }).found, b = brute(G3, k3, cs, gv);
    bt++; if (a !== b) { bbad++; console.log('  解數不符 解題器=' + a + ' 暴力=' + b); }
}
check(bbad === 0, '解題器與暴力列舉不一致 ' + bbad + ' 組');
console.log('  比對 ' + bt + ' 組，不符 ' + bbad + ' 組');

/* ── 4. 邊界情況 ── */
console.log('【4】邊界情況');
var rng4 = rngOf(5);
var r0 = Core.generate({ counts: [6, 6, 6, 6], prefill: 0, compact: 2 }, { rng: rng4 });
check(r0.ok && r0.givens.every(function (v) { return v < 0; }), '預填 0 格');
var rAll = Core.generate({ counts: [6, 6, 6, 6], prefill: 24, compact: 2 }, { rng: rng4 });
check(rAll.ok && rAll.givens.every(function (v) { return v >= 0; }) && rAll.solCount === 1 && rAll.propSolvable, '預填全部：唯一解且可推理');
var rOne = Core.generate({ counts: [1, 1, 1, 1, 1], prefill: 0, compact: 3 }, { rng: rng4 });
check(rOne.ok, '每色 1 格（5 格 5 色）');
var rBig = Core.generate({ counts: [20, 1, 1, 1], prefill: 0, compact: 2 }, { rng: rng4 });
check(!rBig.ok && rBig.reason.indexOf('上限') >= 0, '某色 20/23 應判定超過上限，實際：' + (rBig.ok ? '有解' : rBig.reason));
var r3 = Core.generate({ counts: [8, 8, 8], prefill: 0, compact: 3 }, { rng: rng4 });
console.log('  3 色各 8 格、緊密度 3：' + (r3.ok ? '找到解（' + r3.attempts + ' 個形狀）' : '找不到（' + r3.reason + '）') + '（3 色在六角盤面幾乎被鎖死，找不到是正常的）');
check(Core.maxIndependent(Core.buildGraph(Core.makeShape(19, 3, rng4).cells), 1e6) !== undefined, '最大獨立集可計算');

console.log(failures === 0 ? '\n全部通過' : '\n共 ' + failures + ' 項失敗');
process.exit(failures === 0 ? 0 : 1);
