/* ═══════════════════════════════════════════════════════════════════
   reaction_sudokuone.js — 秒反應・數獨猜一格（企劃 181「四格數獨」的改版）
   樣式：css/games/reaction_sudokuone.css（這款專屬的 class 一律以「sudokuone-」開頭；共用元件在 css/reaction_common.css）
   標準的數獨：每一橫排、每一直排、每一個「宮」裡，1～N 各出現一次。盤面上只有一格被標成黃色，
   只要猜出「那一格」是幾就好，點下面的數字鍵。
   ───────────────────────────────────────────────────────────────────
   · 玩家指出原本的設計有問題（6×6 的盤面、4 個 3×3 的宮，一排只有 6 格卻要放 1～9，條件不夠，根本無法作答）。
     V1.24 改成兩種標準數獨，由簡單到困難：
        第 1～FOUR_LEVELS（6）關：4×4 四宮格——2×2 的宮共 4 個，數字 1～4，每橫排、每直排、每宮 1～4 各一個；
        第 7 關起：9×9 九宮格——3×3 的宮共 9 個，數字 1～9，每橫排、每直排、每宮 1～9 各一個（更難）。
   · 關卡制：猜錯或來不及就結束，成績＝通過幾關。
   ───────────────────────────────────────────────────────────────────
   · 出題（規範 Q1、Q2）：先做出一個完整正確的盤面（解答：用「基本圖形＋洗牌」，一定合法），挑一格當目標，
     再把其他格子一個一個拿掉，每拿一格就用「推理器」deduce() 檢查：只靠邏輯（排除法＋橫排／直排／宮裡的「唯一能放的位置」）
     還能不能推出目標那一格？能才真的拿掉，不能就放回去。所以每一題「可以靠推理得到唯一答案」，不用靠猜。
   · 難度線性（每個階段各自從第 1 關走到頂）：盤面上留下的提示數字個數
        4×4：11 → 5 個（GIVENS4，第 1 → 6 關）；9×9：34 → 12 個（GIVENS9，第 7 → 30 關，RAMP9＝24 關走到頂）；
     越少越要多繞幾步推理；作答限時 4×4 20 → 14 秒、9×9 40 → 24 秒。
     盤面上會用淡黃色標出目標那一格所在的橫排、直排和宮，幫你看該看哪裡（不會揭露答案）。
   · 揭曉：整個盤面的解答都填出來（目標那一格用大字標出）。
   · V1.29（玩家意見）：(1) 盤面（題目格子）盡量加寬：整個盤面的寬度 ＝ 遊戲畫面寬度的 BOARD_FRAC（96%），每格邊長由它算出來
     （boardMetrics），數字鍵隨著盤面變高而排得更緊湊（9×9 的數字鍵改成 5 欄 2 排）；
     (2) 答錯／逾時時，最後顯示正確答案要停留 REVEAL_FAIL_MS（6 秒），讓玩家看清楚，才跳出結算彈窗。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    /* 新手導讀：整個檔案包在 (function () { ... })(); 裡（叫「立即執行函式」），裡面的變數都是這個檔案私有的，不會跟別的遊戲檔案的同名變數打架。
       檔案由上往下大致分成：① 參數區（標題寫著可以自己調整的參數：難度、秒數、文字大多在這）；② 純函式（只做計算、不碰畫面：出題、判斷對錯，單元測試直接測它們）；③ 畫面（mount 是進場、setup 是每一關開始時呼叫，負責把畫面建出來並處理點擊）。
       最後的 Reaction.register(G) 把這款遊戲「登記」給選單（沒有這行，選單就看不到它）。'use strict' 是嚴格模式：打錯變數名稱會直接報錯，而不是默默建立新變數。
       這款遊戲的代號是 'sudokuone'：選單、成績、存檔都靠它；樣式在 css/games/reaction_sudokuone.css，裡面的 class 名稱一律以 sudokuone- 開頭。 */
    'use strict';

    var ID = 'sudokuone';                               /* 這款遊戲的代號：選單、成績、存檔、CSS class 前綴都用它 */
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 90 };  /* 成績規格：better（max＝越大越好、min＝越小越好）、decimals 小數位數、format 顯示格式、label 名稱、min／max 合理範圍（超出範圍的成績不會送排行榜） */
    var h = UI.h, kit = Reaction.kit;                   /* h：建立網頁元素的小工具；kit：闖關遊戲共用的工具箱 */

    /* ═══ 可以自己調的參數 ═══ */
    var FOUR_LEVELS = 10;                        /* 前幾關是 4×4（之後是 9×9）。設 0＝全部 9×9；設很大（例如 999）＝全部 4×4 */
    var RAMP9 = 24;                             /* 9×9 的難度走幾關到頂（第 7 關起算第 1 個 9×9 關卡） */
    var DEEP_P = [0, 0.9];                      /* 出「要先推出別格、再推目標」這種題目的機率：階段的第 1 關 → 到頂 */
    var GIVENS4 = [12, 6];                      /* 4×4：盤面上留下幾個提示數字（不含目標那格，共 15 格可留）：第 1 關 → 第 FOUR_LEVELS 關；留不下這麼少時，留到不能再拿為止 */
    var GIVENS9 = [64, 12];                     /* 9×9：同上（共 80 格可留）：第 1 個 9×9 關卡 → 第 RAMP9 個 */
    var ANS4_S = [30, 120], ANS9_S = [120, 600];   /* 作答限時（秒）：階段的第 1 關 → 到頂 */
    var MAX_LEVEL = 90;                             /* 最後一關：過了第 90 關就算全破（也是成績的上限） */
    var BOARD_FRAC = 0.96;                      /* 盤面寬度佔遊戲畫面寬度的比例 */
    var BORDER = 4;                             /* 盤面左、上外框粗細（px，跟 css 的 .sudokuone-board 一致） */
    var REVEAL_FAIL_MS = 6000;                  /* 答錯或逾時：顯示正確答案要停多久才跳出結算彈窗 */
    var SLACK = 4;                              /* 提示個數離目標不超過這麼多就收題，否則多試幾次、用提示最少的那次 */

    /* ═══ 盤面的幾何（4×4 與 9×9 各做一份）═══
       makeGeom(B)：宮的邊長 B（2 或 3），盤面邊長 N＝B×B。
       rowOf／colOf／blockOf：第 i 格在第幾排／第幾欄／第幾個宮；
       UNITS：所有「單位」（N 排、N 欄、N 個宮），每個單位是 N 個格子的編號；PEERS[i]：跟第 i 格同單位的其他格；
       ALL：1～N 的位元遮罩（bit1～bitN，推理器用位元表示「這格還可能放哪些數字」）。 */
    function makeGeom(B) {
        var N = B * B, g = { B: B, N: N, cells: N * N, ALL: 0, PEERS: [], UNITS: [], rowOf: null, colOf: null, blockOf: null }, i, j;
        for (i = 1; i <= N; i++) g.ALL |= (1 << i);
        g.rowOf = function (c) { return Math.floor(c / N); };  /* Math.floor：無條件捨去成整數 */
        g.colOf = function (c) { return c % N; };
        g.blockOf = function (c) { return Math.floor(g.rowOf(c) / B) * B + Math.floor(g.colOf(c) / B); };  /* Math.floor：無條件捨去成整數 */
        var rows = [], cols = [], blocks = [];
        for (i = 0; i < N; i++) { rows.push([]); cols.push([]); blocks.push([]); }
        for (i = 0; i < N * N; i++) { rows[g.rowOf(i)].push(i); cols[g.colOf(i)].push(i); blocks[g.blockOf(i)].push(i); }
        g.UNITS = rows.concat(cols, blocks);
        g.BLOCKS = blocks;
        for (i = 0; i < N * N; i++) {
            var p = [];
            for (j = 0; j < N * N; j++) if (j !== i && (g.rowOf(j) === g.rowOf(i) || g.colOf(j) === g.colOf(i) || g.blockOf(j) === g.blockOf(i))) p.push(j);
            g.PEERS.push(p);
        }
        return g;
    }
    var GEO4 = makeGeom(2), GEO9 = makeGeom(3);

    /* ═══ 純函式（也給 Node 測試用）═══ */
    /* 盤面的尺寸：畫面寬 W、盤面邊長 N（4 或 9）→ { width（含左外框，＝W × BOARD_FRAC 取整）, cell（每格邊長，可以有小數）, height（含上外框；格子是正方形所以＝width） } */
    function boardMetrics(W, N) {
        var width = Math.round(W * BOARD_FRAC), cell = (width - BORDER) / N;  /* Math.round：四捨五入成整數 */
        return { width: width, cell: cell, height: cell * N + BORDER };
    }
    /* 第 level 關屬於哪個階段：{ g 盤面幾何, idx 這個階段的第幾關（從 1 起算）, len 這個階段走幾關到頂 } */
    function stageOf(level) {
        level = Math.max(1, level);
        if (level <= FOUR_LEVELS) return { g: GEO4, idx: level, len: Math.max(2, FOUR_LEVELS) };
        return { g: GEO9, idx: level - FOUR_LEVELS, len: RAMP9 };
    }
    function givensFor(level) { var s = stageOf(level), r = s.g === GEO4 ? GIVENS4 : GIVENS9; return Math.round(kit.ramp(s.idx, r[0], r[1], s.len)); }  /* kit.ramp(關卡, 起始值, 到頂值, 到頂關卡)：讓數值隨關卡「線性」從起始值變到到頂值（難度曲線的基本工具） */
    function ansMs(level) { var s = stageOf(level), r = s.g === GEO4 ? ANS4_S : ANS9_S; return Math.round(kit.ramp(s.idx, r[0], r[1], s.len) * 1000); }  /* kit.ramp(關卡, 起始值, 到頂值, 到頂關卡)：讓數值隨關卡「線性」從起始值變到到頂值（難度曲線的基本工具） */
    function deepP(level) { var s = stageOf(level); return kit.ramp(s.idx, DEEP_P[0], DEEP_P[1], s.len); }
    function bitCount(m) { var c = 0; while (m) { c += m & 1; m >>= 1; } return c; }
    function onlyDigit(m) { for (var d = 1; d <= 9; d++) if (m === (1 << d)) return d; return 0; }
    /* 做出一個完整正確的盤面（N×N，每個數字 1～N）。
       做法（標準的數獨造盤法）：先用公式排出一個一定合法的基本盤面 base(r, c)＝(B×(r mod B)＋⌊r÷B⌋＋c) mod N，
       再隨機洗牌——數字 1～N 重新對應、「宮列」（每 B 排一組）彼此交換、同一個宮列裡的排互相交換、「宮行」與欄同理——
       這些洗牌都不會破壞規則，所以每一個結果都是合法的完整盤面。 */
    function makeSolution(g, rand) {
        rand = rand || Math.random;                     /* 沒有傳亂數函式就用 Math.random（測試時可以傳固定的亂數，結果才能重現） */
        var B = g.B, N = g.N, digits = kit.shuffle(Array.apply(null, Array(N)).map(function (_, i) { return i + 1; }), rand);  /* kit.shuffle(陣列, rand)：把陣列隨機洗牌，回傳新陣列（不會動到原本的） */
        /* 洗牌後的排／欄順序：先洗「組」的順序，組裡面再各自洗 */
        function order() {
            var bands = kit.shuffle(Array.apply(null, Array(B)).map(function (_, i) { return i; }), rand), out = [];  /* Array.apply(null, Array(n)).map(...)：建立「0 到 n−1 的編號陣列」的常見寫法 */
            bands.forEach(function (b) { kit.shuffle(Array.apply(null, Array(B)).map(function (_, i) { return b * B + i; }), rand).forEach(function (x) { out.push(x); }); });  /* map：把陣列的每個元素轉換成別的東西，回傳新陣列 */
            return out;
        }
        var rowMap = order(), colMap = order(), sol = [];
        for (var r = 0; r < N; r++) for (var c = 0; c < N; c++) {
            var rr = rowMap[r], cc = colMap[c];
            sol.push(digits[(B * (rr % B) + Math.floor(rr / B) + cc) % N]);
        }
        return sol;
    }
    /* 推理器：givens＝每格的數字（0＝空格）。只用兩種邏輯——
         ① 排除法：某格的候選數字只剩一個，就填它；
         ② 單位裡的唯一位置：某個數字在某一排／某一欄／某一個宮裡只剩一格能放，就填它。
       反覆做到推不動為止。回傳 { grid（推理後的盤面，0＝推不出）, steps（用了幾輪）, solved（目標是否推出）, value（推出的目標數字或 0） } */
    function deduce(g, givens, target) {
        var cand = [], gr = givens.slice(), i, d, N = g.N;  /* slice()：複製一份陣列（之後改複本，不會動到原本的資料） */
        for (i = 0; i < g.cells; i++) cand.push(g.ALL);
        function place(idx, dg) {
            gr[idx] = dg; cand[idx] = 1 << dg;
            g.PEERS[idx].forEach(function (p) { if (gr[p] !== dg) cand[p] &= ~(1 << dg); });  /* forEach：對陣列的每個元素各做一次 */
        }
        for (i = 0; i < g.cells; i++) if (gr[i]) place(i, gr[i]);
        var steps = 0, changed = true;
        while (changed) {
            changed = false;
            for (i = 0; i < g.cells; i++) {
                if (!gr[i] && bitCount(cand[i]) === 1) { place(i, onlyDigit(cand[i])); changed = true; }
            }
            g.UNITS.forEach(function (u) {              /* forEach：對陣列的每個元素各做一次 */
                for (d = 1; d <= N; d++) {
                    if (u.some(function (c) { return gr[c] === d; })) continue;  /* some：陣列裡「只要有一個」元素符合條件就回傳 true */
                    var spots = u.filter(function (c) { return !gr[c] && (cand[c] & (1 << d)); });  /* filter：留下符合條件的元素，回傳新陣列 */
                    if (spots.length === 1) { place(spots[0], d); changed = true; }
                }
            });
            if (changed) steps++;
            if (target != null && gr[target]) break;
        }
        return { grid: gr, steps: steps, solved: target != null ? !!gr[target] : false, value: target != null ? gr[target] : 0 };
    }
    /* 出一題：{ g, N, solution（完整解答）, target（要猜的那一格）, givens（提示盤面，0＝空格，目標那格一定是 0）, steps（推理需要幾輪）, answer, count（提示個數） }
       做法：試最多 40 次，每次「做出解答 → 挑目標 → 能拿的提示都拿掉」；提示個數離目標（givensFor）不超過 SLACK 個就收，
       否則記下提示最少的那次，最後用它。「繞一圈」題型（先拿目標的鄰居、留下不相干的格子）前 10 次試不到才改用普通的拿法。 */
    function makePuzzle(level, rand) {
        rand = rand || Math.random;
        var g = stageOf(level).g, want = givensFor(level), best = null;
        for (var tr = 0; tr < 40; tr++) {
            var sol = makeSolution(g, rand), target = kit.randInt(0, g.cells - 1, rand);  /* kit.randInt(最小, 最大, rand)：隨機整數（含最小與最大） */
            var givens = sol.slice(); givens[target] = 0;  /* slice()：複製一份陣列（之後改複本，不會動到原本的資料） */
            var others = [];
            for (var i = 0; i < g.cells; i++) if (i !== target) others.push(i);
            var count = others.length;
            var order = kit.shuffle(others, rand);      /* kit.shuffle(陣列, rand)：把陣列隨機洗牌，回傳新陣列（不會動到原本的） */
            /* 「繞一圈」的題目：先拿「跟目標同橫排、同直排、同宮」的提示，留下不相干的格子，推理就得先靠它們推出別格，再推目標 */
            if (tr < 10 && rand() < deepP(level)) {
                var near = order.filter(function (c) { return g.PEERS[target].indexOf(c) >= 0; }), far = order.filter(function (c) { return g.PEERS[target].indexOf(c) < 0; });  /* indexOf：找元素在陣列（或字串）裡的位置，找不到回傳 −1（所以 < 0 代表「不在裡面」） */
                order = near.concat(far);
            }
            order.forEach(function (c) {
                if (count <= want) return;
                var save = givens[c]; givens[c] = 0;
                var r = deduce(g, givens, target);
                if (r.solved && r.value === sol[target]) count--; else givens[c] = save;
            });
            var fin = deduce(g, givens, target);
            if (!fin.solved || fin.value !== sol[target]) continue;
            var pz = { g: g, N: g.N, solution: sol, target: target, givens: givens, steps: fin.steps, answer: sol[target], count: count };
            if (count <= want + SLACK) return pz;
            if (!best || count < best.count) best = pz;
        }
        if (best) return best;
        /* 保底：只拿掉目標那一格，其他全是提示 */
        var fbSol = makeSolution(g, rand), fbT = 0, fbG = fbSol.slice(); fbG[fbT] = 0;
        return { g: g, N: g.N, solution: fbSol, target: fbT, givens: fbG, steps: deduce(g, fbG, fbT).steps, answer: fbSol[fbT], count: g.cells - 1 };
    }
    /* 結算畫面的評語：依成績回傳一句話 */
    function rating(n) {
        if (n >= 25) return '數獨高手！';
        if (n >= 15) return '推理很敏捷！';
        if (n >= 8) return '不錯喔！';
        if (n >= 3) return '再接再厲！';
        return '先看同一排、同一欄、同一宮缺哪個數字，再來一次！';
    }

    /* mount：選單按下這款遊戲時會呼叫它。把「闖關」的流程（第幾關、過關、失敗、結算、最佳紀錄）交給共用骨架 kit.run，我們只提供 setup（每一關怎麼畫）、rating（評語）等小零件。 */
    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 6,
            numText: function (v) { return v + ' 關'; },
            rating: rating,
            lines: function (S) { return ['通過 ' + S.cleared + ' 關']; },
            setup: setup
        });
    }

    /* setup(api)：每一關開始時呼叫一次，負責出題並把這一關的畫面建出來。api 是共用骨架給的工具：api.stage（這一關的畫面容器）、api.level（第幾關）、
       api.after（延遲執行，換關後自動作廢）、api.timer（倒數計時）、api.pass／api.fail（過關／失敗）。 */
    function setup(api) {
        var stage = api.stage, level = api.level;       /* stage：這一關的畫面容器（要畫的東西都放進去）；level：現在是第幾關 */
        var q = makePuzzle(level, api.rand), g = q.g, N = g.N, B = g.B;
        api.info = q;                                   /* 把這一關的題目資料掛在 api.info，測試與 debug 用（玩家看不到） */
        console.log('[數獨猜一格] 第 ' + level + ' 關：' + N + '×' + N + '（' + B + '×' + B + ' 的宮）目標第 ' + (g.rowOf(q.target) + 1) + ' 排第 ' + (g.colOf(q.target) + 1) + ' 格，答案 ' + q.answer + '；提示 ' + q.count + ' 個（想要 ' + givensFor(level) + '），推理 ' + q.steps + ' 輪；限時 ' + ansMs(level) + ' ms');  /* 在瀏覽器主控台（按 F12）印出這一關的出題內容，方便除錯與驗證 */

        /* 盤面：N 欄 N 列的格子，每一格的邊長由 css 的 .sudokuone-board--n4／--n9 決定；每個宮的最右一欄、最下一排畫粗線（sudokuone-cE／sudokuone-rE） */
        var W = stage.clientWidth || 472, bm = boardMetrics(W, N);
        var board = h('div', { 'class': 'sudokuone-board sudokuone-board--n' + N });
        board.style.setProperty('--sdk-cell', bm.cell.toFixed(3) + 'px');                 /* 每格邊長：盤面寬度是畫面寬的 96% */
        board.style.setProperty('--sdk-font', Math.round(bm.cell * (N === 4 ? 0.62 : 0.72)) + 'px');  /* style.setProperty('--名稱', 值)：用 JS 設定 CSS 變數，CSS 裡用 var(--名稱) 取用（把算好的尺寸交給樣式） */
        var cells = [];
        for (var i = 0; i < g.cells; i++) {
            var c = h('div', { 'class': 'sudokuone-cell' });
            if (g.colOf(i) % B === B - 1) c.className += ' sudokuone-cE';
            if (g.rowOf(i) % B === B - 1) c.className += ' sudokuone-rE';
            if (i === q.target) c.className += ' sudokuone-cell--target';
            else if (g.rowOf(i) === g.rowOf(q.target) || g.colOf(i) === g.colOf(q.target) || g.blockOf(i) === g.blockOf(q.target)) c.className += ' sudokuone-cell--peer';
            if (q.givens[i]) { c.textContent = String(q.givens[i]); c.className += ' sudokuone-cell--given'; }  /* textContent：設定元素裡的文字（安全，不會被當成 HTML 解析） */
            else if (i === q.target) c.textContent = '？';  /* textContent：設定元素裡的文字（安全，不會被當成 HTML 解析） */
            board.appendChild(c); cells.push(c);        /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
        }
        var tip = h('div', { 'class': 'qz-note sudokuone-tip sudokuone-tip--n' + N, text: '黃色那一格數字是哪個？' });
        tip.style.top = Math.round(10 + bm.height + 4) + 'px';  /* Math.round：四捨五入成整數 */
        stage.appendChild(board); stage.appendChild(tip);  /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
        var items = [];
        for (var d = 1; d <= N; d++) (function (d) { items.push({ text: String(d), kind: 'sky', cls: 'sudokuone-btn', onTap: function () { judge(d); } }); })(d);
        /* 數字鍵：4×4 排成一排 4 顆（每顆大一點）；9×9 排成 3×3 */
        var grid = kit.btnGrid(stage, items, N === 4 ? { cols: 4, h: 84, gap: 8 } : { cols: 5, h: 62, gap: 8 });  /* kit.btnGrid：共用的按鈕列（一排大按鈕） */
        api.timer(ansMs(level), function () { judge(null); });  /* 開始倒數（畫面上方的時間條）：時間到就呼叫後面那個函式 */
        if (level === 1 && kit.once('sudokuone.hint')) kit.hintOn(stage, grid.btns[q.answer - 1], { mode: 'tap', delay: 700, text: '請點擊數字' });  /* 操作提示（手指圖示指出該點哪裡）：玩家第一次按下就消失 */

        /* 判定玩家的答案：答對就過關（api.pass），答錯或超時就失敗（api.fail） */
        function judge(v) {
            if (api.over) return;
            var ok = v === q.answer;
            /* 揭曉：整個解答都填出來，目標那一格標大字 */
            cells.forEach(function (c, k) {
                if (!q.givens[k]) { c.textContent = String(q.solution[k]); c.classList.add('sudokuone-cell--fill'); }  /* classList.add／remove／toggle：加上／拿掉 CSS class，元素的外觀就跟著變（class 的樣式寫在 css 檔裡） */
            });
            cells[q.target].classList.add(ok ? 'sudokuone-cell--ok' : 'sudokuone-cell--bad');  /* classList.add／remove／toggle：加上／拿掉 CSS class，元素的外觀就跟著變（class 的樣式寫在 css 檔裡） */
            if (ok) { kit.flash(stage, true, api.my); api.pass({ delay: 1200 }); return; }  /* kit.flash(舞台, 對或錯, 計時器)：畫面閃一下綠光（答對）或紅光（答錯） */
            kit.flash(stage, false, api.my);            /* kit.flash(舞台, 對或錯, 計時器)：畫面閃一下綠光（答對）或紅光（答錯） */
            api.fail({                                  /* api.fail({ delay, lines })：宣告「失敗」，delay 毫秒後進結算畫面，lines 是結算要多寫的說明行 */
                delay: REVEAL_FAIL_MS, lines: [
                    (v == null ? '時間到！' : '你選了 ' + v) + '，黃色那一格是 ' + q.answer,
                    '第 ' + (g.rowOf(q.target) + 1) + ' 排第 ' + (g.colOf(q.target) + 1) + ' 格；整個盤面的解答已填出'
                ]
            });
        }
        /* 給測試／debug 用：api.solve 自動走出正解、api.wrong 故意走錯一步、api.state 回報目前狀態（瀏覽器自動測試會呼叫它們，玩家用不到）。 */
        api.solve = function () { judge(q.answer); };
        api.wrong = function () { judge(q.answer % N + 1); };
    }

    /* 遊戲登記資料：id 代號、name 選單上的名稱、rule 玩法說明（**包起來的是粗體重點）、mount 進場函式、score 成績規格、test 給單元測試用的內部函式。 */
    var G = {
        id: ID,
        name: '數獨猜一格',
        rule: '標準的數獨：**每一橫排、每一直排、每一個宮裡，數字都不重複**。前面的關卡是 4×4（四個 2×2 的宮，數字 1～4），第 11 關起變成更難的 9×9（九個 3×3 的宮，數字 1～9）。盤面上黃色的那一格，**只要猜出它是幾就好**。猜錯或來不及就結束，看你能過幾關。越後面，提示數字越少，要多推理幾步！',
        mount: mount,
        score: SCORE,
        /* test：把內部函式與參數交給單元測試（test/reaction/ 底下的 t_*.js）使用，遊戲本身不會用到。 */
        test: {
            boardMetrics: boardMetrics, BOARD_FRAC: BOARD_FRAC, REVEAL_FAIL_MS: REVEAL_FAIL_MS, GEO4: GEO4, GEO9: GEO9, makeGeom: makeGeom, stageOf: stageOf, givensFor: givensFor, ansMs: ansMs, deepP: deepP, makeSolution: makeSolution, deduce: deduce, makePuzzle: makePuzzle, rating: rating,
            FOUR_LEVELS: FOUR_LEVELS, RAMP9: RAMP9, GIVENS4: GIVENS4, GIVENS9: GIVENS9, ANS4_S: ANS4_S, ANS9_S: ANS9_S, MAX_LEVEL: MAX_LEVEL
        }
    };
    /* 把這款遊戲登記給選單（沒有這行，選單就看不到它） */
    Reaction.register(G);
})();
