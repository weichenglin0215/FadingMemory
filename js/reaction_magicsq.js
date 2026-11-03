/* ═══════════════════════════════════════════════════════════════════
   reaction_magicsq.js — 秒反應・魔方陣（深思篇 430「魔方陣」，河圖洛書；復活 #028「缺角魔方陣」）
   樣式：css/games/reaction_magicsq.css（class 一律以「magicsq-」開頭）
   ───────────────────────────────────────────────────────────────────
   · 玩法：把 1～N² 各填一次，使**每一橫排、每一直行、兩條對角線的加總都一樣**（3×3 是 15，4×4 是 34）。
     盤面已經給了幾個數字。點空格、點下面的數字（已經用過的數字會變灰）。每一排／列旁邊會即時顯示「還差多少」，
     對角線的狀況寫在盤面下面——填進一個數字，所有經過這一格的線的「還差多少」立刻變。
   · 沒有時間限制、不會失敗：全部填對（答案唯一）就過關，換下一題；按左上角「返回」結束，成績＝解開幾題。
   · 難度：3×3 洛書（第 1～8 關，題目給 3 → 2 個數字；3×3 剛好只有 8 種，這 8 關每關一種，不重複）→ 4×4（第 9 關起，總和 34，給 8 → 5 個數字，
     第 9 → 30 關線性）。企劃裡第 21～30 關的「魔術三角／星」這一版還沒做。
   · 出題：3×3 把 8 種全部列出來；4×4（共 7040 種）用回溯法隨機造一個。再從這個答案隨機挑 k 格當提示，
     用回溯法數「符合這些提示的魔方陣有幾種」，剛好 1 種才收（不唯一就重挑，挑不到就多給一個提示）。
   · 提示（每題 HINTS 次）：標出「所在的排／列／對角線剩最少空格」的一個沒填對的格子（最好推理的那一格），不說數字。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    /* 新手導讀：整個檔案包在 (function () { ... })(); 裡，裡面的變數都是這個檔案私有的。
       分三段：① 參數區（難度在這）；② 純函式（算魔方陣、搜尋答案、出題、判斷對錯，單元測試直接測）；③ 畫面（mount／setup）。
       魔方陣：把 1～N×N 各填一次，讓每一排、每一列、兩條對角線的和都一樣（叫「魔術數」，3×3 是 15、4×4 是 34）。 */
    'use strict';

    var ID = 'magicsq';                                 /* 這款遊戲的代號：選單、成績、存檔、CSS class 前綴（magicsq-）都用它 */
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 90 };
    var h = UI.h, kit = Reaction.kit;                   /* h：建立網頁元素的小工具；kit：闖關遊戲共用工具箱 */

    /* ═══ 可以自己調的參數 ═══ */
    var LEVELS3 = 8;                            /* 前幾關是 3×3（最多 8，因為 3×3 只有 8 種）；之後是 4×4 */
    var GIVENS3 = [3, 2];                       /* 3×3 提示個數：第 1 關 → 第 LEVELS3 關 */
    var GIVENS4 = [8, 5];                       /* 4×4 提示個數：第一個 4×4 關 → 第 RAMP4 關 */
    var RAMP4 = 22;                             /* 4×4 的提示數走幾關到頂 */
    var HINTS = 3;                              /* 每一題可以用幾次提示（0＝關掉提示鈕） */
    var MAX_LEVEL = 90;                             /* 最後一關：過了第 90 關就算全破（也是成績的上限） */
    var PASS_DELAY_MS = 1300;                       /* 答對（過關）後停多久才換下一關（毫秒，1300 毫秒＝1.3 秒） */
    var CELL_MAX = 84;                              /* 每個格子的最大邊長（px） */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    /* 魔術數：1～n² 的總和是 n²(n²+1)/2，平均分給 n 排，每排就是 n(n²+1)/2（3×3 → 15、4×4 → 34） */
    function magicSum(n) { return n * (n * n + 1) / 2; }
    /* 這一關是幾乘幾：前 LEVELS3 關（最多 8 關）是 3×3，之後是 4×4 */
    function sizeFor(level) { return level <= Math.min(8, LEVELS3) ? 3 : 4; }
    /* 這一關要給幾個提示數（已經填好的格子）：3×3 與 4×4 各自從第一個數字線性變到第二個（越少越難） */
    function givensFor(level) {
        if (sizeFor(level) === 3) return Math.round(kit.ramp(level, GIVENS3[0], GIVENS3[1], Math.max(2, Math.min(8, LEVELS3))));  /* kit.ramp(關卡, 起始值, 到頂值, 到頂關卡)：讓數值隨關卡「線性」從起始值變到到頂值（難度曲線的基本工具） */
        return Math.round(kit.ramp(level - Math.min(8, LEVELS3), GIVENS4[0], GIVENS4[1], RAMP4));  /* Math.round：四捨五入成整數 */
    }
    /* 所有的線（排、列、兩條對角線），每條線是 n 個格子的編號 */
    /* 列出所有「要加起來是魔術數」的線：n 條排、n 條列、2 條對角線；每條線是 n 個格子編號的陣列（編號 ＝ 排 × n ＋ 欄） */
    function linesOf(n) {
        var L = [], r, c;
        for (r = 0; r < n; r++) { var a = []; for (c = 0; c < n; c++) a.push(r * n + c); L.push(a); }
        for (c = 0; c < n; c++) { var b = []; for (r = 0; r < n; r++) b.push(r * n + c); L.push(b); }
        var d1 = [], d2 = [];
        for (r = 0; r < n; r++) { d1.push(r * n + r); d2.push(r * n + (n - 1 - r)); }
        L.push(d1, d2);
        return L;
    }
    /* 搜尋魔方陣：givens＝已固定的格子（0＝空），一格一格往下填，不合就退回；最多找 limit 個答案。
       rand 有給就用亂數順序試數字（用來「隨機造一個魔方陣」）。回傳 { count, first }。
       剪枝：每排／列／對角線的加總不能超過目標、填滿時要剛好等於目標。 */
    /* 用回溯法找魔方陣：givens 是已固定的格子（0＝空），一格一格由左上往右下填，不合規定就退回上一格；最多找 limit 個答案。
       rand 有給就用亂數順序試數字（用來「隨機造一個魔方陣」）。回傳 { count 找到幾個, first 第一個 }。
       剪枝（提早放棄走不通的路）：每排／列／對角線的加總不能超過魔術數、填滿那條線時要剛好等於魔術數。 */
    function search(n, givens, limit, rand) {
        var M = magicSum(n), total = n * n, g = new Array(total).fill(0), used = new Array(total + 1).fill(false), i;  /* new Array(n).fill(v)：建立長度 n、每一格都是 v 的陣列 */
        for (i = 0; i < total; i++) if (givens[i]) { if (used[givens[i]]) return { count: 0, first: null }; used[givens[i]] = true; }
        var colSum = new Array(n).fill(0), d1 = 0, d2 = 0, count = 0, first = null;
        /* rec(pos)：填第 pos 格（遞迴）。rowSum、colSum、d1、d2 是目前「排／列／兩條對角線」已經累計的和，每填一格就更新，退回時再減掉（回溯） */
        function rec(pos) {
            if (pos === total) { if (d1 === M && d2 === M) { count++; if (!first) first = g.slice(); } return; }  /* slice()：複製一份陣列（之後改複本，不會動到原本的資料） */
            var r = Math.floor(pos / n), c = pos % n, rowSum = 0, k;  /* Math.floor：無條件捨去成整數 */
            for (k = 0; k < c; k++) rowSum += g[r * n + k];
            var vals = [];
            if (givens[pos]) vals.push(givens[pos]);
            else { for (var v0 = 1; v0 <= total; v0++) if (!used[v0]) vals.push(v0); if (rand) vals = kit.shuffle(vals, rand); }  /* kit.shuffle(陣列, rand)：把陣列隨機洗牌，回傳新陣列（不會動到原本的） */
            for (var vi = 0; vi < vals.length; vi++) {
                var v = vals[vi], fixed = !!givens[pos];
                var rs = rowSum + v;
                if (rs > M || (c === n - 1 && rs !== M)) continue;
                if (c < n - 1 && rs + (n - 1 - c) > M) continue;
                var cs = colSum[c] + v;
                if (cs > M || (r === n - 1 && cs !== M)) continue;
                if (r === c && (d1 + v > M || (r === n - 1 && d1 + v !== M))) continue;
                if (r + c === n - 1 && (d2 + v > M || (r === n - 1 && d2 + v !== M))) continue;
                if (!fixed) used[v] = true;
                g[pos] = v; colSum[c] += v;
                if (r === c) d1 += v;
                if (r + c === n - 1) d2 += v;
                rec(pos + 1);
                if (!fixed) used[v] = false;
                g[pos] = 0; colSum[c] -= v;
                if (r === c) d1 -= v;
                if (r + c === n - 1) d2 -= v;
                if (count >= limit) return;
            }
        }
        rec(0);
        return { count: count, first: first };
    }
    /* 3×3 的 8 個魔方陣全部列出來（4×4 有 7040 個，不列，改用 search 隨機造＋數個數） */
    var all3 = null;                                    /* 3×3 的魔方陣只有 8 個，第一次用到時全部列出來存著（all3），之後直接取 */
    /* 窮舉 3×3 的所有魔方陣：把 1～9 的所有排列（9! ＝ 362880 種）都試一遍，每條線都是 15 的就收下。3×3 很小，窮舉最簡單 */
    function enumerate3() {
        if (all3) return all3;
        all3 = [];
        /* 3×3 太小，直接窮舉 9! 種排列最快 */
        var perm = [1, 2, 3, 4, 5, 6, 7, 8, 9];
        (function pm(a, k) { if (k === a.length) { var s = linesOf(3).every(function (ln) { return ln.reduce(function (t, i) { return t + a[i]; }, 0) === 15; }); if (s) all3.push(a.slice()); return; } for (var i = k; i < a.length; i++) { var t = a[k]; a[k] = a[i]; a[i] = t; pm(a, k + 1); t = a[k]; a[k] = a[i]; a[i] = t; } })(perm, 0);  /* every：陣列裡「每一個」元素都符合條件才回傳 true */
        return all3;
    }
    /* 符合提示（givens：0＝空格）的魔方陣有幾個（最多數到 limit） */
    /* 符合這些提示的魔方陣有幾個（最多數到 limit）：出題時用它確認「答案只有一個」 */
    function countMatching(n, givens, limit) { return search(n, givens, limit || 2, null).count; }
    /* 出一題：{ n, solution, givens, count, M }。usedSolutions（選填）：3×3 前幾關不要重複用同一個答案 */
    /* 出一題：先挑一個答案（3×3 從 8 個裡挑、4×4 用 search 隨機造），再隨機挑幾格當提示，
       用 countMatching 確認「只有這個答案」才收；300 次都不唯一就多給一個提示。usedSolutions：3×3 的前幾關不重複用同一個答案。 */
    function makePuzzle(level, rand, usedSolutions) {
        rand = rand || Math.random;
        var n = sizeFor(level), k = givensFor(level), sol = null, tries = 0;
        if (n === 3) {
            var all = enumerate3(), fresh = usedSolutions ? all.filter(function (s) { return usedSolutions.indexOf(s.join(',')) < 0; }) : all;  /* indexOf：找元素在陣列（或字串）裡的位置，找不到回傳 −1（所以 < 0 代表「不在裡面」） */
            sol = kit.pick(fresh.length ? fresh : all, rand);  /* kit.pick(陣列, rand)：從陣列隨機挑一個元素 */
        } else sol = search(4, new Array(16).fill(0), 1, rand).first;
        var cells = Array.apply(null, Array(n * n)).map(function (_, i) { return i; }), want = k;  /* Array.apply(null, Array(n)).map(...)：建立「0 到 n−1 的編號陣列」的常見寫法 */
        while (true) {
            for (var t = 0; t < 300; t++) {
                var pick = kit.shuffle(cells, rand).slice(0, want), givens = new Array(n * n).fill(0);
                pick.forEach(function (c) { givens[c] = sol[c]; });  /* forEach：對陣列的每個元素各做一次 */
                if (countMatching(n, givens, 2) === 1) return { n: n, solution: sol, givens: givens, count: want, M: magicSum(n) };
            }
            want++;          /* 這個提示數怎麼挑都不唯一：多給一個 */
            if (++tries > n * n) return { n: n, solution: sol, givens: sol.slice(), count: n * n, M: magicSum(n) };
        }
    }
    /* 每條線現在的狀況：{ sum, empty（空格數）, diff（目標 − 目前加總）, full, ok } */
    /* 每條線現在的狀況：加總 sum、空格數 empty、離目標還差多少 diff（目標 − 目前）、填滿了嗎 full、填滿而且剛好嗎 ok（畫面上「差 N／多 N／✓／✗」就來自這裡） */
    function lineStatus(n, grid) {
        var M = magicSum(n);
        return linesOf(n).map(function (ln) {           /* map：把陣列的每個元素轉換成別的東西，回傳新陣列 */
            var sum = 0, empty = 0;
            ln.forEach(function (i) { if (grid[i]) sum += grid[i]; else empty++; });
            return { sum: sum, empty: empty, diff: M - sum, full: empty === 0, ok: empty === 0 && sum === M };
        });
    }
    /* 解開了嗎：每格都有數字、而且每條線都剛好是魔術數 */
    function isSolved(n, grid) {
        for (var i = 0; i < grid.length; i++) if (!grid[i]) return false;
        return lineStatus(n, grid).every(function (s) { return s.ok; });
    }
    /* 提示：挑一格「沒填對」的，優先選它所在的線剩下的空格最少的那一格（最好推理） */
    /* 提示：在「沒填對」的格子裡，挑它所在的線「剩下空格最少」的那格（最容易推理的一格） */
    function hintCell(pz, grid) {
        var n = pz.n, ls = linesOf(n), st = lineStatus(n, grid), best = -1, bs = 99;
        for (var i = 0; i < n * n; i++) {
            if (grid[i] === pz.solution[i]) continue;
            var sc = 99;
            ls.forEach(function (ln, li) { if (ln.indexOf(i) >= 0) sc = Math.min(sc, st[li].empty + (grid[i] ? 0 : 0)); });
            if (sc < bs) { bs = sc; best = i; }
        }
        return best;
    }
    /* 結算畫面的評語（依解開題數） */
    function rating(n) {
        if (n >= 25) return '洛書高手！';
        if (n >= 12) return '加總很穩！';
        if (n >= 5) return '越來越有感覺了！';
        return '先想想：中間那一格是幾？每一條線的總和是多少？';
    }

    /* ═══ 畫面 ═══ */
    /* 遊戲進場：交給共用骨架 kit.run 處理闖關流程。leaveSettle: true 代表「沒有失敗」的自由解題——按返回會先結算再離開。usedSol 記下 3×3 用過的答案 */
    function mount(root, ctx) {
        var usedSol = [];
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 5, resume: false, leaveSettle: true,
            head: function (level) { return '第 ' + level + ' 關'; },
            info: function (S) { return '已解 ' + S.cleared + ' 關'; },
            numText: function (v) { return v + ' 關'; },
            rating: rating,
            lines: function (S) { return ['解開 ' + S.cleared + ' 關']; },
            setup: function (api) { setup(api, usedSol); }
        });
    }

    /* 每一關開始時呼叫：出題、建立盤面、數字鍵與按鈕。api 是共用骨架給的工具（api.stage 畫面容器、api.pass 過關…） */
    function setup(api, usedSol) {
        var stage = api.stage, level = api.level;
        var pz = makePuzzle(level, api.rand, usedSol), n = pz.n, total = n * n;
        if (n === 3) usedSol.push(pz.solution.join(','));
        api.info = pz;
        console.log('[魔方陣] 第 ' + level + ' 關：' + n + '×' + n + '，總和 ' + pz.M + '，提示 ' + pz.count + ' 個');
        var W = stage.clientWidth || 472;
        var statW = 80, statH = 44, cell = Math.min(CELL_MAX, Math.floor((W * 0.96 - statW - n * 4) / n));  /* 算每格大小：舞台寬度 ×0.96 扣掉右邊「差多少」欄（statW）與格子間距，再除以邊長，最大不超過 CELL_MAX */
        var grid = pz.givens.slice(), sel = -1, hint = -1, hintsLeft = HINTS, solved = false;  /* grid：目前盤面（先抄一份題目）；sel：選中的格子（−1＝沒選）；hint：提示標出的格子；hintsLeft：剩幾次提示；solved：已解開 */
        var lines = linesOf(n);

        var wrap = h('div', { 'class': 'magicsq-wrap' });  /* wrap：整個遊戲畫面的外框容器；下面建好的各個區塊（盤面、按鈕…）都放進它，最後再整個放進舞台 */
        var board = h('div', { 'class': 'magicsq-board' });  /* board：盤面（所有格子都放在裡面） */
        board.style.setProperty('--magicsq-n', n);      /* style.setProperty('--名稱', 值)：用 JS 設定 CSS 變數，CSS 裡用 var(--名稱) 取用（把算好的尺寸交給樣式） */
        board.style.setProperty('--magicsq-cell', cell + 'px');
        board.style.setProperty('--magicsq-statw', statW + 'px');
        board.style.setProperty('--magicsq-stath', statH + 'px');
        board.style.setProperty('--magicsq-font', Math.round(cell * 0.5) + 'px');
        var cells = [], rowSt = [], colSt = [], r, c;
        for (r = 0; r < n; r++) {
            for (c = 0; c < n; c++) {
                var cl = h('div', { 'class': 'magicsq-cell' });
                (function (idx) { kit.onTap(cl, function () { select(idx); }); })(r * n + c);  /* 用立即執行函式存住這一格的編號 idx（不這樣寫，每格點下去都會拿到迴圈結束時的值） */
                board.appendChild(cl); cells.push(cl);  /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
            }
            var rs = h('div', { 'class': 'magicsq-status' }); board.appendChild(rs); rowSt.push(rs);
        }
        for (c = 0; c < n; c++) { var cs = h('div', { 'class': 'magicsq-status' }); board.appendChild(cs); colSt.push(cs); }
        board.appendChild(h('div', { 'class': 'magicsq-status' }));
        var diagTip = h('div', { 'class': 'magicsq-diag' });
        var tipText = '每條線加起來都要是 ' + pz.M;
        var tip = h('div', { 'class': 'magicsq-tip', text: tipText });  /* tip：盤面下方的提示文字（操作說明、出錯的原因會寫在這裡） */

        var pad = h('div', { 'class': 'magicsq-pad' });
        pad.style.gridTemplateColumns = 'repeat(' + (total === 9 ? 5 : 9) + ', minmax(0, 1fr))';
        var keys = [];
        /* 一個數字一顆鍵（用立即執行函式存住 dg，原因同上）；用過的數字會變灰 */
        for (var d = 1; d <= total; d++) (function (dg) {
            var b = h('button', { 'class': 'btn btn--sky magicsq-key', type: 'button', text: String(dg) });
            kit.onTap(b, function () { enter(dg); });   /* kit.onTap(元素, 函式)：幫元素綁定「點一下」的動作（手機觸控與電腦滑鼠通用，反應比一般 click 快） */
            pad.appendChild(b); keys.push(b);
        })(d);
        var eraser = h('button', { 'class': 'btn btn--line magicsq-key', type: 'button', text: '⌫' });
        kit.onTap(eraser, function () { enter(0); });
        pad.appendChild(eraser);

        var acts = h('div', { 'class': 'magicsq-tools' });
        var btnHint = h('button', { 'class': 'btn btn--line magicsq-tool', type: 'button', text: '提示 ' + hintsLeft });  /* 「提示」按鈕（文字會顯示還剩幾次提示） */
        var btnReset = h('button', { 'class': 'btn btn--line magicsq-tool', type: 'button', text: '重來' });  /* 「重來」按鈕 */
        kit.onTap(btnHint, useHint);
        kit.onTap(btnReset, reset);
        if (HINTS > 0) acts.appendChild(btnHint);       /* 提示次數 HINTS 設成 0，就連提示按鈕都不放 */
        acts.appendChild(btnReset);
        wrap.appendChild(board); wrap.appendChild(diagTip); wrap.appendChild(tip); wrap.appendChild(pad); wrap.appendChild(acts);
        stage.appendChild(wrap);                        /* 把整個遊戲區放進舞台（放進去，畫面上才看得到） */

        /* 更新一條線旁邊的小字：還沒填滿寫「差 N／多 N」，填滿了寫 ✓（剛好）或 ✗（不對），多了或錯了標紅 */
        function statText(el, s) {
            el.textContent = s.full ? (s.ok ? '✓' : '✗') : (s.diff >= 0 ? '差 ' + s.diff : '多 ' + (-s.diff));  /* textContent：設定元素裡的文字（安全，不會被當成 HTML 解析） */
            el.className = 'magicsq-status' + (s.full ? (s.ok ? ' magicsq-status--ok' : ' magicsq-status--bad') : (s.diff < 0 ? ' magicsq-status--bad' : ''));
        }
        /* 重畫整個盤面：格子數字與狀態、每排每列旁邊的「差多少」、對角線、數字鍵是否已用過 */
        function paint() {
            var st = lineStatus(n, grid), used = {};
            for (var i = 0; i < total; i++) {
                cells[i].textContent = grid[i] ? String(grid[i]) : '';
                cells[i].className = 'magicsq-cell' + (pz.givens[i] ? ' magicsq-cell--given' : grid[i] ? ' magicsq-cell--mine' : '') + (i === sel ? ' magicsq-cell--sel' : '') + (i === hint ? ' magicsq-cell--hint' : '') + (solved ? ' magicsq-cell--ok' : '');
                if (grid[i]) used[grid[i]] = true;
            }
            for (var k = 0; k < n; k++) { statText(rowSt[k], st[k]); statText(colSt[k], st[n + k]); }
            var s1 = st[2 * n], s2 = st[2 * n + 1];
            diagTip.innerHTML = '';                     /* innerHTML = ''：把元素裡面的東西全部清掉 */
            [['↘ 對角線', s1], ['↙ 對角線', s2]].forEach(function (p) {
                var s = p[1];
                diagTip.appendChild(h('span', { 'class': 'magicsq-diag__item' + (s.full ? (s.ok ? ' magicsq-diag__item--ok' : ' magicsq-diag__item--bad') : (s.diff < 0 ? ' magicsq-diag__item--bad' : '')), text: p[0] + ' ' + (s.full ? (s.ok ? '✓' : '✗') : (s.diff >= 0 ? '差 ' + s.diff : '多 ' + (-s.diff))) }));
            });
            keys.forEach(function (b, k2) { b.disabled = !!used[k2 + 1]; b.classList.toggle('magicsq-key--used', !!used[k2 + 1]); });  /* classList.add／remove／toggle：加上／拿掉 CSS class，元素的外觀就跟著變（class 的樣式寫在 css 檔裡） */
        }
        /* 點選一格 */
        function select(i) { if (solved) return; sel = i; paint(); }
        /* 按下數字鍵 v（0＝擦掉）：填進選中的格子（題目給的格子不能改），填完檢查是不是解開了 */
        function enter(v) {
            if (solved) return;
            if (sel < 0) { tip.textContent = '先點一格，再點數字'; return; }
            if (pz.givens[sel]) { tip.textContent = '這格是題目給的'; return; }
            hint = -1; grid[sel] = v; tip.textContent = tipText;
            paint();
            if (isSolved(n, grid)) win();
        }
        /* 解開：全部變綠、閃綠光並過關 */
        function win() {
            solved = true; sel = -1; paint(); tip.textContent = '每條線都是 ' + pz.M + '！';
            kit.flash(stage, true, api.my);             /* kit.flash(舞台, 對或錯, 計時器)：畫面閃一下綠光（答對）或紅光（答錯） */
            api.pass({ delay: PASS_DELAY_MS });         /* api.pass({ delay })：宣告「過關」，delay 毫秒後進下一關（最後一關則進結算） */
        }
        /* 提示：標出最好推理的一格（每題 HINTS 次） */
        function useHint() {
            if (solved || hintsLeft <= 0) return;
            var c = hintCell(pz, grid);
            if (c < 0) return;
            hintsLeft--; btnHint.textContent = '提示 ' + hintsLeft; btnHint.disabled = hintsLeft <= 0;
            hint = c; sel = c; tip.textContent = '閃動的那格最好推理'; paint();
        }
        /* 重來：盤面回到題目的樣子 */
        function reset() { if (solved) return; grid = pz.givens.slice(); sel = -1; hint = -1; paint(); }
        /* 給測試／debug 用：api.solve 一鍵填成答案、api.wrong 故意填錯一格、api.state 回報目前狀態 */
        api.solve = function () { grid = pz.solution.slice(); paint(); if (isSolved(n, grid)) win(); };
        api.wrong = function () { for (var i = 0; i < total; i++) if (!pz.givens[i]) { grid[i] = pz.solution[i] % total + 1; break; } paint(); };
        api.state = function () { return { grid: grid.slice(), solved: solved, hintsLeft: hintsLeft }; };
        paint();
    }

    /* 遊戲登記資料：id、名稱、規則文字（**包起來的是粗體重點）、mount 進場函式、score 成績規格、test 給單元測試用的內部函式 */
    var G = {
        id: ID,
        name: '魔方陣',
        rule: '把數字 1、2、3… 各填一次，讓**每一橫排、每一直行、兩條對角線，加起來的總和都一樣**（3×3 是 15，4×4 是 34）。盤面已經給了幾個數字。點空格，再點下面的數字（用過的數字會變灰）；每一排、每一列旁邊會寫「差多少」（還需要再加多少），對角線的在盤面下面，填到剛好就變成 ✓。沒有時間限制，也不會失敗；全部填對就換下一題，想結束就按左上角「返回」，成績是解開幾題。',
        mount: mount,
        score: SCORE,
        test: {
            magicSum: magicSum, sizeFor: sizeFor, givensFor: givensFor, linesOf: linesOf, search: search, enumerate3: enumerate3, countMatching: countMatching,
            makePuzzle: makePuzzle, lineStatus: lineStatus, isSolved: isSolved, hintCell: hintCell, rating: rating,
            LEVELS3: LEVELS3, GIVENS3: GIVENS3, GIVENS4: GIVENS4, RAMP4: RAMP4, HINTS: HINTS, MAX_LEVEL: MAX_LEVEL
        }
    };
    /* 把這款遊戲登記給選單（沒有這行，選單就看不到它） */
    Reaction.register(G);
})();
