/* ═══════════════════════════════════════════════════════════════════
   ghostleg_core.js — 鬼腳圖的共用出題工具（鬼腳圖、鬼腳圖減一 一起用）
   ───────────────────────────────────────────────────────────────────
   V1.33：「鬼腳圖減一」（拔掉一條橫線）跟「鬼腳圖」（畫上一條橫線）用同一種方式蓋出整張圖，所以把出題的純函式搬到這裡。
   V1.33.1：「鬼腳圖減一」改用自己的出題方式（先設計三條路，見 reaction_ghostleg2.js），只用這裡的座標、走路線、找「＝」、畫棋盤；
            蓋圖（construct）現在只有「鬼腳圖」在用。
   V1.33.2：「鬼腳圖」的答案位置改成每一題平均地隨機挑（construct 的 u、pos 選項；answerIndex、answerOk、answerThird）；HIDE 改成前後合計（hardEnough 的 hide）；
            makeZigzag 的最後一個參數從 hb、ha 改成 accept 函式；randomRows 修正答案貼著回頭的間隔；canPlace、placements 改快。「鬼腳圖減一」沒有用到這些改動的部分。
   用法：var C = GhostlegCore({ COLS, ROWS, X0, DX, Y_TOP, Y_BOT, SOL_GAP, DECOY_NEAR, BREAK_EXTRA, AVOID_ENDS });
         之後 C.follow(rungs, start)、C.construct(o, rand)、C.drawBoard(stage, q, labels, msgText)…
   每一款遊戲帶自己的參數（寫在各自檔案的開頭），難度的關卡曲線也在各自的檔案裡。
   名詞：「直線」＝直的那 5 條（甲乙丙丁戊）；「橫線」＝連接相鄰兩條直線的短線，{ row 第幾層, col 第幾縫（第 col 條與第 col+1 條直線之間）}。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    window.GhostlegCore = function (cfg) {
        var kit = Reaction.kit;
        var COLS = cfg.COLS, ROWS = cfg.ROWS, X0 = cfg.X0, DX = cfg.DX, Y_TOP = cfg.Y_TOP, Y_BOT = cfg.Y_BOT;
        var SOL_GAP = cfg.SOL_GAP, DECOY_NEAR = cfg.DECOY_NEAR, BREAK_EXTRA = cfg.BREAK_EXTRA, AVOID_ENDS = cfg.AVOID_ENDS;

        function colX(c) { return X0 + c * DX; }
        function rowY(r) { return Y_TOP + (r + 0.5) * (Y_BOT - Y_TOP) / ROWS; }
        /* y 座標最近的一層（0～ROWS−1） */
        function snapRow(y) { return kit.clamp(Math.round((y - Y_TOP) * ROWS / (Y_BOT - Y_TOP) - 0.5), 0, ROWS - 1); }
        /* 橫線集合 → 查詢用的表 */
        function rungSet(rungs) { var s = {}; rungs.forEach(function (g) { s[g.row + ',' + g.col] = true; }); return s; }
        /* 從 start 欄往下走：回傳 { end, route（折線點，舞台座標）} */
        function follow(rungs, start) {
            var s = rungSet(rungs), col = start, route = [{ x: colX(col), y: Y_TOP }];
            for (var r = 0; r < ROWS; r++) {
                var to = null;
                if (s[r + ',' + col]) to = col + 1; else if (s[r + ',' + (col - 1)]) to = col - 1;
                if (to != null) { route.push({ x: colX(col), y: rowY(r) }, { x: colX(to), y: rowY(r) }); col = to; }
            }
            route.push({ x: colX(col), y: Y_BOT });
            return { end: col, route: route };
        }
        /* 玩家能不能在第 row 層、第 col 條與第 col+1 條直線之間畫一條橫線：位置要在範圍內，而且同一層跟它重疊或相鄰（左右緊鄰）的位置都沒有橫線 */
        function canPlace(rungs, row, col) {
            if (row < 0 || row >= ROWS || col < 0 || col > COLS - 2) return false;
            /* 直接掃一遍橫線（不用先建查詢表：出題時這個函式每秒被呼叫幾十萬次，建表是最大的時間浪費）：同一層、縫 col−1～col+1 有橫線就不行 */
            for (var i = 0; i < rungs.length; i++) { var g = rungs[i]; if (g.row === row && g.col >= col - 1 && g.col <= col + 1) return false; }
            return true;
        }
        /* 玩家能畫的每一條橫線（row, col），以及畫上去之後從 start 走到哪一欄。
           V1.33.2 改快：每個位置都從頭走一遍太慢（出題時每一題要呼叫幾百次）。只加一條橫線的話，只有「起點的路線剛好經過這一層的這兩條直線」的位置會改變終點——
           先算好 endFrom[層][欄]（從那一層、那一欄往下走，最後走到哪一欄）和起點的路線每一層所在的欄 top[層]，其他位置的終點都跟原本一樣，碰到路線的位置查表就知道（結果跟逐個走一遍完全相同）。 */
        function placements(rungs, start) {
            var s = rungSet(rungs), endFrom = [], top = [], r, c, to;
            endFrom[ROWS] = []; for (c = 0; c < COLS; c++) endFrom[ROWS][c] = c;
            for (r = ROWS - 1; r >= 0; r--) {
                endFrom[r] = [];
                for (c = 0; c < COLS; c++) { to = s[r + ',' + c] ? c + 1 : (s[r + ',' + (c - 1)] ? c - 1 : c); endFrom[r][c] = endFrom[r + 1][to]; }
            }
            var col = start;
            for (r = 0; r < ROWS; r++) { top.push(col); col = s[r + ',' + col] ? col + 1 : (s[r + ',' + (col - 1)] ? col - 1 : col); }
            var end0 = endFrom[0][start], out = [];
            for (r = 0; r < ROWS; r++) for (c = 0; c <= COLS - 2; c++) {
                if (s[r + ',' + c] || s[r + ',' + (c - 1)] || s[r + ',' + (c + 1)]) continue;          /* 同一層重疊或左右緊鄰：不能畫（跟 canPlace 一樣；位置一定在範圍內） */
                out.push({ row: r, col: c, end: top[r] === c ? endFrom[r + 1][c + 1] : top[r] === c + 1 ? endFrom[r + 1][c] : end0 });
            }
            return out;
        }
        /* 從 start 欄往下走，走過哪些直線（不重複，由小到大） */
        function visitedCols(rungs, start) {
            var s = rungSet(rungs), col = start, seen = {}; seen[col] = true;
            for (var r = 0; r < ROWS; r++) {
                if (s[r + ',' + col]) col++; else if (s[r + ',' + (col - 1)]) col--;
                seen[col] = true;
            }
            return Object.keys(seen).map(Number).sort(function (x, y) { return x - y; });
        }
        /* 每個「縫」（第 g 縫＝第 g 條與第 g+1 條直線之間）有幾條橫線 */
        function gapCounts(rungs) {
            var cnt = []; for (var g = 0; g < COLS - 1; g++) cnt.push(0);
            rungs.forEach(function (r) { cnt[r.col]++; });
            return cnt;
        }
        /* 隨機走一條路線：從 start 出發，每一步往左或往右一條直線，一路走到「經過 vNeed 條不同的直線、而且轉了 turns 次彎」為止；回傳走過的欄 [start, c1, c2, …]，辦不到回傳 null */
        function makeWalk(start, vNeed, turns, rand) {
            var walk = [start], seen = {}, nSeen = 1; seen[start] = true;
            while ((nSeen < vNeed || walk.length - 1 < turns) && walk.length - 1 < ROWS) {
                var cur = walk[walk.length - 1], opts = [];
                if (cur > 0) opts.push(cur - 1);
                if (cur < COLS - 1) opts.push(cur + 1);
                var fresh = opts.filter(function (o) { return !seen[o]; });
                var next = (nSeen < vNeed && fresh.length && rand() < 0.85) ? kit.pick(fresh, rand) : kit.pick(opts, rand);
                walk.push(next);
                if (!seen[next]) { seen[next] = true; nSeen++; }
            }
            return nSeen >= vNeed ? walk : null;
        }
        /* m 個轉彎各占一層（由上往下、越來越大），平均分散在 ROWS 層裡：把整張圖切成 m 段，每段隨機挑一層；辦不到回傳 null */
        function spreadRows(m, rand) {
            var rows = [], prev = -1;
            for (var i = 0; i < m; i++) {
                var r = Math.floor((i + 0.15 + 0.7 * rand()) * ROWS / m);
                r = Math.max(r, prev + 1);
                r = Math.min(r, ROWS - 1 - (m - 1 - i));
                if (r <= prev) return null;
                rows.push(r); prev = r;
            }
            return rows;
        }
        /* 這個位置（row, col）上下 SOL_GAP 層以內、跟它相接的兩條直線上（縫 col−1、col、col+1），有沒有其他橫線 */
        function crowded(rungs, row, col) {
            return rungs.some(function (g) { return Math.abs(g.row - row) < SOL_GAP && g.col >= col - 1 && g.col <= col + 1 && !(g.row === row && g.col === col); });
        }
        /* 答案藏得多深：在 sol（第 sol.row 層、第 sol.col～sol.col+1 條直線之間）畫上橫線之後，從起點走下去——
           before＝走到這條橫線之前已經轉了幾次彎、after＝走過這條橫線之後還要轉幾次彎（只算現有的橫線）。
           before＝0：答案就在起點那條直線上（從起點往下看就找到）；after＝0：答案就在終點那條直線上（從終點往上看就找到）。 */
        function hideOf(rungs, start, sol) {
            var s = rungSet(rungs), col = start, before = 0, after = 0, passed = false;
            for (var r = 0; r < ROWS; r++) {
                if (r === sol.row && (col === sol.col || col === sol.col + 1)) { col = col === sol.col ? sol.col + 1 : sol.col; passed = true; continue; }
                var to = null;
                if (s[r + ',' + col]) to = col + 1; else if (s[r + ',' + (col - 1)]) to = col - 1;
                if (to != null) { col = to; if (passed) after++; else before++; }
            }
            return { before: before, after: after };
        }
        /* 把畫對的位置分成「答案區段」：同一對直線之間（col 一樣）、上下相連的幾層算同一個答案；回傳 [{ col, from, to }]（from～to 是層的範圍） */
        function answerGroups(sols) {
            var list = sols.slice().sort(function (x, y) { return x.col - y.col || x.row - y.row; }), out = [];
            list.forEach(function (p) {
                var last = out[out.length - 1];
                if (last && last.col === p.col && p.row === last.to + 1) last.to = p.row;
                else out.push({ col: p.col, from: p.row, to: p.row });
            });
            return out;
        }
        /* 這個答案夠不夠「難找」：不碰起點、終點的直線（AVOID_ENDS），而且前後「合計」藏了 hide 個以上的轉彎（V1.33.2：以前是前後各至少 hb、ha 個）。
           前後合計＝這條正確路線的轉彎數減 1，所以前面藏得少、後面就藏得多；答案可以在路線的前段、中段、後段。 */
        function hardEnough(rungs, start, target, sol, hide) {
            if (AVOID_ENDS && [sol.col, sol.col + 1].some(function (c) { return c === start || c === target; })) return false;
            var hd = hideOf(rungs, start, sol);
            return hd.before + hd.after >= hide;
        }
        /* 「＝」：同一縫（同兩條直線之間）上下相鄰的兩條橫線，兩條之間、左右兩旁的縫（g−1、g+1）都沒有橫線 → 走過去又走回來，互相抵消。
           回傳這種「互相抵消的一對」有幾對（0＝沒有）；list（可省略）是陣列的話，把每一對 { col, r1, r2 } 放進去 */
        function cancelPairs(rungs, list) {
            var byGap = {}, n = 0;
            rungs.forEach(function (g) { (byGap[g.col] = byGap[g.col] || []).push(g.row); });
            Object.keys(byGap).forEach(function (k) {
                var g = Number(k), rows = byGap[k].sort(function (x, y) { return x - y; });
                for (var i = 1; i < rows.length; i++) {
                    var r1 = rows[i - 1], r2 = rows[i];
                    if (!rungs.some(function (o) { return (o.col === g - 1 || o.col === g + 1) && o.row > r1 && o.row < r2; })) { n++; if (list) list.push({ col: g, r1: r1, r2: r2 }); }
                }
            });
            return n;
        }
        /* 在第 r 層、第 g 縫多加一條橫線，會不會造出新的「＝」：只要看同一縫裡、它上面最近的一條與下面最近的一條——
           兩條之間、左右兩旁的縫（g−1、g+1）都沒有橫線，就是「＝」。（加在 g 縫只會影響 g 縫，旁邊的縫只會被打斷、不會變多） */
        function makesCancel(rungs, r, g) {
            var up = -1, down = ROWS;
            rungs.forEach(function (o) { if (o.col === g) { if (o.row < r && o.row > up) up = o.row; if (o.row > r && o.row < down) down = o.row; } });
            function broken(r1, r2) { return rungs.some(function (o) { return (o.col === g - 1 || o.col === g + 1) && o.row > r1 && o.row < r2; }); }
            return (up >= 0 && !broken(up, r)) || (down < ROWS && !broken(r, down));
        }
        /* 一條路線的「形狀」：每一個轉彎往右（+1）或往左（−1）；maxRun＝同一個方向最多連走幾步（樓梯有多長）、rev＝方向回頭了幾次 */
        function routeShape(walk) {
            var maxRun = 0, run = 0, rev = 0, prev = 0;
            for (var i = 1; i < walk.length; i++) {
                var d = walk[i] - walk[i - 1];
                if (prev && d !== prev) rev++;
                run = d === prev ? run + 1 : 1; prev = d;
                maxRun = Math.max(maxRun, run);
            }
            return { maxRun: maxRun, rev: rev };
        }
        /* 之字形的路線：從 start 出發，每一步往左或往右一條直線；同一個方向最多連走 stairMax 步（不會變成一路往下的樓梯），
           方向至少回頭 revMin 次，經過 vNeed 條以上不同的直線（needEdges：甲與戊都要碰到），轉彎數在 minTurns～maxTurns 之間。
           accept（可省略）：一個函式 accept(walk)，回傳 true 才算這條路線可以用（V1.33.2：construct 用它檢查「這一題抽到的答案位置」，
           那個轉彎要不碰起點、終點的直線；以前是 hb、ha 兩個參數，要求答案前後各藏幾個轉彎）。
           回傳走過的欄 [start, c1, c2, …]；辦不到回傳 null */
        function makeZigzag(start, vNeed, needEdges, minTurns, stairMax, revMin, maxTurns, rand, accept) {
            for (var att = 0; att < 30; att++) {                                       /* 隨機走，走不出來就重走，最多 30 次 */
                var w = zigzagOnce(start, vNeed, needEdges, minTurns, stairMax, revMin, maxTurns, rand, accept);
                if (w) return w;
            }
            return null;
        }
        function zigzagOnce(start, vNeed, needEdges, minTurns, stairMax, revMin, maxTurns, rand, accept) {
            var walk = [start], seen = {}, nSeen = 1, run = 0, dir = 0, rev = 0;
            seen[start] = true;
            function done() { return nSeen >= vNeed && (!needEdges || (seen[0] && seen[COLS - 1])) && rev >= revMin && walk.length - 1 >= minTurns && (!accept || accept(walk)); }
            /* 路線太長就不再延長：轉彎數＋回頭次數（回頭要多空一層）＋答案前後的留白，要放得進 ROWS 層 */
            while (walk.length - 1 < maxTurns && (walk.length - 1) + rev + 2 * (SOL_GAP - 1) < ROWS - 1) {
                if (done() && rand() < 0.5) break;                                     /* 條件都達到了：一半的機會停下，一半再多走幾步（終點更不好猜） */
                var cur = walk[walk.length - 1], opts = [];
                [-1, 1].forEach(function (d) {
                    if (cur + d < 0 || cur + d > COLS - 1) return;
                    if (d === dir && run >= stairMax) return;                          /* 同一個方向已經連走 stairMax 步：這次一定要回頭 */
                    if (walk.length >= 2 && walk[walk.length - 2] === cur + d && (cur + d === 0 || cur + d === COLS - 1)) return;   /* 不在邊緣來回：甲→乙→甲 的「＝」打不斷 */
                    opts.push(d);
                });
                if (!opts.length) return null;
                /* 還沒碰到的邊緣（或還沒走過的直線）在哪一邊，就比較常往那邊走 */
                var want = 0, need = [];
                for (var c = 0; c < COLS; c++) if (!seen[c] && (needEdges ? (c === 0 || c === COLS - 1) : nSeen < vNeed)) need.push(c);
                if (need.length) { var tgt = need.reduce(function (x, y) { return Math.abs(y - cur) < Math.abs(x - cur) ? y : x; }); want = tgt > cur ? 1 : -1; }
                var d2 = (want && opts.indexOf(want) >= 0 && rand() < 0.6) ? want : kit.pick(opts, rand);
                if (dir && d2 !== dir) rev++;
                run = d2 === dir ? run + 1 : 1; dir = d2;
                walk.push(cur + d2);
                if (!seen[cur + d2]) { seen[cur + d2] = true; nSeen++; }
            }
            return done() ? walk : null;
        }
        /* m 個轉彎各占一層、由上往下，間隔不規則：先保留每兩個相鄰轉彎之間「至少要隔幾層」——一般 1 層；路線回頭（走同一縫）2 層，
           中間要放打斷「＝」的橫線；答案（第 sj 個轉彎）跟前後的轉彎至少 SOL_GAP 層——剩下的層數再隨機分到最上面、每個間隔、最下面。
           V1.33.2：答案本身就是回頭的其中一個轉彎時，打斷「＝」的那一條橫線不能落在答案的留白（SOL_GAP 層以內）裡，所以這個間隔要空 SOL_GAP＋1 層，
           不然這種位置永遠放不下橫線、出題一直失敗（等於悄悄把答案貼著回頭的位置全部排除，答案就集中在別的地方）。
           放不下（必要的間隔加起來超過 ROWS）回傳 null。walk 可省略（省略＝不考慮回頭）。 */
        function randomRows(m, sj, rand, walk) {
            if (m < 1) return null;
            var need = [], sum = 0, k;
            for (k = 1; k < m; k++) {
                var g = 1;
                var back = !!(walk && walk[k - 1] === walk[k + 1]);                        /* 這兩個轉彎是回頭（走同一縫）*/
                if (back) g = 2;
                if (k === sj || k - 1 === sj) g = back ? SOL_GAP + 1 : Math.max(g, SOL_GAP);
                need.push(g); sum += g;
            }
            var slack = ROWS - 1 - sum;
            if (slack < 0) return null;
            var parts = []; for (k = 0; k <= m; k++) parts.push(0);                  /* m＋1 個地方可以多放空層：最上面、m−1 個間隔、最下面 */
            for (var t = 0; t < slack; t++) parts[Math.floor(rand() * parts.length)]++;
            var rows = [parts[0]];
            for (k = 1; k < m; k++) rows.push(rows[k - 1] + need[k - 1] + parts[k]);
            return rows;
        }
        /* 折線從頭走 len 像素的那一段（評審動畫：一路畫出綠色虛線）：回傳點陣列 */
        function routeLength(route) {
            var s = 0; for (var i = 1; i < route.length; i++) s += Math.sqrt(Math.pow(route[i].x - route[i - 1].x, 2) + Math.pow(route[i].y - route[i - 1].y, 2));
            return s;
        }
        function partialRoute(route, len) {
            var out = [route[0]], acc = 0;
            if (len <= 0) return out;
            for (var i = 1; i < route.length; i++) {
                var a = route[i - 1], b = route[i], seg = Math.sqrt(Math.pow(b.x - a.x, 2) + Math.pow(b.y - a.y, 2));
                if (acc + seg <= len) { out.push(b); acc += seg; continue; }
                var t = seg ? (len - acc) / seg : 0;
                out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
                break;
            }
            return out;
        }
        /* 路線 walk 的第 sj 個轉彎（從 0 算起）能不能當答案：不碰起點、終點的直線（AVOID_ENDS；第 0 個一定碰到起點的直線、最後一個一定碰到終點的直線） */
        function answerOk(walk, sj) {
            if (sj < 0 || sj >= walk.length - 1) return false;
            var start = walk[0], target = walk[walk.length - 1], lo = Math.min(walk[sj], walk[sj + 1]);
            return !(AVOID_ENDS && (lo === start || lo + 1 === start || lo === target || lo + 1 === target));
        }
        /* 玩家要畫的那一個轉彎，是正確路線上的第幾個（從 0 算起）——V1.33.2。
           u（0～1）是這一題抽到的「答案在路線上的相對位置」，每一題只抽一次、失敗了重蓋也不換，所以答案落在路線的前段、中段、後段的機會一樣大
           （以前是「前面至少藏 hb 個、後面至少藏 ha 個」，16 層的圖上答案就只能落在正中間那一兩個）。
           做法：u 先換成路線上的一個位置（第 1～倒數第 2 個轉彎之間平均分布，因為第 0 個、最後一個轉彎一定碰到起點、終點的直線）；
           那個位置的轉彎不能當答案（碰到起點或終點的直線）時，改挑離它最近的、能當答案的轉彎。
           （為什麼不是「不能當答案就整條路線重來」：玩家的參數下，每個起點能走的之字形路線只有寥寥幾種，某些起點的某些位置永遠不能當答案，重來也沒用，
           起點就會偏向某幾條直線。）沒有任何轉彎能當答案回傳 −1 */
        function answerIndex(u, walk) {
            var m = walk.length - 1, lo = AVOID_ENDS ? 1 : 0, hi = AVOID_ENDS ? m - 2 : m - 1;
            if (hi < lo) return -1;
            var want = lo + u * (hi - lo + 1) - 0.5, best = -1, bd = 1e9;           /* want＝u 對應的位置（轉彎編號，可以有小數） */
            for (var j = lo; j <= hi; j++) {
                if (!answerOk(walk, j)) continue;
                var d = Math.abs(j - want);
                if (d < bd) { bd = d; best = j; }
            }
            return best;
        }
        /* 第 sj 個轉彎落在「能當答案的轉彎」的前／中／後哪一段（0／1／2；能當答案的範圍＝AVOID_ENDS 時第 1～倒數第 2 個）——u 對應的段是 Math.min(2, Math.floor(u * 3)) */
        function answerThird(sj, m) {
            var lo = AVOID_ENDS ? 1 : 0, hi = AVOID_ENDS ? m - 2 : m - 1;
            return hi <= lo ? 1 : Math.max(0, Math.min(2, Math.floor((sj - lo + 0.5) * 3 / (hi - lo + 1))));
        }
        /* 蓋出一張圖（先定路線、再撒橫線）。o＝{ start 起點, n 橫線數, vNeed 路線至少經過幾條直線, sweep 要不要碰到甲與戊,
           minTurns 路線至少轉幾次彎, stair 同方向最多連走幾步, rev 至少回頭幾次,
           u（0～1，可省略）答案在路線上的相對位置（見 answerIndex）：一題只抽一次、失敗了重蓋也不要換，才不會「好蓋的位置」比較常被留下來；省略＝這次現抽,
           pos（可省略）：true＝路線一定要讓答案落在 u 抽到的那一段（前／中／後，見 answerThird）才算，不然重走；不寫＝只要有轉彎能當答案就好（挑離 u 最近的）,
           shownOnly（可省略）：只管「rungs＋答案」這張圖不能有「＝」——V1.33.0 的鬼腳圖減一用過（玩家看到的是還沒拿掉的圖），現在沒有人用，留著備用；不寫＝兩張都管（鬼腳圖：沒畫的題目、畫上之後） }。
           前後藏幾個轉彎不在這裡管：前後合計＝路線轉彎數 − 1，呼叫的人把 minTurns 設成「合計＋1」以上就夠了（V1.33.2）。
           回傳 { rungs（不含答案）, sol（答案那一條）, start, target（畫上答案之後路線走到的欄）, walk（路線走過的欄）, rows（每個轉彎在第幾層）, sj（答案是第幾個轉彎）}，
           蓋不出來回傳 null。「這一題好不好」（答案唯一、藏得夠深…）由各款遊戲自己檢查。 */
        function construct(o, rand) {
            var start = o.start, n = o.n, vNeed = o.vNeed, sweep = o.sweep, minTurns = o.minTurns, stair = o.stair, rev = o.rev;
            var u = o.u == null ? rand() : o.u, third = Math.min(2, Math.floor(u * 3));
            /* 路線至少要有一個轉彎能當答案（真正挑哪一個，等路線走完、轉彎數 m 確定了才由 answerIndex 照 u 決定）；pos＝true 時，挑到的轉彎還要落在 u 抽到的那一段 */
            var walk = makeZigzag(start, vNeed, sweep, minTurns, stair, rev, Math.min(ROWS - 2, n + 1), rand, function (w) { var k = answerIndex(u, w); return k >= 0 && (!o.pos || answerThird(k, w.length - 1) === third); });
            if (!walk) return null;
            var m = walk.length - 1, target = walk[m];
            if (m - 1 > n) return null;
            var sj = answerIndex(u, walk), rows = randomRows(m, sj, rand, walk);
            if (!rows) return null;
            var turns = rows.map(function (r, i) { return { row: r, col: Math.min(walk[i], walk[i + 1]) }; });
            var sol = turns[sj], rungs = turns.filter(function (g, i) { return i !== sj; });
            var colAt = [], r, i2;                                                      /* 正確路線在每一層（轉彎之前）在哪一條直線上 */
            for (r = 0; r < ROWS; r++) { var passed = 0; for (i2 = 0; i2 < m; i2++) if (rows[i2] < r) passed++; colAt.push(walk[passed]); }
            var rowLoad = []; for (r = 0; r < ROWS; r++) rowLoad.push(0);
            rungs.forEach(function (g) { rowLoad[g.row]++; });
            /* 撒其他橫線：如果圖上還有「＝」（路線回頭、或兩條橫線疊在同一縫），下一條一定要放在它們中間、旁邊的縫，把它打斷（變成交錯的「Z」）；
               沒有「＝」了才照常撒（四個縫平均、優先貼著路線旁邊）。每一條都不能造出新的「＝」。為了打斷「＝」可以比 n 多放 BREAK_EXTRA 條。 */
            for (;;) {
                var pairs = []; if (!o.shownOnly) cancelPairs(rungs, pairs); cancelPairs(rungs.concat([sol]), pairs);        /* 題目裡的「＝」，以及答案畫上去之後的「＝」 */
                var nowPairs = pairs.length;
                if (rungs.length >= n && (!pairs.length || rungs.length >= n + BREAK_EXTRA)) break;
                var cnt = gapCounts(rungs), cands = [];
                for (r = 0; r < ROWS; r++) for (var g = 0; g <= COLS - 2; g++) {
                    if (!canPlace(rungs, r, g) || g === colAt[r] || g + 1 === colAt[r]) continue;      /* 不碰到正確路線走的直線（碰到就會變成路線的轉彎） */
                    if (Math.abs(r - sol.row) < SOL_GAP && g >= sol.col - 1 && g <= sol.col + 1) continue;   /* 玩家要畫的位置上下留白 */
                    if (rowLoad[r] >= 2) continue;                                                      /* 每一層最多 2 條 */
                    var breaks = 0;                                                                         /* 這個位置能打斷幾對「＝」 */
                    pairs.forEach(function (p) { if ((g === p.col - 1 || g === p.col + 1) && r > p.r1 && r < p.r2) breaks++; });
                    if (!nowPairs) {
                        if ((!o.shownOnly && makesCancel(rungs, r, g)) || makesCancel(rungs.concat([sol]), r, g)) continue;  /* 沒有「＝」了：不造出新的「＝」（答案畫上去之後也不會） */
                    } else {
                        if (!breaks) continue;                                                              /* 還有「＝」：只考慮打得斷它的位置， */
                        var after = rungs.concat([{ row: r, col: g }]);
                        var afterPairs = (o.shownOnly ? 0 : cancelPairs(after)) + cancelPairs(after.concat([sol]));
                        if (afterPairs > nowPairs) continue;                                                 /* 而且放下去之後「＝」的總數不會變多 */
                        breaks = 1 + 3 * (nowPairs - afterPairs);                                            /* 變少越多，越優先挑 */
                    }
                    cands.push({ row: r, col: g, breaks: breaks });
                }
                if (!cands.length) return null;
                if (!pairs.length) {
                    var minG = Math.min.apply(null, cands.map(function (x) { return cnt[x.col]; }));
                    cands = cands.filter(function (x) { return cnt[x.col] === minG; });              /* 四個縫的橫線數最多差 1 條 */
                }
                /* 權重：貼著路線旁邊（這一縫碰到路線隔壁的直線）的位置 × DECOY_NEAR；同一層已經有橫線的 ÷ 2（分散到各層） */
                var wsum = 0;
                cands.forEach(function (x) {
                    var c0 = colAt[x.row], dist = Math.min(Math.abs(x.col - c0), Math.abs(x.col + 1 - c0));
                    x.w = (dist === 1 ? DECOY_NEAR : 1) / (1 + rowLoad[x.row]) * (1 + x.breaks);           /* 一次打斷越多對越好 */
                    wsum += x.w;
                });
                var pickW = rand() * wsum, pk = cands[cands.length - 1];
                for (var k = 0; k < cands.length; k++) { pickW -= cands[k].w; if (pickW < 0) { pk = cands[k]; break; } }
                rungs.push({ row: pk.row, col: pk.col }); rowLoad[pk.row]++;
            }
            return { rungs: rungs, sol: sol, start: start, target: target, walk: walk, rows: rows, sj: sj };
        }
        /* ═══ 畫圖（兩款共用，外觀一樣）═══ */
        /* 畫出整張鬼腳圖：直線、橫線、上方的起點圓（綠底黑字是起點）、下方的終點方塊（綠底黑字是終點）、最下面的提示文字。
           q＝{ rungs, start, target }；labels＝上方圓圈的字（甲乙丙丁戊）；msgText＝提示文字。
           回傳 { svg, rungEls（"層,縫" → 那一條橫線的 SVG 元素）, gUser（玩家操作的圖層）, gRoute（評審動畫的圖層）, gHint, endBoxes, msg } */
        function drawBoard(stage, q, labels, msgText) {
            var W = stage.clientWidth || 472, H = stage.clientHeight || 640, c, rungEls = {};
            var svg = kit.svg('svg', { 'class': 'gl-svg', viewBox: '0 0 ' + W + ' ' + H, width: W, height: H }, stage);
            for (c = 0; c < COLS; c++) kit.svg('line', { x1: colX(c), x2: colX(c), y1: Y_TOP, y2: Y_BOT, 'class': 'gl-col' }, svg);
            q.rungs.forEach(function (g) { rungEls[g.row + ',' + g.col] = kit.svg('line', { x1: colX(g.col), x2: colX(g.col + 1), y1: rowY(g.row), y2: rowY(g.row), 'class': 'gl-rung' }, svg); });
            var gUser = kit.svg('g', {}, svg), gRoute = kit.svg('g', {}, svg), gHint = kit.svg('g', {}, svg), endBoxes = [];
            for (c = 0; c < COLS; c++) {
                kit.svg('circle', { cx: colX(c), cy: Y_TOP - 28, r: 22, 'class': 'gl-token' + (c === q.start ? ' gl-token--go' : '') }, svg);
                var t1 = kit.svg('text', { x: colX(c), y: Y_TOP - 20, 'text-anchor': 'middle', 'class': 'gl-label' }, svg); t1.textContent = labels[c];
                endBoxes.push(kit.svg('rect', { x: colX(c) - 22, y: Y_BOT + 8, width: 44, height: 44, rx: 8, 'class': 'gl-end' + (c === q.target ? ' gl-end--go' : '') }, svg));
                var t2 = kit.svg('text', { x: colX(c), y: Y_BOT + 40, 'text-anchor': 'middle', 'class': 'gl-label' }, svg); t2.textContent = String(c + 1);
            }
            var msg = UI.h('div', { 'class': 'gl-msg', text: msgText });
            stage.appendChild(msg);
            return { svg: svg, rungEls: rungEls, gUser: gUser, gRoute: gRoute, gHint: gHint, endBoxes: endBoxes, msg: msg };
        }
        /* 評審動畫走完之後標出結果：走到的終點——對＝加粗綠框、錯＝紅框，而且把正確的終點用黑色虛線框起來 */
        function markEnds(board, end, target) {
            board.endBoxes[end].classList.add(end === target ? 'gl-end--ok' : 'gl-end--bad');
            if (end !== target) board.endBoxes[target].classList.add('gl-end--want');
        }
        return {
            colX: colX, rowY: rowY, snapRow: snapRow, rungSet: rungSet, follow: follow, canPlace: canPlace, placements: placements, visitedCols: visitedCols, gapCounts: gapCounts, makeWalk: makeWalk, spreadRows: spreadRows, crowded: crowded, hideOf: hideOf, answerGroups: answerGroups, hardEnough: hardEnough, cancelPairs: cancelPairs, makesCancel: makesCancel, routeShape: routeShape, makeZigzag: makeZigzag, randomRows: randomRows, routeLength: routeLength, partialRoute: partialRoute,
            answerIndex: answerIndex, answerOk: answerOk, answerThird: answerThird, construct: construct, drawBoard: drawBoard, markEnds: markEnds
        };
    };
})();
