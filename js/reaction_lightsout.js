/* ═══════════════════════════════════════════════════════════════════
   reaction_lightsout.js — 秒反應・關燈
   點一盞燈，它和上下左右的燈都會「亮變暗、暗變亮」。在時間內把所有燈關掉！步數越少越完美。
   ───────────────────────────────────────────────────────────────────
   · 盤面用整數的 bit 表示（第 i 格 ＝ 第 i 個 bit，亮 ＝ 1），按第 j 格會把 toggle[j] 的那幾格反轉。
   · 從答案反推題目（所以一定有解）：從全暗開始，隨機按 k 個「不同」的格子，得到的盤面就是題目。
   · 最少步數：把「按哪些格」當成 GF(2) 上的線性方程式 A·x = 盤面，用高斯消去法（化成列簡階梯形）求出一組解，
     再列舉零空間（自由變數的所有組合）取按的格數最少的那一組。
       3×3：零空間 0 維（解唯一）；4×4：4 維（16 組解）；5×5：2 維（4 組解）。
   · 題目篩選：至少有 1 盞亮、而且最少步數 ≥ max(2, k 的一半)，避免一按就過的無聊題。
   · 難度（第 1 → LEVEL_RAMP 關）：棋盤 3×3（1–5 關）→ 4×4（6–10 關）→ 5×5（11 關以後，解鎖點），
     打亂次數 k 3 → 12、每關限時 60 → 35 秒（線性）。
   · 機會 LIVES 次：時間到＝機會 −1，同一關換一個新題目，並把最少步數的解法疊在盤面上給你看。
   · 成績：通過的關數（越大越好）；副榜：剛好用最少步數的「完美」關數。
   ═══════════════════════════════════════════════════════════════════ */

/* （檔案結構說明見 js/reaction_sticks.js 開頭的「新手導讀」） */
(function () {
    'use strict';

    var ID = 'lightsout';

    /* 世界排行榜的成績規格（欄位說明見 js/leaderboard.js 開頭）；資料庫 MF_games 裡 lightsout 那一列要一致
       （node test/leaderboard/gen_games_sql.cjs 會從這裡產生 insert，test/reaction/t_leaderboard.js 會檢查兩邊是否一致）。 */
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 200 };
    var h = UI.h;
    var kit = Reaction.kit;

    /* 設定集中在這一區 */
    /* ═══ 可以自己調的參數 ═══ */
    var LEVEL_RAMP = 15;
    /* 第 1 關起 3×3、第 6 關起 4×4、第 11 關起 5×5 */
    var SIZE_AT = [1, 6, 11];                 /* 第幾關開始變成 3×3、4×4、5×5 */
    /* 打亂次數 k 與每關限時，隨關卡線性變化 */
    var K_START = 3, K_END = 12;
    var TIME_START = 60, TIME_END = 35;
    var LIVES = 3;
    var CELL = 100;                           /* SVG 單位：一格邊長 */
    var NEXT_MS = 1500, ANSWER_MS = 2800;

    /* 純函式（也給 Node 測試用） */
    /* ═══ 純函式（也給 Node 測試用）═══ */
    /* 這一關棋盤邊長 */
    function sizeFor(level) { return level >= SIZE_AT[2] ? 5 : (level >= SIZE_AT[1] ? 4 : 3); }
    /* 這一關打亂幾下 */
    function kFor(level) { return Math.round(kit.ramp(level, K_START, K_END, LEVEL_RAMP)); }
    /* 這一關限時 */
    function timeFor(level) { return kit.ramp(level, TIME_START, TIME_END, LEVEL_RAMP); }
    /* 【位元遮罩（bit mask）小常識】整個棋盤用一個整數表示：第 i 格的燈亮不亮就是這個整數的第 i 個 bit（1＝亮）。1 << j 是「把 1 左移 j 位」＝只有第 j 個 bit 是 1 的數字。| 是「或」，把多個格子合起來。 */
    /* 按第 j 格會反轉哪幾格（bit mask）*/
    /* 按第 j 格會反轉哪幾格：它自己、左、右、上、下（不能超出棋盤） */
    function toggleMask(N, j) {
        var x = j % N, y = Math.floor(j / N), m = 1 << j;
        if (x > 0) m |= 1 << (j - 1);
        if (x < N - 1) m |= 1 << (j + 1);
        if (y > 0) m |= 1 << (j - N);
        if (y < N - 1) m |= 1 << (j + N);
        return m;
    }
    /* 數一個整數有幾個 bit 是 1（＝幾盞燈亮著） */
    function popcount(v) { var c = 0; while (v) { c += v & 1; v >>>= 1; } return c; }
    /* 按下一組格子之後的盤面：^= 是「互斥或 XOR」，同一格被反轉兩次就變回原樣，這正是「亮變暗、暗變亮」 */
    /* 按下一組格子（presses 是 bit mask）之後的盤面 */
    function applyPresses(N, board, presses) {
        for (var j = 0; j < N * N; j++) if ((presses >> j) & 1) board ^= toggleMask(N, j);
        return board;
    }
    /* 求最少步數：把問題當成「GF(2) 上的線性方程式」（只有 0 和 1，加法就是 XOR），用高斯消去法解，再列舉所有解（自由變數的組合）取按最少格的那一組 */
    /* 最少步數的解：回傳 { mask, count, nullity }；無解回傳 null */
    function solveMin(N, board) {
        var n = N * N, rows = [];
        /* 建立矩陣：每一列代表一格燈，列出哪些按鍵會影響它，最右邊是這格燈目前的狀態 */
        for (var i = 0; i < n; i++) {            /* 第 i 列：哪些按鍵會影響第 i 格（矩陣對稱）｜等號右邊 */
            rows.push(toggleMask(N, i) | (((board >> i) & 1) << n));
        }
        /* 高斯消去：逐欄找主元（pivot），用 XOR 消去其他列 */
        var pivotRowOfCol = [], rank = 0;
        for (var c = 0; c < n; c++) {
            var p = -1; for (var r = rank; r < n; r++) if ((rows[r] >> c) & 1) { p = r; break; }
            if (p < 0) { pivotRowOfCol[c] = -1; continue; }
            var t = rows[p]; rows[p] = rows[rank]; rows[rank] = t;
            for (var r2 = 0; r2 < n; r2++) if (r2 !== rank && ((rows[r2] >> c) & 1)) rows[r2] ^= rows[rank];
            pivotRowOfCol[c] = rank; rank++;
        }
        /* 消完後如果出現「0 = 1」的列就無解 */
        for (var r3 = rank; r3 < n; r3++) if ((rows[r3] >> n) & 1) return null;       /* 0 = 1：無解 */
        /* 自由變數：沒有主元的欄，每一組取值都是一組解 */
        var free = []; for (var c2 = 0; c2 < n; c2++) if (pivotRowOfCol[c2] < 0) free.push(c2);
        var best = null;
        /* 列舉所有自由變數的組合，各算出一組解，保留按最少格的那一組 */
        for (var a = 0; a < (1 << free.length); a++) {
            var x = 0;
            free.forEach(function (f, k) { if ((a >> k) & 1) x |= 1 << f; });
            for (var c3 = 0; c3 < n; c3++) {
                var pr = pivotRowOfCol[c3]; if (pr < 0) continue;
                var v = (rows[pr] >> n) & 1;                         /* x_p = 右邊 ⊕ (這列的自由變數項) */
                free.forEach(function (f) { if (((rows[pr] >> f) & 1) && ((x >> f) & 1)) v ^= 1; });
                if (v) x |= 1 << c3;
            }
            var w = popcount(x);
            if (!best || w < best.count) best = { mask: x, count: w, nullity: free.length };
        }
        return best;
    }
    /* 出題：從全暗開始，隨機按 k 個不同的格子，得到的盤面就是題目（所以一定有解） */
    function makePuzzle(level, rand) {
        rand = rand || Math.random;
        var N = sizeFor(level), k = Math.min(kFor(level), N * N), n = N * N, board = 0, sol = null, presses = 0;
        /* 最多試 300 次，直到題目夠難（最少步數 ≥ 一半的打亂次數） */
        for (var tries = 0; tries < 300; tries++) {
            presses = 0;
            kit.shuffle(Array.apply(null, Array(n)).map(function (_, i) { return i; }), rand).slice(0, k).forEach(function (j) { presses |= 1 << j; });
            board = applyPresses(N, 0, presses);
            if (board === 0) continue;
            sol = solveMin(N, board);
            if (sol && sol.count >= Math.max(2, Math.floor(k / 2))) break;
        }
        return { level: level, N: N, k: k, board: board, made: presses, min: sol.count, minMask: sol.mask, nullity: sol.nullity, time: timeFor(level) };
    }
    /* 依通過關數給評語 */
    function rating(n) {
        if (n >= 15) return '關燈大師！';
        if (n >= 10) return '腦筋很靈活！';
        if (n >= 5) return '不錯喔！';
        return '再試一次，會更順！';
    }

    /* mount：遊戲進場點 */
    function mount(root, ctx) {
        var R = null;

        /* startAt：從第幾關開始（失敗後可從前 5 關繼續）*/
        /* round：開一局 */
        function round(startAt) {
            if (R) R.dispose();
            R = kit.round();
            var my = R;
            root.innerHTML = '';

            /* level 目前關卡；passed 已過幾關；perfect 剛好用最少步數的關數；lives 機會；P 這關的題目；board 目前的盤面（整數）；presses 已按幾下；token 流水號；logs 紀錄 */
            var level = (startAt || 1) - 1, passed = level, perfect = 0, lives = LIVES, P = null, board = 0, presses = 0, state = 'idle', token = 0, t0 = 0, newRec = false, logs = [];
            /* 建立畫面元素 */
            var head = h('div', { 'class': 'lo-head', text: ' ' });
            var banner = h('div', { 'class': 'lo-banner', text: ' ' });
            var field = h('div', { 'class': 'lo-field' });
            var tb = kit.timebar();
            [head, banner, field, tb.el].forEach(function (x) { root.appendChild(x); });

            /* SVG 與每格的元素 */
            var svg, cellEls = [], hintEls = [];
            /* 更新標題列右側的小字 */
            function meta() { ctx.setMeta(kit.meta(['已過 ' + passed + ' 關', '機會 ' + lives])); }

            /* 畫整個棋盤（SVG）：每格有底板、燈泡，以及時間到時用來標出答案的虛線框 */
            function build() {
                field.innerHTML = ''; cellEls = []; hintEls = [];
                var W = P.N * CELL;
                svg = kit.svg('svg', { 'class': 'lo-svg', viewBox: '0 0 ' + W + ' ' + W, preserveAspectRatio: 'xMidYMid meet' }, field);
                for (var i = 0; i < P.N * P.N; i++) {
                    /* (function (i) {...})(i)：立即執行函式，讓每格的點擊事件記住自己的編號 */
                    (function (i) {
                        var x = (i % P.N) * CELL, y = Math.floor(i / P.N) * CELL;
                        var g = kit.svg('g', { 'class': 'lo-cell', transform: 'translate(' + x + ',' + y + ')' }, svg);
                        kit.svg('rect', { 'class': 'lo-tile', x: 5, y: 5, width: CELL - 10, height: CELL - 10, rx: 16 }, g);
                        kit.svg('circle', { 'class': 'lo-bulb', cx: CELL / 2, cy: CELL / 2, r: CELL * 0.28 }, g);
                        hintEls[i] = kit.svg('rect', { 'class': 'lo-hint', x: 8, y: 8, width: CELL - 16, height: CELL - 16, rx: 14, display: 'none' }, g);
                        g.addEventListener('pointerdown', function (e) { e.preventDefault(); press(i); });
                        cellEls[i] = g;
                    })(i);
                }
                paint();
            }
            /* 依目前的盤面更新每格亮不亮；(board >> i) & 1 取出第 i 個 bit */
            function paint() {
                for (var i = 0; i < P.N * P.N; i++) cellEls[i].setAttribute('class', 'lo-cell' + (((board >> i) & 1) ? ' lo-cell--on' : ''));
                banner.textContent = '步數 ' + presses + '　最少 ' + P.min;
            }

            /* 開始一關或重來同一關（時間到後換新題） */
            function startPuzzle(sameLevel) {
                if (my.dead) return;
                if (!sameLevel) level++;
                /* 產生這關的題目 */
                P = makePuzzle(level);
                board = P.board; presses = 0; state = 'play';
                var id = ++token;
                head.textContent = '第 ' + level + ' 關　限時 ' + Math.round(P.time) + ' 秒';
                build(); meta();
                t0 = performance.now();
                /* 主控台印出這關的實際資料（棋盤、打亂次數、最少步數、限時） */
                try { console.info('[關燈] 第 ' + level + ' 關：' + P.N + '×' + P.N + '、打亂 ' + P.k + ' 下、最少 ' + P.min + ' 步（零空間 ' + P.nullity + ' 維）、限時 ' + P.time.toFixed(1) + ' 秒'); } catch (e) { }
                tb.set(1);
                /* 倒數 */
                my.loop(function (now) {
                    if (id !== token || state !== 'play') return false;
                    var left = P.time - (now - t0) / 1000;
                    tb.set(left / P.time);
                    head.textContent = '第 ' + level + ' 關　剩 ' + Math.max(0, Math.ceil(left)) + ' 秒';
                });
                my.after(P.time * 1000, function () { if (id === token && state === 'play') timeUp(); });
            }

            /* 按一格：用 XOR 反轉自己和上下左右 */
            function press(i) {
                if (state !== 'play') return;
                board ^= toggleMask(P.N, i); presses++;
                Sfx.play('click');
                paint();
                /* 所有燈都熄了（board 為 0）→ 過關；剛好用最少步數就是「完美」 */
                if (board === 0) {
                    state = 'won'; token++;
                    passed = level;
                    var isPerfect = presses === P.min;
                    if (isPerfect) perfect++;
                    logs.push('第 ' + level + ' 關：最少 ' + P.min + ' 步，你用了 ' + presses + ' 步' + (isPerfect ? '（完美）' : ''));
                    if (Reaction.setBest(ID, passed, function (v, b) { return v > b; })) newRec = true;
                    tb.set(0);
                    banner.textContent = isPerfect ? '完美！剛好最少 ' + P.min + ' 步' : '過關！最少 ' + P.min + ' 步，你用了 ' + presses + ' 步';
                    head.textContent = '第 ' + level + ' 關　過關';
                    Sfx.play(isPerfect ? 'win' : 'pop');
                    meta();
                    my.after(NEXT_MS, function () { startPuzzle(false); });
                }
            }

            /* 時間到：扣機會，把最少步數的解答用虛線框疊在盤面上 */
            function timeUp() {
                state = 'over'; token++;
                lives--; tb.set(0); meta();
                head.textContent = '時間到';
                banner.textContent = '按這幾格就能關燈（最少 ' + P.min + ' 步）';
                for (var i = 0; i < P.N * P.N; i++) hintEls[i].setAttribute('display', ((P.minMask >> i) & 1) ? 'inline' : 'none');
                logs.push('第 ' + level + ' 關時間到（最少 ' + P.min + ' 步）');
                Sfx.play('bad');
                /* 還有機會就換一個新題目 */
                if (lives > 0) { my.after(ANSWER_MS, function () { startPuzzle(true); }); return; }
                /* 沒有機會了 → 結算，kit.resumeFrom 可從前 5 關繼續 */
                my.after(ANSWER_MS, function () {
                    var back = kit.resumeFrom(level);
                        kit.result(root, {
                        score: passed,        /* 世界排行榜成績（跟 setBest 存的同一個數字） */
                        num: passed + ' 關', label: rating(passed),
                        lines: ['完美 ' + perfect + ' 關'].concat(logs.slice(-3)),
                        isNew: newRec && passed > 0, sfx: passed >= 5 ? 'win' : 'fail', onAgain: function () { round(1); },
                            resume: { level: back, run: function () { round(back); } }
                    });
                });
            }

            /* G.debug：測試用後門 */
            G.debug = {
                state: function () { return { level: level, passed: passed, perfect: perfect, lives: lives, state: state, N: P && P.N, board: board, presses: presses, min: P && P.min, minMask: P && P.minMask, time: P && P.time }; },
                press: press,
                solve: function () { for (var i = 0; i < P.N * P.N; i++) if ((P.minMask >> i) & 1) press(i); },
                timeUp: function () { if (state === 'play') timeUp(); }
            };
            /* 開場等 400 毫秒再開始第一關 */
            my.after(400, function () { startPuzzle(false); });
        }

        round(1);
    }

    /* 遊戲身分證 */
    var G = {
        id: ID,
        name: '關燈',
        rule: '點一盞燈，它和上下左右的燈都會「亮變暗、暗變亮」。想辦法在時間內把所有的燈都關掉！剛好用最少的步數過關，會得到「完美」。',
        mount: mount,
        /* 世界排行榜的成績規格 */
        score: SCORE,
        /* test 匯出純函式給 Node 自動測試 */
        test: { sizeFor: sizeFor, kFor: kFor, timeFor: timeFor, toggleMask: toggleMask, popcount: popcount, applyPresses: applyPresses, solveMin: solveMin, makePuzzle: makePuzzle, rating: rating, LEVEL_RAMP: LEVEL_RAMP }
    };
    /* 登記到遊戲清單 */
    Reaction.register(G);
})();
