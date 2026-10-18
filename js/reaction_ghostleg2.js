/* ═══════════════════════════════════════════════════════════════════
   reaction_ghostleg2.js — 秒反應・鬼腳圖減一
   「鬼腳圖」的反過來版本：上方有起點、下方有終點（都是綠底黑字），照現有的橫線走，從起點走不到終點。
   玩家要「拿掉一條橫線」（點一下那一條橫線），讓起點接到終點。只有一次機會。關卡制，成績＝通過關數。
   畫棋盤、走路線用 js/ghostleg_core.js（跟「鬼腳圖」外觀一樣）；出題方式是這一款自己的（V1.33.1 重寫，見下面）。
   ───────────────────────────────────────────────────────────────────
   【拿掉一條，答案在哪裡】
   拿掉的話，答案一定是「起點現在這條路線上」的某一個轉彎：拿掉它，路線在那一層就不轉彎、直直走下去。
   換個角度看：每一個轉彎都是「起點的路線」跟「另一條路」交叉的地方；拿掉它，起點就改走那一條路的下半段。
   所以「拿掉 x 會走到終點」＝x 是起點的路線跟「現在會走到終點的那條路」交叉的地方。答案只有一個＝這兩條路只交叉一次。
   ───────────────────────────────────────────────────────────────────
   【V1.33.1 為什麼要重寫出題】
   舊的做法是隨機撒橫線、再檢查「有沒有剛好一個答案」，量出來兩個問題：
     1. 答案幾乎都在路線正中間：舊版要求「答案之前轉 HIDE_BEFORE 次、之後也要轉 HIDE_AFTER 次」，在 16 層的圖上，
        前後各 4 次就只剩中間那一兩個轉彎可以當答案——玩家很快就學會「挑中間那一條」。
     2. 參數一調大就出不了題：隨機撒出來的圖，起點的路線跟終點那條路「剛好只交叉一次」的機會很小，
        條件再嚴一點就要試好幾百次（電腦 0.3～2 秒、手機更久），試不出來就退回只有兩條橫線的保底題。
   新的做法：先「設計」好三條路，再撒其他橫線（只做「答案往右轉」的版本，另一半的題目整張圖左右翻面）：
     P＝起點現在的路線（第 k 個轉彎往右轉，那就是答案 x）；
     Q＝「現在會走到終點的那條路」在答案那一層以上的部分：一直待在 P 的右邊，只在 x 跟 P 交叉；
     T＝Q 在答案那一層以下的部分＝拿掉 x 之後起點的新路線：一直待在舊路線的左邊，最後走到終點。
   其他橫線都不碰這三條路，所以答案保證只有一個，幾乎每次都蓋得出來（出題只要幾毫秒）。
   答案是第幾個轉彎（k）每一題平均地隨機挑，路線的前段、中段、後段都會出現。
   ───────────────────────────────────────────────────────────────────
   【怎麼變難】
     1. 候選很多（TURNS）：起點的路線至少轉 TURNS 次彎，每一個轉彎都是一個要追到底的候選。
     2. 答案的位置猜不到：k 平均地隨機挑（不會總是在中間）。
     3. 答案藏得深（HIDE_BEFORE＋HIDE_AFTER＝前後「合計」）：答案之前路線已經轉的次數＋拿掉之後新路線還要轉的次數，
        合計至少 HIDE_BEFORE＋HIDE_AFTER 次——答案在前段，拿掉之後的新路線就特別長（從終點往上找很費力）；答案在後段，
        從起點往下就要先試過很多個轉彎。
     4. 答案不碰起點、終點的直線（AVOID_ENDS）。
     5. 差一條的誘餌（NEAR_MISS）：拿錯的那些轉彎裡，至少有幾個會走到「終點隔壁那一條」。
     6. 不留破綻：圖上沒有「＝」（同一縫上下兩條、中間兩旁都沒有橫線＝互相抵消，會玩的人一眼就忽略）；
        拿掉答案之後會不會留下「＝」照 LEAVE_EQ（40%）的機率決定（拿錯的候選大約也是這個比例，玩家沒辦法拿它猜）；
        答案那一縫的橫線不會特別少（答案附近四條路都不能碰，不處理的話一半的題目答案都在「最空的那一縫」；現在跟拿錯的候選一樣約 20%）。
   · 操作：點一下橫線（上下 HIT_Y 以內都算點到）就拿掉它，馬上從起點畫出綠色粗虛線一路走下去，看能不能走到終點。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'ghostleg2';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 30 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 30;                       /* 幾關之後難度到頂（也是最後一關） */
    var COLS = 6, ROWS = 16;                    /* 直線數、層數（跟「鬼腳圖」一樣） */
    var X0 = 25, DX = 84, Y_TOP = 76, Y_BOT = 520;   /* 第 1 條直線的 x、直線間距、上下端 y（舞台座標） */
    var RUNGS = [20, 40];                        /* 橫線數（含答案那一條）：第 1 關 → 到頂（設計好的三條路用掉的比這個多時，就不再多撒） */
    var DENSITY_MAX = 1.3;                      /* 橫線數上限 ＝ 層數 × 這個值 */
    var TURNS = [5, 5];                         /* 起點現在的路線至少轉幾次彎（＝候選有幾個）：第 1 關 → 到頂（路線要碰到兩邊、要回頭時會自動再多幾個） */
    var TURNS_EXTRA = 2;                        /* 每一題的轉彎數再隨機多 0～這麼多個（每一題不一樣長） */
    var VISIT = [6, 6];                         /* 起點現在的路線至少經過幾條不同的直線：第 1 關 → 到頂 */
    var HIDE_BEFORE = [4, 4];                   /* 答案前後「合計」至少藏 HIDE_BEFORE＋HIDE_AFTER 個轉彎（答案之前路線已經轉的＋拿掉之後新路線還要轉的）： */
    var HIDE_AFTER = [4, 4];                    /*   第 1 關 → 到頂。V1.33.1 起是「合計」：每一題隨機決定答案在路線的前段、中段或後段，前面藏得少、後面就藏得多 */
    var AVOID_ENDS = true;                      /* 答案的兩端都不可以是起點那條、終點那條直線 */
    var NEAR_MISS = [0, 2];                     /* 拿錯的候選裡，至少幾個會走到「終點隔壁那一條」（差一條的誘餌）：第 1 關 → 到頂 */
    var LEAVE_EQ = 0.4;                         /* 答案拿掉之後「會留下＝」的機率（量過拿錯的候選約 40% 會留下，答案也照這個比例，玩家沒辦法用這個猜答案） */
    var SWEEP_FROM = 6;                        /* 從第幾關起，起點現在的路線要碰到最左與最右兩條直線（VISIT 等於直線數時，每一關都會碰到） */
    var STAIR = [3, 5];                         /* 起點的路線同一個方向最多連走幾步：第 1 關 → 到頂 */
    var REVERSE = [3, 5];                       /* 起點的路線至少回頭幾次：第 1 關 → 到頂 */
    var DECOY_NEAR = 4;                         /* 其他橫線放在「路線隔壁那一縫」的機會是放在別處的幾倍 */
    var BREAK_EXTRA = 3;                        /* 為了打斷「＝」，橫線數最多可以比 RUNGS 多幾條 */
    var XGAP_W = 3;                             /* 答案那一縫的橫線容易比較少（答案附近四條路都不能碰），撒其他橫線時這一縫的機會乘上這個倍數，免得「最空的那一縫」變成線索 */
    var MIN_GAP_OK = 0.4;                       /* 這麼多比例的題目「允許答案在橫線最少的那一縫」（其他題目一定不在）：量過拿錯的候選約 20% 在最少的那一縫，答案也差不多，就不能拿來猜 */
    var GAP_SPREAD = 3;                         /* 五個縫（相鄰兩條直線之間）的橫線數最多差幾條（差太多，圖看起來一邊空空的） */
    var TIME_S = [30, 60];                      /* 每關限時（秒）：第 1 關 → 到頂 */
    var HIT_Y = 16;                             /* 手指點在橫線上下多遠以內，算點到那一條（px） */
    var ROUTE_MS = [1500, 3200];                /* 評審動畫（畫出綠色虛線）的時間範圍 */
    var HOLD_MS = 2000;                         /* 動畫畫完後停多久才進下一關／結算 */
    var GEN_BUDGET_MS = 250;                    /* 出題最多花多久（毫秒）：超過就直接用最寬鬆的條件（正常只要幾毫秒，這是保險） */
    var LABELS = ['甲', '乙', '丙', '丁', '戊', '己'];

    /* ═══ 純函式（也給 Node 測試用）═══ */
    /* 共用工具（js/ghostleg_core.js）：座標、走路線、找「＝」、畫棋盤。SOL_GAP＝1：答案旁邊不特別留白 */
    var C = GhostlegCore({ COLS: COLS, ROWS: ROWS, X0: X0, DX: DX, Y_TOP: Y_TOP, Y_BOT: Y_BOT, SOL_GAP: 1, DECOY_NEAR: DECOY_NEAR, BREAK_EXTRA: BREAK_EXTRA, AVOID_ENDS: AVOID_ENDS });
    var colX = C.colX, rowY = C.rowY, follow = C.follow, cancelPairs = C.cancelPairs, gapCounts = C.gapCounts, routeShape = C.routeShape;
    var RIGHT = COLS - 1;                       /* 最右邊那一條直線的編號 */
    function at(level, pair) { return kit.ramp(level, pair[0], pair[1], RAMP_LEVELS); }
    function rungCap() { return Math.floor(ROWS * DENSITY_MAX); }
    function rungCount(level) { return Math.min(rungCap(), Math.round(at(level, RUNGS))); }
    function turnsAt(level) { return Math.round(at(level, TURNS)); }
    function visitAt(level) { return Math.round(at(level, VISIT)); }
    function hideAt(level) { return { b: Math.round(at(level, HIDE_BEFORE)), a: Math.round(at(level, HIDE_AFTER)) }; }
    function nearAt(level) { return Math.round(at(level, NEAR_MISS)); }
    function stairAt(level) { return Math.round(at(level, STAIR)); }
    function revAt(level) { return Math.round(at(level, REVERSE)); }
    function timeMs(level) { return Math.round(at(level, TIME_S) * 1000); }
    /* 起點的路線依序用到哪幾條橫線（每一個轉彎就是一條橫線） */
    function pathRungs(rungs, start) {
        var s = {}, c = start, out = [];
        rungs.forEach(function (g) { s[g.row + ',' + g.col] = g; });
        for (var r = 0; r < ROWS; r++) {
            if (s[r + ',' + c]) { out.push(s[r + ',' + c]); c++; }
            else if (s[r + ',' + (c - 1)]) { out.push(s[r + ',' + (c - 1)]); c--; }
        }
        return out;
    }
    /* 起點的路線走過的欄（每轉一次彎記一次）：[start, c1, c2, …] */
    function pathCols(rungs, start) {
        var cols = [start], c = start;
        pathRungs(rungs, start).forEach(function (g) { c = g.col === c ? c + 1 : c - 1; cols.push(c); });
        return cols;
    }
    function without(rungs, x) { return rungs.filter(function (g) { return !(g.row === x.row && g.col === x.col); }); }
    /* 拿掉 x 之後：起點走到哪一欄（end）、路線在 x 那一層之後還轉幾次彎（after）、整張圖會不會留下「＝」（leaves） */
    function pullOut(rungs, start, x) {
        var rest = without(rungs, x);
        return { end: follow(rest, start).end, after: pathRungs(rest, start).filter(function (g) { return g.row > x.row; }).length, leaves: cancelPairs(rest) > 0 };
    }
    /* 答案的文字：「第 5 層的 乙～丙 之間那一條」 */
    function rungText(g) { return '第 ' + (g.row + 1) + ' 層的 ' + LABELS[g.col] + '～' + LABELS[g.col + 1] + ' 之間那一條'; }
    /* 照權重 w 隨機挑一個 */
    function pickW(list, rand) {
        var s = 0, i; for (i = 0; i < list.length; i++) s += list[i].w;
        var v = rand() * s;
        for (i = 0; i < list.length; i++) { v -= list[i].w; if (v < 0) return list[i]; }
        return list[list.length - 1];
    }

    /* ─── 出題第 1 步：起點的路線 P ───
       從 start 出發走 m 步（每一步往左或往右一條直線＝一個轉彎），第 k 步（從 0 算起）往右轉，那就是答案 x。
       答案要「只有一個」，路線一定要長這樣（不然 Q、T 沒地方放）：
         · 答案之前（走過的第 0～k 欄）都不碰最右邊那一條：Q 要一直待在 P 的右邊；
         · 答案之後（第 k+1～m 欄）都不碰最左邊那一條：T 要一直待在舊路線的左邊。
       o＝{ start, m, k, stair 同方向最多連走幾步, rev 至少回頭幾次, visit 至少經過幾條直線, sweep 要不要碰到最左與最右兩條 }；
       回傳走過的欄 [start, c1, …, cm]；辦不到回傳 null */
    function makeRoute(o, rand) {
        var m = o.m, k = o.k, start = o.start;
        for (var att = 0; att < 30; att++) {
            var w = [start], run = 0, dir = 0, rev = 0, seen = {}, nSeen = 1, seenL = start === 0, seenR = false, dead = false, i;
            seen[start] = true;
            for (i = 0; i < m && !dead; i++) {
                var cur = w[i], opts = [];
                for (var dd = -1; dd <= 1; dd += 2) {
                    var nx = cur + dd;
                    if (nx < 0 || nx > RIGHT) continue;
                    if (i === k && dd !== 1) continue;                                  /* 第 k 步：往右轉（答案） */
                    if (i < k && nx > RIGHT - 1) continue;                              /* 答案之前：不碰最右邊那一條 */
                    if (i > k && nx < 1) continue;                                      /* 答案之後：不碰最左邊那一條 */
                    if (dd === dir && run >= o.stair) continue;                         /* 同一個方向最多連走 stair 步（不會變成一路往下的樓梯） */
                    if (i >= 1 && w[i - 1] === nx && (nx === 0 || nx === RIGHT)) continue;   /* 不在邊緣來回：甲→乙→甲 的「＝」打不斷 */
                    if (i === k - 1 && AVOID_ENDS && (nx === start || nx + 1 === start)) continue;   /* 答案的兩端不可以是起點那一條 */
                    if (i === k - 1 && dd === -1 && nx > COLS - 4) continue;             /* 回頭接到答案：右邊要留兩條給 Q 讓開（打斷「＝」的橫線要放那裡） */
                    if (i === k + 1 && dd === -1 && nx < 2) continue;                   /* 答案之後馬上回頭：左邊要留兩條給 T 讓開 */
                    if (o.sweep && i < k) {                                             /* 答案之前：剩下的步數要夠「先碰到最左邊、再走回答案的位置」 */
                        var rem = k - i - 1, aim = RIGHT - m + k;                       /* aim＝答案左邊那一條至少要在哪（答案之後才走得到最右邊） */
                        if (seenL || nx === 0 ? aim - nx > rem : nx + Math.max(0, aim) > rem) continue;
                    }
                    if (o.sweep && i >= k && !seenR && nx < RIGHT - (m - i - 1)) continue;   /* 答案之後一定要碰到最右邊 */
                    opts.push(dd);
                }
                if (!opts.length) { dead = true; break; }
                /* 還沒碰到的邊（或還沒走過的直線）在哪一邊，就比較常往那邊走 */
                var want = 0;
                if (o.sweep && i < k && !seenL) want = -1;
                else if (o.sweep && i >= k && !seenR) want = 1;
                else if (nSeen < o.visit) { var lo = 99, hi = -1; for (var c = 0; c < COLS; c++) if (!seen[c]) { lo = Math.min(lo, c); hi = Math.max(hi, c); } want = (hi > cur && (lo > cur || hi - cur <= cur - lo)) ? 1 : -1; }
                var d2 = (want && opts.indexOf(want) >= 0 && rand() < 0.65) ? want : kit.pick(opts, rand);
                if (dir && d2 !== dir) rev++;
                run = d2 === dir ? run + 1 : 1; dir = d2;
                var nc = cur + d2;
                w.push(nc);
                if (!seen[nc]) { seen[nc] = true; nSeen++; }
                if (i + 1 <= k && nc === 0) seenL = true;
                if (i + 1 >= k + 1 && nc === RIGHT) seenR = true;
            }
            if (dead || rev < o.rev || nSeen < o.visit || (o.sweep && !(seenL && seenR))) continue;
            return w;
        }
        return null;
    }
    /* ─── 出題第 2 步：每個轉彎在第幾層 ───
       由上往下、每個轉彎各占一層；路線回頭（連續兩個轉彎在同一縫）中間至少空 1 層，要放打斷「＝」的橫線；
       跟答案連在一起的回頭要空 3 層（Q 或 T 要先讓開兩條，打斷「＝」的橫線才放得下）。剩下的空層隨機分到最上面、每個間隔、最下面。
       放不下回傳 null */
    function routeRows(w, k, rand) {
        var m = w.length - 1, need = [], sum = 0, i;
        for (i = 1; i < m; i++) {
            var g = 1;
            if (w[i - 1] === w[i + 1]) g = (i === k || i - 1 === k) ? 4 : 2;
            need.push(g); sum += g;
        }
        var slack = ROWS - 1 - sum;
        if (slack < 0) return null;
        var parts = []; for (i = 0; i <= m; i++) parts.push(0);
        for (var t = 0; t < slack; t++) parts[Math.floor(rand() * parts.length)]++;
        var rows = [parts[0]];
        for (i = 1; i < m; i++) rows.push(rows[i - 1] + need[i - 1] + parts[i]);
        return rows;
    }
    /* 路線 w 每一層的位置：col[j]＝第 j 層「之前」（上面）在第幾條直線（j＝0～ROWS；col[ROWS]＝最後走到的欄） */
    function colsAlong(w, rows) {
        var col = [], i = 0;
        for (var j = 0; j <= ROWS; j++) { while (i < rows.length && rows[i] < j) i++; col.push(w[i]); }
        return col;
    }
    /* 路線回頭的地方，放一條打斷「＝」的橫線（放在路線「外側」那一縫、兩個轉彎中間的某一層）。
       跟答案連在一起的回頭：答案之前那一個（第 k−1、k 個轉彎）放最上面一層、答案之後那一個（第 k、k+1 個）放最下面一層，讓 Q／T 有空間讓開。
       回傳 [{ row, col }]；放不下回傳 null */
    function routeBreakers(w, rows, k, rand) {
        var out = [];
        for (var i = 0; i + 2 < w.length; i++) {
            if (w[i] !== w[i + 2]) continue;
            var g = Math.min(w[i], w[i + 1]), gb = w[i + 1] === g + 1 ? g - 1 : g + 1;
            if (gb < 0 || gb > COLS - 2) return null;
            var lo = rows[i] + 1, hi = rows[i + 1] - 1;
            if (hi < lo) return null;
            out.push({ row: i + 1 === k ? lo : i === k ? hi : kit.randInt(lo, hi, rand), col: gb });
        }
        return out;
    }
    /* ─── 出題第 3 步：Q（現在會走到終點的那條路，答案那一層以上）───
       每一層都在 P 的右邊、不碰 P 的橫線，最後在答案那一層（rk）剛好在 qEnd（P 右邊那一條）。可以往左也可以往右（不會整條貼在最右邊）；
       Q 回頭時（連續兩次轉彎在同一縫）會在上一層放一條打斷「＝」的橫線（brks）：往左再往右＝放在 Q 右邊；往右再往左＝放在 Q 左邊（不能碰到 P）。
       先算「從第 r 層、第 q 條、上一次往哪轉、上一層有沒有轉」還走不走得到終點（feas，記在 memo 裡），再由上往下隨機走一條。
       colP＝P 每一層的位置；brkAt＝P 的打斷橫線（第幾層 → 縫的清單），Q 不能碰到它們。回傳 { col（每一層的位置）, moves（Q 的橫線）, brks }；辦不到回傳 null */
    function makeQ(colP, rk, qEnd, brkAt, rand) {
        var memo = {};
        function step(r, q, dd, ld, adj) {            /* 第 r 層：Q 從 q 往 dd（0＝不轉彎）走；可以的話回傳 { q: 新位置, brk: 要放的打斷橫線或 null } */
            var q2 = q + dd, i;
            if (q2 < 0 || q2 > RIGHT) return null;
            var p0 = colP[r], p1 = colP[r + 1], bs = brkAt[r] || [];
            if (p0 !== p1) { if (dd || q <= Math.max(p0, p1)) return null; }       /* P 在這一層轉彎：Q 不轉彎，而且不碰 P 的橫線 */
            else if (Math.min(q, q2) <= p0) return null;                           /* 一直在 P 的右邊，Q 的橫線也不碰 P */
            for (i = 0; i < bs.length; i++) if (dd ? Math.abs(Math.min(q, q2) - bs[i]) < 2 : (q === bs[i] || q === bs[i] + 1)) return null;
            var brk = null;
            if (dd && ld === -dd) {                    /* 回頭：上一層（Q 那時沒轉彎）放一條打斷「＝」的橫線 */
                if (adj || r < 1) return null;
                var gb = dd === 1 ? q + 1 : q - 2;
                if (gb < 0 || gb > COLS - 2) return null;
                if (dd === -1) { var pb0 = colP[r - 1], pb1 = colP[r]; if (pb0 !== pb1 ? Math.max(pb0, pb1) > gb - 1 : pb0 > gb - 1) return null; }   /* 放在 Q 左邊時不能碰到 P */
                var bs2 = brkAt[r - 1] || [];
                for (i = 0; i < bs2.length; i++) if (Math.abs(bs2[i] - gb) < 2) return null;
                brk = { row: r - 1, col: gb };
            }
            return { q: q2, brk: brk };
        }
        function feas(r, q, ld, adj) {
            if (r === rk) return q === qEnd;
            var key = ((r * COLS + q) * 3 + ld + 1) * 2 + adj;
            if (memo[key] !== undefined) return memo[key];
            var res = false;
            for (var dd = -1; dd <= 1 && !res; dd++) {
                var s = step(r, q, dd, ld, adj);
                if (s && feas(r + 1, s.q, dd || ld, dd ? 1 : 0)) res = true;
            }
            memo[key] = res;
            return res;
        }
        var tops = [], c;
        for (c = 0; c < COLS; c++) if (feas(0, c, 0, 0)) tops.push(c);
        if (!tops.length) return null;
        var q = kit.pick(tops, rand), ld = 0, adj = 0, col = [q], moves = [], brks = [];
        for (var r = 0; r < rk; r++) {
            var opts = [];
            for (var dd = -1; dd <= 1; dd++) {
                var s = step(r, q, dd, ld, adj);
                if (s && feas(r + 1, s.q, dd || ld, dd ? 1 : 0)) opts.push({ dd: dd, s: s, w: dd ? 0.45 : 1 });
            }
            var pk = pickW(opts, rand);
            if (pk.dd) { moves.push({ row: r, col: Math.min(q, pk.s.q) }); if (pk.s.brk) brks.push(pk.s.brk); ld = pk.dd; adj = 1; }
            else adj = 0;
            q = pk.s.q; col.push(q);
        }
        return { col: col, moves: moves, brks: brks };
    }
    /* ─── 出題第 4 步：T（拿掉答案之後起點的新路線，答案那一層以下）───
       從 tStart（答案左邊那一條）出發往下，每一層都在舊路線（colP）的左邊、不碰它的橫線，至少轉 need 次彎，最後不停在 avoid（答案的兩條直線）。
       T 回頭時（連續兩次轉彎在同一縫）會在上一層、T 外側那一縫放一條打斷「＝」的橫線（brks）。
       先算「從第 r 層、第 t 條、已經轉了幾次、上一次往哪轉、上一層有沒有轉」還走不走得完（feas，記在 memo 裡），再由上往下隨機走一條。
       回傳 { col, moves, brks, end }；辦不到回傳 null */
    function makeT(colP, rk, tStart, need, avoid, brkAt, rand) {
        var memo = {};
        function step(r, t, dd, ld, adj) {            /* 第 r 層：T 從 t 往 dd（0＝不轉彎）走；可以的話回傳 { t: 新位置, brk: 要放的打斷橫線或 null } */
            var t2 = t + dd, i;
            if (t2 < 0 || t2 > RIGHT) return null;
            var o0 = colP[r], o1 = colP[r + 1], bs = brkAt[r] || [];
            if (o0 !== o1) { var go = Math.min(o0, o1); if (dd ? Math.min(t, t2) > go - 2 : t >= go) return null; }   /* 舊路線在這一層轉彎：不碰它的橫線 */
            else if (dd ? Math.max(t, t2) > o0 - 1 : t >= o0) return null;                                       /* 一直在舊路線的左邊 */
            for (i = 0; i < bs.length; i++) if (dd ? Math.abs(Math.min(t, t2) - bs[i]) < 2 : (t === bs[i] || t === bs[i] + 1)) return null;
            var brk = null;
            if (dd && ld === -dd) {                    /* 回頭：上一層（T 那時沒轉彎）在 T 外側放一條打斷「＝」的橫線 */
                if (adj || r - 1 <= rk) return null;
                var gb = dd === -1 ? t - 2 : t + 1;
                if (gb < 0 || gb > COLS - 2) return null;
                if (dd === 1) { var pb0 = colP[r - 1], pb1 = colP[r]; if (pb0 !== pb1 ? Math.min(pb0, pb1) < gb + 2 : pb0 <= gb + 1) return null; }   /* 放在 T 右邊時不能碰到舊路線 */
                var bs2 = brkAt[r - 1] || [];
                for (i = 0; i < bs2.length; i++) if (Math.abs(bs2[i] - gb) < 2) return null;
                brk = { row: r - 1, col: gb };
            }
            return { t: t2, brk: brk };
        }
        function feas(r, t, mv, ld, adj) {
            if (r === ROWS) return mv >= need && !(avoid && avoid.indexOf(t) >= 0);
            var key = (((r * COLS + t) * (need + 1) + mv) * 3 + ld + 1) * 2 + adj;
            if (memo[key] !== undefined) return memo[key];
            var res = false;
            for (var dd = -1; dd <= 1 && !res; dd++) {
                var s = step(r, t, dd, ld, adj);
                if (s && feas(r + 1, s.t, Math.min(need, mv + (dd ? 1 : 0)), dd || ld, dd ? 1 : 0)) res = true;
            }
            memo[key] = res;
            return res;
        }
        if (!feas(rk + 1, tStart, 0, 0, 0)) return null;
        var t = tStart, mv = 0, ld = 0, adj = 0, col = [], moves = [], brks = [], j;
        for (j = 0; j <= ROWS; j++) col.push(-1);
        col[rk + 1] = t;
        for (var r = rk + 1; r < ROWS; r++) {
            var opts = [];
            for (var dd = -1; dd <= 1; dd++) {
                var s = step(r, t, dd, ld, adj);
                if (s && feas(r + 1, s.t, Math.min(need, mv + (dd ? 1 : 0)), dd || ld, dd ? 1 : 0)) opts.push({ dd: dd, s: s, w: dd ? (mv < need ? 1.6 : 0.5) : 1 });
            }
            var pk = pickW(opts, rand);
            if (pk.dd) { moves.push({ row: r, col: Math.min(t, pk.s.t) }); mv++; if (pk.s.brk) brks.push(pk.s.brk); ld = pk.dd; adj = 1; }
            else adj = 0;
            t = pk.s.t; col[r + 1] = t;
        }
        return { col: col, moves: moves, brks: brks, end: t };
    }
    /* 同一層的橫線有沒有重疊或相鄰（鬼腳圖不允許：同一層、緊鄰的兩條會分不清往哪走） */
    function clash(rungs) {
        var byRow = {};
        for (var i = 0; i < rungs.length; i++) {
            var g = rungs[i], list = byRow[g.row] = byRow[g.row] || [];
            for (var j = 0; j < list.length; j++) if (Math.abs(list[j] - g.col) < 2) return true;
            list.push(g.col);
        }
        return false;
    }
    /* 把第 1～4 步串起來：設計好 P、Q、T（和打斷「＝」的橫線）。o＝{ start, m, k, need（T 至少轉幾次）, stair, rev, visit, sweep }。
       回傳 { w（P 走過的欄）, k, x（答案）, base（設計好的橫線）, prot（每一層不能碰的直線）, colP, start, target }；
       辦不到回傳 null；卡在 T（新路線轉不了 need 次）回傳 { failT: true } */
    function design(o, rand) {
        var w = makeRoute(o, rand);
        if (!w) return null;
        var k = o.k, failT = false;
        for (var tr = 0; tr < 4; tr++) {
            var rows = routeRows(w, k, rand);
            if (!rows) return null;
            var pb = routeBreakers(w, rows, k, rand);
            if (!pb) continue;
            var colP = colsAlong(w, rows), rk = rows[k], brkAt = {};
            pb.forEach(function (b) { (brkAt[b.row] = brkAt[b.row] || []).push(b.col); });
            var Q = makeQ(colP, rk, w[k + 1], brkAt, rand);
            if (!Q) continue;
            var T = makeT(colP, rk, w[k], o.need, AVOID_ENDS ? [w[k], w[k] + 1] : null, brkAt, rand);
            if (!T) { failT = true; continue; }
            var turns = rows.map(function (r, i) { return { row: r, col: Math.min(w[i], w[i + 1]) }; });
            var base = turns.concat(Q.moves, T.moves, pb, Q.brks, T.brks);
            if (clash(base)) continue;
            /* 每一層「不能碰」的直線：P、Q（答案以上）、T（答案以下）在這一層沒有轉彎時所在的那一條——其他橫線碰到就會改變它們 */
            var prot = [];
            for (var r = 0; r < ROWS; r++) {
                var pc = [];
                if (colP[r] === colP[r + 1]) pc.push(colP[r]);
                if (r < rk && Q.col[r] === Q.col[r + 1]) pc.push(Q.col[r]);
                if (r > rk && T.col[r] === T.col[r + 1]) pc.push(T.col[r]);
                prot.push(pc);
            }
            return { w: w, k: k, x: turns[k], base: base, prot: prot, colP: colP, start: w[0], target: T.end };
        }
        return failT ? { failT: true } : null;                                         /* failT：卡在「新路線轉不了那麼多次」 */
    }
    /* ─── 出題第 5 步：撒其他橫線 ───
       圖上還有「＝」就先放能打斷它的位置；沒有了才照常撒（橫線少的縫優先、優先貼著路線旁邊、每一層最多 2 條、不造出新的「＝」）。
       其他橫線都不碰 P、Q、T（不然答案就不只一個了）。撒到 n 條、而且各縫的橫線數最多差 o.gap 條為止（最多多 BREAK_EXTRA 條）；
       這一題不允許「答案在橫線最少的那一縫」（o.xmin＝false）時，還要撒到答案那一縫不是最少的為止。
       「＝」要管兩張圖：玩家看到的圖；以及這一題「拿掉答案不可以留下＝」（o.leave＝false）時，拿掉答案之後的圖——
       答案是四條路（P、Q、T、舊路線）碰在一起的地方，不特別處理的話，拿掉它大多會留下「＝」，玩家就能拿這個猜答案。 */
    function fillRest(d, n, o, rand) {
        var rungs = d.base.slice(), rowLoad = [], r, g, keepX = o.leave === false;
        function allPairs(rg, list) { return cancelPairs(rg, list) + (keepX ? cancelPairs(without(rg, d.x), list) : 0); }
        for (r = 0; r < ROWS; r++) rowLoad.push(0);
        rungs.forEach(function (x) { rowLoad[x.row]++; });
        for (var guard = 0; guard < 80; guard++) {
            var pairs = []; allPairs(rungs, pairs);
            var cnt = gapCounts(rungs), minG = Math.min.apply(null, cnt), spread = Math.max.apply(null, cnt) - minG;
            if (rungs.length >= n + BREAK_EXTRA) break;
            var xLow = o.xmin === false && cnt[d.x.col] === minG;                         /* 答案那一縫是橫線最少的（這一題不允許） */
            if (rungs.length >= n && !pairs.length && spread <= o.gap && !xLow) break;
            var rx = keepX ? without(rungs, d.x) : null, cands = [];
            for (r = 0; r < ROWS; r++) for (g = 0; g <= COLS - 2; g++) {
                if (!C.canPlace(rungs, r, g)) continue;
                if (d.prot[r].indexOf(g) >= 0 || d.prot[r].indexOf(g + 1) >= 0) continue;   /* 不碰設計好的三條路 */
                if (rowLoad[r] >= 2) continue;                                             /* 每一層最多 2 條 */
                var breaks = 0;
                if (!pairs.length) {
                    if (C.makesCancel(rungs, r, g) || (keepX && C.makesCancel(rx, r, g))) continue;   /* 沒有「＝」了：不造出新的「＝」 */
                } else {
                    pairs.forEach(function (p) { if ((g === p.col - 1 || g === p.col + 1) && r > p.r1 && r < p.r2) breaks++; });
                    if (!breaks) continue;                                                 /* 還有「＝」：只考慮打得斷它的位置， */
                    var after = allPairs(rungs.concat([{ row: r, col: g }]));
                    if (after > pairs.length) continue;                                    /* 而且放下去之後「＝」不會變多 */
                    breaks = 1 + 3 * (pairs.length - after);
                }
                cands.push({ row: r, col: g, breaks: breaks });
            }
            if (!cands.length && !pairs.length && rungs.length < n) {
                /* 圖還很空、放哪裡都會造出「＝」：先放一條（下一輪會在它旁邊放一條打斷它） */
                for (r = 0; r < ROWS; r++) for (g = 0; g <= COLS - 2; g++) {
                    if (C.canPlace(rungs, r, g) && d.prot[r].indexOf(g) < 0 && d.prot[r].indexOf(g + 1) < 0 && rowLoad[r] < 2) cands.push({ row: r, col: g, breaks: 0 });
                }
            }
            if (!pairs.length) {
                /* 橫線少的縫優先：還不到 n 條時挑「最少＋1 條以內」的縫（都放不下就哪一縫都可以）；已經夠 n 條了，就只補最少的那一縫 */
                var few = cands.filter(function (x) { return rungs.length >= n ? (xLow ? x.col === d.x.col : cnt[x.col] === minG) : cnt[x.col] <= minG + 1; });
                if (few.length || rungs.length >= n) cands = few;
            }
            if (!cands.length) break;
            cands.forEach(function (x) {
                var c0 = d.colP[x.row], dist = Math.min(Math.abs(x.col - c0), Math.abs(x.col + 1 - c0));
                x.w = (dist === 1 ? DECOY_NEAR : 1) / (1 + rowLoad[x.row]) * (1 + x.breaks) * (cnt[x.col] === minG ? 2 : 1) * (x.col === d.x.col ? XGAP_W : 1);
            });
            var pk = pickW(cands, rand);
            rungs.push({ row: pk.row, col: pk.col }); rowLoad[pk.row]++;
        }
        return rungs;
    }
    /* ─── 出題第 6 步：檢查（用「真的拿掉每一條、走走看」來驗證，不靠設計時的推論）───
       o＝{ near 誘餌至少幾個, leave 拿掉答案要不要留下「＝」（null＝都可以）, gap 各縫橫線數最多差幾條, xmin 答案那一縫可不可以是最少的（null＝都可以） }。合格回傳題目，不合格回傳 null */
    function finish(rungs, d, o) {
        if (cancelPairs(rungs)) return null;                                           /* 玩家看到的圖不能有「＝」 */
        var start = d.start, target = d.target, path = pathRungs(rungs, start);
        var cands = path.map(function (g, i) { var p = pullOut(rungs, start, g); p.rung = g; p.idx = i; return p; });
        var sols = cands.filter(function (p) { return p.end === target; });
        if (sols.length !== 1 || sols[0].rung.row !== d.x.row || sols[0].rung.col !== d.x.col) return null;   /* 答案只有一個，而且就是設計的那一條 */
        var main = sols[0];
        if (AVOID_ENDS && [main.rung.col, main.rung.col + 1].some(function (c) { return c === start || c === target; })) return null;
        var near = cands.filter(function (p) { return p.end !== target && Math.abs(p.end - target) === 1; }).length;
        if (near < o.near) return null;
        if (o.leave !== null && main.leaves !== o.leave) return null;
        var cc = gapCounts(rungs);
        if (Math.max.apply(null, cc) - Math.min.apply(null, cc) > o.gap) return null;
        if (o.xmin === false && cc[main.rung.col] === Math.min.apply(null, cc)) return null;   /* 答案那一縫不可以是橫線最少的（這一題） */
        var ans = { row: main.rung.row, col: main.rung.col };
        return {
            rungs: rungs, start: start, target: target, endNow: follow(rungs, start).end, answer: ans, solutions: [ans],
            candidates: path.length, near: near, leave: main.leaves, hide: { before: main.idx, after: main.after }, shape: routeShape(d.w)
        };
    }
    /* 整張圖左右翻面（「答案往左轉」的那一半題目） */
    function mirror(q) {
        function fl(g) { return { row: g.row, col: COLS - 2 - g.col }; }
        q.rungs = q.rungs.map(fl); q.answer = fl(q.answer); q.solutions = q.solutions.map(fl);
        q.start = RIGHT - q.start; q.target = RIGHT - q.target; q.endNow = RIGHT - q.endNow;
        return q;
    }
    /* 一次嘗試：隨機挑轉彎數 m、起點，答案是第幾個轉彎 k 由 o.u（0～1：答案在路線上的相對位置，一題只抽一次）決定，
       設計三條路、撒橫線、檢查。o＝這一級的條件；n＝橫線數。
       （u 一題只抽一次、失敗了也不換：不然「好蓋的位置」會比較常被留下來，答案又會集中在某一段） */
    function attempt(o, n, rand) {
        var lo = Math.min(Math.max(o.turns, (o.sweep ? COLS - 1 : o.visit - 1) + o.rev), ROWS - 1 - o.rev);   /* 要碰兩邊、要回頭 rev 次，最少要這麼多個轉彎 */
        var hi = Math.max(lo, Math.min(lo + o.extra, ROWS - 1 - o.rev));
        var m = kit.randInt(Math.max(2, lo), Math.max(2, hi), rand), kLo = AVOID_ENDS ? 1 : 0;
        var k = kLo + Math.min(m - 1 - kLo, Math.floor((o.u == null ? rand() : o.u) * (m - kLo)));
        var need = Math.max(1, o.hide - k);                                            /* 前後合計：答案越前面，拿掉之後的新路線要轉越多次 */
        for (var s = 0; s < 6; s++) {                                                  /* 同一個 k 換幾個起點試試（k 才會真的平均） */
            var d = design({ start: kit.randInt(0, RIGHT, rand), m: m, k: k, need: need, stair: o.stair, rev: o.rev, visit: o.visit, sweep: o.sweep }, rand);
            if (d && d.failT) { if (need > 1) need--; continue; }                      /* 新路線轉不了那麼多次（答案很前面時，16 層放不下太長的新路線）：少要一次 */
            if (!d) continue;
            for (var f = 0; f < 6; f++) {
                var q = finish(fillRest(d, n, o, rand), d, o);
                if (q) return q;
            }
        }
        return null;
    }
    /* 這一關的條件（第 0 級＝不放寬）：u＝答案在路線上的相對位置（0～1，一題抽一次）、leave＝拿掉答案要不要留下「＝」、
       xmin＝允不允許答案在橫線最少的那一縫（都是一題擲一次） */
    function levelBase(level, rand) {
        var hd = hideAt(level), visit = Math.min(COLS, visitAt(level));
        var base = {
            turns: turnsAt(level), extra: TURNS_EXTRA, hide: Math.max(1, hd.b + hd.a), near: nearAt(level), leave: rand() < LEAVE_EQ, xmin: rand() < MIN_GAP_OK, u: rand(),
            stair: Math.max(1, stairAt(level)), rev: Math.max(0, revAt(level)), visit: visit, sweep: level >= SWEEP_FROM || visit >= COLS, gap: GAP_SPREAD
        };
        base.rev = Math.min(base.rev, Math.floor((ROWS - 2) / 3));                     /* 回頭太多次，16 層放不下 */
        base.hide = Math.min(base.hide, ROWS - 3);
        return base;
    }
    /* 出題：照這一關的條件試；試不出來就一級一級放寬（最後一級幾乎沒有條件，一定出得來），每一級最多試幾次（stages 的第 2 個數字）。
       超過 GEN_BUDGET_MS 就直接跳到最後一級（保險：正常幾毫秒就出好了）。 */
    function makeLevel(level, rand) {
        rand = rand || Math.random;
        var base = levelBase(level, rand), visit = base.visit;
        var stages = [
            [base, 30],
            [Object.assign({}, base, { near: Math.max(0, base.near - 1), stair: base.stair + 1 }), 20],
            [Object.assign({}, base, { near: 0, stair: base.stair + 1, rev: Math.max(0, base.rev - 1), hide: base.hide - 1, turns: base.turns - 1, gap: GAP_SPREAD + 1 }), 20],
            [Object.assign({}, base, { near: 0, stair: COLS, rev: Math.max(0, base.rev - 2), hide: Math.max(2, base.hide - 3), turns: base.turns - 2, visit: Math.min(visit, COLS - 1), sweep: false, gap: GAP_SPREAD + 1 }), 30],
            [{ turns: 3, extra: 3, hide: 2, near: 0, leave: base.leave, xmin: base.xmin, stair: COLS, rev: 0, visit: 2, sweep: false, gap: GAP_SPREAD + 2 }, 400]   /* 最後一級：幾乎沒有條件，但「拿掉會不會留下＝」「答案在不在最少的縫」照樣管（不然又變成線索） */
        ];
        var n = rungCount(level), t0 = Date.now();
        for (var st = 0; st < stages.length; st++) {
            for (var t = 0; t < stages[st][1]; t++) {
                if (st < stages.length - 1 && Date.now() - t0 > GEN_BUDGET_MS) break;
                var o = stages[st][0];
                if (Date.now() - t0 > GEN_BUDGET_MS * 3) o = Object.assign({}, o, { leave: null, xmin: null });   /* 已經花太久（很慢的手機）：最後一級連這兩條也不管，馬上出題 */
                var q = attempt(o, n, rand);
                if (q) {
                    if (rand() < 0.5) mirror(q);
                    q.sweep = stages[st][0].sweep; q.stage = st;
                    return q;
                }
            }
        }
        /* 保底（理論上不會用到）：很簡單的一題 */
        var r0 = [{ row: 3, col: 0 }, { row: 8, col: 1 }];
        return { rungs: r0, start: 0, target: 1, endNow: follow(r0, 0).end, answer: { row: 8, col: 1 }, solutions: [{ row: 8, col: 1 }], candidates: 2, near: 0, leave: false, hide: { before: 1, after: 0 }, shape: { maxRun: 2, rev: 0 }, sweep: false, stage: stages.length };
    }
    /* 手指點在 (x, y)：點到哪一條橫線（在它兩條直線之間、上下 HIT_Y 以內，最近的那一條）；沒有回傳 null */
    function rungAt(rungs, x, y) {
        var best = null, bd = HIT_Y + 0.001;
        rungs.forEach(function (g) {
            if (x < colX(g.col) + 6 || x > colX(g.col + 1) - 6) return;
            var d = Math.abs(y - rowY(g.row));
            if (d < bd) { bd = d; best = g; }
        });
        return best;
    }
    function routeMs(route) { return Math.round(kit.clamp(C.routeLength(route) * 2.4, ROUTE_MS[0], ROUTE_MS[1])); }
    function rating(n) {
        if (n >= 15) return '鬼腳圖大師！一條都不多！';
        if (n >= 10) return '高手！';
        if (n >= 6) return '不錯喔！';
        if (n >= 3) return '再接再厲！';
        return '沿著起點的路線，一個轉彎一個轉彎想「這裡不轉會到哪」，再來一次！';
    }

    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: RAMP_LEVELS, goodAt: 5,
            numText: function (v) { return v + ' 關'; },
            rating: rating,
            lines: function (S) { return ['通過 ' + S.cleared + ' 關']; },
            setup: setup
        });
    }

    function setup(api) {
        var stage = api.stage, level = api.level, my = api.my;
        var q = makeLevel(level, api.rand);
        api.info = q;
        console.log('[鬼腳圖減一] 第 ' + level + ' 關：橫線 ' + q.rungs.length + ' 條；起點 ' + LABELS[q.start] + '、終點 ' + (q.target + 1) + '（現在走到 ' + (q.endNow + 1) + '）；答案 ' + rungText(q.answer) +
            '（起點路線上第 ' + (q.hide.before + 1) + ' 個轉彎，共 ' + q.candidates + ' 個）；差一條的誘餌 ' + q.near + ' 個；拿掉之後新路線還轉 ' + q.hide.after + ' 次；拿掉答案' + (q.leave ? '會' : '不會') + '留下「＝」' +
            '；路線同方向最多連走 ' + q.shape.maxRun + ' 步、回頭 ' + q.shape.rev + ' 次' + (q.sweep ? '、碰到最左與最右' : '') + (q.stage ? '；放寬第 ' + q.stage + ' 級' : '') + '；限時 ' + timeMs(level) + ' ms');

        var board = C.drawBoard(stage, q, LABELS, '照現有的線走不到終點！點一下要拿掉的那一條橫線');
        var gRoute = board.gRoute, msg = board.msg;

        /* 操作提示（只在第一次進遊戲時）：手指點在答案那一條上（共用的手指提示）；玩家一碰畫面就消失 */
        if (level === 1 && kit.once('ghostleg2.hint')) {
            var a = q.answer;
            kit.hintOn(stage, null, { mode: 'tap', x: (colX(a.col) + colX(a.col + 1)) / 2, y: rowY(a.row), delay: 600, text: '點一下橫線，把它拿掉' });
        }

        /* 點一下橫線＝拿掉它（只有一次機會）：原位留下淡淡的紅色虛線，接著跑評審動畫 */
        var locked = false;
        stage.addEventListener('pointerdown', function (e) {
            if (api.over || locked) return;
            var p = kit.localPt(e, stage), g = rungAt(q.rungs, p.x, p.y);
            if (!g) return;
            e.preventDefault();
            locked = true; api.stopTimer();
            board.rungEls[g.row + ',' + g.col].classList.add('gx-gone');
            Sfx.play('click');
            msg.textContent = '';
            judge(g);
        });
        /* 評審動畫：從起點開始畫出一條綠色粗虛線，經過每個轉折點，看看最後能不能抵達終點 */
        function judge(removed) {
            var f = follow(without(q.rungs, removed), q.start), ms = routeMs(f.route), total = C.routeLength(f.route);
            var line = kit.svg('polyline', { points: '', 'class': 'gx-route' }, gRoute);
            my.tween(ms, function (e) {
                line.setAttribute('points', C.partialRoute(f.route, total * e).map(function (p) { return p.x.toFixed(1) + ',' + p.y.toFixed(1); }).join(' '));
            }, kit.linear).then(function () {
                var win = f.end === q.target;
                C.markEnds(board, f.end, q.target);
                Sfx.play(win ? 'ok' : 'bad');
                if (!win) showAnswer();
                api.after(HOLD_MS, function () {
                    if (win) api.pass({ delay: 0 });
                    else api.fail({ delay: 0, lines: ['拿掉這一條，會走到終點 ' + (f.end + 1) + '，不是綠色的終點 ' + (q.target + 1), '答案是' + rungText(q.answer) + '（綠色那一條）'] });
                });
            });
        }
        /* 失敗時把答案那一條標成綠色 */
        function showAnswer() { q.solutions.forEach(function (g) { var el = board.rungEls[g.row + ',' + g.col]; if (el) el.classList.add('gx-answer'); }); }
        api.timer(timeMs(level), function () {
            locked = true;
            msg.textContent = '';
            showAnswer();
            api.fail({ delay: 1200, lines: ['時間到了', '答案是' + rungText(q.answer) + '（綠色那一條）'] });
        });

        /* 驗證用：用真的 PointerEvent 點一條橫線 */
        function tapAt(g) {
            var r = stage.getBoundingClientRect(), sc = r.width / (stage.clientWidth || r.width);
            var x = (colX(g.col) + colX(g.col + 1)) / 2, y = rowY(g.row);
            ['pointerdown', 'pointerup'].forEach(function (type) {
                stage.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 9, clientX: r.left + x * sc, clientY: r.top + y * sc }));
            });
        }
        api.solve = function () { tapAt(q.answer); };
        api.wrong = function () {
            var bad = pathRungs(q.rungs, q.start).filter(function (g) { return !q.solutions.some(function (s) { return s.row === g.row && s.col === g.col; }); })[0] || q.rungs.filter(function (g) { return !(g.row === q.answer.row && g.col === q.answer.col); })[0];
            if (bad) tapAt(bad);
        };
        api.tap = tapAt;
    }

    var G = {
        id: ID,
        name: '鬼腳圖減一',
        rule: '這是「鬼腳圖」的反過來版本。上方有綠色的起點，下方有綠色的終點，照現有的橫線走，**從起點到不了終點**。請你**點一下其中一條橫線，把它拿掉**，讓起點接到終點。**只有一次機會**，拿掉之後會從起點開始一路走下去，遇到橫線就轉彎，看能不能走到終點。',
        mount: mount,
        score: SCORE,
        test: {
            pathRungs: pathRungs, pathCols: pathCols, without: without, pullOut: pullOut, makeRoute: makeRoute, routeRows: routeRows, colsAlong: colsAlong, routeBreakers: routeBreakers,
            makeQ: makeQ, makeT: makeT, clash: clash, design: design, fillRest: fillRest, finish: finish, mirror: mirror, attempt: attempt, levelBase: levelBase, makeLevel: makeLevel,
            rungAt: rungAt, rungText: rungText, routeMs: routeMs, rating: rating,
            rungCap: rungCap, rungCount: rungCount, turnsAt: turnsAt, visitAt: visitAt, hideAt: hideAt, nearAt: nearAt, stairAt: stairAt, revAt: revAt, timeMs: timeMs,
            C: C, COLS: COLS, ROWS: ROWS, RAMP_LEVELS: RAMP_LEVELS, RUNGS: RUNGS, DENSITY_MAX: DENSITY_MAX, TURNS: TURNS, TURNS_EXTRA: TURNS_EXTRA, VISIT: VISIT, HIDE_BEFORE: HIDE_BEFORE, HIDE_AFTER: HIDE_AFTER,
            AVOID_ENDS: AVOID_ENDS, NEAR_MISS: NEAR_MISS, LEAVE_EQ: LEAVE_EQ, SWEEP_FROM: SWEEP_FROM, STAIR: STAIR, REVERSE: REVERSE, BREAK_EXTRA: BREAK_EXTRA, GAP_SPREAD: GAP_SPREAD, XGAP_W: XGAP_W, MIN_GAP_OK: MIN_GAP_OK, TIME_S: TIME_S, HIT_Y: HIT_Y, HOLD_MS: HOLD_MS, ROUTE_MS: ROUTE_MS,
            GEN_BUDGET_MS: GEN_BUDGET_MS
        }
    };
    Reaction.register(G);
})();
