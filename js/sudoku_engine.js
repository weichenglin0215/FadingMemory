/* 數獨引擎（純函式部分）：幾何、解題計數、技巧推理器、出題器。UI 另外接。 */
/* ─── 新手導讀 ───
   這個檔案是「數獨引擎」，只做計算、完全不碰畫面：描述盤面的幾何、數有幾個解、用人類的推理技巧解題、出題。
   畫面與操作在 js/sudoku_lib.js。整個檔案包在 (function (root) { ... })(...) 裡（立即執行函式），裡面的變數都是私有的，
   最後用 root.SudokuEngine = SL 把「工具箱」SL 交出去（瀏覽器掛在 window、Node 測試用 module.exports）。
   數獨的資料表示法：盤面是一個陣列，第 i 格的數字放在 grid[i]（0＝空格）；「候選數」用位元遮罩（bitmask）存——
   一個整數的第 d 個位元是 1，代表數字 d 還可以放（例如只剩 3 和 5 可放 ＝ (1<<3)|(1<<5) ＝ 40）。 */
(function (root) {
    'use strict';
    var SL = {};                                        /* 這個檔案對外提供的所有函式都掛在 SL 底下（SL.geom、SL.solve、SL.logic、SL.make…） */

    /* 數位元遮罩裡有幾個 1（＝這一格還有幾個候選數）。m &= m - 1 會每次消掉最右邊的一個 1 */
    function bitCount(m) { var c = 0; while (m) { m &= m - 1; c++; } return c; }
    /* 如果遮罩只剩「剛好一個」數字，回傳那個數字；否則回傳 0（用來判斷「唯一候選」） */
    function lowDigit(m) { for (var d = 1; d <= 16; d++) if (m === (1 << d)) return d; return 0; }
    /* 洗牌（Fisher-Yates）：先複製陣列，再從後往前，每個位置跟前面隨機一個位置交換。rand 是亂數函式（測試時可以給固定亂數） */
    function shuffle(a, rand) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rand() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }  /* slice()：複製一份陣列（之後改複本，不會動到原本的資料） */

    /* ═══ 幾何：宮是 boxR 排 × boxC 欄（4×4＝2×2、6×6＝2×3、9×9＝3×3）═══ */
    /* 幾何：把「第 c 格在第幾排、第幾欄、第幾宮、跟哪些格同一個單位」都先算好存起來，之後每個函式直接查表。
       參數 boxR×boxC 是一個宮的排數與欄數；盤面邊長 N ＝ boxR × boxC，共 N×N 格。 */
    SL.geom = function (boxR, boxC) {
        var N = boxR * boxC, g = { R: boxR, C: boxC, N: N, cells: N * N, ALL: 0, units: [], peers: [], unitsOf: [] }, i, j;  /* g 是要回傳的幾何物件：N 邊長、cells 總格數、ALL 全部候選數的遮罩、units 所有「單位」（排、欄、宮）、peers 每格的「同行同列同宮的其他格」、unitsOf 每格屬於哪幾個單位 */
        for (i = 1; i <= N; i++) g.ALL |= (1 << i);
        /* 格子編號 c → 第幾排（0 起算）：編號每 N 個換一排 */
        g.rowOf = function (c) { return Math.floor(c / N); };  /* Math.floor：無條件捨去成整數 */
        g.colOf = function (c) { return c % N; };
        /* 格子編號 c → 第幾宮：先算「第幾排宮、第幾欄宮」，再換成宮的編號 */
        g.boxOf = function (c) { return Math.floor(g.rowOf(c) / boxR) * (N / boxC) + Math.floor(g.colOf(c) / boxC); };  /* Math.floor：無條件捨去成整數 */
        var rows = [], cols = [], boxes = [];
        for (i = 0; i < N; i++) { rows.push([]); cols.push([]); boxes.push([]); }
        for (i = 0; i < N * N; i++) { rows[g.rowOf(i)].push(i); cols[g.colOf(i)].push(i); boxes[g.boxOf(i)].push(i); }
        g.rows = rows; g.cols = cols; g.boxes = boxes;
        /* 單位＝所有的排＋欄＋宮（每個單位都要填滿 1～N 各一次，這是數獨的規則） */
        g.units = rows.concat(cols, boxes);
        for (i = 0; i < N * N; i++) {
            var p = [], us = [];                        /* 對每一格 i：us 存「它屬於哪幾個單位」、p（peers）存「跟它同排或同欄或同宮的其他格」——填了 i，這些格就不能再放同一個數字 */
            for (j = 0; j < g.units.length; j++) if (g.units[j].indexOf(i) >= 0) us.push(j);  /* indexOf：找元素在陣列（或字串）裡的位置，找不到回傳 −1（所以 < 0 代表「不在裡面」） */
            g.unitsOf.push(us);
            for (j = 0; j < N * N; j++) if (j !== i && (g.rowOf(j) === g.rowOf(i) || g.colOf(j) === g.colOf(i) || g.boxOf(j) === g.boxOf(i))) p.push(j);
            g.peers.push(p);
        }
        return g;
    };

    /* ═══ 回溯法：最多數到 limit 個解；random 有給就用亂數順序試（造完整盤用）═══ */
    /* 回溯法解題：回傳 { count: 解的個數（最多數到 limit 個）, solution: 第一個解 }。出題要靠它確認「答案唯一」（limit 給 2，數到 2 個就知道不唯一）。
       做法：每次挑「候選數最少」的空格（最容易出錯的先試），一個一個數字試；試不下去就退回上一步（這就是回溯）。
       rand 有給就用亂數順序試數字，拿來「造一個隨機的完整盤面」。 */
    SL.solve = function (g, givens, limit, rand) {
        var N = g.N, cells = g.cells, grid = givens.slice(), cand = new Array(cells), found = 0, first = null, i;  /* slice()：複製一份陣列（之後改複本，不會動到原本的資料） */
        function ok() { return true; }                  /* （沒有用到的小函式，保留不影響結果） */
        for (i = 0; i < cells; i++) cand[i] = g.ALL;    /* 一開始每一格的候選數都是「全部數字」；下一行起，已經填了數字的格子要把它的數字從同排、同欄、同宮的候選數裡去掉 */
        for (i = 0; i < cells; i++) if (grid[i]) {
            if (!(cand[i] & (1 << grid[i]))) return { count: 0, solution: null };
            cand[i] = 1 << grid[i];
            for (var k = 0; k < g.peers[i].length; k++) { var p = g.peers[i][k]; if (grid[p] === grid[i]) return { count: 0, solution: null }; cand[p] &= ~(1 << grid[i]); }
        }
        /* 遞迴（函式自己呼叫自己）：每一層填一格。grid 是目前盤面、cand 是目前每格的候選數；用 slice() 複製再往下，這樣退回來時上一層的資料沒被改壞 */
        function rec(grid, cand) {
            var best = -1, bc = 99, c;                  /* 在所有空格裡找「候選數最少」的那一格（best），候選數是 0 代表這條路走不通，直接 return 退回 */
            for (var q = 0; q < cells; q++) if (!grid[q]) { c = bitCount(cand[q]); if (c === 0) return; if (c < bc) { bc = c; best = q; if (c === 1) break; } }
            if (best < 0) { found++; if (!first) first = grid.slice(); return; }  /* 沒有空格了＝找到一個完整的解：計數加一，第一個解存起來 */
            var ds = [];
            for (var d = 1; d <= N; d++) if (cand[best] & (1 << d)) ds.push(d);
            if (rand) ds = shuffle(ds, rand);           /* 有給亂數就把嘗試順序洗牌（造隨機盤面用）；沒給就由小到大試 */
            for (var x = 0; x < ds.length; x++) {
                var dg = ds[x], g2 = grid.slice(), c2 = cand.slice();
                g2[best] = dg; c2[best] = 1 << dg;
                var bad = false;
                for (var y = 0; y < g.peers[best].length; y++) { var pp = g.peers[best][y]; if (!g2[pp]) { c2[pp] &= ~(1 << dg); if (!c2[pp]) { bad = true; break; } } }  /* 填下數字 dg 之後，把它從所有「同排同欄同宮」空格的候選數去掉；任何一格變成沒有候選數，這個數字就不能填（bad） */
                if (bad) continue;
                rec(g2, c2);
                if (found >= limit) return;             /* 已經數到 limit 個解就不用再找了（提早結束，省時間） */
            }
        }
        rec(grid, cand);
        return { count: found, solution: first };
    };
    /* 造一個隨機的完整盤面：從全空盤面開始解、只要 1 個解、而且用亂數順序試——每次得到的盤面都不一樣 */
    SL.randomSolution = function (g, rand) { return SL.solve(g, new Array(g.cells).fill(0), 1, rand).solution; };  /* new Array(n).fill(v)：建立長度 n、每一格都是 v 的陣列 */

    /* ═══ 技巧推理器 ═══
       等級 1：唯一候選（格子只剩一個數字能放）、唯一位置（單位裡某數字只剩一格能放）
       等級 2：數對（兩格只剩同兩個數字）、鎖定（某數字在宮裡只出現在同一排／欄，或在排／欄裡只出現在同一宮）
       等級 3：隱性數對、三數組、X 翼（X-Wing）
       回傳 { solved, grid, level（用到的最高等級）, used（各技巧用了幾次）}；contradiction＝推到矛盾（題目有問題） */
    /* 每種技巧屬於第幾級（用到的最高級＝這一題的難度等級）：single 唯一候選、hidden 唯一位置（1 級）；nakedPair 數對、locked 鎖定（2 級）；hiddenPair 隱性數對、nakedTriple 三數組、xwing X 翼（3 級） */
    SL.TECH = { single: 1, hidden: 1, nakedPair: 2, locked: 2, hiddenPair: 3, nakedTriple: 3, xwing: 3 };
    /* 用「人類的技巧」解題（不猜）：只准用 maxLevel 以內的技巧，一直用到解完或卡住。
       出題時用它檢查「這題不用猜就解得出來」；提示功能也用它找下一步。 */
    SL.logic = function (g, givens, maxLevel) {
        maxLevel = maxLevel || 1;
        var N = g.N, cells = g.cells, grid = givens.slice(), cand = new Array(cells), used = {}, level = 0, dead = false, order = [], i, d;  /* grid 盤面、cand 候選數、used 各技巧用了幾次、level 用到的最高等級、dead 推到矛盾（題目有問題）、order 依序填出了哪些格（給提示用） */
        for (i = 0; i < cells; i++) cand[i] = grid[i] ? (1 << grid[i]) : g.ALL;
        /* 記錄「用了某個技巧」：次數加一，並更新用到的最高等級 */
        function use(name) { used[name] = (used[name] || 0) + 1; if (SL.TECH[name] > level) level = SL.TECH[name]; }
        var recording = false;
        /* 在第 c 格填下數字 dg：這格候選數只剩 dg，並把 dg 從所有同排同欄同宮的格子候選數去掉；任何格變成沒有候選數就是矛盾（dead） */
        function place(c, dg) {
            if (recording) order.push(c);
            grid[c] = dg; cand[c] = 1 << dg;
            for (var k = 0; k < g.peers[c].length; k++) { var p = g.peers[c][k]; if (grid[p] === dg) dead = true; if (cand[p] & (1 << dg)) { cand[p] &= ~(1 << dg); if (!cand[p]) dead = true; } }
        }
        /* 從第 c 格的候選數去掉 mask 裡的數字；真的去掉了東西回傳 true（代表這個技巧有「用上」） */
        function elim(c, mask) { if (cand[c] & mask) { cand[c] &= ~mask; if (!cand[c]) dead = true; return true; } return false; }
        for (i = 0; i < cells; i++) if (grid[i]) { var gv = grid[i]; grid[i] = 0; place(i, gv); }
        recording = true;                         /* 從這裡開始記下「推理依序填出了哪些格」（提示用） */
        /* 等級 1 技巧：①唯一候選——某格只剩一個數字能放，就填它；
           ②唯一位置——某個單位（排／欄／宮）裡，數字 d 只有一格能放，d 就填那格。 */
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
        /* 把陣列 arr 裡「任選 k 個」的所有組合一組一組丟給 fn（遞迴 rec 負責排組合）。數對、三數組用它來試每一種組合 */
        function combos(arr, k, fn) {
            var idx = [];
            (function rec(start) { if (idx.length === k) { fn(idx.map(function (x) { return arr[x]; })); return; } for (var x = start; x < arr.length; x++) { idx.push(x); rec(x + 1); idx.pop(); } })(0);  /* map：把陣列的每個元素轉換成別的東西，回傳新陣列 */
        }
        /* 數對（k＝2）／三數組（k＝3）：某單位裡有 k 格，它們的候選數合起來只有 k 個不同數字，
           那這 k 個數字一定就在這 k 格裡，同單位其他格的候選數可以去掉這些數字。 */
        function nakedSubset(k, name) {
            var did = false;
            g.units.forEach(function (un) {             /* forEach：對陣列的每個元素各做一次 */
                var open = un.filter(function (c) { return !grid[c] && bitCount(cand[c]) <= k; });  /* filter：留下符合條件的元素，回傳新陣列 */
                combos(open, k, function (cs) {
                    var uni = 0; cs.forEach(function (c) { uni |= cand[c]; });  /* forEach：對陣列的每個元素各做一次 */
                    if (bitCount(uni) !== k) return;
                    var ch = false;
                    un.forEach(function (c) { if (!grid[c] && cs.indexOf(c) < 0 && elim(c, uni)) ch = true; });  /* indexOf：找元素在陣列（或字串）裡的位置，找不到回傳 −1（所以 < 0 代表「不在裡面」） */
                    if (ch) { did = true; use(name); }
                });
            });
            return did;
        }
        /* 隱性數對：某單位裡，兩個數字都「只能放在同樣的兩格」，那這兩格就只能是這兩個數字，
           這兩格的其他候選數都可以去掉。 */
        function hiddenPair() {
            var did = false;
            g.units.forEach(function (un) {
                var pos = {}, ds = [];
                for (var dg = 1; dg <= N; dg++) {
                    var placed = un.some(function (c) { return grid[c] === dg; }); if (placed) continue;  /* some：陣列裡「只要有一個」元素符合條件就回傳 true */
                    var sp = un.filter(function (c) { return !grid[c] && (cand[c] & (1 << dg)); });  /* filter：留下符合條件的元素，回傳新陣列 */
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
        /* 鎖定：某數字在單位 A 裡只能放在 A 與另一個單位 B 的「重疊那幾格」，
           那 B 裡不在重疊的格子就不能放這個數字（例如數字在某宮裡只出現在同一排，那排其他宮的格子就不能放它）。 */
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
                        if (!sp.every(function (c) { return vu.indexOf(c) >= 0; })) continue;  /* every：陣列裡「每一個」元素都符合條件才回傳 true */
                        var ch = false;
                        vu.forEach(function (c) { if (!grid[c] && un.indexOf(c) < 0 && elim(c, bit)) ch = true; });
                        if (ch) { did = true; use('locked'); }
                    }
                }
            }
            return did;
        }
        /* X 翼：某數字在兩條排裡都「只有兩個位置、而且位置在同樣兩欄」，
           這個數字在這兩欄的其他格子就不能放（排／欄對調也一樣）。 */
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
                        var ca = A.map(function (c) { return lines === g.rows ? g.colOf(c) : g.rowOf(c); }), cb = B.map(function (c) { return lines === g.rows ? g.colOf(c) : g.rowOf(c); });  /* map：把陣列的每個元素轉換成別的東西，回傳新陣列 */
                        if (ca[0] !== cb[0] || ca[1] !== cb[1]) continue;
                        var ch = false;
                        ca.forEach(function (ci) { cross[ci].forEach(function (c) { if (!grid[c] && A.indexOf(c) < 0 && B.indexOf(c) < 0 && elim(c, bit)) ch = true; }); });
                        if (ch) { did = true; use('xwing'); }
                    }
                }
            });
            return did;
        }
        var guard = 0;                                  /* 主迴圈：已經填滿就結束；否則依序試「簡單的技巧→較難的技巧」，有任何一個技巧有進展就重來一輪；都沒進展就卡住離開。guard 防止意外無限迴圈 */
        while (!dead && guard++ < 500) {
            var done = true; for (i = 0; i < cells; i++) if (!grid[i]) { done = false; break; }
            if (done) break;
            if (singles()) continue;
            if (maxLevel >= 2 && (nakedSubset(2, 'nakedPair') || locked())) continue;
            if (maxLevel >= 3 && (hiddenPair() || nakedSubset(3, 'nakedTriple') || xwing())) continue;
            break;
        }
        var solved = !dead && grid.every(function (v) { return v > 0; });  /* 解完的條件：沒有矛盾、而且每一格都有數字 */
        return { solved: solved, grid: grid, level: level, used: used, dead: dead, cand: cand, order: order };
    };

    /* 提示：玩家目前填的格子裡「跟答案一樣」的才算數（填錯的當作沒填），再用推理器往下推，回傳「現在可以確定、而且玩家還沒填對」的第一格；
       沒有就回傳 -1。只標位置，不說數字、不說理由。 */
    /* 提示：把玩家填對的格子當作已知，再用推理器往下推，回傳「現在能確定、玩家還沒填對」的第一格（見上面這段說明） */
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
    /* 出題（做法見上面這段說明）。回傳 { solution 完整答案, givens 題目（0＝空格）, count 提示數, level 用到的最高技巧等級, used 各技巧次數 } */
    SL.make = function (g, spec, rand) {
        rand = rand || Math.random;
        var best = null, t0 = Date.now(), tr;           /* Date.now()：現在的時間（毫秒），拿來算「經過了多久」 */
        for (tr = 0; tr < (spec.tries || 20); tr++) {
            var sol = SL.randomSolution(g, rand), givens = sol.slice(), count = g.cells;  /* 先造完整盤面 sol；givens 是「題目」，一開始等於完整盤面，接著一格一格挖掉；count 是還剩幾個提示 */
            var order = shuffle(Array.apply(null, Array(g.cells)).map(function (_, i) { return i; }), rand);  /* 挖洞的順序：把所有格子編號洗牌 */
            var cur = 0;
            for (var k = 0; k < order.length; k++) {
                if (count <= (spec.floor || 0) && cur >= (spec.minLevel || 0)) break;     /* 提示數夠少、而且用到的技巧夠高級，才停手 */
                var c = order[k], save = givens[c];
                givens[c] = 0;                          /* 先試著把這格挖掉 */
                var r = SL.logic(g, givens, spec.maxLevel);
                if (r.solved) { count--; cur = r.level; } else givens[c] = save;  /* 挖掉後「只用 maxLevel 以內的技巧」仍然解得完才算數（免猜、而且唯一）；解不完就把數字放回去 */
            }
            var res = SL.logic(g, givens, spec.maxLevel);
            var pz = { solution: sol, givens: givens, count: count, level: res.level, used: res.used };
            var okLevel = res.level >= (spec.minLevel || 0);  /* 這題用到的技巧等級夠高（不會太簡單）嗎？夠高、提示數也夠少就直接用；否則記下「目前最好的一題」繼續重試 */
            if (okLevel && count <= (spec.maxCount || 999)) return pz;
            if (!best || (okLevel && !best.okLevel) || (okLevel === best.okLevel && (count < best.count))) { best = pz; best.okLevel = okLevel; }
            if (spec.ms && Date.now() - t0 > spec.ms) break;  /* Date.now()：現在的時間（毫秒），拿來算「經過了多久」 */
        }
        return best;
    };

    root.SudokuEngine = SL;
    if (typeof module !== 'undefined' && module.exports) module.exports = SL;
})(typeof window !== 'undefined' ? window : this);
