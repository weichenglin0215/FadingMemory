/* ═══════════════════════════════════════════════════════════════════
   reaction_takuzu.js — 秒反應・黑白不連三（深思篇 427「黑白不連三」，Takuzu／Binairo）
   樣式：css/games/reaction_takuzu.css（class 一律以「takuzu-」開頭）
   ───────────────────────────────────────────────────────────────────
   · 玩法：每一格塗黑或白。**同色不能連續三格（橫的、直的都一樣）；每一排、每一列黑白一樣多。**題目給的格子不能改。
     下面選「黑／白／清除」，再點格子。沒有時間限制。
   · 規則比較難懂，所以：**放下去違反規則的那一刻，會彈出這一步的規則說明（附圖：把這一排／列畫出來，違規的格子圈紅）**，
     這一步不算數、可以馬上重放。放錯但沒有「當場違規」的（例如放了錯的顏色，之後才發現卡死），不會被打斷，可以用「清除」改。
   · 沒有失敗：全部填滿而且符合規則（答案唯一）就過關，換下一題；按左上角「返回」結束，成績＝解開幾題。
   · 難度：4×4（第 1～4 關）→ 6×6（第 5～14 關）→ 8×8（第 15 關起）。提示數 4×4：8→6、6×6：18→13、8×8：32→22（各階段內線性）。
     實測只用這兩條規則時，6×6 最少約 9～12 個提示、8×8 約 16～21 個才唯一，所以終點留約 1.3 倍的緩衝。
   · 出題：先隨機造一個合法的滿盤，再一格一格挖；每挖一格都要「只靠三個推理（連兩個→兩側必反色、夾住→中間必反色、某色用完→剩下全是另一色）」
     解得完才真的挖（＝不用猜、答案唯一）。
   · 提示（每題 HINTS 次）：標出「現在可以確定」的一格，不說顏色、不說理由。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    /* 新手導讀：整個檔案包在 (function () { ... })(); 裡（叫「立即執行函式」），裡面的變數都是這個檔案私有的，不會跟別的遊戲檔案的同名變數打架。
       檔案由上往下大致分成：① 參數區（標題寫著可以自己調整的參數：難度、秒數、文字大多在這）；② 純函式（只做計算、不碰畫面：出題、判斷對錯，單元測試直接測它們）；③ 畫面（mount 是進場、setup 是每一關開始時呼叫，負責把畫面建出來並處理點擊）。
       最後的 Reaction.register(G) 把這款遊戲「登記」給選單（沒有這行，選單就看不到它）。'use strict' 是嚴格模式：打錯變數名稱會直接報錯，而不是默默建立新變數。
       這款遊戲的代號是 'takuzu'：選單、成績、存檔都靠它；樣式在 css/games/reaction_takuzu.css，裡面的 class 名稱一律以 takuzu- 開頭。 */
    'use strict';

    var ID = 'takuzu';                                  /* 這款遊戲的代號：選單、成績、存檔、CSS class 前綴都用它 */
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 90 };  /* 成績規格：better（max＝越大越好、min＝越小越好）、decimals 小數位數、format 顯示格式、label 名稱、min／max 合理範圍（超出範圍的成績不會送排行榜） */
    var h = UI.h, kit = Reaction.kit;                   /* h：建立網頁元素的小工具；kit：闖關遊戲共用工具箱 */

    /* ═══ 可以自己調的參數 ═══ */
    var STAGES = [                              /* 盤面大小的階段：n＝邊長、to＝這個階段的最後一關（最後一個階段一路到底） */
        { n: 4, to: 4 }, { n: 6, to: 14 }, { n: 8, to: 9999 }
    ];
    var RAMP_LEN = { 4: 4, 6: 10, 8: 16 };      /* 每個階段內，提示數走幾關到頂 */
    var GIVENS = { 4: [8, 6], 6: [18, 13], 8: [32, 22] };      /* 提示數：階段的第 1 關 → 到頂 */
    var SLACK = 3;                              /* 提示數離目標不超過這麼多就收題，否則多試幾次、用最接近的 */
    var HINTS = 3;                              /* 每一題可以用幾次提示（0＝關掉提示鈕） */
    var MAX_LEVEL = 90;                             /* 最後一關：過了第 90 關就算全破（也是成績的上限） */
    var PASS_DELAY_MS = 1300;                   /* 解開之後停多久才換下一題 */
    var CELL_MAX = 92;                          /* 每格邊長最大值（px，4×4 不要大到不像棋盤） */
    var BLACK = 1, WHITE = 2;                       /* BLACK：黑色格子代號 1；WHITE：白色格子代號 2（0 表示還沒填） */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    /* 這一關屬於哪個階段：回傳 { n 盤面邊長, idx 在這個階段裡是第幾關, len 這個階段的提示數要走幾關才到頂 } */
    function stageOf(level) {
        level = Math.max(1, level);
        var from = 1;
        for (var i = 0; i < STAGES.length; i++) {
            if (level <= STAGES[i].to || i === STAGES.length - 1) return { n: STAGES[i].n, idx: level - from + 1, len: RAMP_LEN[STAGES[i].n] };
            from = STAGES[i].to + 1;
        }
    }
    /* 這一關要留幾個提示數（已經填好的格子）：從階段第 1 關的數字線性變到階段到頂的數字（越少越難） */
    function givensFor(level) { var s = stageOf(level), r = GIVENS[s.n]; return Math.round(kit.ramp(s.idx, r[0], r[1], s.len)); }  /* kit.ramp(關卡, 起始值, 到頂值, 到頂關卡)：讓數值隨關卡「線性」從起始值變到到頂值（難度曲線的基本工具） */
    /* 顏色代號換成文字：1＝黑、其他＝白（說明文字用） */
    function nameOf(c) { return c === BLACK ? '黑' : '白'; }

    /* 在 (r, c) 放 color 會不會違規？回傳 null（沒違規）或 { type: 'triple'|'count', dir: 'row'|'col', index, cells（違規的格子）, color }
       三連優先於「數量超過」。grid 不會被改動。 */
    /* 檢查「在第 i 格放 color」會不會違規，不會真的放下去（grid 不會被改）。
       這個函式特別有意思：它不是檢查整盤，而是只看「這一格會造成的問題」，所以玩家按下去時能立刻說明是哪一排哪幾格出問題。 */
    function violationAt(grid, n, i, color) {
        var r = Math.floor(i / n), c = i % n, half = n / 2, k, s;  /* Math.floor：無條件捨去成整數 */
        /* 小工具：取 (rr, cc) 這格的顏色，但「正在檢查的那一格」要當成已經放了 color */
        function at(rr, cc) { return rr * n + cc === i ? color : grid[rr * n + cc]; }
        /* 橫向檢查三連：包含這一格的三格窗口最多三個（起點 s 從 c−2 到 c），三格都是同色就違規 */
        for (s = c - 2; s <= c; s++) {
            if (s < 0 || s + 2 >= n) continue;
            if (at(r, s) === color && at(r, s + 1) === color && at(r, s + 2) === color) return { type: 'triple', dir: 'row', index: r, color: color, cells: [r * n + s, r * n + s + 1, r * n + s + 2] };
        }
        /* 直向檢查三連：做法同上，只是方向換成由上往下 */
        for (s = r - 2; s <= r; s++) {
            if (s < 0 || s + 2 >= n) continue;
            if (at(s, c) === color && at(s + 1, c) === color && at(s + 2, c) === color) return { type: 'triple', dir: 'col', index: c, color: color, cells: [s * n + c, (s + 1) * n + c, (s + 2) * n + c] };
        }
        var rowCells = [], colCells = [];               /* 再檢查「數量」：這一排／這一列這個顏色的格子不能超過一半（n/2） */
        for (k = 0; k < n; k++) { if (at(r, k) === color) rowCells.push(r * n + k); if (at(k, c) === color) colCells.push(k * n + c); }
        if (rowCells.length > half) return { type: 'count', dir: 'row', index: r, color: color, cells: rowCells };
        if (colCells.length > half) return { type: 'count', dir: 'col', index: c, color: color, cells: colCells };
        return null;
    }
    /* 整盤合不合規則（沒有三連、每排每列黑白一樣多；空格不算）。回傳違規清單 */
    /* 整盤檢查：回傳所有違規（有三連、或某排某列某色超過一半）。填滿後用它確認有沒有錯 */
    function findViolations(grid, n) {
        var out = [], r, c, k;
        for (r = 0; r < n; r++) for (c = 0; c < n; c++) {
            var v = grid[r * n + c];
            if (!v) continue;
            if (c + 2 < n && grid[r * n + c + 1] === v && grid[r * n + c + 2] === v) out.push({ type: 'triple', dir: 'row', index: r });
            if (r + 2 < n && grid[(r + 1) * n + c] === v && grid[(r + 2) * n + c] === v) out.push({ type: 'triple', dir: 'col', index: c });
        }
        for (r = 0; r < n; r++) {
            var cr = [0, 0, 0], cc = [0, 0, 0];
            for (k = 0; k < n; k++) { cr[grid[r * n + k]]++; cc[grid[k * n + r]]++; }
            if (cr[BLACK] > n / 2 || cr[WHITE] > n / 2) out.push({ type: 'count', dir: 'row', index: r });
            if (cc[BLACK] > n / 2 || cc[WHITE] > n / 2) out.push({ type: 'count', dir: 'col', index: r });
        }
        return out;
    }
    /* 完成了嗎：每格都有顏色、而且沒有任何違規 */
    function isComplete(grid, n) { for (var i = 0; i < grid.length; i++) if (!grid[i]) return false; return findViolations(grid, n).length === 0; }

    /* 推理器：只用三招——
         ① 連兩個同色 → 兩側必是另一色；② 夾住（同色—空—同色）→ 中間必是另一色；③ 某色已經用到一半 → 這一排／列剩下的空格全是另一色。
       反覆做到推不動。回傳 { grid, order（依序推出的格子）, solved, dead（推出矛盾） } */
    /* 推理器（不猜、只用規則一步一步推）：一直套用三招，直到推不動為止。出題用它確認「題目不用猜就解得出來」 */
    function propagate(start, n) {
        var g = start.slice(), order = [], dead = false, half = n / 2, changed = true;  /* slice()：複製一份陣列（之後改複本，不會動到原本的資料） */
        /* 把第 i 格設成 v（只能設空格；已經是別的顏色就代表矛盾 dead）；有設成功就記入 order、並標記「有進展」 */
        function setc(i, v) { if (g[i] === 0) { g[i] = v; order.push(i); changed = true; } else if (g[i] !== v) dead = true; }
        /* 對一條線（一排或一列，idxs 是這條線的格子編號）套用三招：連兩個同色→兩邊填另一色；同色夾一格→中間填另一色；某色已用到一半→其餘空格全填另一色 */
        function line(idxs) {
            var k, a = idxs.map(function (i) { return g[i]; });  /* map：把陣列的每個元素轉換成別的東西，回傳新陣列 */
            for (k = 0; k + 1 < n; k++) if (a[k] && a[k] === a[k + 1]) {
                var o = 3 - a[k];
                if (k - 1 >= 0 && !g[idxs[k - 1]]) setc(idxs[k - 1], o);
                if (k + 2 < n && !g[idxs[k + 2]]) setc(idxs[k + 2], o);
            }
            for (k = 0; k + 2 < n; k++) if (a[k] && a[k] === a[k + 2] && !g[idxs[k + 1]]) setc(idxs[k + 1], 3 - a[k]);
            var cnt = [0, 0, 0];
            idxs.forEach(function (i) { cnt[g[i]]++; });  /* forEach：對陣列的每個元素各做一次 */
            [BLACK, WHITE].forEach(function (col) {
                if (cnt[col] > half) dead = true;
                if (cnt[col] === half) idxs.forEach(function (i) { if (!g[i]) setc(i, 3 - col); });
            });
        }
        var lines = [], r, c;                           /* 把所有的排與列都列成「格子編號清單」，之後逐條套用 line */
        for (r = 0; r < n; r++) { var rr = [], cc = []; for (c = 0; c < n; c++) { rr.push(r * n + c); cc.push(c * n + r); } lines.push(rr, cc); }
        var guard = 0;
        while (changed && !dead && guard++ < 200) { changed = false; lines.forEach(line); }  /* 一直重複套用，直到整盤都沒有新進展（changed 為 false）；guard 防止意外無限迴圈 */
        if (!dead && findViolations(g, n).length) dead = true;
        return { grid: g, order: order, solved: !dead && g.every(function (v) { return v > 0; }), dead: dead };  /* every：陣列裡「每一個」元素都符合條件才回傳 true */
    }
    /* 造一個合法的滿盤：一格一格亂數放顏色，違規就換色，兩色都不行就退回上一格 */
    /* 造一個合法的完整盤面：一格一格隨機放顏色，違規就換另一色，兩色都不行就退回上一格重來（這種「試、錯、退」叫回溯） */
    function randomSolution(n, rand) {
        var g = new Array(n * n).fill(0), i = 0, tried = new Array(n * n).fill(0), guard = 0;  /* new Array(n).fill(v)：建立長度 n、每一格都是 v 的陣列 */
        var first = new Array(n * n).fill(0);
        while (i < n * n && guard++ < 100000) {
            if (i < 0) return randomSolution(n, rand);
            if (!first[i]) first[i] = rand() < 0.5 ? BLACK : WHITE;
            var placed = false;
            while (tried[i] < 2) {
                var col = tried[i] === 0 ? first[i] : 3 - first[i];
                tried[i]++;
                g[i] = 0;
                if (!violationAt(g, n, i, col)) { g[i] = col; placed = true; break; }
            }
            if (placed) i++; else { g[i] = 0; tried[i] = 0; first[i] = 0; i--; }
        }
        return g;
    }
    /* 出一題：{ n, solution, givens, count, want }。挖空時每挖一格都用 propagate 確認還解得完（＝唯一、免猜） */
    /* 出一題：先造完整盤面，再一格一格挖洞，每挖一格就用 propagate 確認「還解得完」（答案唯一、免猜），挖到提示數接近 want 為止 */
    function makePuzzle(level, rand) {
        rand = rand || Math.random;                     /* 沒有傳亂數函式就用 Math.random（測試時可以傳固定的亂數，結果才能重現） */
        var st = stageOf(level), n = st.n, want = givensFor(level), best = null;
        for (var tr = 0; tr < 25; tr++) {
            var sol = randomSolution(n, rand), givens = sol.slice(), count = n * n;
            var order = kit.shuffle(Array.apply(null, Array(n * n)).map(function (_, i) { return i; }), rand);  /* kit.shuffle(陣列, rand)：把陣列隨機洗牌，回傳新陣列（不會動到原本的） */
            for (var k = 0; k < order.length && count > want; k++) {
                var c = order[k], save = givens[c];
                givens[c] = 0;
                if (propagate(givens, n).solved) count--; else givens[c] = save;
            }
            var pz = { n: n, solution: sol, givens: givens, count: count, want: want };
            if (count <= want + SLACK) return pz;       /* 提示數離目標不超過 SLACK 就收題；否則多試幾次，最後用最接近的 */
            if (!best || count < best.count) best = pz;
        }
        return best;
    }
    /* 提示：玩家填的格子裡「跟答案一樣」的才算數，再往下推理，回傳第一個「現在可以確定、玩家還沒填對」的格子；沒有就回傳第一個沒填對的格子 */
    /* 提示：把玩家填對的格子當已知，再往下推理，回傳「現在能確定、玩家還沒填對」的第一格；推不出來就給第一個沒填對的 */
    function hintCell(pz, player) {
        var base = pz.givens.slice(), i, n = pz.n;
        for (i = 0; i < base.length; i++) if (!base[i] && player[i] === pz.solution[i]) base[i] = player[i];
        var r = propagate(base, n);
        for (i = 0; i < r.order.length; i++) if (player[r.order[i]] !== pz.solution[r.order[i]]) return r.order[i];
        for (i = 0; i < base.length; i++) if (player[i] !== pz.solution[i]) return i;
        return -1;
    }
    /* 結算畫面的評語（依解開題數） */
    function rating(n) {
        if (n >= 25) return '黑白大師！';
        if (n >= 12) return '推理很穩！';
        if (n >= 5) return '越來越有感覺了！';
        return '先記住：連兩個同色，兩邊就是另一色！';
    }

    /* ═══ 畫面 ═══ */
    /* 遊戲進場：交給共用骨架 kit.run 處理闖關流程。leaveSettle: true 代表「沒有失敗」的自由解題——按返回會先結算（顯示成績）再離開 */
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

    /* 每一關開始時呼叫：出題、建立盤面與按鈕。api 是共用骨架給的工具（api.stage 畫面容器、api.pass 過關、api.my 計時器管理…） */
    function setup(api) {
        var stage = api.stage, level = api.level;       /* stage：這一關的畫面容器（要畫的東西都放進去）；level：現在是第幾關 */
        var pz = makePuzzle(level, api.rand), n = pz.n;
        api.info = pz;                                  /* 把這一關的題目資料掛在 api.info，測試與 debug 用（玩家看不到） */
        console.log('[黑白不連三] 第 ' + level + ' 關：' + n + '×' + n + '，提示 ' + pz.count + ' 個（想要 ' + pz.want + '）');  /* 在瀏覽器主控台（按 F12）印出這一關的出題內容，方便除錯與驗證 */
        var W = stage.clientWidth || 472;
        var cell = Math.min(CELL_MAX, Math.floor(W * 0.96 / n));
        var grid = pz.givens.slice(), tool = BLACK, hintsLeft = HINTS, hint = -1, solved = false, popup = null;  /* grid：目前盤面（先抄一份題目）；tool：目前選的畫筆（黑／白／清除）；hintsLeft：剩幾次提示；hint：提示標出的格子；solved：已解開；popup：違規說明彈窗 */

        var wrap = h('div', { 'class': 'takuzu-wrap' });  /* wrap：整個遊戲畫面的外框容器；下面建好的各個區塊（盤面、按鈕…）都放進它，最後再整個放進舞台 */
        var board = h('div', { 'class': 'takuzu-board' });  /* board：盤面（所有格子都放在裡面） */
        board.style.setProperty('--takuzu-n', n);       /* style.setProperty('--名稱', 值)：用 JS 設定 CSS 變數，CSS 裡用 var(--名稱) 取用（把算好的尺寸交給樣式） */
        board.style.setProperty('--takuzu-cell', cell + 'px');
        var cells = [], discs = [];
        for (var i = 0; i < n * n; i++) {
            var d = h('span', { 'class': 'takuzu-disc' });
            var c = h('div', { 'class': 'takuzu-cell' }, [d]);
            (function (idx) { kit.onTap(c, function () { tap(idx); }); })(i);  /* 用立即執行函式把當下的 i 存成 idx，每一格點下去才知道自己是哪一格 */
            board.appendChild(c); cells.push(c); discs.push(d);  /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
        }
        var tip = h('div', { 'class': 'takuzu-tip', text: '選顏色，再點格子' });  /* tip：盤面下方的提示文字（操作說明、出錯的原因會寫在這裡） */
        var palette = h('div', { 'class': 'takuzu-tools' });
        var btnB = h('button', { 'class': 'btn btn--line takuzu-tool takuzu-tool--black', type: 'button', html: '<i class="takuzu-swatch takuzu-swatch--black"></i>黑' });
        var btnW = h('button', { 'class': 'btn btn--line takuzu-tool takuzu-tool--white', type: 'button', html: '<i class="takuzu-swatch takuzu-swatch--white"></i>白' });
        var btnE = h('button', { 'class': 'btn btn--line takuzu-tool', type: 'button', text: '清除' });
        kit.onTap(btnB, function () { setTool(BLACK); });  /* kit.onTap(元素, 函式)：幫元素綁定「點一下」的動作（手機觸控與電腦滑鼠通用，反應比一般 click 快） */
        kit.onTap(btnW, function () { setTool(WHITE); });
        kit.onTap(btnE, function () { setTool(0); });
        [btnB, btnW, btnE].forEach(function (b) { palette.appendChild(b); });
        var acts = h('div', { 'class': 'takuzu-tools' });
        var btnHint = h('button', { 'class': 'btn btn--line takuzu-tool', type: 'button', text: '提示 ' + hintsLeft });  /* 「提示」按鈕（文字會顯示還剩幾次提示） */
        var btnReset = h('button', { 'class': 'btn btn--line takuzu-tool', type: 'button', text: '重來' });  /* 「重來」按鈕 */
        kit.onTap(btnHint, useHint);
        kit.onTap(btnReset, reset);
        if (HINTS > 0) acts.appendChild(btnHint);       /* 提示次數 HINTS 設成 0，就連提示按鈕都不放 */
        acts.appendChild(btnReset);
        wrap.appendChild(board); wrap.appendChild(tip); wrap.appendChild(palette); wrap.appendChild(acts);
        stage.appendChild(wrap);                        /* 把整個遊戲區放進舞台（放進去，畫面上才看得到） */
        setTool(BLACK);

        /* 切換畫筆：記住選了哪一種，並讓對應的按鈕亮起來 */
        function setTool(t) {
            tool = t;
            btnB.classList.toggle('takuzu-tool--on', t === BLACK);  /* classList.add／remove／toggle：加上／拿掉 CSS class，元素的外觀就跟著變（class 的樣式寫在 css 檔裡） */
            btnW.classList.toggle('takuzu-tool--on', t === WHITE);
            btnE.classList.toggle('takuzu-tool--on', t === 0);
        }
        /* 重畫：每一格依狀態（題目／提示／解開）設 class，並依盤面顏色畫黑白圓點 */
        function paint() {
            for (var i = 0; i < n * n; i++) {
                var cl = 'takuzu-cell' + (pz.givens[i] ? ' takuzu-cell--given' : '') + (i === hint ? ' takuzu-cell--hint' : '') + (solved ? ' takuzu-cell--ok' : '');
                cells[i].className = cl;
                discs[i].className = 'takuzu-disc' + (grid[i] === BLACK ? ' takuzu-disc--black' : grid[i] === WHITE ? ' takuzu-disc--white' : '');
            }
        }
        /* 點格子：題目給的格子不能改；清除或點同色＝擦掉；否則先用 violationAt 檢查，
           會違規就彈出說明（這一步不會放下去），沒違規才放下去；放完若全盤完成就過關。 */
        function tap(i) {
            if (solved || popup) return;
            if (pz.givens[i]) { tip.textContent = '這一格是題目給的，不能改'; return; }  /* textContent：設定元素裡的文字（安全，不會被當成 HTML 解析） */
            hint = -1;
            if (tool === 0 || grid[i] === tool) { grid[i] = 0; paint(); return; }
            var v = violationAt(grid, n, i, tool);
            if (v) { explain(i, v); return; }
            grid[i] = tool;
            tip.textContent = '選顏色，再點格子';
            paint();
            if (isComplete(grid, n)) win();
        }
        /* 解開：鎖住盤面、全部格子變綠、閃綠光並過關 */
        function win() {
            solved = true; paint();
            tip.textContent = '解開了！';
            kit.flash(stage, true, api.my);             /* kit.flash(舞台, 對或錯, 計時器)：畫面閃一下綠光（答對）或紅光（答錯） */
            api.pass({ delay: PASS_DELAY_MS });         /* api.pass({ delay })：宣告「過關」，delay 毫秒後進下一關（最後一關則進結算） */
        }
        /* 提示：請 hintCell 找出「現在可以確定」的格子並閃動標示（每題 HINTS 次） */
        function useHint() {
            if (solved || hintsLeft <= 0) return;
            var c = hintCell(pz, grid);
            if (c < 0) return;
            hintsLeft--; btnHint.textContent = '提示 ' + hintsLeft; btnHint.disabled = hintsLeft <= 0;
            hint = c; tip.textContent = '黃色閃動的那一格，現在可以確定了'; paint();
        }
        /* 重來：回到題目的樣子 */
        function reset() {
            if (solved || popup) return;
            grid = pz.givens.slice(); hint = -1; tip.textContent = '選顏色，再點格子'; paint();
        }

        /* 違規說明彈窗：把違規的那一排／列畫出來（紅圈＝違規的格子），再附一張規則示意圖 */
        /* 違規說明彈窗：把違規的那一排／列畫出來（紅圈＝違規的格子），再附一張規則示意圖。
           Dlg.open 是共用的彈窗：host 指定蓋在哪裡、children 是內容、buttons 是按鈕。 */
        function explain(i, v) {
            Sfx.play('bad');                            /* Sfx.play(名稱)：播放音效（ok 答對、bad 答錯、click 點擊…；音效是程式即時合成的） */
            var line = [], k;
            for (k = 0; k < n; k++) line.push(v.dir === 'row' ? v.index * n + k : k * n + v.index);
            var after = grid.slice(); after[i] = v.color;
            var unit = v.dir === 'row' ? '排' : '列';
            var title = v.type === 'triple' ? '同色不能連續三格' : '每一' + unit + '黑白要一樣多';
            var body = v.type === 'triple'
                ? '你放的「' + nameOf(v.color) + '」會讓這一' + unit + '出現連續三個' + nameOf(v.color) + '（紅圈）。'
                : '這一' + unit + '只有 ' + n + ' 格，黑、白各最多 ' + (n / 2) + ' 個；這一' + unit + '已經有 ' + (n / 2) + ' 個「' + nameOf(v.color) + '」了，不能再放第 ' + (n / 2 + 1) + ' 個（紅圈）。';
            var tipText = v.type === 'triple'
                ? '小技巧：兩個同色靠在一起，兩邊一定是另一色；同色中間只隔一格，那格也是另一色。'
                : '小技巧：某一色用到一半，這一' + unit + '剩下的空格就全是另一色。';
            var svg = ruleSvg(after, line, v, i, n);
            popup = Dlg.open({
                host: stage, title: title,
                children: [svg, h('div', { 'class': 'takuzu-explain', text: body }), h('div', { 'class': 'takuzu-explain takuzu-explain--tip', text: tipText })],
                buttons: [{ text: '知道了', kind: 'primary', onClick: function () { popup = null; tip.textContent = '這一步沒有放下去，換個位置或顏色再試'; } }],
                onClose: function () { popup = null; }
            });
        }

        /* 給測試／debug 用：api.solve 一鍵填成答案、api.wrong 故意放一步違規的、api.explainOpen 問說明彈窗是否開著 */
        api.solve = function () { grid = pz.solution.slice(); paint(); if (isComplete(grid, n)) win(); };
        api.wrong = function () {
            /* 找一個空格 + 一個會違規的顏色，走一次「違規彈窗」流程；找不到就什麼都不做 */
            for (var i = 0; i < n * n; i++) {
                if (grid[i] || pz.givens[i]) continue;
                for (var col = 1; col <= 2; col++) { var v = violationAt(grid, n, i, col); if (v) { explain(i, v); return v; } }
            }
            return null;
        };
        api.explainOpen = function () { return !!popup; };
        paint();
    }

    /* 規則示意圖：上半是玩家這一排／列的實際樣子（違規格子圈紅、黃框＝剛放的那格），下半是這條規則的「錯／對」範例。
       圖的寬 400、高 190（viewBox），彈窗裡等比例縮放 */
    /* 畫說明彈窗裡的規則示意圖（SVG 向量圖）：上面是玩家這一排的樣子，下面是「錯／對」範例。svg 的 viewBox 是內部座標，縮放時會等比例變大變小 */
    function ruleSvg(after, lineIdx, v, placedIdx, n) {
        var cs = Math.min(46, Math.floor(400 / n)), W = 400, x0 = (W - cs * n) / 2;
        var svg = kit.svg('svg', { viewBox: '0 0 ' + W + ' 196', 'class': 'takuzu-svg', width: '100%' });  /* kit.svg(標籤, 屬性, 父元素)：建立 SVG 向量圖形元素（形狀、線條…），畫圖用，放大縮小不會糊 */
        /* 畫一顆圓點：有顏色就畫黑／白圓，沒顏色畫小灰點；red 為 true 時外面再畫一圈紅圈（標出違規） */
        function disc(x, y, s, val, red) {
            if (val) kit.svg('circle', { cx: x + s / 2, cy: y + s / 2, r: s * 0.36, 'class': 'takuzu-svg-disc takuzu-svg-disc--' + (val === BLACK ? 'black' : 'white') }, svg);
            else kit.svg('circle', { cx: x + s / 2, cy: y + s / 2, r: s * 0.12, 'class': 'takuzu-svg-dot' }, svg);
            if (red) kit.svg('circle', { cx: x + s / 2, cy: y + s / 2, r: s * 0.46, 'class': 'takuzu-svg-bad' }, svg);
        }
        function text(x, y, str, cls, anchor) { var t = kit.svg('text', { x: x, y: y, 'text-anchor': anchor || 'start', 'class': cls }, svg); t.textContent = str; }
        lineIdx.forEach(function (ci, k) {
            kit.svg('rect', { x: x0 + k * cs, y: 6, width: cs, height: cs, 'class': 'takuzu-svg-cell' + (ci === placedIdx ? ' takuzu-svg-cell--new' : '') }, svg);
            disc(x0 + k * cs, 6, cs, after[ci], v.cells.indexOf(ci) >= 0);  /* indexOf：找元素在陣列（或字串）裡的位置，找不到回傳 −1（所以 < 0 代表「不在裡面」） */
        });
        text(W / 2, cs + 30, '你的這一' + (v.dir === 'row' ? '排' : '列') + '（黃框＝剛放的那格）', 'takuzu-svg-cap', 'middle');
        /* 規則範例：錯的一列、對的一列 */
        var rows = [], s2 = 30;
        if (v.type === 'triple') rows = [{ cells: [BLACK, BLACK, BLACK, WHITE], ok: false, label: '✗ 連續三個' }, { cells: [BLACK, BLACK, WHITE, BLACK], ok: true, label: '✓ 可以' }];
        else {
            var half = n / 2, mk = function (nb) { var a = []; for (var k = 0; k < n; k++) a.push(k < nb ? BLACK : WHITE); return a; };
            rows = [{ cells: mk(half + 1), ok: false, label: '✗ 黑 ' + (half + 1) + ' 個' }, { cells: mk(half), ok: true, label: '✓ 各 ' + half + ' 個' }];
        }
        var s3 = Math.min(s2, Math.floor(190 / rows[0].cells.length));
        rows.forEach(function (row, r) {
            var xs = 60, y = cs + 48 + r * (s3 + 12);
            row.cells.forEach(function (val, k) { disc(xs + k * s3, y, s3, val, false); });
            text(xs + row.cells.length * s3 + 14, y + s3 * 0.72, row.label, 'takuzu-svg-mark takuzu-svg-mark--' + (row.ok ? 'ok' : 'no'));
        });
        return svg;
    }

    /* 遊戲登記資料：id、名稱、規則文字（**包起來的是粗體重點）、mount 進場函式、score 成績規格、test 給單元測試用的內部函式 */
    var G = {
        id: ID,
        name: '黑白不連三',
        rule: '每一格塗黑或白，要符合兩條規則：**①同色不能連續三格（橫的、直的都一樣）；②每一排、每一列，黑和白一樣多。**題目已經給的格子不能改。下面先選「黑」「白」或「清除」，再點格子。沒有時間限制；如果你放的那一步違反規則，會彈出圖解告訴你是哪一條、哪幾格，那一步不會放下去，可以馬上重放。全部填對就換下一題，想結束就按左上角「返回」，成績是解開幾題。',
        mount: mount,
        score: SCORE,
        /* test：把內部函式與參數交給單元測試（test/reaction/ 底下的 t_*.js）使用，遊戲本身不會用到。 */
        test: {
            stageOf: stageOf, givensFor: givensFor, violationAt: violationAt, findViolations: findViolations, isComplete: isComplete,
            propagate: propagate, randomSolution: randomSolution, makePuzzle: makePuzzle, hintCell: hintCell, rating: rating,
            STAGES: STAGES, RAMP_LEN: RAMP_LEN, GIVENS: GIVENS, SLACK: SLACK, HINTS: HINTS, MAX_LEVEL: MAX_LEVEL, BLACK: BLACK, WHITE: WHITE
        }
    };
    /* 把這款遊戲登記給選單（沒有這行，選單就看不到它） */
    Reaction.register(G);
})();
