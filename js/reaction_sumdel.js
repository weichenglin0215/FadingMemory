/* ═══════════════════════════════════════════════════════════════════
   reaction_sumdel.js — 秒反應・刪數湊和（深思篇 428「刪數湊和」，類似 2023 年流行的 Sumplete）
   樣式：css/games/reaction_sumdel.css（class 一律以「sumdel-」開頭）
   ───────────────────────────────────────────────────────────────────
   · 玩法：方陣裡每格一個數字，每一排、每一列旁邊有一個「目標」。**點掉一些數字（刪除），讓每一排、每一列剩下的數字加起來剛好等於目標。**
     再點一下可以恢復。每刪一個，所屬那一排和那一列旁邊的差額就立刻變：「−N」＝還要再少 N、「＋N」＝刪過頭了、「✓」＝剛好。
   · 沒有時間限制、不會失敗：全部的排和列都剛好等於目標（答案唯一）就過關，換下一題；按左上角「返回」結束，成績＝解開幾題。
   · 難度：方陣 4×4（第 1～6 關）→ 5×5（第 7～16 關）→ 7×7（第 17 關起）；數字範圍 1～9 一路走到 1～30（第 1 → 30 關，越大越難估）。
   · 出題：隨機數字＋隨機決定「刪哪幾格」→ 算出每排每列的目標 → 用回溯法數解的個數，**不是唯一解就重出**（所以每題只有一種刪法）。
     實測唯一解比例 90～100%。每題至少要刪掉 DEL_MIN 成的格子，不會出現「什麼都不用刪」。
   · 提示（每題 HINTS 次）：標出一個「現在跟答案不一樣」的格子（要刪卻沒刪、或不該刪卻刪了），不說該刪還是該留。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    /* 新手導讀：整個檔案包在 (function () { ... })(); 裡，裡面的變數都是這個檔案私有的。
       分三段：① 參數區（難度、秒數都在這）；② 純函式（出題、算目標、判斷解開了沒，單元測試直接測）；③ 畫面（mount／setup）。 */
    'use strict';

    var ID = 'sumdel';                                  /* 這款遊戲的代號：選單、成績、存檔、CSS class 前綴（sumdel-）都用它 */
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 90 };
    var h = UI.h, kit = Reaction.kit;                   /* h：建立網頁元素的小工具；kit：闖關遊戲共用工具箱 */

    /* ═══ 可以自己調的參數 ═══ */
    var STAGES = [{ n: 4, to: 6 }, { n: 5, to: 16 }, { n: 7, to: 9999 }];     /* 方陣大小的階段：n＝邊長、to＝這個階段的最後一關 */
    var RAMP_LEVELS = 30;                       /* 數字範圍走幾關到頂 */
    var NUM_MAX = [9, 30];                      /* 數字的最大值：第 1 關 → 到頂 */
    var KEEP_P = 0.55;                          /* 每一格「留下」的機率（其餘的要刪掉） */
    var DEL_MIN = 0.3;                          /* 至少要刪掉多少比例的格子 */
    var HINTS = 3;                              /* 每一題可以用幾次提示（0＝關掉提示鈕） */
    var MAX_LEVEL = 90;                             /* 最後一關：過了第 90 關就算全破（也是成績的上限） */
    var PASS_DELAY_MS = 1300;                       /* 答對（過關）後停多久才換下一關（毫秒，1300 毫秒＝1.3 秒） */
    var TRIES = 400;                            /* 找不到唯一解的題目時，最多重試幾次 */
    var CELL_MAX = 66;                          /* 每格邊長最大值（px） */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    /* 這一關屬於哪個階段（方陣邊長 n）：由上往下找第一個「關卡 ≤ to」的階段；最後一個階段一路到底 */
    function stageOf(level) {
        level = Math.max(1, level);
        for (var i = 0; i < STAGES.length; i++) if (level <= STAGES[i].to || i === STAGES.length - 1) return STAGES[i];
    }
    /* 這一關方陣的邊長（4×4、5×5、7×7） */
    function sizeFor(level) { return stageOf(level).n; }
    /* 這一關格子裡數字的最大值：從 NUM_MAX 的第一個數字線性變到第二個數字（kit.ramp 做線性插值） */
    function maxNumFor(level) { return Math.round(kit.ramp(level, NUM_MAX[0], NUM_MAX[1], RAMP_LEVELS)); }

    /* 每排每列留下的數字加總 → { rowT, colT }；keep[i]＝true 表示留下 */
    /* 算每一排、每一列「留下的數字」加總：nums 是所有格子的數字、keep[i] 為 true 代表這格留下。回傳 { rowT 每排的和, colT 每列的和 }。出題時用答案算出目標 */
    function targetsOf(nums, keep, n) {
        var rowT = new Array(n).fill(0), colT = new Array(n).fill(0);
        for (var i = 0; i < n * n; i++) if (keep[i]) { rowT[Math.floor(i / n)] += nums[i]; colT[i % n] += nums[i]; }
        return { rowT: rowT, colT: colT };
    }
    /* 目前的狀況：每排每列「現在留下的加總 − 目標」（0＝剛好；正＝還要再刪；負＝刪多了） */
    /* 算目前每排每列跟目標差多少（畫面上目標旁邊的 −N／＋N／✓ 就是它）：0＝剛好、正數＝還要再刪、負數＝刪過頭 */
    function diffsOf(nums, keep, n, rowT, colT) {
        var t = targetsOf(nums, keep, n), rd = [], cd = [], k;
        for (k = 0; k < n; k++) { rd.push(t.rowT[k] - rowT[k]); cd.push(t.colT[k] - colT[k]); }
        return { rows: rd, cols: cd };
    }
    /* 解開了嗎：每一排、每一列的差都是 0 */
    function isSolved(nums, keep, n, rowT, colT) {
        var d = diffsOf(nums, keep, n, rowT, colT);
        return d.rows.every(function (v) { return v === 0; }) && d.cols.every(function (v) { return v === 0; });
    }
    /* 數解的個數（最多數到 limit）：一排一排選「留哪幾格」，列的加總超過目標或湊不到就剪掉 */
    /* 數有幾種刪法能湊出目標（最多數到 limit 種），出題用它確認「答案只有一種」。
       做法：①先對每一排，列出所有「加起來剛好等於這排目標」的留法（用位元遮罩代表留哪幾格）；
       ②再一排一排選一種留法（dfs 深度優先搜尋），如果某一列已經超過目標、或剩下的排再怎麼加也湊不到目標，就立刻放棄這條路（剪枝）。 */
    function countSolutions(nums, n, rowT, colT, limit) {
        var rowSubs = [], r, m;                         /* rowSubs[r]：第 r 排所有「加起來剛好等於這排目標」的留法（m 是位元遮罩：第 c 位是 1 代表第 c 格留下） */
        for (r = 0; r < n; r++) {
            var subs = [];
            for (m = 0; m < (1 << n); m++) {
                var s = 0;
                for (var c = 0; c < n; c++) if (m & (1 << c)) s += nums[r * n + c];
                if (s === rowT[r]) subs.push(m);
            }
            if (!subs.length) return 0;
            rowSubs.push(subs);
        }
        /* rest[r][c]：從第 r 排到最後一排，第 c 列還能再加多少 */
        var rest = [];                                  /* rest[r][c]：從第 r 排到最後一排，第 c 列「最多還能再加多少」（全部留下的話）。用來判斷「就算後面全留，這列也湊不到目標」→ 剪枝 */
        for (r = n; r >= 0; r--) { rest[r] = new Array(n).fill(0); if (r < n) for (var cc = 0; cc < n; cc++) rest[r][cc] = rest[r + 1][cc] + nums[r * n + cc]; }
        for (var q = 0; q <= n; q++) if (!rest[q]) rest[q] = new Array(n).fill(0);
        var count = 0, part = new Array(n).fill(0);
        /* dfs：一排一排往下試；row 是正在決定第幾排。part[c] 是目前已累計的各列和。試完一種留法要把它加進去的數字再減回來（回溯） */
        (function dfs(row) {
            if (count >= limit) return;
            if (row === n) { for (var c2 = 0; c2 < n; c2++) if (part[c2] !== colT[c2]) return; count++; return; }
            for (var si = 0; si < rowSubs[row].length; si++) {
                var mask = rowSubs[row][si], ok = true, c3;
                for (c3 = 0; c3 < n; c3++) {
                    if (mask & (1 << c3)) part[c3] += nums[row * n + c3];
                    if (part[c3] > colT[c3]) ok = false;
                }
                if (ok) for (c3 = 0; c3 < n; c3++) if (part[c3] + rest[row + 1][c3] < colT[c3]) { ok = false; break; }
                if (ok) dfs(row + 1);
                for (c3 = 0; c3 < n; c3++) if (mask & (1 << c3)) part[c3] -= nums[row * n + c3];
                if (count >= limit) return;
            }
        })(0);
        return count;
    }
    /* 出一題：{ n, nums, rowT, colT, keep（答案：true＝留下）, max }。唯一解才收。 */
    /* 出一題：隨機給每格一個數字、隨機決定哪些留下（KEEP_P 的機率），用答案算出目標，
       再用 countSolutions 確認只有一種刪法才收；試 TRIES 次都不唯一就用第一個（保底，實測不會用到）。 */
    function makePuzzle(level, rand) {
        rand = rand || Math.random;
        var n = sizeFor(level), mx = maxNumFor(level), best = null;
        for (var tr = 0; tr < TRIES; tr++) {
            var nums = [], keep = [], i, dels = 0;
            for (i = 0; i < n * n; i++) { nums.push(kit.randInt(1, mx, rand)); var kp = rand() < KEEP_P; keep.push(kp); if (!kp) dels++; }
            if (dels < Math.ceil(n * n * DEL_MIN)) continue;  /* 刪掉的格子太少（低於 DEL_MIN 比例）就重抽——題目太簡單 */
            var t = targetsOf(nums, keep, n), okLines = true, r, c;
            /* 每一排、每一列都至少要刪一格、至少要留一格，否則那一行不用算 */
            for (r = 0; r < n && okLines; r++) {          /* 每一排、每一列至少要刪一格、至少要留一格 */
                var kr = 0, kc = 0;
                for (c = 0; c < n; c++) { if (keep[r * n + c]) kr++; if (keep[c * n + r]) kc++; }
                if (kr === 0 || kr === n || kc === 0 || kc === n) okLines = false;
            }
            if (!okLines) continue;
            var pz = { n: n, nums: nums, rowT: t.rowT, colT: t.colT, keep: keep, max: mx };
            if (countSolutions(nums, n, t.rowT, t.colT, 2) === 1) return pz;
            if (!best) best = pz;
        }
        return best;       /* 保底（實測不會用到）：不保證唯一，但答案一定存在 */
    }
    /* 提示：挑一格「現在跟答案不一樣」的；優先挑所在的排或列還沒湊對的 */
    /* 提示：挑一格「現在跟答案不一樣」的；優先挑它所在的排或列還沒湊對的 */
    function hintCell(pz, keep) {
        var n = pz.n, d = diffsOf(pz.nums, keep, n, pz.rowT, pz.colT), pick = -1, i;
        for (i = 0; i < n * n; i++) if (keep[i] !== pz.keep[i] && (d.rows[Math.floor(i / n)] !== 0 || d.cols[i % n] !== 0)) { pick = i; break; }
        if (pick < 0) for (i = 0; i < n * n; i++) if (keep[i] !== pz.keep[i]) { pick = i; break; }
        return pick;
    }
    /* 結算畫面的評語（依解開題數） */
    function rating(n) {
        if (n >= 25) return '算帳高手！';
        if (n >= 12) return '加減很穩！';
        if (n >= 5) return '越來越有感覺了！';
        return '先把比目標還大的數字刪掉，再看每一排剩下的！';
    }

    /* ═══ 畫面 ═══ */
    /* 遊戲進場：交給共用骨架 kit.run 處理闖關流程。leaveSettle: true 代表「沒有失敗」的自由解題——按返回會先結算再離開 */
    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 5, resume: false, leaveSettle: true,
            head: function (level) { return '第 ' + level + ' 關'; },
            info: function (S) { return '已解 ' + S.cleared + ' 關'; },
            numText: function (v) { return v + ' 關'; },
            rating: rating,
            lines: function (S) { return ['解開 ' + S.cleared + ' 關']; },
            setup: setup
        });
    }

    /* 每一關開始時呼叫：出題、建立方陣與按鈕。api 是共用骨架給的工具（api.stage 畫面容器、api.pass 過關、api.my 計時器管理…） */
    function setup(api) {
        var stage = api.stage, level = api.level;
        var pz = makePuzzle(level, api.rand), n = pz.n;
        api.info = pz;
        console.log('[刪數湊和] 第 ' + level + ' 關：' + n + '×' + n + '，數字 1～' + pz.max);
        var W = stage.clientWidth || 472;
        var headW = 66, cell = Math.min(CELL_MAX, Math.floor((W * 0.96 - headW - n * 4) / n));  /* 算每格大小：舞台寬度 ×0.96 扣掉左邊目標欄（headW）與格子間距，再除以邊長，最大不超過 CELL_MAX */
        var keep = pz.nums.map(function () { return true; }), hintsLeft = HINTS, hint = -1, solved = false;  /* keep：目前每格是否「留著」（一開始全部留著，玩家點一下就刪掉）；hint：提示標出的格子；solved：已解開 */

        var wrap = h('div', { 'class': 'sumdel-wrap' });
        var board = h('div', { 'class': 'sumdel-board' });
        board.style.setProperty('--sumdel-n', n);       /* 用 JS 把算好的尺寸交給 CSS 變數（CSS 裡用 var(--sumdel-cell) 取得） */
        board.style.setProperty('--sumdel-cell', cell + 'px');
        board.style.setProperty('--sumdel-head', headW + 'px');
        board.style.setProperty('--sumdel-font', Math.round(cell * 0.46) + 'px');
        board.appendChild(h('div', { 'class': 'sumdel-corner' }));
        var colHead = [], rowHead = [], cells = [], i, r, c;
        for (c = 0; c < n; c++) { var ch = h('div', { 'class': 'sumdel-head sumdel-head--col' }); board.appendChild(ch); colHead.push(ch); }
        for (r = 0; r < n; r++) {
            var rh = h('div', { 'class': 'sumdel-head sumdel-head--row' }); board.appendChild(rh); rowHead.push(rh);
            for (c = 0; c < n; c++) {
                var cl = h('div', { 'class': 'sumdel-cell', text: String(pz.nums[r * n + c]) });
                (function (idx) { kit.onTap(cl, function () { toggle(idx); }); })(r * n + c);  /* 用立即執行函式存住這一格的編號 idx（不這樣寫，每格點下去都會拿到迴圈結束時的值） */
                board.appendChild(cl); cells.push(cl);
            }
        }
        var tipText = '點數字刪掉它；旁邊的 −N＝還要少 N，＋N＝刪過頭了';
        var tip = h('div', { 'class': 'sumdel-tip', text: tipText });
        var acts = h('div', { 'class': 'sumdel-tools' });
        var btnHint = h('button', { 'class': 'btn btn--line sumdel-tool', type: 'button', text: '提示 ' + hintsLeft });
        var btnReset = h('button', { 'class': 'btn btn--line sumdel-tool', type: 'button', text: '重來' });
        kit.onTap(btnHint, useHint);
        kit.onTap(btnReset, reset);
        if (HINTS > 0) acts.appendChild(btnHint);
        acts.appendChild(btnReset);
        wrap.appendChild(board); wrap.appendChild(tip); wrap.appendChild(acts);
        stage.appendChild(wrap);

        /* 更新一個目標欄位：上面寫目標數字，下面寫還差多少（✓／−N／＋N） */
        function headText(el, target, diff) {
            el.innerHTML = '';
            el.appendChild(h('div', { 'class': 'sumdel-target', text: String(target) }));
            el.appendChild(h('div', { 'class': 'sumdel-diff' + (diff === 0 ? ' sumdel-diff--ok' : diff < 0 ? ' sumdel-diff--over' : ''), text: diff === 0 ? '✓' : diff > 0 ? '−' + diff : '＋' + (-diff) }));
        }
        /* 重畫：先更新所有目標欄位的差值，再依狀態（被刪掉／提示／解開）設每一格的 class */
        function paint() {
            var d = diffsOf(pz.nums, keep, n, pz.rowT, pz.colT);
            for (var k = 0; k < n; k++) { headText(rowHead[k], pz.rowT[k], d.rows[k]); headText(colHead[k], pz.colT[k], d.cols[k]); }
            for (var i = 0; i < n * n; i++) cells[i].className = 'sumdel-cell' + (keep[i] ? '' : ' sumdel-cell--del') + (i === hint ? ' sumdel-cell--hint' : '') + (solved ? ' sumdel-cell--ok' : '');
        }
        /* 點一格：切換「留／刪」，重畫後檢查是不是全部剛好了 */
        function toggle(i) {
            if (solved) return;
            keep[i] = !keep[i]; hint = -1; paint();
            if (isSolved(pz.nums, keep, n, pz.rowT, pz.colT)) win();
        }
        /* 解開：全部變綠、閃綠光並過關 */
        function win() {
            solved = true; paint(); tip.textContent = '每排每列都剛好！';
            kit.flash(stage, true, api.my);
            api.pass({ delay: PASS_DELAY_MS });
        }
        /* 提示：標出一格跟答案不一樣的（每題 HINTS 次） */
        function useHint() {
            if (solved || hintsLeft <= 0) return;
            var c = hintCell(pz, keep);
            if (c < 0) return;
            hintsLeft--; btnHint.textContent = '提示 ' + hintsLeft; btnHint.disabled = hintsLeft <= 0;
            hint = c; tip.textContent = '黃色閃動的那一格，跟答案不一樣'; paint();
        }
        /* 重來：全部格子恢復成「留著」 */
        function reset() { if (solved) return; keep = pz.nums.map(function () { return true; }); hint = -1; paint(); }
        /* 給測試／debug 用：api.solve 一鍵變成答案、api.wrong 故意弄錯一格、api.state 回報目前狀態 */
        api.solve = function () { keep = pz.keep.slice(); paint(); if (isSolved(pz.nums, keep, n, pz.rowT, pz.colT)) win(); };
        api.wrong = function () { keep = pz.keep.slice(); keep[0] = !keep[0]; paint(); };
        api.state = function () { return { keep: keep.slice(), solved: solved, hintsLeft: hintsLeft }; };
        paint();
    }

    /* 遊戲登記資料：id、名稱、規則文字（**包起來的是粗體重點）、mount 進場函式、score 成績規格、test 給單元測試用的內部函式 */
    var G = {
        id: ID,
        name: '刪數湊和',
        rule: '方陣裡每一格有一個數字，**每一排、每一列旁邊各有一個「目標」**。**點掉一些數字（刪除），讓每一排、每一列剩下沒刪的數字加起來，剛好等於旁邊的目標**；再點一下可以恢復。目標下面的小字告訴你還差多少：「−N」是剩下的總和還要再少 N（還要再刪），「＋N」是刪過頭了（要少刪 N），變成 ✓ 就是剛好。沒有時間限制，也不會失敗，每一題的刪法只有一種；全部都 ✓ 就過關，想結束就按左上角「返回」，成績是解開幾題。',
        mount: mount,
        score: SCORE,
        test: {
            stageOf: stageOf, sizeFor: sizeFor, maxNumFor: maxNumFor, targetsOf: targetsOf, diffsOf: diffsOf, isSolved: isSolved,
            countSolutions: countSolutions, makePuzzle: makePuzzle, hintCell: hintCell, rating: rating,
            STAGES: STAGES, RAMP_LEVELS: RAMP_LEVELS, NUM_MAX: NUM_MAX, KEEP_P: KEEP_P, DEL_MIN: DEL_MIN, HINTS: HINTS, MAX_LEVEL: MAX_LEVEL
        }
    };
    /* 把這款遊戲登記給選單（沒有這行，選單就看不到它） */
    Reaction.register(G);
})();
