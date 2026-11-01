// 原創篇：擺擺看類的出題實測（唯一解比例、最少提示數、存不存在）
// 執行：node exp_place.cjs
'use strict';
let SEED = 1101; function rnd() { SEED = (SEED * 1103515245 + 12345) & 0x7fffffff; return SEED / 0x7fffffff; }
function ri(a, b) { return a + Math.floor(rnd() * (b - a + 1)); }
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function pct(a, b) { return (100 * a / b).toFixed(1) + '%'; }
function perms(arr) { if (arr.length <= 1) return [arr.slice()]; const out = []; arr.forEach((x, i) => { const rest = arr.slice(0, i).concat(arr.slice(i + 1)); perms(rest).forEach(p => out.push([x].concat(p))); }); return out; }

// ───────── 534 圓桌吃水餃：每個人說「我左右兩個人一共吃了幾個」，反推每個人吃幾個 ─────────
function dumplings() {
    console.log('\n=== 圓桌吃水餃（dumplings）：圍成一圈的「左右鄰居和」能不能反推 ===');
    const rank = (M) => { const A = M.map(r => r.slice()); let rk = 0; const n = A.length, m = A[0].length; for (let c = 0; c < m && rk < n; c++) { let p = -1; for (let r = rk; r < n; r++) if (Math.abs(A[r][c]) > 1e-9) { p = r; break; } if (p < 0) continue; [A[rk], A[p]] = [A[p], A[rk]]; for (let r = 0; r < n; r++) if (r !== rk) { const f = A[r][c] / A[rk][c]; for (let k = 0; k < m; k++) A[r][k] -= f * A[rk][k]; } rk++; } return rk; };
    const out = [];
    for (let n = 3; n <= 12; n++) { const M = [...Array(n)].map((_, i) => [...Array(n)].map((_, j) => ((j === (i + 1) % n || j === (i + n - 1) % n) ? 1 : 0))); const r = rank(M); out.push(`${n} 人：${r === n ? '唯一' : '少 ' + (n - r) + ' 個條件'}`); }
    console.log(out.join('、'));
    // 少條件時（4、8、12 人），加上「每人吃 1～15 個」的範圍後，答案還剩幾種？
    for (const n of [4, 8]) {
        let tot = 0, uniq = 0;
        for (let t = 0; t < 2000; t++) {
            const x = [...Array(n)].map(() => ri(1, 15)); const s = x.map((_, i) => x[(i + 1) % n] + x[(i + n - 1) % n]);
            // 解空間：x 加上 (a,b,−a,−b,…) 型的零空間；直接列舉 a,b
            let cnt = 0; for (let a = -15; a <= 15; a++) for (let b = -15; b <= 15; b++) { const y = x.map((v, i) => v + [a, b, -a, -b][i % 4]); if (y.every(v => v >= 1 && v <= 15)) cnt++; }
            tot++; if (cnt === 1) uniq++;
        }
        console.log(`${n} 人時只靠範圍 1～15 就唯一：${pct(uniq, tot)}（所以 4 的倍數人數要多給條件）`);
    }
}

// ───────── 533 站牌放哪：只告訴你「任兩站之間的距離」清單，排出站牌位置 ─────────
function busstops() {
    console.log('\n=== 站牌放哪（busstops）：兩兩距離清單能不能唯一決定站牌（左右顛倒算同一個）===');
    const solveAll = (D, n) => {
        // 經典回溯：每次把剩下最大的距離放在左端或右端
        const total = Math.max(...D); const res = []; const ms = new Map(); D.forEach(d => ms.set(d, (ms.get(d) || 0) + 1));
        const pts = [0, total]; const take = (d) => { const c = ms.get(d) || 0; if (!c) return false; ms.set(d, c - 1); return true; };
        const give = d => ms.set(d, (ms.get(d) || 0) + 1);
        take(total);
        const rec = () => {
            if (pts.length === n) { res.push(pts.slice().sort((a, b) => a - b).join(',')); return; }
            let mx = -1; for (const [d, c] of ms) if (c > 0 && d > mx) mx = d;
            for (const y of [mx, total - mx]) {
                const used = []; let ok = true;
                for (const p of pts) { const d = Math.abs(p - y); if (take(d)) used.push(d); else { ok = false; break; } }
                if (ok) { pts.push(y); rec(); pts.pop(); }
                used.forEach(give);
                if (mx === total - mx) break;
            }
        };
        rec();
        const norm = new Set(res.map(s => { const a = s.split(',').map(Number); const b = a.map(v => total - v).sort((x, y) => x - y).join(','); return s < b ? s : b; }));
        return norm.size;
    };
    for (const [n, M] of [[4, 12], [5, 15], [6, 20], [7, 25]]) {
        let tot = 0, uniq = 0;
        for (let t = 0; t < 1500; t++) {
            const set = new Set([0, M]); while (set.size < n) set.add(ri(1, M - 1));
            const p = [...set]; const D = []; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) D.push(Math.abs(p[i] - p[j]));
            tot++; if (solveAll(D, n) === 1) uniq++;
        }
        console.log(`${n} 站、路長 ${M}：唯一 ${pct(uniq, tot)}`);
    }
}

// ───────── 536 價格標錯了：價格標籤全被貼錯位置，每張都貼到「隔壁（上下左右）」的商品上 ─────────
// 已知：每層（橫排）正確總價、每一直行正確總價。看「每張都錯」＋「只錯到隔壁」＋兩種總價，能不能唯一還原
function pricetags() {
    console.log('\n=== 價格標錯了（pricetags）：貨架上的標籤都被貼到隔壁（上下左右）===');
    // 註：3×3 這種奇數格的貨架「每張都貼到隔壁」根本不可能（棋盤黑白格數 5≠4），所以只測偶數格
    for (const [R, C] of [[2, 3], [2, 4], [3, 4]]) {
        const N = R * C;
        const adj = i => { const r = Math.floor(i / C), c = i % C, a = []; if (r > 0) a.push(i - C); if (r < R - 1) a.push(i + C); if (c > 0) a.push(i - 1); if (c < C - 1) a.push(i + 1); return a; };
        // 用回溯列出所有「每個位置都換到隔壁」的排列
        const derAdj = [], p = Array(N), used = Array(N).fill(false);
        const gen = i => { if (i === N) { derAdj.push(p.slice()); return; } for (const q of adj(i)) if (!used[q]) { used[q] = true; p[i] = q; gen(i + 1); used[q] = false; } };
        gen(0);
        for (const [mode, lo, hi, step] of [['只給橫排總價', 20, 200, 5], ['橫排＋直行總價', 20, 200, 5]]) {
            let tot = 0, uniq = 0, solsSum = 0;
            for (let t = 0; t < 400; t++) {
                const price = [...Array(N)].map(() => lo + step * ri(0, Math.floor((hi - lo) / step)));
                const rowS = [...Array(R)].map((_, r) => price.slice(r * C, r * C + C).reduce((a, b) => a + b, 0));
                const colS = [...Array(C)].map((_, c) => { let s = 0; for (let r = 0; r < R; r++) s += price[r * C + c]; return s; });
                const cur = derAdj[ri(0, derAdj.length - 1)]; // 標籤 i（屬於位置 i）現在貼在 cur[i]
                const shown = Array(N); for (let i = 0; i < N; i++) shown[cur[i]] = price[i]; // 位置 j 上看到的數字
                const seen = new Set();
                for (const q of derAdj) { // 試：位置 j 的標籤其實屬於 q[j]
                    const arr = Array(N); for (let j = 0; j < N; j++) arr[q[j]] = shown[j];
                    let ok = true; for (let r = 0; r < R && ok; r++) { let s = 0; for (let c = 0; c < C; c++) s += arr[r * C + c]; if (s !== rowS[r]) ok = false; }
                    if (ok && mode !== '只給橫排總價') for (let c = 0; c < C && ok; c++) { let s = 0; for (let r = 0; r < R; r++) s += arr[r * C + c]; if (s !== colS[c]) ok = false; }
                    if (ok) seen.add(arr.join(','));
                }
                tot++; solsSum += seen.size; if (seen.size === 1) uniq++;
            }
            console.log(`${R}×${C}、${mode}、價格 ${lo}～${hi}：唯一 ${pct(uniq, tot)}｜平均解數 ${(solsSum / tot).toFixed(2)}｜「都貼到隔壁」的貼法共 ${derAdj.length} 種`);
        }
    }
}

// ───────── 538 疊箱子：越下面越重、越右邊越重（標準楊表），露出幾個重量就能唯一 ─────────
function boxstack() {
    console.log('\n=== 疊箱子（boxstack）：最少要露出幾箱的重量才唯一 ===');
    for (const [R, C] of [[2, 3], [3, 3], [2, 4], [3, 4]]) {
        const n = R * C, all = [];
        const grid = Array(n).fill(0);
        const rec = (k) => { // 依序放 1..n：放 k 的格子要「上面和左邊都已經放了」
            if (k > n) { all.push(grid.slice()); return; }
            for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) { const i = r * C + c; if (grid[i]) continue; if (r > 0 && !grid[i - C]) continue; if (c > 0 && !grid[i - 1]) continue; grid[i] = k; rec(k + 1); grid[i] = 0; }
        };
        rec(1);
        const dist = {}; const trials = Math.min(200, all.length);
        for (let t = 0; t < trials; t++) {
            const T = all[ri(0, all.length - 1)];
            let best = n;
            for (let m = 0; m < (1 << n); m++) {
                const cnt = m.toString(2).split('1').length - 1; if (cnt >= best) continue;
                let matches = 0; for (const U of all) { let ok = true; for (let i = 0; i < n; i++) if ((m >> i & 1) && U[i] !== T[i]) { ok = false; break; } if (ok && ++matches > 1) break; }
                if (matches === 1) best = cnt;
            }
            dist[best] = (dist[best] || 0) + 1;
        }
        console.log(`${R}×${C}：所有擺法 ${all.length} 種｜最少露出箱數分布 ${JSON.stringify(dist)}`);
    }
}

// ───────── 539 扁擔挑擔：每一排、每一列都要「左右力矩平衡」的拉丁方陣存在嗎 ─────────
function pole() {
    console.log('\n=== 扁擔挑擔（pole）：每排每列都平衡的方陣 ===');
    for (const n of [4, 5, 6, 7]) {
        const pos = [...Array(n)].map((_, i) => 2 * i - (n - 1)); // 左右對稱的掛鉤位置（偶數 n 用 −3,−1,1,3）
        const rows = perms([...Array(n)].map((_, i) => i + 1)).filter(p => p.reduce((s, v, i) => s + v * pos[i], 0) === 0);
        // 數拉丁方陣：每排取自 rows，每列也要平衡
        let squares = 0; const colOk = sq => { for (let c = 0; c < n; c++) { let s = 0; const seen = new Set(); for (let r = 0; r < n; r++) { s += sq[r][c] * pos[r]; seen.add(sq[r][c]); } if (s !== 0 || seen.size !== n) return false; } return true; };
        const cap = 2e6; let steps = 0;
        const rec = (sq) => { if (++steps > cap) return; if (sq.length === n) { if (colOk(sq)) squares++; return; } for (const r of rows) { let ok = true; for (const prev of sq) for (let c = 0; c < n; c++) if (prev[c] === r[c]) { ok = false; break; } if (ok) rec(sq.concat([r])); } };
        if (rows.length >= n) rec([]);
        console.log(`${n}×${n}：平衡的一排有 ${rows.length} 種｜每排每列都平衡的拉丁方陣 ${squares} 個${steps > cap ? '（只搜了一部分）' : ''}`);
    }
}

// ───────── 544 敬酒幾次：每個人說自己跟幾個人互敬，畫出誰敬誰（度數序列唯一實現） ─────────
function toasts() {
    console.log('\n=== 敬酒幾次（toasts）：只靠「每人敬了幾個人」能不能唯一決定誰敬誰 ===');
    for (const n of [4, 5, 6]) {
        const E = []; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) E.push([i, j]);
        const byDeg = new Map();
        for (let m = 0; m < (1 << E.length); m++) { const d = Array(n).fill(0); E.forEach(([a, b], k) => { if (m >> k & 1) { d[a]++; d[b]++; } }); const key = d.join(','); byDeg.set(key, (byDeg.get(key) || 0) + 1); }
        let uniqGraphs = 0, total = 1 << E.length, uniqSeq = 0;
        for (const [, c] of byDeg) if (c === 1) { uniqGraphs++; uniqSeq++; }
        console.log(`${n} 人：所有可能的敬酒關係 ${total} 種｜只靠次數就唯一的 ${uniqGraphs} 種（${pct(uniqGraphs, total)}）`);
    }
}

// ───────── 537 分菜一樣多：9 道菜分給 3 桌，每桌 3 道、價錢總和一樣 ─────────
function sharedish() {
    console.log('\n=== 分菜一樣多（sharedish）===');
    for (const [n, g, lo, hi] of [[6, 2, 10, 60], [9, 3, 10, 60], [9, 3, 50, 300], [12, 3, 10, 60]]) {
        let tot = 0, uniq = 0, none = 0;
        const per = n / g;
        for (let t = 0; t < 600; t++) {
            // 先造答案：隨機分成 g 組，每組總和相同（最後一道用補差）
            const target = ri(lo * per + 10, hi * per - 10); let v = [], ok = true;
            for (let k = 0; k < g && ok; k++) { let rest = target; const grp = []; for (let j = 0; j < per - 1; j++) { const x = ri(lo, hi); grp.push(x); rest -= x; } if (rest < lo || rest > hi) ok = false; grp.push(rest); v = v.concat(grp); }
            if (!ok) { t--; continue; }
            // 數分法（組與組不分順序）
            const used = Array(n).fill(false); let cnt = 0;
            const rec = (left) => { if (left === 0) { cnt++; return; } const first = used.indexOf(false); used[first] = true; const pick = (start, k, sum, sel) => { if (k === per - 1) { if (sum === target) { sel.forEach(i => used[i] = true); rec(left - 1); sel.forEach(i => used[i] = false); } return; } for (let i = start; i < n; i++) if (!used[i]) { sel.push(i); pick(i + 1, k + 1, sum + v[i], sel); sel.pop(); } }; pick(first + 1, 0, v[first], []); used[first] = false; };
            rec(g); tot++; if (cnt === 1) uniq++; if (cnt === 0) none++;
        }
        console.log(`${n} 道分 ${g} 桌、價錢 ${lo}～${hi}：唯一分法 ${pct(uniq, tot)}`);
    }
}

// ───────── 扁擔挑擔改版：K 根扁擔、每根 4 個掛鉤（−2,−1,+1,+2），把 4K 個不同重量的籃子掛上，每根都平衡 ─────────
function poleV2() {
    console.log('\n=== 扁擔挑擔改版（不要求拉丁方陣，只要每根扁擔平衡）===');
    const combos = (arr, k) => { if (k === 0) return [[]]; const out = []; for (let i = 0; i <= arr.length - k; i++) combos(arr.slice(i + 1), k - 1).forEach(c => out.push([arr[i]].concat(c))); return out; };
    const P4 = perms([0, 1, 2, 3]);
    const ways = g => { let c = 0; for (const p of P4) { const [a, b, cc, d] = p.map(i => g[i]); if (-2 * a - b + cc + 2 * d === 0) c++; } return c / 2; }; // 左右鏡像算同一種
    for (const [K, lo, hi] of [[2, 1, 12], [2, 1, 20], [3, 1, 20]]) {
        let tot = 0, uniq = 0, tries = 0;
        while (tot < 300 && tries < 100000) {
            tries++; const s = new Set(); while (s.size < 4 * K) s.add(ri(lo, hi)); const w = [...s];
            const rec = rest => { if (!rest.length) return 1; const f = rest[0]; let sum = 0; for (const c of combos(rest.slice(1), 3)) { const g = [f].concat(c); const wy = ways(g); if (!wy) continue; sum += wy * rec(rest.filter(x => !g.includes(x))); } return sum; };
            const total = rec(w); if (!total) continue; tot++; if (total === 1) uniq++;
        }
        console.log(`${K} 根扁擔、重量 ${lo}～${hi}：有解的題目中唯一 ${pct(uniq, tot)}`);
    }
}

const only = process.argv[2]; const all = { dumplings, busstops, pricetags, boxstack, pole, poleV2, toasts, sharedish };
for (const k in all) if (!only || only.split(',').includes(k)) all[k]();
