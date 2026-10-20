/* ═══════════════════════════════════════════════════════════════════
   reaction_gomoku.js — 秒反應・堵住五子（企劃 233）
   公園石桌上的五子棋盤面：白棋（電腦）下一步就要贏了。你只能下一顆黑棋，**點那唯一能擋住的位置**。
   答對＝白棋怎麼下都贏不了；答錯＝白棋下在致勝點（可能連下好幾手），五顆連線亮紅。
   ───────────────────────────────────────────────────────────────────
   · 「白棋會贏」的定義（whiteWins）：輪到白棋，只要能靠「連續衝四（下一顆讓某條線變成四，逼黑棋非擋不可）」
     加上「一手同時下出兩個致勝點（活四、雙四，黑棋一次只能擋一個）」在 WIN_DEPTH 步預備之內連成五顆，就算會贏。
     致勝點（winCells）＝白棋下在那格剛好連成五顆（或以上）的空格。這是五子棋最基本、算得清楚的戰術，可以用程式窮舉驗證。
   · 兩種題型：
       ① 四顆一排（'four'）：白棋有一個四，只剩一個致勝點（一端被黑棋或棋盤邊緣堵住的四顆一排，或是中間空一格的「跳四」）——只有下在那個致勝點能擋；
       ② 兩個三顆交叉（'corner'，後面的關卡）：白棋有兩條三顆的線，它們從同一個空格 X 往兩個不同方向伸出去——
          白棋下在 X 會同時變成兩個四（雙四），黑棋擋不了。**只有下在交叉點 X 才擋得住兩條**（擋任何一條線的某一端都沒用）。
     兩種題型都由 isGood 窮舉驗證：黑棋所有「有意義的下法」（鄰近白棋威脅的空格）裡，**只有一格**能讓白棋贏不了；
     而且「黑棋不下」白棋也贏——所以離得很遠的下法等於沒下，也一樣輸。錯的下法只要在 WIN_DEPTH 步內輸掉；正確答案則用更深的 HOLD_DEPTH 步確認白棋真的贏不了。
   · 為了讓「白棋會贏」的證明站得住腳，盤面上黑棋不能有自己的反擊（任何 5 格視窗裡有 3 顆黑棋、沒有白棋，黑棋就有機會自己連成四，這種盤面不出）。
   · 難度（線性）：盤面棋子數 6 → 40 顆（STONES）、限時 10 → 4 秒（TIME_S）、「看起來很危險、其實已經被堵住」的假威脅 0 → 3 組（DECOYS）、
     第 CORNER_FROM 關起「兩個三顆交叉」的機率 20% → 70%（CORNER_P）；威脅可以朝八個方向任一個，被一堆無關的棋子淹沒（雜訊棋子一顆顆放，每放一顆就驗證答案還是唯一）。
   · 揭曉：答錯時白棋依序下出致勝的幾手（黑棋被逼著擋的也畫出來），最後把連成的五顆用紅線穿過去，停格 2 秒以上；綠圈標出唯一的擋法。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'gomoku';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 60 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 24;                       /* 幾關之後難度到頂 */
    var STONES = [6, 40];                       /* 盤面棋子總數：第 1 關 → 到頂 */
    var TIME_S = [10, 4];                       /* 每題限時（秒）：第 1 關 → 到頂 */
    var DECOYS = [0, 3];                        /* 「假威脅」（已經被堵死的四、被堵死的三）組數：第 1 關 → 到頂 */
    var CORNER_FROM = 5, CORNER_P = [0.2, 0.7]; /* 「兩個三顆交叉」題型：第 CORNER_FROM 關起出現，機率從 CORNER_P[0] 線性增加到 CORNER_P[1]（到頂的關卡） */
    var WIN_DEPTH = 2;                          /* 白棋最多幾步預備（衝四）之後要連成五顆才算「會贏」（錯誤的下法都要在這個範圍內輸掉） */
    var HOLD_DEPTH = 4;                         /* 正確答案要通過更嚴的檢查：白棋用到 4 步預備（連續衝四）也贏不了，才敢說「化解了」 */
    var BOARD = 13;                             /* 棋盤邊長（13×13，格子比 15×15 大，手指好點） */
    var MAX_LEVEL = 60;
    var BLACK = 1, WHITE = -1;
    var LINES = [[0, 1], [1, 0], [1, 1], [1, -1]];                             /* 四條線的方向：橫、直、斜（右下）、斜（左下） */
    var DIR8 = [[0, 1], [1, 0], [1, 1], [1, -1], [0, -1], [-1, 0], [-1, -1], [-1, 1]];

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function stonesFor(level) { return Math.round(kit.ramp(level, STONES[0], STONES[1], RAMP_LEVELS)); }
    function timeMs(level) { return Math.round(kit.ramp(level, TIME_S[0], TIME_S[1], RAMP_LEVELS) * 1000); }
    function decoysFor(level) { return Math.round(kit.ramp(level, DECOYS[0], DECOYS[1], RAMP_LEVELS)); }
    function cornerPFor(level) { return level < CORNER_FROM ? 0 : kit.ramp(level, CORNER_P[0], CORNER_P[1], RAMP_LEVELS); }
    function newBoard(n) { var m = n || BOARD; return new Int8Array(m * m); }
    function inb(n, r, c) { return r >= 0 && r < n && c >= 0 && c < n; }
    /* color 的棋在 idx（空格或已經有 color 的棋都可以）會不會連成五顆以上？會就回傳連成的那一條線的格子（連續、至少 5 個），不會回傳 null */
    function fiveThrough(b, n, idx, color) {
        var r0 = Math.floor(idx / n), c0 = idx % n;
        for (var d = 0; d < 4; d++) {
            var dr = LINES[d][0], dc = LINES[d][1], cells = [idx], r = r0 + dr, c = c0 + dc;
            while (inb(n, r, c) && b[r * n + c] === color) { cells.push(r * n + c); r += dr; c += dc; }
            r = r0 - dr; c = c0 - dc;
            while (inb(n, r, c) && b[r * n + c] === color) { cells.unshift(r * n + c); r -= dr; c -= dc; }
            if (cells.length >= 5) return cells;
        }
        return null;
    }
    /* 致勝點：color 下在那格就連成五顆的空格（全盤掃描） */
    function winCells(b, n, color) {
        var out = [];
        for (var i = 0; i < n * n; i++) if (b[i] === 0 && fiveThrough(b, n, i, color)) out.push(i);
        return out;
    }
    /* 剛下了 idx（已經放上棋盤）之後，經過它的四條線上、距離 4 格以內的空格，哪些是 color 的致勝點 */
    function localWinCells(b, n, idx, color) {
        var r0 = Math.floor(idx / n), c0 = idx % n, out = [], seen = {};
        for (var d = 0; d < 4; d++) for (var k = -4; k <= 4; k++) {
            if (!k) continue;
            var r = r0 + LINES[d][0] * k, c = c0 + LINES[d][1] * k;
            if (!inb(n, r, c)) continue;
            var j = r * n + c;
            if (b[j] !== 0 || seen[j]) continue;
            seen[j] = 1;
            if (fiveThrough(b, n, j, color)) out.push(j);
        }
        return out;
    }
    /* 掃描所有「5 格視窗」（橫直斜四個方向、連續 5 格）：視窗裡沒有對方的棋、而且 color 的棋剛好（exact）或至少（不 exact）有 count 顆時，
       把視窗裡的空格收集起來（不重複）。 */
    function windowCells(b, n, color, count, exact) {
        var out = [], seen = {};
        for (var d = 0; d < 4; d++) {
            var dr = LINES[d][0], dc = LINES[d][1];
            for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) {
                if (!inb(n, r + 4 * dr, c + 4 * dc)) continue;
                var mine = 0, other = 0, empt = [];
                for (var k = 0; k < 5; k++) {
                    var j = (r + dr * k) * n + c + dc * k, v = b[j];
                    if (v === color) mine++; else if (v === 0) empt.push(j); else other++;
                }
                if (other || (exact ? mine !== count : mine < count)) continue;
                for (var e = 0; e < empt.length; e++) if (!seen[empt[e]]) { seen[empt[e]] = 1; out.push(empt[e]); }
            }
        }
        return out;
    }
    /* 輪到白棋，白棋能不能在 depth 步預備之內連成五顆？回傳 { win, pv }：pv 是致勝的下法 [{ c: 顏色, cell }…]（最後一手是白棋連成五顆）。
       ① 現在就有致勝點 → 贏；
       ② depth ≥ 1：白棋下一個「讓某條線變成四」的位置 m（它一定在「5 格視窗裡剛好有 3 顆白棋、沒有黑棋」的空格上）：
          新的致勝點 ≥ 2 個 → 黑棋一次擋不了兩個 → 贏；剛好 1 個而且 depth ≥ 2 → 黑棋被逼著擋那一格，再往下搜尋
          （黑棋擋的那一手如果反而讓黑棋連成五顆或四顆反擊，這條路線不算白棋贏——保守起見，寧可不出這種題）。 */
    function whiteWins(b, n, depth) {
        var wc = winCells(b, n, WHITE);
        if (wc.length) return { win: true, pv: [{ c: WHITE, cell: wc[0] }] };
        if (depth < 1) return { win: false, pv: [] };
        var cands = windowCells(b, n, WHITE, 3, true);
        for (var i = 0; i < cands.length; i++) {
            var m = cands[i];
            b[m] = WHITE;
            var nw = localWinCells(b, n, m, WHITE);
            if (nw.length >= 2) { b[m] = 0; return { win: true, pv: [{ c: WHITE, cell: m }, { c: BLACK, cell: nw[0] }, { c: WHITE, cell: nw[1] }] }; }
            if (nw.length === 1 && depth >= 2) {
                var w = nw[0];
                b[w] = BLACK;
                if (!fiveThrough(b, n, w, BLACK) && !localWinCells(b, n, w, BLACK).length) {
                    var sub = whiteWins(b, n, depth - 1);
                    if (sub.win) { b[w] = 0; b[m] = 0; return { win: true, pv: [{ c: WHITE, cell: m }, { c: BLACK, cell: w }].concat(sub.pv) }; }
                }
                b[w] = 0;
            }
            b[m] = 0;
        }
        return { win: false, pv: [] };
    }
    /* 黑棋「有意義的下法」：鄰近白棋威脅（5 格視窗裡沒有黑棋、至少 2 顆白棋）的空格；其他地方的下法等於沒下 */
    function relevantCells(b, n) { return windowCells(b, n, WHITE, 2, false); }
    /* 黑棋有沒有自己的反擊機會：某個 5 格視窗裡有 3 顆以上黑棋、沒有白棋（再下一兩顆就變成四） */
    function blackCounter(b, n) { return windowCells(b, n, BLACK, 3, false).length > 0; }
    /* 黑棋所有能讓白棋贏不了的下法（在 relevantCells 裡窮舉；每一手都用 whiteWins 驗證） */
    function solutionCells(b, n, depth) {
        var out = [], cells = relevantCells(b, n);
        cells.forEach(function (c) {
            b[c] = BLACK;
            if (!whiteWins(b, n, depth).win) out.push(c);
            b[c] = 0;
        });
        return out.sort(function (x, y) { return x - y; });
    }
    /* 這個盤面是不是一道好題：黑棋沒有現成的五顆可連、也沒有反擊的苗頭、「黑棋不下」白棋會贏（所以遠處的下法都是輸）、而且能擋住的下法剛好只有 want 這一格。
       為了快：先確認 want 真的擋得住，再一個個試其他格，只要發現第二個擋法就立刻回 false。 */
    function isGood(b, n, want, depth) {
        if (winCells(b, n, BLACK).length || blackCounter(b, n)) return false;
        if (!whiteWins(b, n, depth).win) return false;
        if (b[want] !== 0) return false;
        b[want] = BLACK;
        var holds = !whiteWins(b, n, Math.max(depth, HOLD_DEPTH)).win;          /* 正確答案要「撐得更久」：搜到 HOLD_DEPTH 步預備，白棋還是贏不了 */
        b[want] = 0;
        if (!holds) return false;
        var cells = relevantCells(b, n);
        for (var i = 0; i < cells.length; i++) {
            var c = cells[i];
            if (c === want) continue;
            b[c] = BLACK;
            var also = !whiteWins(b, n, depth).win;
            b[c] = 0;
            if (also) return false;
        }
        return true;
    }
    /* ── 題型模板：在以 (r0,c0) 為起點、方向 d 的一條線上擺棋。回傳 { white, black, x（唯一的擋法）}，擺不下（出界）回傳 null ── */
    function lineCell(n, r0, c0, d, k) { var r = r0 + DIR8[d][0] * k, c = c0 + DIR8[d][1] * k; return inb(n, r, c) ? r * n + c : -1; }
    /* 四顆一排：broken＝false → 白 0 1 2 3、第 4 格是致勝點、第 -1 格被黑棋（或棋盤邊緣）堵住；broken＝true → 白 0 1 _ 3 4（跳四），致勝點是中間的第 2 格 */
    function placeFour(n, r0, c0, d, broken) {
        var cell = function (k) { return lineCell(n, r0, c0, d, k); };
        var ks = broken ? [0, 1, 3, 4] : [0, 1, 2, 3], x = cell(broken ? 2 : 4), W = ks.map(cell);
        if (x < 0 || W.some(function (v) { return v < 0; })) return null;
        var B = [];
        if (!broken && cell(-1) >= 0) B.push(cell(-1));                    /* 另一端在棋盤內就放黑棋堵住；在棋盤邊緣就不用放 */
        return { white: W, black: B, x: x };
    }
    /* 兩個三顆交叉：從 (r0,c0)（交叉點 X）出發，往 d1、d2 兩個方向各有三顆白棋（第 1、2、3 格）。
       兩條線的兩端（X 另一邊的第 -1 格、遠端的第 4 格）都要在棋盤內，才是「活」三。 */
    function placeCorner(n, r0, c0, d1, d2) {
        if (d1 === d2 || (d1 + 4) % 8 === d2) return null;                 /* 兩個方向不能在同一條線上 */
        var cell1 = function (k) { return lineCell(n, r0, c0, d1, k); }, cell2 = function (k) { return lineCell(n, r0, c0, d2, k); };
        var W = [cell1(1), cell1(2), cell1(3), cell2(1), cell2(2), cell2(3)], x = r0 * n + c0;
        if (W.some(function (v) { return v < 0; })) return null;
        if (cell1(4) < 0 || cell2(4) < 0 || cell1(-1) < 0 || cell2(-1) < 0) return null;
        return { white: W, black: [], x: x };
    }
    /* 假威脅：已經被堵死的四（兩端黑棋）、被堵死的三（兩端黑棋）。放不下回傳 null */
    function placeDecoy(n, r0, c0, d, kind) {
        var cell = function (k) { return lineCell(n, r0, c0, d, k); }, W, B;
        if (kind === 0) { W = [cell(0), cell(1), cell(2), cell(3)]; B = [cell(-1), cell(4)]; }
        else { W = [cell(0), cell(1), cell(2)]; B = [cell(-1), cell(3)]; }
        if (W.some(function (v) { return v < 0; }) || B.some(function (v) { return v < 0; })) return null;
        return { white: W, black: B };
    }
    /* 這顆白棋放上去，會不會跟別的白棋在同一個「沒有黑棋的 5 格視窗」裡？（會的話才可能改變題目，要完整驗證；不會的話放了也沒影響） */
    function touchesWhite(b, n, idx) {
        var r0 = Math.floor(idx / n), c0 = idx % n;
        for (var d = 0; d < 4; d++) {
            var dr = LINES[d][0], dc = LINES[d][1];
            for (var s = -4; s <= 0; s++) {
                var r = r0 + dr * s, c = c0 + dc * s;
                if (!inb(n, r, c) || !inb(n, r + 4 * dr, c + 4 * dc)) continue;
                var white = 0, black = 0;
                for (var k = 0; k < 5; k++) { var v = b[(r + dr * k) * n + c + dc * k]; if (v === WHITE) white++; else if (v === BLACK) black++; }
                if (!black && white > 0) return true;                       /* 這顆還沒放上去（視窗裡算不到自己），所以 white > 0 ＝已經有別的白棋 */
            }
        }
        return false;
    }
    /* 出一關：{ n, board, x（唯一的擋法）, kind（'four'｜'corner'）, stones, decoys, level } */
    function makeLevel(level, rand) {
        rand = rand || Math.random;
        var n = BOARD, target = stonesFor(level), want = decoysFor(level), kind = rand() < cornerPFor(level) ? 'corner' : 'four';
        for (var tr = 0; tr < 800; tr++) {
            var b = newBoard(n), tpl = null, r0 = kit.randInt(0, n - 1, rand), c0 = kit.randInt(0, n - 1, rand);
            if (kind === 'four') tpl = placeFour(n, r0, c0, kit.randInt(0, 7, rand), rand() < 0.4);
            else tpl = placeCorner(n, r0, c0, kit.randInt(0, 7, rand), kit.randInt(0, 7, rand));
            if (!tpl) continue;
            tpl.white.forEach(function (k) { b[k] = WHITE; });
            tpl.black.forEach(function (k) { b[k] = BLACK; });
            /* 好題＝唯一擋法成立；「交叉」題型還要保持純粹：不能因為雜訊棋子湊成現成的致勝點（那就變成普通的四了） */
            var good = function () { return isGood(b, n, tpl.x, WIN_DEPTH) && (kind === 'four' || !winCells(b, n, WHITE).length); };
            if (!good()) continue;
            /* 假威脅 */
            var decoys = 0, g, placed;
            for (g = 0; g < 40 && decoys < want; g++) {
                var dp = placeDecoy(n, kit.randInt(0, n - 1, rand), kit.randInt(0, n - 1, rand), kit.randInt(0, 7, rand), rand() < 0.5 ? 0 : 1);
                if (!dp) continue;
                placed = dp.white.concat(dp.black);
                if (placed.some(function (k) { return b[k] !== 0; })) continue;
                dp.white.forEach(function (k) { b[k] = WHITE; });
                dp.black.forEach(function (k) { b[k] = BLACK; });
                if (good()) decoys++;
                else placed.forEach(function (k) { b[k] = 0; });
            }
            /* 雜訊棋子：一顆一顆隨機放，放了之後答案還是唯一才保留（跟別的白棋沾不上邊的白棋、不在威脅視窗裡的黑棋可以免驗證，最後整盤再驗一次） */
            var count = 0, tries = 0, relevant = null;
            for (var i = 0; i < n * n; i++) if (b[i]) count++;
            while (count < target && tries++ < 400) {
                var k = kit.randInt(0, n * n - 1, rand);
                if (b[k] !== 0) continue;
                var color = rand() < 0.5 ? WHITE : BLACK, safe;
                if (color === BLACK) {
                    if (!relevant) relevant = relevantCells(b, n);
                    safe = relevant.indexOf(k) < 0;
                } else safe = !touchesWhite(b, n, k);
                b[k] = color;
                if (safe ? !blackCounter(b, n) : good()) { count++; relevant = null; } else b[k] = 0;
            }
            if (count < target - 2 || !good()) continue;
            return { n: n, board: b, x: tpl.x, kind: kind, stones: count, decoys: decoys, level: level };
        }
        /* 保底（極少用到）：一條被黑棋堵住一端的四 */
        var fb = newBoard(n); [0, 1, 2, 3].forEach(function (k) { fb[6 * n + 3 + k] = WHITE; }); fb[6 * n + 2] = BLACK;
        return { n: n, board: fb, x: 6 * n + 7, kind: 'four', stones: 5, decoys: 0, level: level };
    }
    function rating(n) {
        if (n >= 25) return '五子棋高手！';
        if (n >= 15) return '眼光很準！';
        if (n >= 8) return '不錯喔！';
        if (n >= 3) return '再接再厲！';
        return '先找白棋四顆連在一起的地方，再來一次！';
    }

    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 5, stageClass: 'gmk-stage',
            numText: function (v) { return v + ' 關'; },
            rating: rating,
            lines: function (S) { return ['通過 ' + S.cleared + ' 關']; },
            setup: setup
        });
    }

    function setup(api) {
        var stage = api.stage, level = api.level;
        var q = makeLevel(level, api.rand), n = q.n, b = q.board;
        api.info = q;
        console.log('[堵住五子] 第 ' + level + ' 關（' + (q.kind === 'four' ? '四顆一排' : '兩個三顆交叉') + '）：棋子 ' + q.stones + ' 顆（假威脅 ' + q.decoys + ' 組），答案 (' + Math.floor(q.x / n) + ',' + q.x % n + ')；限時 ' + timeMs(level) + ' ms');

        var W = stage.clientWidth || 472, cell = Math.floor(Math.min((W - 12) / n, 40)), BS = cell * n, bx = Math.round((W - BS) / 2), by = 64;
        var tip = h('div', { 'class': 'qz-note gmk-tip', text: '白棋下一步就贏！點唯一的擋法' });
        stage.appendChild(tip);
        var board = h('div', { 'class': 'gmk-board' });
        board.style.cssText = 'left:' + bx + 'px;top:' + by + 'px;width:' + BS + 'px;height:' + BS + 'px;';
        stage.appendChild(board);
        var svg = kit.svg('svg', { 'class': 'gmk-svg', viewBox: '0 0 ' + BS + ' ' + BS, width: BS, height: BS }, board);
        function px(k) { return (k % n + 0.5) * cell; }
        function py(k) { return (Math.floor(k / n) + 0.5) * cell; }
        for (var i = 0; i < n; i++) {
            kit.svg('line', { 'class': 'gmk-grid', x1: (i + 0.5) * cell, y1: cell / 2, x2: (i + 0.5) * cell, y2: BS - cell / 2 }, svg);
            kit.svg('line', { 'class': 'gmk-grid', x1: cell / 2, y1: (i + 0.5) * cell, x2: BS - cell / 2, y2: (i + 0.5) * cell }, svg);
        }
        var gStones = kit.svg('g', {}, svg), gMark = kit.svg('g', {}, svg);
        function stone(k, color, cls) {
            return kit.svg('circle', { 'class': 'gmk-stone ' + (color === WHITE ? 'gmk-stone--w' : 'gmk-stone--b') + (cls ? ' ' + cls : ''), cx: px(k), cy: py(k), r: cell * 0.43 }, gStones);
        }
        for (var k = 0; k < n * n; k++) if (b[k]) stone(k, b[k]);
        var info = h('div', { 'class': 'qz-note gmk-info', text: '' });
        info.style.top = (by + BS + 12) + 'px';
        stage.appendChild(info);
        var done = false;
        api.timer(timeMs(level), function () { judge(-1); });
        if (level === 1 && kit.once('gomoku.hint')) kit.hintOn(stage, null, { mode: 'tap', x: bx + px(q.x), y: by + py(q.x), delay: 700, text: '請點能擋住白棋的位置' });
        kit.onTap(board, function (e) {
            if (done || api.over) return;
            var p = kit.localPt(e, board), c = Math.floor(p.x / cell), r = Math.floor(p.y / cell);
            if (c < 0 || c >= n || r < 0 || r >= n) return;
            var idx = r * n + c;
            if (b[idx]) { tip.textContent = '那一格已經有棋子了，換一格'; Sfx.play('bad'); return; }
            judge(idx);
        });
        function judge(idx) {
            if (done || api.over) return;
            done = true;
            var ok = idx === q.x;
            if (idx >= 0) { b[idx] = BLACK; stone(idx, BLACK, 'gmk-stone--new'); }
            kit.svg('circle', { 'class': 'gmk-ring', cx: px(q.x), cy: py(q.x), r: cell * 0.55 }, gMark);
            if (ok) {
                info.textContent = '擋住了！白棋的威脅化解了';
                kit.flash(stage, true, api.my);
                api.pass({ delay: 1500 });
                return;
            }
            /* 失敗：白棋依序下出致勝的幾手（被逼著擋的黑棋也畫出來），最後用紅線穿過連成的五顆 */
            var pv = whiteWins(b, n, WIN_DEPTH).pv;
            info.textContent = idx >= 0 ? '擋不住！綠圈才是唯一的擋法' : '時間到！綠圈才是唯一的擋法';
            pv.forEach(function (m, j) {
                api.after(500 + j * 650, function () {
                    b[m.cell] = m.c; stone(m.cell, m.c, 'gmk-stone--new');
                    if (j === pv.length - 1) {
                        var five = fiveThrough(b, n, m.cell, WHITE);
                        if (five) kit.svg('line', { 'class': 'gmk-five', x1: px(five[0]), y1: py(five[0]), x2: px(five[five.length - 1]), y2: py(five[five.length - 1]), 'stroke-width': (cell * 0.22).toFixed(1) }, gMark);
                    }
                });
            });
            kit.flash(stage, false, api.my);
            api.fail({ delay: 500 + pv.length * 650 + 2000, lines: [idx >= 0 ? '你下的位置擋不住，白棋連成五顆了' : '時間到！', '唯一的擋法是第 ' + (Math.floor(q.x / n) + 1) + ' 列第 ' + (q.x % n + 1) + ' 欄（綠圈）'] });
        }
        api.solve = function () { judge(q.x); };
        api.wrong = function () {
            var others = relevantCells(b, n).filter(function (k) { return k !== q.x; });
            judge(others.length ? others[0] : (b[0] ? 1 : 0));
        };
    }

    var G = {
        id: ID,
        name: '堵住五子',
        rule: '這是五子棋的盤面，**白棋下一步就要贏了**。你只能下一顆黑棋，**點那個唯一能擋住的位置**。有時是白棋已經四顆連在一起，有時是兩條三顆的線交叉，只有下在交叉點才擋得住。小心**看起來很危險、其實已經被堵住的假威脅**。擋錯或來不及就結束，看你能過幾關。越後面，棋子越多、時間越短！',
        mount: mount,
        score: SCORE,
        test: {
            stonesFor: stonesFor, timeMs: timeMs, decoysFor: decoysFor, cornerPFor: cornerPFor, newBoard: newBoard, fiveThrough: fiveThrough, winCells: winCells, localWinCells: localWinCells, windowCells: windowCells,
            whiteWins: whiteWins, relevantCells: relevantCells, blackCounter: blackCounter, solutionCells: solutionCells, isGood: isGood, placeFour: placeFour, placeCorner: placeCorner, placeDecoy: placeDecoy, touchesWhite: touchesWhite,
            makeLevel: makeLevel, rating: rating,
            RAMP_LEVELS: RAMP_LEVELS, STONES: STONES, TIME_S: TIME_S, DECOYS: DECOYS, CORNER_FROM: CORNER_FROM, CORNER_P: CORNER_P, WIN_DEPTH: WIN_DEPTH, HOLD_DEPTH: HOLD_DEPTH, BOARD: BOARD, MAX_LEVEL: MAX_LEVEL, BLACK: BLACK, WHITE: WHITE
        }
    };
    Reaction.register(G);
})();
