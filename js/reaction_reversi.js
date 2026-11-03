/* ═══════════════════════════════════════════════════════════════════
   reaction_reversi.js — 秒反應・翻最多棋（企劃 232）
   樣式：css/games/reaction_reversi.css（這款專屬的 class 一律以「reversi-」開頭；共用元件在 css/reaction_common.css）
   黑白棋（奧賽羅）的殘局，你是黑棋。點一個空格下黑棋，夾住的白棋全部翻過來。
   **要下在「這一步能翻最多顆」的那一格**（並列最多也算對）。點下去之後，把每一個合法位置能翻幾顆都標出來（最多的是綠色），你下的不是最多就失敗。
   ───────────────────────────────────────────────────────────────────
   · 難度（都是線性）：盤面上的棋子數 12 → 50 顆（STONES，越後面盤面越滿）、限時 15 → 6 秒（TIME_S）、
     最多與「第二多」只差幾顆：要求的差距上限 9 → 1（GAP_MAX；到最後只差剛好 1 顆）、
     「藏起來的最多」的機率 0 → 90%（TRICK_P：最多的那一手一次翻三個以上的方向、或是只有斜線方向能翻，不是一眼看得出的橫直線）。
   · 出題（makeLevel）：從標準開局隨機下法（兩邊輪流、沒得下就跳過）下到目標的棋子數，輪到黑棋、而且黑棋至少有 MIN_MOVES 個合法的下法；
     再檢查：最多（best）與第二多（second，比 best 少的最大翻子數）的差距在 [1, 這一關的上限]；
     這一關若要求「藏起來」，最多的那幾手每一手都要是「一次翻 3 個以上方向」或「只有斜線能翻」。條件做不到就重抽。
   · 偷吃步「下在角落」：題目不保證角落最多（角落翻得多不多是隨機的）。
   · 判定：flipsFor 算出每個位置能翻幾顆；點的那格 ＝ 最多（含並列）才算對；點在不能下的格子（夾不到白棋）不算、也不扣——只提醒一下。
   · 揭曉：每個合法位置浮出一個數字（綠色是最多）、你點的格子標色（對＝綠、錯＝紅），夾住的白棋翻面，停格 2.8 秒。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    /* 新手導讀：整個檔案包在 (function () { ... })(); 裡（叫「立即執行函式」），裡面的變數都是這個檔案私有的，不會跟別的遊戲檔案的同名變數打架。
       檔案由上往下大致分成：① 參數區（標題寫著可以自己調整的參數：難度、秒數、文字大多在這）；② 純函式（只做計算、不碰畫面：出題、判斷對錯，單元測試直接測它們）；③ 畫面（mount 是進場、setup 是每一關開始時呼叫，負責把畫面建出來並處理點擊）。
       最後的 Reaction.register(G) 把這款遊戲「登記」給選單（沒有這行，選單就看不到它）。'use strict' 是嚴格模式：打錯變數名稱會直接報錯，而不是默默建立新變數。
       這款遊戲的代號是 'reversi'：選單、成績、存檔都靠它；樣式在 css/games/reaction_reversi.css，裡面的 class 名稱一律以 reversi- 開頭。 */
    'use strict';

    var ID = 'reversi';                                 /* 這款遊戲的代號：選單、成績、存檔、CSS class 前綴都用它 */
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 90 };  /* 成績規格：better（max＝越大越好、min＝越小越好）、decimals 小數位數、format 顯示格式、label 名稱、min／max 合理範圍（超出範圍的成績不會送排行榜） */
    var h = UI.h, kit = Reaction.kit;                   /* h：建立網頁元素的小工具；kit：闖關遊戲共用的工具箱 */

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 30;                       /* 幾關之後難度到頂 */
    var STONES = [12, 50];                      /* 盤面上的棋子總數：第 1 關 → 到頂（開局 4 顆，下 N 步會多 N 顆） */
    var TIME_S = [15, 6];                       /* 每題限時（秒）：第 1 關 → 到頂 */
    var GAP_MAX = [9, 1];                       /* 「最多」與「第二多」差距的上限：第 1 關 → 到頂（最後只差剛好 1） */
    var TRICK_P = [0, 0.9];                     /* 要求「最多的那一手藏起來」的機率：第 1 關 → 到頂 */
    var MIN_MOVES = 4;                          /* 黑棋至少有幾個合法下法 */
    var MAX_LEVEL = 90;                             /* 最後一關：過了第 90 關就算全破（也是成績的上限） */
    var N = 8, BLACK = 1, WHITE = -1;               /* N：棋盤邊長 8×8；BLACK：黑棋代號 1；WHITE：白棋代號 −1 */
    var DIRS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];     /* 八個方向 [列的變化, 欄的變化]；兩個都不是 0 的就是斜線（isDiagonal） */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function stonesFor(level) { return Math.round(kit.ramp(level, STONES[0], STONES[1], RAMP_LEVELS)); }  /* kit.ramp(關卡, 起始值, 到頂值, 到頂關卡)：讓數值隨關卡「線性」從起始值變到到頂值（難度曲線的基本工具） */
    function timeMs(level) { return Math.round(kit.ramp(level, TIME_S[0], TIME_S[1], RAMP_LEVELS) * 1000); }  /* Math.round：四捨五入成整數 */
    function gapMaxFor(level) { return Math.max(1, Math.round(kit.ramp(level, GAP_MAX[0], GAP_MAX[1], RAMP_LEVELS))); }
    function trickPFor(level) { return kit.ramp(level, TRICK_P[0], TRICK_P[1], RAMP_LEVELS); }
    function isDiagonal(d) { return DIRS[d][0] !== 0 && DIRS[d][1] !== 0; }
    /* 標準開局：中間四顆（白黑／黑白交叉）。棋盤是 64 格的陣列：1 黑、−1 白、0 空 */
    function initBoard() {
        var b = new Int8Array(N * N);
        b[3 * N + 3] = WHITE; b[4 * N + 4] = WHITE; b[3 * N + 4] = BLACK; b[4 * N + 3] = BLACK;
        return b;
    }
    /* color 下在 idx 能翻哪些子：回傳 { flips: [格子編號], dirs: 有幾個方向翻了子, onlyDiag: 翻子的方向是不是全部都是斜線 }；格子不是空的或夾不到子，flips 是空陣列 */
    function flipsFor(b, idx, color) {
        var out = { flips: [], dirs: 0, onlyDiag: true };
        if (b[idx] !== 0) return out;
        var r0 = Math.floor(idx / N), c0 = idx % N;     /* Math.floor：無條件捨去成整數 */
        for (var d = 0; d < 8; d++) {
            var r = r0 + DIRS[d][0], c = c0 + DIRS[d][1], line = [];
            while (r >= 0 && r < N && c >= 0 && c < N && b[r * N + c] === -color) { line.push(r * N + c); r += DIRS[d][0]; c += DIRS[d][1]; }
            if (line.length && r >= 0 && r < N && c >= 0 && c < N && b[r * N + c] === color) {
                out.flips = out.flips.concat(line); out.dirs++;
                if (!isDiagonal(d)) out.onlyDiag = false;
            }
        }
        if (!out.dirs) out.onlyDiag = false;
        return out;
    }
    /* color 所有合法的下法：[{ idx, n（翻幾顆）, dirs, onlyDiag, flips }] */
    function legalMoves(b, color) {
        var out = [];
        for (var i = 0; i < N * N; i++) { if (b[i] !== 0) continue; var f = flipsFor(b, i, color); if (f.flips.length) out.push({ idx: i, n: f.flips.length, dirs: f.dirs, onlyDiag: f.onlyDiag, flips: f.flips }); }
        return out;
    }
    function applyMove(b, idx, color) {
        var f = flipsFor(b, idx, color);
        b[idx] = color; f.flips.forEach(function (k) { b[k] = color; });  /* forEach：對陣列的每個元素各做一次 */
        return f;
    }
    function countStones(b) { var n = 0; for (var i = 0; i < b.length; i++) if (b[i]) n++; return n; }
    /* 這一份下法清單的「最多」「第二多」：best＝最大翻子數、second＝比 best 少的最大翻子數（沒有就是 0）、bestIdxs＝翻最多的所有格子 */
    function ranking(moves) {
        var best = 0, i;
        moves.forEach(function (m) { if (m.n > best) best = m.n; });
        var second = 0, bestIdxs = [];
        moves.forEach(function (m) { if (m.n === best) bestIdxs.push(m.idx); else if (m.n > second) second = m.n; });
        return { best: best, second: second, gap: best - second, bestIdxs: bestIdxs };
    }
    function isCorner(idx) { return idx === 0 || idx === N - 1 || idx === N * (N - 1) || idx === N * N - 1; }
    /* 出一關：{ board, moves（黑棋所有合法下法）, best, second, gap, bestIdxs, tricky（這一題有沒有要求藏起來）, stones, level } */
    function makeLevel(level, rand) {
        rand = rand || Math.random;                     /* 沒有傳亂數函式就用 Math.random（測試時可以傳固定的亂數，結果才能重現） */
        var target = stonesFor(level), gapMax = gapMaxFor(level), wantTrick = rand() < trickPFor(level);
        for (var tr = 0; tr < 6000; tr++) {
            var b = initBoard(), turn = BLACK, passes = 0, ok = true;
            /* 從開局隨機下到目標的棋子數：兩邊輪流，沒得下就換對方；兩邊都沒得下就放棄這一盤 */
            while (countStones(b) < target) {
                var ms = legalMoves(b, turn);
                if (!ms.length) { if (++passes >= 2) { ok = false; break; } turn = -turn; continue; }
                passes = 0; applyMove(b, kit.pick(ms, rand).idx, turn); turn = -turn;  /* kit.pick(陣列, rand)：從陣列隨機挑一個元素 */
            }
            if (!ok) continue;
            if (turn !== BLACK) { var wm = legalMoves(b, WHITE); if (!wm.length) continue; applyMove(b, kit.pick(wm, rand).idx, WHITE); }       /* 輪到黑棋：如果現在是白棋，白棋再下一步 */
            var moves = legalMoves(b, BLACK);
            if (moves.length < MIN_MOVES) continue;
            var rk = ranking(moves);
            if (rk.gap < 1 || rk.gap > gapMax) continue;                                           /* 最多與第二多的差距 */
            var best = moves.filter(function (m) { return m.n === rk.best; });  /* filter：留下符合條件的元素，回傳新陣列 */
            if (wantTrick && !best.every(function (m) { return m.dirs >= 3 || m.onlyDiag; })) continue;      /* 藏起來：每一個最多的下法都不是單純的橫直線 */
            return { board: b, moves: moves, best: rk.best, second: rk.second, gap: rk.gap, bestIdxs: rk.bestIdxs, tricky: wantTrick, stones: countStones(b), level: level };
        }
        /* 保底（極少用到）：開局，黑棋 4 個下法各翻 1 顆（全部並列最多） */
        var b0 = initBoard(), m0 = legalMoves(b0, BLACK), r0 = ranking(m0);
        return { board: b0, moves: m0, best: r0.best, second: r0.second, gap: r0.gap, bestIdxs: r0.bestIdxs, tricky: false, stones: 4, level: level };
    }
    /* 結算畫面的評語：依成績回傳一句話 */
    function rating(n) {
        if (n >= 25) return '黑白棋大師！';
        if (n >= 15) return '眼光很準！';
        if (n >= 8) return '不錯喔！';
        if (n >= 3) return '再接再厲！';
        return '每個方向都要數，特別是斜線，再來一次！';
    }

    /* mount：選單按下這款遊戲時會呼叫它。把「闖關」的流程（第幾關、過關、失敗、結算、最佳紀錄）交給共用骨架 kit.run，我們只提供 setup（每一關怎麼畫）、rating（評語）等小零件。 */
    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 5, stageClass: 'reversi-stage',
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
        var q = makeLevel(level, api.rand), b = q.board;
        api.info = q;                                   /* 把這一關的題目資料掛在 api.info，測試與 debug 用（玩家看不到） */
        console.log('[翻最多棋] 第 ' + level + ' 關：棋子 ' + q.stones + ' 顆，黑棋有 ' + q.moves.length + ' 個下法，最多翻 ' + q.best + '（在 ' + q.bestIdxs.map(function (i) { return '(' + Math.floor(i / N) + ',' + i % N + ')'; }).join('、') + '），第二多 ' + q.second + '（差 ' + q.gap + '）' + (q.tricky ? '；藏起來' : '') + '；限時 ' + timeMs(level) + ' ms');  /* 在瀏覽器主控台（按 F12）印出這一關的出題內容，方便除錯與驗證 */

        var W = stage.clientWidth || 472, H = stage.clientHeight || 640, cell = Math.floor(Math.min((W - 16) / N, 60)), BS = cell * N, bx = Math.round((W - BS) / 2), by = 64;
        var tip = h('div', { 'class': 'qz-note reversi-tip', text: '你是黑棋：下在能翻最多顆的格子' });
        stage.appendChild(tip);                         /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
        var board = h('div', { 'class': 'reversi-board' });  /* board：盤面（所有格子都放在裡面） */
        board.style.cssText = 'left:' + bx + 'px;top:' + by + 'px;width:' + BS + 'px;height:' + BS + 'px;';
        stage.appendChild(board);
        var cells = [], discs = [];
        for (var i = 0; i < N * N; i++) {
            var el = h('div', { 'class': 'reversi-cell' });
            el.style.cssText = 'left:' + (i % N) * cell + 'px;top:' + Math.floor(i / N) * cell + 'px;width:' + cell + 'px;height:' + cell + 'px;';
            var disc = null;
            if (b[i]) { disc = h('div', { 'class': 'reversi-disc ' + (b[i] === BLACK ? 'reversi-disc--b' : 'reversi-disc--w') }); el.appendChild(disc); }
            board.appendChild(el); cells.push(el); discs.push(disc);
        }
        var info = h('div', { 'class': 'qz-note reversi-info', text: '' });
        info.style.top = (by + BS + 12) + 'px';
        stage.appendChild(info);
        api.timer(timeMs(level), function () { judge(-1); });  /* 開始倒數（畫面上方的時間條）：時間到就呼叫後面那個函式 */
        if (level === 1 && kit.once('reversi.hint')) {  /* kit.once(key)：同一個頁面只有第一次回傳 true（用來讓提示只出現一次） */
            var hm = q.moves.filter(function (m) { return q.bestIdxs.indexOf(m.idx) >= 0; })[0];  /* indexOf：找元素在陣列（或字串）裡的位置，找不到回傳 −1（所以 < 0 代表「不在裡面」） */
            kit.hintOn(stage, null, { mode: 'tap', x: bx + (hm.idx % N + 0.5) * cell, y: by + (Math.floor(hm.idx / N) + 0.5) * cell, delay: 700, text: '請點能翻最多顆的格子' });  /* 操作提示（手指圖示指出該點哪裡）：玩家第一次按下就消失 */
        }
        var moveOf = {}; q.moves.forEach(function (m) { moveOf[m.idx] = m; });
        var done = false;
        kit.onTap(board, function (e) {                 /* kit.onTap(元素, 函式)：幫元素綁定「點一下」的動作（手機觸控與電腦滑鼠通用，反應比一般 click 快） */
            if (done || api.over) return;
            var p = kit.localPt(e, board), c = Math.floor(p.x / cell), r = Math.floor(p.y / cell);
            if (c < 0 || c >= N || r < 0 || r >= N) return;
            var k = r * N + c;
            if (!moveOf[k]) { tip.textContent = '這格夾不到白棋，不能下（再找一格）'; Sfx.play('bad'); return; }  /* Sfx.play(名稱)：播放音效（ok 答對、bad 答錯、click 點擊…；音效是程式即時合成的） */
            judge(k);
        });
        /* 判定玩家的答案：答對就過關（api.pass），答錯或超時就失敗（api.fail） */
        function judge(k) {
            if (done || api.over) return;
            done = true;
            var ok = k >= 0 && q.bestIdxs.indexOf(k) >= 0;
            /* 把每個合法位置能翻幾顆標出來（最多的是綠色） */
            q.moves.forEach(function (m) {
                var lab = h('div', { 'class': 'reversi-count' + (q.bestIdxs.indexOf(m.idx) >= 0 ? ' reversi-count--best' : ''), text: String(m.n) });
                cells[m.idx].appendChild(lab);
            });
            if (k >= 0) {
                cells[k].classList.add(ok ? 'reversi-cell--ok' : 'reversi-cell--bad');  /* classList.add／remove／toggle：加上／拿掉 CSS class，元素的外觀就跟著變（class 的樣式寫在 css 檔裡） */
                /* 下黑棋、夾住的白棋翻面（翻面動畫） */
                var disc = h('div', { 'class': 'reversi-disc reversi-disc--b reversi-disc--new' }); cells[k].insertBefore(disc, cells[k].firstChild);
                moveOf[k].flips.forEach(function (f) { if (discs[f]) { discs[f].classList.add('reversi-disc--flip'); api.after(250, function () { discs[f].classList.remove('reversi-disc--w'); discs[f].classList.add('reversi-disc--b'); }); } });  /* api.after(毫秒, 函式)：過幾毫秒再執行；這一關結束後會自動作廢（不會跑到下一關去） */
            } else q.bestIdxs.forEach(function (i) { cells[i].classList.add('reversi-cell--ok'); });
            var chosen = k >= 0 ? moveOf[k].n : 0;
            info.textContent = k >= 0 ? '你下的翻了 ' + chosen + ' 顆；最多是 ' + q.best + ' 顆（第二多 ' + q.second + ' 顆）' : '時間到！最多是 ' + q.best + ' 顆（綠色數字）';  /* textContent：設定元素裡的文字（安全，不會被當成 HTML 解析） */
            if (ok) { kit.flash(stage, true, api.my); api.pass({ delay: 1800 }); return; }  /* kit.flash(舞台, 對或錯, 計時器)：畫面閃一下綠光（答對）或紅光（答錯） */
            kit.flash(stage, false, api.my);
            api.fail({ delay: 2800, lines: [k >= 0 ? '你下的只翻 ' + chosen + ' 顆，最多的位置能翻 ' + q.best + ' 顆' : '時間到！', '最多 ' + q.best + ' 顆、第二多 ' + q.second + ' 顆（差 ' + q.gap + '），黑棋共有 ' + q.moves.length + ' 個下法'] });  /* api.fail({ delay, lines })：宣告「失敗」，delay 毫秒後進結算畫面，lines 是結算要多寫的說明行 */
        }
        /* 給測試／debug 用：api.solve 自動走出正解、api.wrong 故意走錯一步、api.state 回報目前狀態（瀏覽器自動測試會呼叫它們，玩家用不到）。 */
        api.solve = function () { judge(q.bestIdxs[0]); };
        api.wrong = function () {
            var w = q.moves.filter(function (m) { return q.bestIdxs.indexOf(m.idx) < 0; })[0];
            judge(w ? w.idx : -1);
        };
    }

    /* 遊戲登記資料：id 代號、name 選單上的名稱、rule 玩法說明（**包起來的是粗體重點）、mount 進場函式、score 成績規格、test 給單元測試用的內部函式。 */
    var G = {
        id: ID,
        name: '翻最多棋',
        rule: '這是黑白棋（奧賽羅）的殘局，**你是黑棋**。點一個空格下黑棋，**夾住的白棋全部會翻過來**。**要下在「這一步能翻最多顆」的那一格**（並列最多也算對）。下完會把每個位置能翻幾顆都標出來，你下的不是最多就結束，看你能過幾關。越後面，棋盤越滿、最多和第二多越接近，而且最多的那一手常常藏在斜線方向！',
        mount: mount,
        score: SCORE,
        /* test：把內部函式與參數交給單元測試（test/reaction/ 底下的 t_*.js）使用，遊戲本身不會用到。 */
        test: {
            stonesFor: stonesFor, timeMs: timeMs, gapMaxFor: gapMaxFor, trickPFor: trickPFor, isDiagonal: isDiagonal, initBoard: initBoard, flipsFor: flipsFor, legalMoves: legalMoves, applyMove: applyMove, countStones: countStones, ranking: ranking, isCorner: isCorner,
            makeLevel: makeLevel, rating: rating,
            RAMP_LEVELS: RAMP_LEVELS, STONES: STONES, TIME_S: TIME_S, GAP_MAX: GAP_MAX, TRICK_P: TRICK_P, MIN_MOVES: MIN_MOVES, MAX_LEVEL: MAX_LEVEL, N: N, BLACK: BLACK, WHITE: WHITE
        }
    };
    /* 把這款遊戲登記給選單（沒有這行，選單就看不到它） */
    Reaction.register(G);
})();
