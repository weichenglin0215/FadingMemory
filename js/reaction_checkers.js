/* ═══════════════════════════════════════════════════════════════════
   reaction_checkers.js — 秒反應・跳棋跳最遠（企劃 262）
   樣式：css/games/reaction_checkers.css（這款專屬的 class 一律以「checkers-」開頭；共用元件在 css/reaction_common.css）
   跳棋盤上，你的棋子（紅色彈珠）可以**跳過相鄰的任何一顆棋子、落到後面的空位**，而且可以一直**連跳**。
   **點出哪一顆紅棋能連跳最多次**。點下去，彈珠就沿著路線連跳一遍。
   ───────────────────────────────────────────────────────────────────
   · 規則（longest）：往上、下、左、右四個方向，隔壁（距離 1）有棋子（紅、藍都算）、正後面（距離 2）是空格，就能跳過去。
     棋子不會被吃掉，所以盤面在連跳過程中不變；為了不會永遠繞圈，**同一個格子不能降落兩次**（包含出發的那一格）。
     最多能連跳幾次＝在「跳躍圖」上找最長的不重複路線（深度優先搜尋，窮舉）。
   · 出題（makeLevel）：**每一顆紅棋都跳得動，而且連跳次數很接近**（V1.57.5 重寫；以前紅棋約有四成跳 0 次，一眼就能排除）。
     ① 在同一個盤面上放好幾條「會共用棋子」的連跳路線（addChain），再補一些棋子；
     ② 算出盤面上**每一顆棋子**能連跳幾次（連跳只看「哪些格子有棋」，跟顏色無關）；
     ③ 從這些棋子裡挑誰是紅棋（pickReds）：最多的那一顆**唯一**，其他紅棋都只比它少 1～SPREAD 次、至少跳 MIN_JUMP 次，
        其中至少 NEAR 顆只少 1 次；另外要有 RIVALS 顆紅棋「第一步能跳的方向不比最佳的少」（不能只看第一步就猜中）。沒被挑中的都是藍棋。
   · 難度（都是 [第 1 關, 到頂] 線性變化，數值看下面的參數區）：棋盤寬（COLS）、長（ROWS）、紅棋顆數（REDS）、藍棋至少幾顆（BLUES）、
     最多連跳至少幾次（MIN_BEST）、紅棋最多少幾跳（SPREAD）、紅棋至少跳幾次（MIN_JUMP）、只差 1 跳的紅棋幾顆（NEAR）、第一步誘餌幾顆（RIVALS）、
     最佳路線至少轉幾個彎（MIN_TURNS）、限時（TIME_S）。
   · 版面（V1.57.5 之後）：上面只留一行字（作答前是提示，揭曉時換成結果），下面整塊給棋盤；格子是正方形，寬、高都放得下的前提下盡量大（最大 CELL_MAX）。
   · 揭曉：每顆紅棋旁邊標出能連跳幾次（最多的是綠色），最多的那一顆用動畫連跳一遍（彈珠跳的時候有弧線）。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    /* 新手導讀：整個檔案包在 (function () { ... })(); 裡（叫「立即執行函式」），裡面的變數都是這個檔案私有的，不會跟別的遊戲檔案的同名變數打架。
       檔案由上往下大致分成：① 參數區（標題寫著可以自己調整的參數：難度、秒數、文字大多在這）；② 純函式（只做計算、不碰畫面：出題、判斷對錯，單元測試直接測它們）；③ 畫面（mount 是進場、setup 是每一關開始時呼叫，負責把畫面建出來並處理點擊）。
       最後的 Reaction.register(G) 把這款遊戲「登記」給選單（沒有這行，選單就看不到它）。'use strict' 是嚴格模式：打錯變數名稱會直接報錯，而不是默默建立新變數。
       這款遊戲的代號是 'checkers'：選單、成績、存檔都靠它；樣式在 css/games/reaction_checkers.css，裡面的 class 名稱一律以 checkers- 開頭。 */
    'use strict';

    var ID = 'checkers';                                /* 這款遊戲的代號：選單、成績、存檔、CSS class 前綴都用它 */
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 90 };  /* 成績規格：better（max＝越大越好、min＝越小越好）、decimals 小數位數、format 顯示格式、label 名稱、min／max 合理範圍（超出範圍的成績不會送排行榜） */
    var h = UI.h, kit = Reaction.kit;                   /* h：建立網頁元素的小工具；kit：闖關遊戲共用的工具箱 */

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 30;                       /* 幾關之後難度到頂 */
    var COLS = [6, 8];                          /* 棋盤寬（幾欄，玩家指定）：第 1 關 → 到頂 */
    var ROWS = [6, 12];                         /* 棋盤長（幾列，玩家指定）：第 1 關 → 到頂 */
    var REDS = [2, 8];                          /* 紅棋顆數：第 1 關 → 到頂 */
    var BLUES = [12, 48];                        /* 藍棋顆數（至少；連跳路線經過的棋子也算在裡面）：第 1 關 → 到頂 */
    var MIN_BEST = [4, 10];                      /* 最多的連跳數至少幾次：第 1 關 → 到頂 */
    var SPREAD = [1, 1];                        /* 每顆紅棋最多比「最多的那顆」少幾跳（越小，次數越接近）：第 1 關 → 到頂 */
    var MIN_JUMP = [2, 3];                      /* 每顆紅棋至少能連跳幾次（不能低於 1＝沒有跳不動的紅棋）：第 1 關 → 到頂 */
    var NEAR = [1, 3];                          /* 至少幾顆紅棋「只比最多的少 1 跳」（要比到最後一步才分得出來）：第 1 關 → 到頂 */
    var RIVALS = [1, 2];                        /* 至少幾顆別的紅棋「第一步能跳的方向不比最佳的少」（不能只看第一步就猜中）：第 1 關 → 到頂 */
    var MIN_TURNS = [1, 3];                     /* 最長路線至少轉幾個彎：第 1 關 → 到頂 */
    var TIME_S = [30, 60];                       /* 每題限時（秒）：第 1 關 → 到頂 */
    var HOP_MS = 420;                           /* 揭曉時彈珠每跳一次的時間（毫秒） */
    var MAX_LEVEL = 90;                             /* 最後一關：過了第 90 關就算全破（也是成績的上限） */
    /* ── 版面（px）── */
    var NOTE_H = 36;                            /* 棋盤上方那一行字（提示／揭曉結果）佔的高度 */
    var CELL_MAX = 80;                          /* 每格最大幾 px（前幾關盤面小，格子不要大得誇張） */
    var EDGE = 4;                               /* 棋盤跟畫面左右、下緣至少留幾 px */
    /* ── 下面是出題內部用的數字，一般不用調 ── */
    var CHAIN_EXTRA = [0, 2];                   /* 鋪路線時比紅棋顆數多鋪幾條 */
    var PIECE_EXTRA = [2, 4];                   /* 棋子總數最多比「紅＋藍」多鋪到幾顆就停止加路線 */
    var CHAIN_REUSE = 0.6;                      /* 新路線有多大的機率優先跳過「已經放好的棋子」（路線互相共用，看起來更亂） */
    var SEARCH_CAP = 4000;                      /* 算一顆棋子的最長連跳時，最多走幾步搜尋；超過就不拿它當紅棋（避免出題太慢） */
    var TRIES = 3000;                           /* 最多試幾個盤面（實測通常 10 個以內就成功） */
    var EMPTY = 0, RED = 1, BLUE = 2;               /* 棋盤格子的狀態代號：EMPTY＝0 空格、RED＝1 紅方的棋、BLUE＝2 藍方的棋 */
    var DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];       /* 上、下、左、右 */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    /* 小工具：讓 [第 1 關的值, 到頂的值] 這種成對的設定依關卡線性變化，並四捨五入成整數 */
    function ramp(level, pair) { return Math.round(kit.ramp(level, pair[0], pair[1], RAMP_LEVELS)); }  /* kit.ramp(關卡, 起始值, 到頂值, 到頂關卡)：讓數值隨關卡「線性」從起始值變到到頂值（難度曲線的基本工具） */
    /* 這一關棋盤的寬（幾欄）、長（幾列） */
    function colsFor(level) { return ramp(level, COLS); }
    function rowsFor(level) { return ramp(level, ROWS); }
    /* 這一關有幾顆紅棋（要從紅棋裡挑「能連跳最多次」的那顆） */
    function redsFor(level) { return ramp(level, REDS); }
    /* 這一關有幾顆藍棋（藍棋也可以被跳過，用來干擾判斷） */
    function bluesFor(level) { return ramp(level, BLUES); }
    /* 這一關「最多的那顆能連跳的次數」至少要幾次 */
    function minBestFor(level) { return ramp(level, MIN_BEST); }
    /* 紅棋最多比最佳少幾跳、至少跳幾次、幾顆只少 1 跳、幾顆第一步誘餌（意思見上面的參數） */
    function spreadFor(level) { return ramp(level, SPREAD); }
    function minJumpFor(level) { return Math.max(1, ramp(level, MIN_JUMP)); }
    function nearFor(level) { return Math.min(redsFor(level) - 1, Math.max(1, ramp(level, NEAR))); }
    function rivalsFor(level) { return Math.min(redsFor(level) - 1, ramp(level, RIVALS)); }
    /* 最佳路線至少要轉幾個彎（轉彎越多越難看出來） */
    function minTurnsFor(level) { return ramp(level, MIN_TURNS); }
    /* 這一關的作答限時（毫秒） */
    function timeMs(level) { return Math.round(kit.ramp(level, TIME_S[0], TIME_S[1], RAMP_LEVELS) * 1000); }  /* Math.round：四捨五入成整數 */
    /* 第 r 列第 c 欄在棋盤（寬 cols、長 rows）裡嗎（in bounds）。格子編號＝列 × cols ＋ 欄 */
    function inb(cols, rows, r, c) { return r >= 0 && r < rows && c >= 0 && c < cols; }
    /* 從 start（格子編號）出發最多能連跳幾次：回傳 { jumps, path（依序降落的格子編號）}。
       被跳的棋子不會被吃掉；同一個格子不能降落兩次（含出發那格，它在跳起來之後是空的但不能回去）。 */
    /* 從 start 這一格出發，最多能連跳幾次？規則（像跳棋）：隔壁有棋子、而且棋子後面是空格，就能跳過去降落；被跳的棋子不會被吃掉；同一格不能降落兩次。
       做法是「深度優先搜尋」（dfs）：每到一格就試四個方向，能跳就跳過去繼續往下試，試完要退回（path.pop／visited[land] = false），記錄走過最長的那條。回傳 { jumps 次數, path 依序降落的格子 }。 */
    /* cap（選填）：最多走幾步搜尋；超過就放棄，回傳的 capped 是 true（代表次數可能還能更多，不能拿來用） */
    /* cols＝棋盤寬幾欄（長幾列由 board.length 算出來） */
    function longest(board, cols, start, cap) {
        var best = { jumps: 0, path: [], capped: false }, visited = {}, path = [], steps = 0, rows = board.length / cols;
        visited[start] = true;
        /* dfs（深度優先搜尋）：從目前的格子 cur 往下試所有跳法；先檢查「目前這條路」是不是比紀錄更長，再試上下左右四個方向 */
        function dfs(cur) {
            if (cap && ++steps > cap) { best.capped = true; return; }
            var r = Math.floor(cur / cols), c = cur % cols;   /* Math.floor：無條件捨去成整數 */
            if (path.length > best.jumps) { best.jumps = path.length; best.path = path.slice(); }  /* slice()：複製一份陣列（之後改複本，不會動到原本的資料） */
            for (var d = 0; d < 4; d++) {
                var mr = r + DIRS[d][0], mc = c + DIRS[d][1], lr = r + 2 * DIRS[d][0], lc = c + 2 * DIRS[d][1];
                if (!inb(cols, rows, lr, lc)) continue;
                var mid = mr * cols + mc, land = lr * cols + lc;
                if (board[mid] === EMPTY || mid === start) continue;             /* 隔壁要有棋子（出發的那顆已經離開，不算） */
                if (board[land] !== EMPTY && land !== start) continue;           /* 後面要是空格（出發那格也是空的，但已經在 visited 裡） */
                if (visited[land]) continue;
                visited[land] = true; path.push(land);
                dfs(land);
                path.pop(); visited[land] = false;
            }
        }
        dfs(start);
        return best;
    }
    /* 一條路線轉了幾個彎（連續兩跳的方向不同就算一個彎）；出發點 start 也要給 */
    /* 一條路線轉了幾個彎：相鄰兩跳的方向不同就算一個彎（用 Math.sign 取每一跳的列、欄移動方向，組成字串比較） */
    function turnsOf(cols, start, path) {
        var prev = null, turns = 0, cur = start;
        for (var i = 0; i < path.length; i++) {
            var dr = Math.sign(Math.floor(path[i] / cols) - Math.floor(cur / cols)), dc = Math.sign(path[i] % cols - cur % cols), key = dr + ',' + dc;
            if (prev !== null && key !== prev) turns++;
            prev = key; cur = path[i];
        }
        return turns;
    }
    /* 用隨機漫步造一條 k 次連跳的路線：每一步在四個方向裡隨機挑一個合法的跳法。回傳 { start, lands 降落格, mids 被跳過的棋子所在格 }；走進死路就回傳 null。
       occ／keepEmpty（選填）：共用盤面上「已經有棋的格子」「必須保持空的格子」，新路線要跟前面的路線相容（路線之間可以跳同一顆棋、降落在同一格）。
       reuse（選填）：有多大的機率優先跳過已經放好的棋子。 */
    function buildChain(cols, rows, k, rand, occ, keepEmpty, reuse) {
        occ = occ || {}; keepEmpty = keepEmpty || {};
        var start = kit.randInt(0, cols * rows - 1, rand), cur = start, lands = [], mids = [], landSet = {}, midSet = {};  /* kit.randInt(最小, 最大, rand)：隨機整數（含最小與最大） */
        if (keepEmpty[start]) return null;              /* 出發格一定要放棋子 */
        landSet[start] = true;
        for (var i = 0; i < k; i++) {
            var opts = [], used = [];
            for (var d = 0; d < 4; d++) {
                var r = Math.floor(cur / cols), c = cur % cols, mr = r + DIRS[d][0], mc = c + DIRS[d][1], lr = r + 2 * DIRS[d][0], lc = c + 2 * DIRS[d][1];
                if (!inb(cols, rows, lr, lc)) continue;
                var mid = mr * cols + mc, land = lr * cols + lc;
                if (landSet[land] || midSet[land] || landSet[mid]) continue;      /* 降落的格子要空、不能是已經降落過的、被跳的棋子的格子不能是降落格 */
                if (keepEmpty[mid] || (occ[land] && land !== start)) continue;   /* 跟盤面上別條路線相容 */
                opts.push({ mid: mid, land: land });
                if (occ[mid]) used.push(opts[opts.length - 1]);
            }
            if (!opts.length) return null;
            var o = kit.pick(used.length && rand() < (reuse || 0) ? used : opts, rand);   /* kit.pick(陣列, rand)：從陣列隨機挑一個元素 */
            mids.push(o.mid); lands.push(o.land); midSet[o.mid] = true; landSet[o.land] = true; cur = o.land;
        }
        return { start: start, lands: lands, mids: mids };
    }
    /* 鋪一個棋子盤面（只決定哪些格子有棋，還不分顏色）：先放好幾條共用棋子的路線（長度 top 或 top−1），再隨機補到至少 need 顆。回傳 { board（有棋＝BLUE）, count }；放不下回傳 null */
    function buildPieces(cols, rows, level, top, need, rand) {
        var occ = {}, keepEmpty = {}, count = 0, made = 0, a, want = redsFor(level) + ramp(level, CHAIN_EXTRA), enough = need + ramp(level, PIECE_EXTRA);
        function put(cell) { if (!occ[cell]) { occ[cell] = true; count++; } }
        for (a = 0; a < 80 && made < want && count < enough; a++) {
            var ch = buildChain(cols, rows, Math.max(1, top - kit.randInt(0, 1, rand)), rand, occ, keepEmpty, CHAIN_REUSE);
            if (!ch) continue;
            put(ch.start); ch.mids.forEach(put);                                       /* forEach：對陣列的每個元素各做一次 */
            ch.lands.forEach(function (l) { keepEmpty[l] = true; });
            made++;
        }
        var free = [];
        for (var cell = 0; cell < cols * rows; cell++) if (!occ[cell] && !keepEmpty[cell]) free.push(cell);
        while (count < need && free.length) put(free.splice(kit.randInt(0, free.length - 1, rand), 1)[0]);
        if (count < need) return null;
        var board = new Int8Array(cols * rows);         /* board：棋盤（Int8Array 是固定長度的整數陣列，每格存 EMPTY／RED／BLUE） */
        Object.keys(occ).forEach(function (k) { board[+k] = BLUE; });
        return { board: board, count: count };
    }
    /* 位置 p 的棋子，第一步有幾個方向可以跳 */
    function openMoves(board, cols, p) {
        var r = Math.floor(p / cols), c = p % cols, k = 0, rows = board.length / cols;
        for (var d = 0; d < 4; d++) {
            var lr = r + 2 * DIRS[d][0], lc = c + 2 * DIRS[d][1];
            if (inb(cols, rows, lr, lc) && board[(r + DIRS[d][0]) * cols + c + DIRS[d][1]] !== EMPTY && board[lr * cols + lc] === EMPTY) k++;
        }
        return k;
    }
    /* 從盤面上的棋子裡挑紅棋。infos：每顆棋子的 { cell, jumps, path }；want：{ reds, minBest, maxTop, spread, minJump, near, rivals, minTurns }。
       回傳 [最佳, 其他…]（挑不出來回傳 null）。最佳的次數是唯一最多的；其他紅棋的次數在 [max(minJump, 最佳−spread), 最佳−1]，
       至少 near 顆是最佳−1、至少 rivals 顆第一步能跳的方向不比最佳少；剩下的名額優先給跳得多的。 */
    function pickReds(board, cols, infos, want, rand) {
        var tops = [];
        infos.forEach(function (x) { if (x.jumps >= want.minBest && x.jumps <= want.maxTop && tops.indexOf(x.jumps) < 0) tops.push(x.jumps); });  /* indexOf：找元素在陣列裡的位置，找不到回傳 −1 */
        tops = kit.shuffle(tops, rand);                 /* kit.shuffle(陣列, rand)：回傳一份順序打亂的「複本」（原本的陣列不變，要接住回傳值） */
        for (var t = 0; t < tops.length; t++) {
            var top = tops[t], low = Math.max(want.minJump, top - want.spread), need = want.reds - 1;
            var bests = infos.filter(function (x) { return x.jumps === top && turnsOf(cols, x.cell, x.path) >= want.minTurns; });  /* filter：留下符合條件的元素，回傳新陣列 */
            var pool = infos.filter(function (x) { return x.jumps >= low && x.jumps < top; });
            if (!bests.length || pool.length < need || pool.filter(function (x) { return x.jumps === top - 1; }).length < want.near) continue;
            var best = kit.pick(bests, rand), bo = openMoves(board, cols, best.cell), chosen = [];
            pool = kit.shuffle(pool, rand);
            /* take(條件, 最多挑到幾顆)：從候選裡照順序挑符合條件的 */
            var take = function (fits, upto) { for (var i = 0; i < pool.length && chosen.length < upto; i++) if (chosen.indexOf(pool[i]) < 0 && fits(pool[i])) chosen.push(pool[i]); };
            var rival = function (x) { return openMoves(board, cols, x.cell) >= bo; };
            var close = function (x) { return x.jumps === top - 1; };
            take(function (x) { return close(x) && rival(x); }, want.rivals);
            take(rival, want.rivals);
            if (chosen.length < want.rivals) continue;
            take(close, Math.min(need, chosen.length + Math.max(0, want.near - chosen.filter(close).length)));
            if (chosen.filter(close).length < want.near) continue;
            pool.sort(function (x, y) { return y.jumps - x.jumps; });                  /* sort：排序（跳得多的排前面） */
            take(function () { return true; }, need);
            if (chosen.length === need) return [best].concat(chosen);                  /* concat：把兩個陣列接起來，回傳新陣列 */
        }
        return null;
    }
    /* 出一關：{ cols 寬, rows 長, board, reds（紅棋的格子編號）, jumps（每顆紅棋的最大連跳數）, paths, best（最多的那顆在 reds 裡的位置）, bestJumps, second, gap, turns, level } */
    function makeLevel(level, rand) {
        rand = rand || Math.random;                     /* 沒有傳亂數函式就用 Math.random（測試時可以傳固定的亂數，結果才能重現） */
        var cols = colsFor(level), rows = rowsFor(level), R = redsFor(level), need = R + bluesFor(level);
        var want = { reds: R, minBest: minBestFor(level), maxTop: 0, spread: spreadFor(level), minJump: minJumpFor(level), near: nearFor(level), rivals: rivalsFor(level), minTurns: minTurnsFor(level) };
        for (var tr = 0; tr < TRIES; tr++) {
            var top = want.minBest + kit.randInt(0, 1, rand);
            want.maxTop = top + 1;
            var made = buildPieces(cols, rows, level, top, need, rand);
            if (!made) continue;
            var board = made.board, infos = [];
            for (var cell = 0; cell < cols * rows; cell++) if (board[cell] !== EMPTY) {
                var x = longest(board, cols, cell, SEARCH_CAP);
                if (!x.capped) infos.push({ cell: cell, jumps: x.jumps, path: x.path });
            }
            var picked = pickReds(board, cols, infos, want, rand);
            if (!picked) continue;
            picked = kit.shuffle(picked, rand);         /* 最佳的那顆排在哪裡是隨機的 */
            var reds = picked.map(function (q) { return q.cell; });                    /* map：把陣列的每個元素轉換成別的東西，回傳新陣列 */
            reds.forEach(function (cc) { board[cc] = RED; });
            return answer(cols, board, reds, picked.map(function (q) { return q.jumps; }), picked.map(function (q) { return q.path; }), level);
        }
        return fallback(level);
    }
    /* 把盤面整理成 makeLevel 的回傳格式 */
    function answer(cols, board, reds, jumps, paths, level) {
        var bi = 0, second = 0, i;
        for (i = 1; i < jumps.length; i++) if (jumps[i] > jumps[bi]) bi = i;
        for (i = 0; i < jumps.length; i++) if (i !== bi && jumps[i] > second) second = jumps[i];
        return { cols: cols, rows: board.length / cols, board: board, reds: reds, jumps: jumps, paths: paths, best: bi, bestJumps: jumps[bi], second: second, gap: jumps[bi] - second, turns: turnsOf(cols, reds[bi], paths[bi]), level: level };
    }
    /* 保底（幾乎用不到）：6×6，左上角的紅棋往右跳兩次再往下跳一次（3 次），左下角的紅棋只能跳 1 次 */
    function fallback(level) {
        var fn = 6, fb = new Int8Array(fn * fn);
        [[0, 0, RED], [0, 1, BLUE], [0, 3, BLUE], [1, 4, BLUE], [5, 0, RED], [5, 1, BLUE]].forEach(function (a) { fb[a[0] * fn + a[1]] = a[2]; });
        var fr = [0, 5 * fn], fres = fr.map(function (cc) { return longest(fb, fn, cc); });
        return answer(fn, fb, fr, fres.map(function (x) { return x.jumps; }), fres.map(function (x) { return x.path; }), level);
    }
    /* 結算畫面的評語：依成績回傳一句話 */
    function rating(n) {
        if (n >= 25) return '跳棋大師！';
        if (n >= 15) return '路線看得很準！';
        if (n >= 8) return '不錯喔！';
        if (n >= 3) return '再接再厲！';
        return '多看幾步：跳過去之後還能再跳！';
    }

    /* mount：選單按下這款遊戲時會呼叫它。把「闖關」的流程（第幾關、過關、失敗、結算、最佳紀錄）交給共用骨架 kit.run，我們只提供 setup（每一關怎麼畫）、rating（評語）等小零件。 */
    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 5, stageClass: 'checkers-stage',
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
        var q = makeLevel(level, api.rand), cols = q.cols, rows = q.rows, board = q.board;
        api.info = q;                                   /* 把這一關的題目資料掛在 api.info，測試與 debug 用（玩家看不到） */
        console.log('[跳棋跳最遠] 第 ' + level + ' 關：寬 ' + cols + '×長 ' + rows + '，紅棋 ' + q.reds.length + ' 顆，各能連跳 ' + q.jumps.join('、') + ' 次；最多 ' + q.bestJumps + '（第二多 ' + q.second + '，差 ' + q.gap + '，路線轉 ' + q.turns + ' 個彎）；限時 ' + timeMs(level) + ' ms');  /* 在瀏覽器主控台（按 F12）印出這一關的出題內容，方便除錯與驗證 */

        /* 版面：上面一行字（NOTE_H），下面整塊給棋盤；格子正方形，寬、高都放得下的前提下盡量大（最大 CELL_MAX） */
        var W = stage.clientWidth || 484, H = stage.clientHeight || 700;
        var cs = Math.floor(Math.min((W - 2 * EDGE) / cols, (H - NOTE_H - EDGE) / rows, CELL_MAX)), BW = cs * cols, BH = cs * rows, bx = Math.round((W - BW) / 2), by = NOTE_H, ps = Math.round(cs * 0.78), off = (cs - ps) / 2;
        var field = h('div', { 'class': 'checkers-field' });
        stage.appendChild(field);                       /* appendChild：把一個元素放進另一個元素裡（放進去，畫面上才看得到） */
        var tip = h('div', { 'class': 'qz-note checkers-tip', text: '點出能連跳最多次的紅棋' });   /* 棋盤上方那一行：作答前是提示，揭曉時換成結果 */
        field.appendChild(tip);
        var bd = h('div', { 'class': 'checkers-board' });
        bd.style.cssText = 'left:' + bx + 'px;top:' + by + 'px;width:' + BW + 'px;height:' + BH + 'px;background-size:' + cs + 'px ' + cs + 'px;';
        field.appendChild(bd);
        var pcs = {};                                                       /* 格子編號 → 棋子的元素 */  /* pcs：格子編號 → 棋子的畫面元素 */
        /* 把棋子元素放到某一格的位置（用 left／top，棋子比格子小，off 是置中用的位移） */
        function place(el, cell) { el.style.left = (cell % cols) * cs + off + 'px'; el.style.top = Math.floor(cell / cols) * cs + off + 'px'; }
        for (var cell = 0; cell < cols * rows; cell++) if (board[cell] !== EMPTY) {
            var el = h('div', { 'class': 'checkers-pc ' + (board[cell] === RED ? 'checkers-pc--red' : 'checkers-pc--blue') });
            el.style.width = el.style.height = ps + 'px';
            el.appendChild(h('div', { 'class': 'checkers-pc__in' }));
            place(el, cell); bd.appendChild(el); pcs[cell] = el;
        }
        var done = false;
        api.timer(timeMs(level), function () { judge(-1); });  /* 開始倒數（畫面上方的時間條）：時間到就呼叫後面那個函式 */
        if (level === 1 && kit.once('checkers.hint')) kit.hintOn(stage, pcs[q.reds[q.best]], { mode: 'tap', delay: 700, text: '請點能連跳最多次的紅棋' });  /* 操作提示（手指圖示指出該點哪裡）：玩家第一次按下就消失 */
        q.reds.forEach(function (cellNo, ri) { kit.onTap(pcs[cellNo], function () { judge(ri); }); });  /* kit.onTap(元素, 函式)：幫元素綁定「點一下」的動作（手機觸控與電腦滑鼠通用，反應比一般 click 快） */

        /* 彈珠沿著路線連跳（外層直線移動、內層做弧線）；跳完呼叫 done */
        /* 揭曉動畫：第 ri 顆紅棋沿著它的最佳路線一跳一跳過去（每跳 HOP_MS 毫秒，直線移動加上弧線動畫），跳完呼叫 onEnd */
        function hop(ri, onEnd) {
            var el = pcs[q.reds[ri]], path = q.paths[ri], k = 0;
            el.classList.add('checkers-pc--go');        /* classList.add／remove／toggle：加上／拿掉 CSS class，元素的外觀就跟著變（class 的樣式寫在 css 檔裡） */
            el.style.zIndex = '20';
            /* next：跳下一步（遞迴式的動畫迴圈：每一跳用 api.after 等動畫播完才跳下一跳） */
            function next() {
                if (k >= path.length) { onEnd && onEnd(); return; }
                var inner = el.firstChild;
                el.style.transition = 'left ' + HOP_MS + 'ms linear, top ' + HOP_MS + 'ms linear';
                place(el, path[k]);
                inner.classList.remove('checkers-pc__in--arc'); void inner.offsetWidth; inner.classList.add('checkers-pc__in--arc'); inner.style.animationDuration = HOP_MS + 'ms';
                Sfx.play('pop'); k++;                   /* Sfx.play(名稱)：播放音效（ok 答對、bad 答錯、click 點擊…；音效是程式即時合成的） */
                api.after(HOP_MS + 40, next);           /* api.after(毫秒, 函式)：過幾毫秒再執行；這一關結束後會自動作廢（不會跑到下一關去） */
            }
            next();
        }
        /* 判定玩家的答案：答對就過關（api.pass），答錯或超時就失敗（api.fail） */
        function judge(ri) {
            if (done || api.over) return;
            done = true;
            var ok = ri >= 0 && q.jumps[ri] === q.bestJumps;
            /* 每顆紅棋旁邊標出能跳幾次（最多的是綠色） */
            q.reds.forEach(function (cellNo, j) {
                var b = h('div', { 'class': 'checkers-badge' + (q.jumps[j] === q.bestJumps ? ' checkers-badge--best' : ''), text: String(q.jumps[j]) });
                pcs[cellNo].appendChild(b);
            });
            if (ri >= 0) pcs[q.reds[ri]].classList.add(ok ? 'checkers-pc--ok' : 'checkers-pc--bad');
            var go = ok ? ri : q.best;
            tip.classList.add('checkers-tip--result');
            tip.textContent = ok ? '連跳 ' + q.jumps[ri] + ' 次，是最多的！' : (ri >= 0 ? '你選的只能連跳 ' + q.jumps[ri] + ' 次，最多是 ' + q.bestJumps + ' 次' : '時間到！最多能連跳 ' + q.bestJumps + ' 次');  /* textContent：設定元素裡的文字（安全，不會被當成 HTML 解析） */
            kit.flash(stage, ok, api.my);               /* kit.flash(舞台, 對或錯, 計時器)：畫面閃一下綠光（答對）或紅光（答錯） */
            api.after(500, function () { hop(go); });
            var hopMs = 500 + q.paths[go].length * (HOP_MS + 40);
            if (ok) { api.pass({ delay: hopMs + 900 }); return; }  /* api.pass({ delay })：宣告「過關」，delay 毫秒後進下一關（最後一關則進結算） */
            api.fail({ delay: hopMs + 1800, lines: [ri >= 0 ? '你選的只能連跳 ' + q.jumps[ri] + ' 次' : '時間到！', '最多能連跳 ' + q.bestJumps + ' 次（第二多 ' + q.second + ' 次）'] });  /* api.fail({ delay, lines })：宣告「失敗」，delay 毫秒後進結算畫面，lines 是結算要多寫的說明行 */
        }
        /* 給測試／debug 用：api.solve 自動走出正解、api.wrong 故意走錯一步、api.state 回報目前狀態（瀏覽器自動測試會呼叫它們，玩家用不到）。 */
        api.solve = function () { judge(q.best); };
        api.wrong = function () { var w = q.jumps.findIndex(function (v) { return v !== q.bestJumps; }); judge(w >= 0 ? w : 0); };
    }

    /* 遊戲登記資料：id 代號、name 選單上的名稱、rule 玩法說明（**包起來的是粗體重點）、mount 進場函式、score 成績規格、test 給單元測試用的內部函式。 */
    var G = {
        id: ID,
        name: '跳棋跳最遠',
        rule: '這是方格版的跳棋。**紅色彈珠可以跳過相鄰的任何一顆棋子**（往上下左右），落到後面的空格，而且可以**一直連跳**（同一個格子不能降落兩次）。**點出哪一顆紅棋能連跳最多次**，點下去它就連跳一遍。**每一顆紅棋都跳得動，次數又很接近**，要一顆一顆看清楚。點錯或來不及就結束，看你能過幾關。越後面，棋盤越滿、紅棋越多！',
        mount: mount,
        score: SCORE,
        /* test：把內部函式與參數交給單元測試（test/reaction/ 底下的 t_*.js）使用，遊戲本身不會用到。 */
        test: {
            colsFor: colsFor, rowsFor: rowsFor, redsFor: redsFor, bluesFor: bluesFor, minBestFor: minBestFor, spreadFor: spreadFor, minJumpFor: minJumpFor, nearFor: nearFor, rivalsFor: rivalsFor, minTurnsFor: minTurnsFor, timeMs: timeMs, longest: longest, turnsOf: turnsOf, buildChain: buildChain, openMoves: openMoves, makeLevel: makeLevel, rating: rating,
            RAMP_LEVELS: RAMP_LEVELS, COLS: COLS, ROWS: ROWS, NOTE_H: NOTE_H, CELL_MAX: CELL_MAX, EDGE: EDGE, REDS: REDS, BLUES: BLUES, MIN_BEST: MIN_BEST, SPREAD: SPREAD, MIN_JUMP: MIN_JUMP, NEAR: NEAR, RIVALS: RIVALS, MIN_TURNS: MIN_TURNS, TIME_S: TIME_S, HOP_MS: HOP_MS, MAX_LEVEL: MAX_LEVEL, EMPTY: EMPTY, RED: RED, BLUE: BLUE
        }
    };
    /* 把這款遊戲登記給選單（沒有這行，選單就看不到它） */
    Reaction.register(G);
})();
