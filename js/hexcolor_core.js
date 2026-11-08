/* ═══════════════════════════════════════════════════════════════════
   hexcolor_core.js — 六角著色：盤面產生器＋解題器（純邏輯，不碰畫面）
   ───────────────────────────────────────────────────────────────────
   遊戲規則：六角格子「相鄰的格子不可以同色」，而且每個顏色「剛好」要用掉指定的格數。
   這個檔案只負責三件事（畫面與操作在 js/hexcolor_test.js）：
     1. makeShape   ：隨機長出 n 格的形狀，緊密度 1~3 決定「每格至少貼著幾個鄰居」。
     2. makeSolver  ：解題器——找出一個合法解、數有幾個解、判斷「不用猜只靠推理」能不能解完。
     3. generate    ：把上面串起來：長形狀 → 找隱藏解 → 從隱藏解挑出預填格（保證有解）。
   為什麼預填的顏色要從「隱藏解」挑？因為亂挑顏色常常會讓盤面無解
   （實測：37 格、4 色，亂填 10 格只有約 12% 有解），從解答裡抄幾格出來就一定有解。

   【座標】六角格用「軸座標」(q, r)：q 往右、r 往右下。每格有 6 個鄰居，方向表是 DIRS。
          畫面上的位置：x = √3 × (q + r/2)，y = 1.5 × r（尖頂六角形）。
   【這個檔案怎麼被使用】
     · 網頁：<script src="js/hexcolor_core.js"> 之後，用 window.HexColorCore 取用。
     · Node 測試：const Core = require('./js/hexcolor_core.js');（檔案最後有 module.exports）
   ═══════════════════════════════════════════════════════════════════ */

/* (function (global) { ... })(window) 叫「立即執行函式」(IIFE)：
   函式寫完馬上執行一次，裡面宣告的變數只活在這個函式裡面，不會變成全域變數去污染別的 .js 檔。
   最後我們「刻意」把要公開的東西掛到 global（網頁上就是 window）上。 */
(function (global) {
    'use strict';   /* 嚴格模式：寫錯變數名稱之類的小錯誤會直接報錯，而不是默默變成怪行為 */

    /* 六個鄰居的方向（軸座標的位移量 [dq, dr]） */
    var DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]];

    /* ───────── 小工具 ───────── */

    /* 把 (q, r) 換成一個數字當「鍵」，用來放進 Set／Map 快速查「這格在不在形狀裡」。
       +512 是為了讓負數座標也變成正數；座標不會超出 ±512，所以不同格子的鍵不會撞在一起。 */
    function cellKey(q, r) { return (q + 512) * 1024 + (r + 512); }

    /* 陣列加總 */
    function sum(arr) {
        var s = 0;
        for (var i = 0; i < arr.length; i++) s += arr[i];
        return s;
    }

    /* 洗牌（Fisher–Yates）：從後面往前，每個位置跟「前面隨機一個位置」交換。
       rng 是「亂數函式」，呼叫一次回傳 0~1 之間的小數（預設 Math.random；測試時可傳固定種子的版本）。 */
    function shuffle(arr, rng) {
        for (var i = arr.length - 1; i > 0; i--) {
            var j = Math.floor(rng() * (i + 1));
            var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
        }
        return arr;
    }

    /* 加權隨機抽一個：weights[i] 越大，被抽中的機會越大。回傳被抽中的「位置」。 */
    function pickWeighted(weights, rng) {
        var total = sum(weights);
        var x = rng() * total;
        for (var i = 0; i < weights.length; i++) {
            x -= weights[i];
            if (x < 0) return i;
        }
        return weights.length - 1;
    }

    /* 可重現的亂數產生器（mulberry32）：同一個 seed 每次產生一樣的數列，測試時用。 */
    function makeRng(seed) {
        var a = seed | 0;
        return function () {
            a = (a + 0x6D2B79F5) | 0;
            var t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    /* ═══════════════════════════════════════════════════════════════
       一、形狀：隨機長出 n 格，緊密度 compact = 1 / 2 / 3
       ───────────────────────────────────────────────────────────────
       緊密度的意思：每個格子「至少」要貼著 compact 個別的格子（盡量做到）。
         1 → 形狀鬆散、像樹枝；  3 → 形狀緊實、像一團蜂窩。
       做法分兩步：
         ① 成長：從一格開始，每次從「貼著形狀的空位」裡加權抽一個。
            空位目前貼著幾格（n_in）決定權重：緊密度 1 偏愛只貼 1 格的（長出枝條），
            緊密度 3 偏愛貼 3 格的（填進凹洞，越長越圓）。
         ② 修補：成長完還是有些格子鄰居不夠（例如邊角），就把「鄰居不夠的格子」搬到
            「貼最多鄰居」的空位，搬完形狀仍然要連通；缺口總數變少或不變就接受，
            直到沒有缺口或試太多次為止。真的做不到（例如角落）就算了——只是盡量。
       ═══════════════════════════════════════════════════════════════ */

    /* 成長時的權重表：GROW_WEIGHTS[緊密度][空位貼著的格數 n_in]（n_in 從 1 到 6，第 0 格不用） */
    var GROW_WEIGHTS = {
        1: [0, 1.00, 0.30, 0.10, 0.05, 0.02, 0.02],
        2: [0, 0.25, 1.00, 0.50, 0.20, 0.10, 0.10],
        3: [0, 0.05, 0.40, 1.00, 0.60, 0.30, 0.30]
    };

    /* 修補最多試幾次（太多會拖慢，太少會修不好；35 格以內通常幾十次就修完） */
    var REPAIR_ITERATIONS = 1500;

    /* 某一格在形狀（set）裡有幾個鄰居 */
    function degreeIn(set, q, r) {
        var d = 0;
        for (var i = 0; i < 6; i++) {
            if (set.has(cellKey(q + DIRS[i][0], r + DIRS[i][1]))) d++;
        }
        return d;
    }

    /* 缺口總數：每一格「目標鄰居數 − 實際鄰居數」（不夠的才算）加起來。0 代表每格都達標。 */
    function deficiency(cells, set, target) {
        var total = 0;
        for (var i = 0; i < cells.length; i++) {
            var d = degreeIn(set, cells[i][0], cells[i][1]);
            if (d < target) total += target - d;
        }
        return total;
    }

    /* 拿掉第 skipIdx 格之後（呼叫前 set 裡已經先刪掉它），剩下的格子還連在一起嗎？
       從任一格出發一路走到所有走得到的鄰居（深度優先走訪），數走了幾格。 */
    function connectedWithout(cells, set, skipIdx) {
        if (cells.length <= 2) return true;
        var start = (skipIdx === 0) ? 1 : 0;
        var seen = new Set();
        var stack = [cells[start]];
        seen.add(cellKey(cells[start][0], cells[start][1]));
        var count = 1;
        while (stack.length) {
            var c = stack.pop();
            for (var i = 0; i < 6; i++) {
                var nq = c[0] + DIRS[i][0], nr = c[1] + DIRS[i][1];
                var k = cellKey(nq, nr);
                if (set.has(k) && !seen.has(k)) {
                    seen.add(k);
                    stack.push([nq, nr]);
                    count++;
                }
            }
        }
        return count === cells.length - 1;
    }

    /* 步驟②：修補。cells 與 set 會被直接修改。 */
    function repairShape(cells, set, target, rng) {
        if (target <= 1 || cells.length < 3) return;   /* 緊密度 1 不用修（連通就保證每格至少 1 個鄰居） */
        var gap = deficiency(cells, set, target);
        var iter = 0;
        while (gap > 0 && iter < REPAIR_ITERATIONS) {
            iter++;
            /* 找出鄰居不夠的格子，隨機挑一個 */
            var weak = [];
            for (var i = 0; i < cells.length; i++) {
                if (degreeIn(set, cells[i][0], cells[i][1]) < target) weak.push(i);
            }
            var vi = weak[Math.floor(rng() * weak.length)];
            var old = cells[vi];
            /* 先把它拿起來；拿起來之後如果形狀斷成兩塊，就放回去換下一輪 */
            set.delete(cellKey(old[0], old[1]));
            if (!connectedWithout(cells, set, vi)) {
                set.add(cellKey(old[0], old[1]));
                continue;
            }
            /* 找所有「貼著形狀的空位」，記下各自貼著幾格（用 Map：鍵→[q, r, 貼著幾格]） */
            var cand = new Map();
            for (var j = 0; j < cells.length; j++) {
                if (j === vi) continue;
                for (var d = 0; d < 6; d++) {
                    var nq = cells[j][0] + DIRS[d][0], nr = cells[j][1] + DIRS[d][1];
                    var k = cellKey(nq, nr);
                    if (set.has(k)) continue;
                    if (nq === old[0] && nr === old[1]) continue;   /* 不要放回原位 */
                    var e = cand.get(k);
                    if (e) e[2]++; else cand.set(k, [nq, nr, 1]);
                }
            }
            var list = Array.from(cand.values());
            if (!list.length) { set.add(cellKey(old[0], old[1])); continue; }
            /* 優先選「貼著的格數 ≥ 目標」的空位；都沒有就選貼得最多的 */
            var good = list.filter(function (e2) { return e2[2] >= target; });
            var pool = good;
            if (!pool.length) {
                var best = 0;
                list.forEach(function (e2) { if (e2[2] > best) best = e2[2]; });
                pool = list.filter(function (e2) { return e2[2] === best; });
            }
            var pick = pool[Math.floor(rng() * pool.length)];
            cells[vi] = [pick[0], pick[1]];
            set.add(cellKey(pick[0], pick[1]));
            var gap2 = deficiency(cells, set, target);
            if (gap2 <= gap) {
                gap = gap2;                                   /* 沒變差就接受（持平也接受，才走得出死胡同） */
            } else {                                          /* 變差了：還原 */
                set.delete(cellKey(pick[0], pick[1]));
                cells[vi] = old;
                set.add(cellKey(old[0], old[1]));
            }
        }
    }

    /* 產生形狀。回傳 { cells, minDeg, avgDeg, below, target }：
         cells  ：[[q, r], ...]（已照「由上到下、由左到右」排好）
         minDeg ：實際上最少的鄰居數；avgDeg：平均鄰居數
         below  ：有幾格的鄰居數沒達到目標；target：要求的緊密度 */
    function makeShape(n, compact, rng) {
        rng = rng || Math.random;
        var table = GROW_WEIGHTS[compact] || GROW_WEIGHTS[2];
        var set = new Set();
        var cells = [[0, 0]];
        set.add(cellKey(0, 0));
        /* ① 成長 */
        while (cells.length < n) {
            var cand = new Map();
            for (var i = 0; i < cells.length; i++) {
                for (var d = 0; d < 6; d++) {
                    var nq = cells[i][0] + DIRS[d][0], nr = cells[i][1] + DIRS[d][1];
                    var k = cellKey(nq, nr);
                    if (set.has(k)) continue;
                    var e = cand.get(k);
                    if (e) e[2]++; else cand.set(k, [nq, nr, 1]);
                }
            }
            var list = Array.from(cand.values());
            var weights = list.map(function (e2) { return table[Math.min(6, e2[2])]; });
            var pick = list[pickWeighted(weights, rng)];
            cells.push([pick[0], pick[1]]);
            set.add(cellKey(pick[0], pick[1]));
        }
        /* ② 修補 */
        repairShape(cells, set, compact, rng);
        /* 排序：先 r 後 q（畫面由上而下、由左而右），格子編號就固定下來 */
        cells.sort(function (a, b) { return a[1] - b[1] || a[0] - b[0]; });
        var minDeg = 99, total = 0, below = 0;
        for (var m = 0; m < cells.length; m++) {
            var dg = degreeIn(set, cells[m][0], cells[m][1]);
            if (dg < minDeg) minDeg = dg;
            if (dg < compact) below++;
            total += dg;
        }
        return { cells: cells, minDeg: minDeg, avgDeg: total / cells.length, below: below, target: compact };
    }

    /* 由格子座標建「相鄰圖」：nbrs[i] 是第 i 格的所有鄰居編號。 */
    function buildGraph(cells) {
        var idx = new Map();
        cells.forEach(function (c, i) { idx.set(cellKey(c[0], c[1]), i); });
        var nbrs = cells.map(function (c) {
            var out = [];
            for (var d = 0; d < 6; d++) {
                var j = idx.get(cellKey(c[0] + DIRS[d][0], c[1] + DIRS[d][1]));
                if (j !== undefined) out.push(j);
            }
            return out;
        });
        return { n: cells.length, cells: cells, nbrs: nbrs };
    }

    /* ═══════════════════════════════════════════════════════════════
       二、最大獨立集：「彼此都不相鄰」的格子最多能選幾格
       ───────────────────────────────────────────────────────────────
       同一種顏色的格子一定彼此不相鄰，所以任何顏色的格數都不可能超過這個數字。
       （六角盤面大約是 N/3：每個三角形裡最多只能有一格同色。）
       用來「提早放棄」不可能有解的組合，省得解題器白算。
       maxCalls 是安全閥：遞迴次數超過就放棄（回傳 null，代表「不知道」）。
       ═══════════════════════════════════════════════════════════════ */
    function maxIndependent(G, maxCalls) {
        var n = G.n, nbrs = G.nbrs;
        var alive = new Uint8Array(n).fill(1);      /* 1＝這格還在考慮中 */
        var calls = 0, aborted = false;
        function mis() {
            if (++calls > maxCalls) { aborted = true; return 0; }
            var taken = 0, removed = [], changed = true;
            /* 化簡：鄰居 ≤ 1 的格子一定選它（拿走它與它唯一的鄰居） */
            while (changed) {
                changed = false;
                for (var i = 0; i < n; i++) {
                    if (!alive[i]) continue;
                    var d = 0, nb = -1;
                    for (var t = 0; t < nbrs[i].length; t++) {
                        if (alive[nbrs[i][t]]) { d++; nb = nbrs[i][t]; }
                    }
                    if (d <= 1) {
                        taken++; alive[i] = 0; removed.push(i);
                        if (d === 1) { alive[nb] = 0; removed.push(nb); }
                        changed = true;
                    }
                }
            }
            /* 分支：挑鄰居最多的格子，「不選它」與「選它（它的鄰居全部出局）」各算一次取大的 */
            var best = -1, bd = -1;
            for (var i2 = 0; i2 < n; i2++) {
                if (!alive[i2]) continue;
                var d2 = 0;
                for (var t2 = 0; t2 < nbrs[i2].length; t2++) if (alive[nbrs[i2][t2]]) d2++;
                if (d2 > bd) { bd = d2; best = i2; }
            }
            var res = 0;
            if (best >= 0) {
                alive[best] = 0;
                var a = mis();
                var rem2 = [best];
                for (var t3 = 0; t3 < nbrs[best].length; t3++) {
                    var nb3 = nbrs[best][t3];
                    if (alive[nb3]) { alive[nb3] = 0; rem2.push(nb3); }
                }
                var b = 1 + mis();
                for (var t4 = 0; t4 < rem2.length; t4++) alive[rem2[t4]] = 1;
                alive[best] = 1;
                res = Math.max(a, b);
            }
            for (var t5 = 0; t5 < removed.length; t5++) alive[removed[t5]] = 1;   /* 還原化簡拿走的格子 */
            return taken + res;
        }
        var result = mis();
        return aborted ? null : result;
    }

    /* ═══════════════════════════════════════════════════════════════
       三、解題器
       ───────────────────────────────────────────────────────────────
       每一格都有一個「還能用哪些顏色」的清單（domain，用位元遮罩存：第 c 位是 1 ＝ 顏色 c 還能用）。
       推理規則只有兩條（跟玩家腦中的推理一樣）：
         規則 1：放下顏色 c → 它所有鄰居都不能再用 c；某格只剩一色可用 → 就是那色。
         規則 2（數量）：顏色 c 還要放 r 格、而且「還放得下 c 的空格」剛好也是 r 格 → 全都得放 c；
                        顏色 c 已經放完 → 所有空格都不能再用 c；放得下的空格比 r 還少 → 此路不通。
       只靠這兩條就解得完的盤面叫「純推理可解」（不用猜）。
       解不完的就「試一個顏色、再推理」（回溯搜尋），用來找解、數解的個數。
       ═══════════════════════════════════════════════════════════════ */
    function makeSolver(G, k) {
        var n = G.n, nb = G.nbrs;
        var FULL = (1 << k) - 1;                         /* k 種顏色全部可用：k 個 1 */
        var POP = new Uint8Array(1 << k);                /* POP[x]＝x 的二進位裡有幾個 1（還剩幾種顏色可用） */
        for (var x = 1; x < (1 << k); x++) POP[x] = POP[x >> 1] + (x & 1);

        /* 一個「狀態」：每格還能用的顏色、每格已放的顏色（-1＝空）、每色還要放幾格、已放幾格 */
        function newState(counts) {
            return { dom: new Int32Array(n).fill(FULL), col: new Int8Array(n).fill(-1), rem: Int32Array.from(counts), assigned: 0 };
        }
        function cloneState(s) {
            return { dom: s.dom.slice(), col: s.col.slice(), rem: s.rem.slice(), assigned: s.assigned };
        }

        /* 在第 i 格放顏色 c；過程中要處理的新「只剩一色」的格子丟進 queue。矛盾回傳 false。 */
        function assign(s, i, c, queue) {
            if (!((s.dom[i] >> c) & 1)) return false;    /* 這格不能用 c */
            if (s.col[i] !== -1) return s.col[i] === c;  /* 已經放過了：同色算沒事，異色是矛盾 */
            s.col[i] = c; s.dom[i] = 1 << c; s.assigned++;
            if (--s.rem[c] < 0) return false;            /* c 已經超量 */
            for (var t = 0; t < nb[i].length; t++) {
                var j = nb[i][t];
                if (s.col[j] === c) return false;        /* 鄰居已經是 c：相鄰同色 */
                if (s.col[j] === -1 && ((s.dom[j] >> c) & 1)) {
                    s.dom[j] &= ~(1 << c);               /* 規則 1：鄰居不能再用 c */
                    if (s.dom[j] === 0) return false;
                    if (POP[s.dom[j]] === 1) queue.push(j);
                }
            }
            return true;
        }

        /* 反覆套用兩條規則直到沒有新的推理。矛盾回傳 false。 */
        function propagate(s, queue) {
            for (;;) {
                while (queue.length) {
                    var i = queue.pop();
                    if (s.col[i] !== -1) continue;
                    var c = 31 - Math.clz32(s.dom[i]);   /* 只剩一色：取出那一色的編號 */
                    if (!assign(s, i, c, queue)) return false;
                }
                var progressed = false;
                for (var color = 0; color < k; color++) {
                    var r = s.rem[color], cand = 0;
                    for (var i2 = 0; i2 < n; i2++) if (s.col[i2] === -1 && ((s.dom[i2] >> color) & 1)) cand++;
                    if (cand < r) return false;           /* 規則 2：放不下了 */
                    if (r === 0) {
                        if (cand > 0) {                   /* 規則 2：這色放完了，其他格都不能用 */
                            for (var i3 = 0; i3 < n; i3++) {
                                if (s.col[i3] === -1 && ((s.dom[i3] >> color) & 1)) {
                                    s.dom[i3] &= ~(1 << color);
                                    if (s.dom[i3] === 0) return false;
                                    if (POP[s.dom[i3]] === 1) queue.push(i3);
                                }
                            }
                            progressed = true;
                        }
                    } else if (cand === r) {              /* 規則 2：位置剛好等於數量，全都放這色 */
                        for (var i4 = 0; i4 < n; i4++) {
                            if (s.col[i4] === -1 && ((s.dom[i4] >> color) & 1)) {
                                if (!assign(s, i4, color, queue)) return false;
                            }
                        }
                        progressed = true;
                    }
                }
                if (!progressed && !queue.length) return true;
            }
        }

        /* 把預填的格子放進去並推理一輪。預填本身矛盾就回傳 null。 */
        function start(givens, counts) {
            var s = newState(counts), q = [];
            for (var i = 0; i < n; i++) {
                if (givens[i] >= 0 && !assign(s, i, givens[i], q)) return null;
            }
            if (!propagate(s, q)) return null;
            return s;
        }

        /* 只靠規則推理（不猜）能不能把整個盤面填完？ */
        function propSolves(givens, counts) {
            var s = start(givens, counts);
            return !!s && s.assigned === n;
        }

        /* 回溯搜尋。opts：{ cap: 找到幾個解就停, nodeLimit: 最多試幾個節點, rng: 有給就隨機順序 }
           回傳 { found 解的個數, aborted 是否因節點上限中途放棄, nodes, first 第一個解（Int8Array 或 null） } */
        function search(givens, counts, opts) {
            opts = opts || {};
            var cap = opts.cap || 1, nodeLimit = opts.nodeLimit || 10000, rng = opts.rng || null;
            var s = start(givens, counts);
            if (!s) return { found: 0, aborted: false, nodes: 0, first: null };
            var found = 0, nodes = 0, aborted = false, first = null;
            function dfs(st) {
                if (found >= cap || aborted) return;
                if (++nodes > nodeLimit) { aborted = true; return; }
                if (st.assigned === n) {
                    if (found === 0) first = st.col.slice();
                    found++;
                    return;
                }
                /* 挑「剩下顏色最少」的空格先試（失敗得最快）；有 rng 時同分的隨機挑 */
                var best = -1, bs = 99, ties = 0;
                for (var i = 0; i < n; i++) {
                    if (st.col[i] !== -1) continue;
                    var p = POP[st.dom[i]];
                    if (p < bs) { bs = p; best = i; ties = 1; }
                    else if (rng && p === bs) { ties++; if (rng() * ties < 1) best = i; }
                }
                var colors = [];
                for (var c = 0; c < k; c++) if ((st.dom[best] >> c) & 1) colors.push(c);
                if (rng) shuffle(colors, rng);
                for (var ci = 0; ci < colors.length; ci++) {
                    var t = cloneState(st), qq = [];
                    if (assign(t, best, colors[ci], qq) && propagate(t, qq)) dfs(t);
                    if (found >= cap || aborted) return;
                }
            }
            dfs(s);
            return { found: found, aborted: aborted, nodes: nodes, first: first };
        }

        return { propSolves: propSolves, search: search };
    }

    /* ═══════════════════════════════════════════════════════════════
       四、產生一個盤面
       ───────────────────────────────────────────────────────────────
       params：{ counts: [各色格數], prefill: 預填幾格, compact: 緊密度 1~3 }（格數總和＝格子總數）
       opts  ：{ rng, maxAttempts, maxMs, nodeBudget, countCap, countNodes }（都可省略）
       流程：長一個形狀 → 找一個「剛好符合各色格數」的合法著色（隱藏解）
             → 找不到就換一個形狀再試（最多 maxAttempts 次或 maxMs 毫秒）
             → 找到了就從隱藏解隨機抄 prefill 格當預填，並順便量「難度指標」：
               解的個數（數到 countCap 為止）、能不能純推理解完。
       回傳 { ok: true, ... } 或 { ok: false, reason, ... }（失敗時仍附上最後一個形狀，方便畫出來看）。
       ═══════════════════════════════════════════════════════════════ */
    function generate(params, opts) {
        opts = opts || {};
        var rng = opts.rng || Math.random;
        var counts = params.counts.slice();
        var k = counts.length, N = sum(counts);
        var maxAttempts = opts.maxAttempts || 80;
        var maxMs = opts.maxMs || 2500;
        var nodeBudget = opts.nodeBudget || 6000;
        var countCap = opts.countCap || 200;
        var countNodes = opts.countNodes || 30000;
        var maxCount = Math.max.apply(null, counts);
        var t0 = Date.now();
        var attempts = 0, overAlpha = 0, lastShape = null, lastGraph = null, lastAlpha = null;

        while (attempts < maxAttempts && Date.now() - t0 < maxMs) {
            attempts++;
            var shape = makeShape(N, params.compact, rng);
            var G = buildGraph(shape.cells);
            lastShape = shape; lastGraph = G;
            /* 提早放棄：某一色的格數超過「彼此不相鄰的格子最多能選幾格」，這個形狀一定無解 */
            var alpha = maxIndependent(G, 200000);
            lastAlpha = alpha;
            if (alpha !== null && maxCount > alpha) { overAlpha++; continue; }
            var solver = makeSolver(G, k);
            var none = new Int8Array(N).fill(-1);
            var r = solver.search(none, counts, { cap: 1, nodeLimit: nodeBudget, rng: rng });
            if (r.found < 1) continue;

            /* 找到隱藏解了：從解裡隨機抄 prefill 格當預填 */
            var solution = r.first;
            var prefill = Math.max(0, Math.min(N, params.prefill | 0));
            var order = shuffle(Array.from({ length: N }, function (_, i) { return i; }), rng);
            var givens = new Int8Array(N).fill(-1);
            for (var i = 0; i < prefill; i++) givens[order[i]] = solution[order[i]];
            /* 難度指標 */
            var cnt = solver.search(givens, counts, { cap: countCap, nodeLimit: countNodes });
            return {
                ok: true,
                cells: shape.cells, nbrs: G.nbrs, shape: shape,
                solution: solution, givens: givens, counts: counts,
                /* 數解可能因節點上限中途放棄、一個都還沒數到；但隱藏解一定存在，所以至少是 1 */
                solCount: Math.max(cnt.found, 1), solCountCapped: cnt.found >= countCap, solCountAborted: cnt.aborted,
                propSolvable: solver.propSolves(givens, counts),
                alpha: alpha, attempts: attempts, ms: Date.now() - t0
            };
        }
        /* 全部失敗：回報原因（若每次都是因為「某色超過上限」就特別說明） */
        var reason = (overAlpha === attempts)
            ? '某色格數超過形狀能容納的上限（約 N÷3）'
            : '找不到合法解（數量組合可能太極端）';
        return {
            ok: false, reason: reason,
            cells: lastShape.cells, nbrs: lastGraph.nbrs, shape: lastShape,
            solution: null, givens: new Int8Array(N).fill(-1), counts: counts,
            alpha: lastAlpha, attempts: attempts, ms: Date.now() - t0
        };
    }

    var HexColorCore = {
        DIRS: DIRS,
        makeRng: makeRng,
        makeShape: makeShape,
        buildGraph: buildGraph,
        maxIndependent: maxIndependent,
        makeSolver: makeSolver,
        generate: generate
    };

    /* 掛到全域（網頁）；如果是在 Node 裡被 require，也能用 module.exports 取得 */
    global.HexColorCore = HexColorCore;
    if (typeof module !== 'undefined' && module.exports) module.exports = HexColorCore;
})(typeof window !== 'undefined' ? window : globalThis);
