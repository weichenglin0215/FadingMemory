/* ═══════════════════════════════════════════════════════════════════
   reaction_sandwich.js — 秒反應・夾心數獨（深思篇 425「夾心數獨」，Sandwich Sudoku）
   樣式：css/sudoku_lib.css（跟數獨系列共用盤面，class 一律以「sudokulib-」開頭；外圍線索也是它的 .sudokulib-ring）
   ───────────────────────────────────────────────────────────────────
   · 玩法：標準數獨（每一橫排、每一直排、每個宮裡 1～N 各一次），另外盤面外圍有一圈數字：**那一排（那一列）裡，「1」和「N」中間夾著的數字加總**
     （1 和 N 誰先誰後都可以，位置也不固定）。例如 6×6 一排裡 1 在第 2 格、6 在第 5 格，夾心數字就是第 3、4 格相加。
     夾心 0＝1 和 N 緊緊相鄰。點格、點下面的數字。沒有時間限制、填錯不會結束；全部填對就過關，換下一題；按左上角「返回」結束，成績＝解開幾題。
   · 關卡：4×4（第 1～5 關，題目給 5 → 2 個數字）→ 6×6（第 6～16 關，給 14 → 6 個）→ 9×9（第 17 關起，給 30 → 16 個）。
     外圍的夾心數字一直都全部給（每排每列各一個）。
   · 出題：先造完整的數獨盤，算出每一排每一列的夾心數字，再一格一格拿掉提示；**每拿一格都用回溯法確認「加上夾心數字之後答案仍然唯一」**才真的拿。
     回溯時：除了數獨的排／欄／宮規則，每一排每一列一旦 1 和 N 都放好了，夾在中間的數字加總一定要等於夾心數字，不可能達到就剪掉。
   · 夾心的「加總」會用到小技巧：例如夾心 0 → 1 和 N 相鄰；夾心很大 → 中間夾著好幾個大數；夾心 3 在 4×4 → 夾著的是 3。
     填完一排、而且 1 和 N 都放好了，夾在中間的格子加起來不是夾心數字，那幾格會標紅。
   · 提示（每題 HINTS 次）：標出一格「跟答案不一樣」的格子（優先選答案最少剩幾種的那一格），不說數字。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    /* 新手導讀：整個檔案包在 (function () { ... })(); 裡（叫「立即執行函式」），裡面的變數都是這個檔案私有的，不會跟別的遊戲檔案的同名變數打架。
       檔案由上往下大致分成：① 參數區（標題寫著可以自己調整的參數：難度、秒數、文字大多在這）；② 純函式（只做計算、不碰畫面：出題、判斷對錯，單元測試直接測它們）；③ 畫面（mount 是進場、setup 是每一關開始時呼叫，負責把畫面建出來並處理點擊）。
       最後的 Reaction.register(G) 把這款遊戲「登記」給選單（沒有這行，選單就看不到它）。'use strict' 是嚴格模式：打錯變數名稱會直接報錯，而不是默默建立新變數。
       這款遊戲的代號是 'sandwich'：選單、成績、存檔都靠它。 */
    'use strict';

    var ID = 'sandwich';                                /* 這款遊戲的代號：選單、成績、存檔、CSS class 前綴都用它 */
    var SCORE = { better: 'max', decimals: 0, format: '{v} 題', label: '解開題數', min: 1, max: 90 };  /* 成績規格：better（max＝越大越好、min＝越小越好）、decimals 小數位數、format 顯示格式、label 名稱、min／max 合理範圍（超出範圍的成績不會送排行榜） */
    var kit = Reaction.kit, SE = window.SudokuEngine, lib = Reaction.sudokuLib;

    /* ═══ 可以自己調的參數 ═══ */
    var STAGES = [                              /* 盤面大小的階段：boxR×boxC＝宮的形狀、to＝這個階段的最後一關、givens＝提示數：階段第 1 關 → 最後一關、len＝走幾關到頂 */
        { n: 4, boxR: 2, boxC: 2, to: 5, givens: [5, 2], len: 5, frac: 0.8 },
        { n: 6, boxR: 2, boxC: 3, to: 16, givens: [14, 6], len: 11, frac: 0.92 },
        { n: 9, boxR: 3, boxC: 3, to: 9999, givens: [30, 16], len: 14, frac: 0.96 }
    ];
    var HINTS = 3;                                  /* 每一題可以用幾次提示（目前 3 次） */
    var MAX_LEVEL = 90;                             /* 最後一關：過了第 90 關就算全破（也是成績的上限） */
    var SLACK = 3;                              /* 提示數離目標不超過這麼多就收題（挖不下去時就停在能挖到的最少） */
    var DIG_MS = 900;                           /* 出題最多花幾毫秒（超過就用目前挖到的） */
    var GEOS = {};                                  /* 夾心數獨的版面幾何資料快取（依盤面大小存，算過就不重算） */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function stageOf(level) {
        level = Math.max(1, level);
        var from = 1;
        for (var i = 0; i < STAGES.length; i++) {
            if (level <= STAGES[i].to || i === STAGES.length - 1) return { st: STAGES[i], idx: Math.min(level, STAGES[i].to) - from + 1 };
            from = STAGES[i].to + 1;
        }
    }
    function geoOf(st) { return GEOS[st.n] || (GEOS[st.n] = SE.geom(st.boxR, st.boxC)); }
    function givensFor(level) { var s = stageOf(level); return Math.round(kit.ramp(s.idx, s.st.givens[0], s.st.givens[1], s.st.len)); }
    /* 一條線（n 個格子的數值，空格是 0）的夾心狀況：{ both（1 和 N 都放好了）, sum（夾在中間已填數字的加總）, gap（中間有幾格）, empty（中間還有幾格沒填）} */
    function sandwichOf(vals, n) {
        var a = vals.indexOf(1), b = vals.indexOf(n);
        if (a < 0 || b < 0) return { both: false };
        var lo = Math.min(a, b), hi = Math.max(a, b), sum = 0, empty = 0;
        for (var i = lo + 1; i < hi; i++) { if (vals[i]) sum += vals[i]; else empty++; }
        return { both: true, sum: sum, gap: hi - lo - 1, empty: empty };
    }
    /* 完整盤面的夾心數字：{ rows: [每一排], cols: [每一列] } */
    function cluesOf(g, grid) {
        var n = g.N, rows = [], cols = [], r, c;
        for (r = 0; r < n; r++) { var rv = [], cv = []; for (c = 0; c < n; c++) { rv.push(grid[r * n + c]); cv.push(grid[c * n + r]); } rows.push(sandwichOf(rv, n).sum); cols.push(sandwichOf(cv, n).sum); }
        return { rows: rows, cols: cols };
    }
    /* 這條線現在的狀況合不合夾心數字？（還不確定的話回傳 true）：1 和 N 都放好了，夾著的格子加總＝夾心、而且空格填得出夠大／夠小的數 */
    function lineFeasible(vals, n, clue) {
        var s = sandwichOf(vals, n);
        if (!s.both) return true;
        if (s.sum > clue) return false;
        if (s.empty === 0) return s.sum === clue;
        /* 還有 s.empty 個空格要填 2～n−1 的數字（不能跟這條線上已有的重複）：最小與最大可能的加總 */
        var free = []; for (var d = 2; d <= n - 1; d++) if (vals.indexOf(d) < 0) free.push(d);
        if (free.length < s.empty) return false;
        var mn = 0, mx = 0; for (var k = 0; k < s.empty; k++) { mn += free[k]; mx += free[free.length - 1 - k]; }
        return s.sum + mn <= clue && clue <= s.sum + mx;
    }
    /* 回溯數解：給定提示 givens（0＝空）與夾心數字，最多數 limit 個解（用來確認唯一）；超過 maxNodes 個節點就放棄回傳 -1（不確定） */
    function countSolutions(g, givens, clues, limit, maxNodes) {
        var n = g.N, cells = g.cells, grid = givens.slice(), cand = new Array(cells), count = 0, nodes = 0, i, d;
        for (i = 0; i < cells; i++) cand[i] = g.ALL;
        for (i = 0; i < cells; i++) if (grid[i]) {
            if (!(cand[i] & (1 << grid[i]))) return 0;
            cand[i] = 1 << grid[i];
            for (var k = 0; k < g.peers[i].length; k++) { var p = g.peers[i][k]; if (grid[p] === grid[i]) return 0; cand[p] &= ~(1 << grid[i]); }
        }
        function lineOk(gr, r, c) {
            var rv = [], cv = [], q;
            for (q = 0; q < n; q++) { rv.push(gr[r * n + q]); cv.push(gr[q * n + c]); }
            return lineFeasible(rv, n, clues.rows[r]) && lineFeasible(cv, n, clues.cols[c]);
        }
        for (i = 0; i < cells; i++) if (grid[i] && !lineOk(grid, g.rowOf(i), g.colOf(i))) return 0;
        function bits(m) { var c = 0; while (m) { m &= m - 1; c++; } return c; }
        function rec(gr, cd) {
            if (++nodes > maxNodes) return;
            var best = -1, bc = 99, c;
            for (var q = 0; q < cells; q++) if (!gr[q]) { c = bits(cd[q]); if (c === 0) return; if (c < bc) { bc = c; best = q; if (c === 1) break; } }
            if (best < 0) { count++; return; }
            for (var v = 1; v <= n; v++) {
                if (!(cd[best] & (1 << v))) continue;
                var g2 = gr.slice(), c2 = cd.slice(), bad = false;
                g2[best] = v; c2[best] = 1 << v;
                for (var y = 0; y < g.peers[best].length; y++) { var pp = g.peers[best][y]; if (!g2[pp]) { c2[pp] &= ~(1 << v); if (!c2[pp]) { bad = true; break; } } }
                if (bad || !lineOk(g2, g.rowOf(best), g.colOf(best))) continue;
                rec(g2, c2);
                if (count >= limit || nodes > maxNodes) return;
            }
        }
        rec(grid, cand);
        return nodes > maxNodes ? -1 : count;
    }
    /* 出一題：{ n, solution, givens, clues, count（提示數）, want } */
    function makePuzzle(level, rand) {
        rand = rand || Math.random;                     /* 沒有傳亂數函式就用 Math.random（測試時可以傳固定的亂數，結果才能重現） */
        var s = stageOf(level), g = geoOf(s.st), want = givensFor(level), t0 = Date.now();
        var sol = SE.randomSolution(g, rand), clues = cluesOf(g, sol);
        var givens = sol.slice(), count = g.cells;
        var order = kit.shuffle(Array.apply(null, Array(g.cells)).map(function (_, i) { return i; }), rand);
        for (var k = 0; k < order.length && count > want; k++) {
            if (Date.now() - t0 > DIG_MS) break;
            var c = order[k], save = givens[c];
            givens[c] = 0;
            if (countSolutions(g, givens, clues, 2, 20000) === 1) count--; else givens[c] = save;
        }
        return { n: g.N, solution: sol, givens: givens, clues: clues, count: count, want: want, level: level };
    }
    /* 這個盤面上，哪些格子「夾在 1 和 N 中間、而且加總不對」（填滿的線才判斷）→ 布林陣列（標紅用） */
    function badSandwichCells(g, grid, clues) {
        var n = g.N, bad = new Array(g.cells).fill(false), r, c, q;
        function mark(idxs, clue) {
            var vals = idxs.map(function (i) { return grid[i]; }), s = sandwichOf(vals, n);
            if (!s.both || s.empty > 0 || s.sum === clue) return;
            var a = vals.indexOf(1), b = vals.indexOf(n);
            for (var k = Math.min(a, b) + 1; k < Math.max(a, b); k++) bad[idxs[k]] = true;
        }
        for (r = 0; r < n; r++) { var ri = [], ci = []; for (q = 0; q < n; q++) { ri.push(r * n + q); ci.push(q * n + r); } mark(ri, clues.rows[r]); mark(ci, clues.cols[r]); }
        return bad;
    }
    /* 結算畫面的評語：依成績回傳一句話 */
    function rating(n) {
        if (n >= 25) return '夾心數獨大師！';
        if (n >= 12) return '推理很穩！';
        if (n >= 5) return '越來越有感覺了！';
        return '先想：夾心是 0，代表 1 和 N 貼在一起！';
    }

    /* ═══ 畫面（盤面、數字鍵、工具列都是 sudoku_lib.js 的 mountBoard，這裡只加外圍的夾心數字）═══ */
    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 5, resume: false, leaveSettle: true,
            head: function (level) { return '第 ' + level + ' 題'; },
            info: function (S) { return '已解 ' + S.cleared + ' 題'; },
            numText: function (v) { return v + ' 題'; },
            rating: rating,
            lines: function (S) { return ['解開 ' + S.cleared + ' 題']; },
            setup: setup
        });
    }
    /* setup(api)：每一關開始時呼叫一次，負責出題並把這一關的畫面建出來。api 是共用骨架給的工具：api.stage（這一關的畫面容器）、api.level（第幾關）、
       api.after（延遲執行，換關後自動作廢）、api.timer（倒數計時）、api.pass／api.fail（過關／失敗）。 */
    function setup(api) {
        var s = stageOf(api.level), g = geoOf(s.st), pz = makePuzzle(api.level, api.rand);
        api.info = pz;                                  /* 把這一關的題目資料掛在 api.info，測試與 debug 用（玩家看不到） */
        console.log('[夾心數獨] 第 ' + api.level + ' 題：' + g.N + '×' + g.N + '，提示 ' + pz.count + ' 個（想要 ' + pz.want + '）；外圍 ' + pz.clues.rows.join(',') + '／' + pz.clues.cols.join(','));  /* 在瀏覽器主控台（按 F12）印出這一關的出題內容，方便除錯與驗證 */
        var ctl = lib.mountBoard(api, g, pz, {
            frac: s.st.frac, maxLevel: 1, ring: { top: pz.clues.cols, left: pz.clues.rows },
            tip: '外圍數字＝1 和 ' + g.N + ' 中間夾的和',
            extraConflict: function (grid) { return badSandwichCells(g, grid, pz.clues); }
        });
        /* 給測試／debug 用：api.solve 自動走出正解、api.wrong 故意走錯一步、api.state 回報目前狀態（瀏覽器自動測試會呼叫它們，玩家用不到）。 */
        api.solve = function () { ctl.fillSolution(); };
        api.wrong = function () { ctl.putWrong(); };
        api.ctl = ctl;
    }

    /* 遊戲登記資料：id 代號、name 選單上的名稱、rule 玩法說明（**包起來的是粗體重點）、mount 進場函式、score 成績規格、test 給單元測試用的內部函式。 */
    var G = {
        id: ID,
        name: '夾心數獨',
        rule: '標準數獨：**每一橫排、每一直排、每個宮裡，1～N 各出現一次**。另外盤面外面有一圈數字：**那一排（那一列）裡，「1」和最大數「N」中間夾著的數字，加起來是多少**（1 和 N 誰先誰後都可以，位置不固定；0 表示 1 和 N 緊緊相鄰）。點一格，再點下面的數字；1 和 N 都放好的那一排，夾著的格子加總不對會標紅。沒有時間限制，填錯也不會結束；全部填對就換下一題，想結束就按左上角「返回」，成績是解開幾題。',
        mount: mount,
        score: SCORE,
        /* test：把內部函式與參數交給單元測試（test/reaction/ 底下的 t_*.js）使用，遊戲本身不會用到。 */
        test: {
            STAGES: STAGES, stageOf: stageOf, givensFor: givensFor, sandwichOf: sandwichOf, cluesOf: cluesOf, lineFeasible: lineFeasible, countSolutions: countSolutions,
            makePuzzle: makePuzzle, badSandwichCells: badSandwichCells, rating: rating, HINTS: HINTS, MAX_LEVEL: MAX_LEVEL, geoOf: geoOf
        }
    };
    /* 把這款遊戲登記給選單（沒有這行，選單就看不到它） */
    Reaction.register(G);
})();
