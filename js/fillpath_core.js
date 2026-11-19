/* ═══════════════════════════════════════════════════════════════════
   fillpath_core.js — 「填滿」系列遊戲的共用引擎（一筆填滿 blockfill、多色填滿 multifill 共用；V1.57.3.0）
   遊戲畫面（棋盤、拖曳、結算）在 js/fillpath_ui.js；題庫在 js/fillpath_bank.js（用 test/reaction/gen_fillpath_bank.cjs 離線產生）。
   ───────────────────────────────────────────────────────────────────
   【玩法】棋盤上有一些格子（不是每個位置都有，會有空洞），每種顏色有一個「起點」，**終點不告訴你**。
   手指從起點拖出一條路，上下左右一格一格走，不能重疊；要用幾條路（每種顏色一條）把**每一個格子都蓋滿**才過關。
   一筆填滿（blockfill）只有一個起點、一條路；多色填滿（multifill）有 2～4 個起點、2～4 條路，每條路各自在哪裡結束，要自己判斷。

   【出題】離線用電腦搜尋，專門找「人類最難解」的題目，做成題庫（fillpath_bank.js）：
     · 一個題目＝一塊區域（格子與空洞）＋起點們；保證有解（題庫產生時用解題器驗證過）；
     · 「難」的量法（V1.57.3.2，FP.human）：站在人類的立場沿著解走一遍——每一格前面有幾個方向（T 字、十字路口，包括走過的路把旁邊變成 T 字）、
       哪些錯的方向一眼看得出、哪些要細心數死巷才排除、哪些要走很多步才卡住；再加上終點藏了幾個、解很少（最好只有 1 種）；
     · 題庫分 10 個難度級（tier，只是產生時的分組）；遊戲每一關依 [第一關, 封頂] 的難度參數用 FP.select 從整個題庫挑最符合的題目，隨機翻轉旋轉（8 種）再給玩家。
   【判定】只看規則：每一格都被蓋到、每條路都從自己的起點出發，所以接法跟出題時的解不同也算過關。
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
    'use strict';
    var FP = {};

    /* ═══ 一、題目的格式 ═══
       一個題目用一個字串表示：每一列用 '/' 隔開，每個字元是一格：'#'＝有格子、'.'＝空洞（沒有格子）、'A'～'D'＝起點（A＝第 0 種顏色、B＝第 1 種…，那一格也是格子）。
       例如 '#A#/#.#/###' 是 3×3、中間有個洞、起點在最上面中間。 */
    /* 把字串轉成題目物件 { w, h, mask（每格 1＝有格子）, starts（每種顏色的起點格子編號；格子編號＝列 × w ＋ 欄）, k（顏色數）, tiles（格子數） } */
    FP.parse = function (str) {
        var rows = String(str).split('/'), h = rows.length, w = rows[0].length, mask = new Uint8Array(w * h), starts = [], tiles = 0, r, c;
        for (r = 0; r < h; r++) {
            for (c = 0; c < w; c++) {
                var ch = rows[r].charAt(c), i = r * w + c;
                if (ch === '#') { mask[i] = 1; tiles++; }
                else if (ch >= 'A' && ch <= 'D') { mask[i] = 1; tiles++; starts[ch.charCodeAt(0) - 65] = i; }
            }
        }
        return { w: w, h: h, mask: mask, starts: starts, k: starts.length, tiles: tiles };
    };
    /* 反過來：題目物件轉成字串 */
    FP.serialize = function (p) {
        var rows = [], r, c;
        for (r = 0; r < p.h; r++) {
            var s = '';
            for (c = 0; c < p.w; c++) { var i = r * p.w + c, j = p.starts.indexOf(i); s += !p.mask[i] ? '.' : (j >= 0 ? String.fromCharCode(65 + j) : '#'); }
            rows.push(s);
        }
        return rows.join('/');
    };
    /* 翻轉旋轉（t ＝ 0～7：0 不變；1～3 轉 90／180／270 度；4～7 先左右翻轉再轉）：回傳新題目（旋轉 90 度時寬高對調）。形狀、起點的相對位置不變，解法也一樣。 */
    FP.transform = function (p, t) {
        var flip = t >= 4, rot = t % 4, w = p.w, h = p.h, nw = rot % 2 ? h : w, nh = rot % 2 ? w : h, mask = new Uint8Array(nw * nh), map = [], r, c, i;
        for (r = 0; r < h; r++) for (c = 0; c < w; c++) {
            var cc = flip ? w - 1 - c : c, rr = r, nr, nc;       /* 先（可能）左右翻轉，再順時針轉 rot 次 90 度 */
            if (rot === 0) { nr = rr; nc = cc; }
            else if (rot === 1) { nr = cc; nc = h - 1 - rr; }
            else if (rot === 2) { nr = h - 1 - rr; nc = w - 1 - cc; }
            else { nr = w - 1 - cc; nc = rr; }
            map[r * w + c] = nr * nw + nc;
            if (p.mask[r * w + c]) mask[nr * nw + nc] = 1;
        }
        var starts = p.starts.map(function (s) { return map[s]; }), tiles = 0;
        for (i = 0; i < mask.length; i++) tiles += mask[i];
        return { w: nw, h: nh, mask: mask, starts: starts, k: starts.length, tiles: tiles };
    };

    /* ═══ 二、圖與解題器 ═══ */
    /* 區域的相鄰圖：g.nb[格子] ＝ 上右下左裡「也有格子」的鄰格；g.cells ＝ 所有有格子的格子編號 */
    FP.graph = function (p) {
        var w = p.w, h = p.h, N = w * h, nb = [], cells = [], i;
        for (i = 0; i < N; i++) {
            var a = [];
            if (p.mask[i]) {
                var r = (i / w) | 0, c = i % w;
                if (r > 0 && p.mask[i - w]) a.push(i - w);
                if (c < w - 1 && p.mask[i + 1]) a.push(i + 1);
                if (r < h - 1 && p.mask[i + w]) a.push(i + w);
                if (c > 0 && p.mask[i - 1]) a.push(i - 1);
                cells.push(i);
            }
            nb.push(a);
        }
        return { w: w, h: h, N: N, nb: nb, cells: cells };
    };

    /* 解題器：從各起點出發，每條路不重疊、可以在任何一格結束，要把每一格都蓋滿。回傳 { count 解的個數（最多數到 limit）, nodes 搜尋了幾個節點, aborted 搜尋量超過 budget 就中止, first 第一個解（每種顏色一條路：格子編號陣列，從起點開始）}。
       選項 opts：
         limit（最多數幾個解，預設 1）、budget（最多搜尋幾個節點，預設 100 萬）、
         level（剪枝強度：0 只擋「孤立的格子」、1 再加「死路格子太多」、2 再加「有一塊空地沒有任何線頭碰得到」；預設 2）——
               level 小＝像普通人那樣只看得到眼前的死路，搜尋量大，拿來量「人類要試幾次」；level 2＝解題器自己用的，很快、
         order（鄰格的試法：'fixed' 固定順序、'rand' 隨機、'warn' 往「之後出路最少」的鄰格走（Warnsdorff，聰明人的辦法）、'anti' 反過來）、rand（亂數函式）。
       做法：每次挑「可以走的鄰格最少」的那一條路往前走一格；一條路也可以在目前這格就結束（只有多條路時才需要試）。
       剪枝：每個還沒蓋到的格子至少要有一個能接的鄰格；只有一個能接的格子（死路）一定是某條路的終點，所以死路格子不能比「還在長的路」多；每一塊相連的空地都要有線頭碰得到。 */
    FP.solve = function (g, starts, opts) {
        opts = opts || {};
        var N = g.N, nb = g.nb, k = starts.length, cover = new Int8Array(N), head = new Int32Array(k), done = new Uint8Array(k), c, i;
        var limit = opts.limit || 1, budget = opts.budget || 1000000, level = opts.level === undefined ? 2 : opts.level, order = opts.order || 'fixed', rand = opts.rand || Math.random;
        var count = 0, nodes = 0, aborted = false, first = null, left = g.cells.length - k, cells = g.cells, paths = [];
        var tag = new Int32Array(N), stamp = 0, stack = new Int32Array(N);
        for (i = 0; i < N; i++) cover[i] = -1;
        for (c = 0; c < k; c++) {
            var init = opts.paths ? opts.paths[c] : [starts[c]];     /* opts.paths：從「已經畫了一部分」的狀態開始搜尋（每條路目前走過的格子）；opts.done：哪幾條路已經結束 */
            for (i = 0; i < init.length; i++) cover[init[i]] = c;
            head[c] = init[init.length - 1]; paths.push(init.slice()); left -= init.length - 1;
            if (opts.done && opts.done[c]) done[c] = 1;
        }
        var dep = 0, maxDep = 0;                                 /* 搜尋走到多深（從開始的狀態往前走了幾步）：量「走錯了要走多遠才會發現」 */
        /* 這一格（沒蓋到的）還有幾個能接的鄰格：沒蓋到的鄰格，或「還在長的路」的線頭 */
        function feasible() {
            var dead = 0, active = 0, u, q, d, x, a, ci;
            for (c = 0; c < k; c++) if (!done[c]) active++;
            for (ci = 0; ci < cells.length; ci++) {
                u = cells[ci]; if (cover[u] >= 0) continue;
                d = 0; a = nb[u];
                for (q = 0; q < a.length; q++) { x = a[q]; if (cover[x] < 0 || (!done[cover[x]] && head[cover[x]] === x)) d++; }
                if (d === 0) return false;
                if (d === 1 && level >= 1) { dead++; if (dead > active) return false; }
            }
            if (level >= 2) {
                stamp++;
                for (ci = 0; ci < cells.length; ci++) {
                    u = cells[ci]; if (cover[u] >= 0 || tag[u] === stamp) continue;
                    var sp = 0, touched = false; stack[sp++] = u; tag[u] = stamp;
                    while (sp) {
                        var y = stack[--sp], ay = nb[y];
                        for (q = 0; q < ay.length; q++) { x = ay[q]; if (cover[x] < 0) { if (tag[x] !== stamp) { tag[x] = stamp; stack[sp++] = x; } } else if (!done[cover[x]] && head[cover[x]] === x) touched = true; }
                    }
                    if (!touched) return false;
                }
            }
            return true;
        }
        function freeNb(h) { var r = [], a = nb[h]; for (var q = 0; q < a.length; q++) if (cover[a[q]] < 0) r.push(a[q]); return r; }
        function orderMoves(list) {
            if (list.length < 2 || order === 'fixed') return list;
            var j, t;
            if (order === 'rand') { for (var i2 = list.length - 1; i2 > 0; i2--) { j = (rand() * (i2 + 1)) | 0; t = list[i2]; list[i2] = list[j]; list[j] = t; } return list; }
            var keyed = list.map(function (v) { var n2 = 0, a = nb[v]; for (var q = 0; q < a.length; q++) if (cover[a[q]] < 0) n2++; return { v: v, n: n2 + rand() * 0.5 }; });
            keyed.sort(function (p, q2) { return order === 'warn' ? p.n - q2.n : q2.n - p.n; });
            return keyed.map(function (e) { return e.v; });
        }
        function rec() {
            if (aborted) return;
            if (++nodes > budget) { aborted = true; return; }
            if (dep > maxDep) maxDep = dep;
            if (left === 0) { count++; if (!first) first = paths.map(function (p) { return p.slice(); }); return; }
            if (!feasible()) return;
            var bc = -1, bm = null, col, fm;
            for (col = 0; col < k; col++) {
                if (done[col]) continue;
                fm = freeNb(head[col]);
                if (bm === null || fm.length < bm.length) { bm = fm; bc = col; if (fm.length <= 1) break; }
            }
            if (bc < 0) return;                                  /* 每條路都結束了、卻還有空格 → 這條路走不通 */
            if (bm.length === 0) { done[bc] = 1; rec(); done[bc] = 0; return; }
            var mv = orderMoves(bm.slice()), oldHead = head[bc];
            for (var m = 0; m < mv.length && !aborted && count < limit; m++) {
                var v = mv[m]; cover[v] = bc; head[bc] = v; left--; paths[bc].push(v);
                dep++; rec(); dep--;
                paths[bc].pop(); left++; head[bc] = oldHead; cover[v] = -1;
            }
            if (k > 1 && !aborted && count < limit) { done[bc] = 1; rec(); done[bc] = 0; }      /* 這一條就在這裡結束 */
        }
        if (opts.check) return { ok: left === 0 || feasible() };   /* 只檢查「現在這個狀態看得出錯嗎」（不搜尋） */
        rec();
        return { count: count, nodes: nodes, aborted: aborted, first: first, depth: maxDep };
    };

    /* ═══ 二之一、量題目的「結構」（V1.57.3.1：難度參數要量得出來才能調）═══
       analyze(題目, 解)：解＝每種顏色一條路（格子編號陣列，從起點開始），回傳這一題的結構數字（遊戲的難度參數、題庫產生器都用同一套）：
         lo／hi    最短／最長的一條路有幾格（含起點）；一筆填滿只有一條路，lo＝hi＝格子數
         bal       長短比＝最短 ÷ 最長（1＝一樣長；越小越不平均）
         tr        轉彎比例＝路上「方向有改變」的格子數 ÷ 路中間的格子數（0＝一直線、1＝每一格都轉）
         st        最長連續直線（格）：同一個方向連續走的格子數（含頭尾）
         jn        岔路口數＝區域裡有 3 或 4 個鄰格的格子數（走到這裡有得選）
         x4        十字路口數＝4 個鄰格都有格子的格子數
         co        走廊比例＝只有 2 個（或更少）鄰格的格子 ÷ 全部格子（越高越像一條沒得選的走廊）
         ch        選擇比例＝解的每一步裡，「前面有 2 個以上沒走過的出口」的步數 ÷ 總步數（越高越容易走錯）
         cr        交叉數＝每條路「起點→終點」的直線兩兩交叉的對數（路線互相穿插；一筆填滿只有一條路，所以是 0）
         sd        起點之間最短的曼哈頓距離（只有一個起點＝0）
         vd        空洞數＝棋盤格數 − 格子數 */
    function segCross(ax, ay, bx, by, cx, cy, dx, dy) {
        function o(px, py, qx, qy, rx, ry) { var v = (qx - px) * (ry - py) - (qy - py) * (rx - px); return v > 0 ? 1 : (v < 0 ? -1 : 0); }
        var o1 = o(ax, ay, bx, by, cx, cy), o2 = o(ax, ay, bx, by, dx, dy), o3 = o(cx, cy, dx, dy, ax, ay), o4 = o(cx, cy, dx, dy, bx, by);
        return o1 * o2 < 0 && o3 * o4 < 0;                /* 兩線段互相「穿過」（只碰到端點不算） */
    }
    function r2(x) { return Math.round(x * 100) / 100; }
    FP.analyze = function (p, paths) {
        var g = FP.graph(p), w = p.w, k = paths.length, i, j, t, lens = paths.map(function (a) { return a.length; });
        var lo = Math.min.apply(null, lens), hi = Math.max.apply(null, lens);
        var turns = 0, den = 0, st = 1, steps = 0, branch = 0;
        paths.forEach(function (pa, c) {
            var run = 1;
            for (t = 1; t < pa.length; t++) {
                var d = pa[t] - pa[t - 1];
                if (t >= 2) { if (d !== pa[t - 1] - pa[t - 2]) { turns++; run = 1; } den++; }
                run++; if (run > st) st = run;
            }
            for (t = 0; t < pa.length - 1; t++) {          /* 這一步之前有幾個出口：沒走過、也不是別條路的起點的鄰格 */
                var free = 0, a = g.nb[pa[t]];
                for (i = 0; i < a.length; i++) { var x = a[i]; if (pa.indexOf(x) > t) free++; else if (pa.indexOf(x) < 0 && p.starts.indexOf(x) < 0) free++; }
                steps++; if (free >= 2) branch++;
            }
        });
        var jn = 0, x4 = 0, cor = 0, t3 = 0, x4d = 0;
        g.cells.forEach(function (cell) {
            var dg = g.nb[cell].length, r = (cell / w) | 0, cc = cell % w, dia = 0;
            if (dg >= 3) jn++; if (dg === 3) t3++; if (dg <= 2) cor++;
            if (dg === 4) {                                /* 十字路口：再看斜方向（右上、左上、左下、右下）有沒有格子——都沒有的話，只有一條路能穿過，另外兩邊會變成死巷 */
                x4++;
                [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(function (d) { var rr = r + d[0], c2 = cc + d[1]; if (rr >= 0 && rr < p.h && c2 >= 0 && c2 < w && p.mask[rr * w + c2]) dia++; });
                if (dia > 0) x4d++;
            }
        });
        var cr = 0, ends = paths.map(function (pa) { return [pa[0], pa[pa.length - 1]]; });
        for (i = 0; i < k; i++) for (j = i + 1; j < k; j++) {
            var A = ends[i][0], B = ends[i][1], C = ends[j][0], D = ends[j][1];
            if (segCross(A % w, (A / w) | 0, B % w, (B / w) | 0, C % w, (C / w) | 0, D % w, (D / w) | 0)) cr++;
        }
        var sd = 0;
        if (k >= 2) { sd = 999; for (i = 0; i < k; i++) for (j = i + 1; j < k; j++) { var s1 = p.starts[i], s2 = p.starts[j], dd = Math.abs((s1 % w) - (s2 % w)) + Math.abs(((s1 / w) | 0) - ((s2 / w) | 0)); if (dd < sd) sd = dd; } }
        return { lo: lo, hi: hi, bal: r2(lo / hi), tr: den ? r2(turns / den) : 0, st: st, jn: jn, t3: t3, x4: x4, x4d: x4d, co: r2(cor / g.cells.length), ch: steps ? r2(branch / steps) : 0, cr: cr, sd: sd, vd: p.w * p.h - p.tiles };
    };

    /* ═══ 二之二、站在人類的立場走一遍（V1.57.3.2：玩家指出「難在 T 字路口」）═══
       人類怎麼解（玩家的觀察）：
         ① 先找終點：只有一邊跟別的格子相接的格子（死巷）一定是某條路的終點；多色填滿裡，死巷比起點少，就有終點「藏起來」，玩家很困擾；
         ② 只有兩邊相接的格子最好判斷（進來一邊、出去另一邊，沒得選）；
         ③ 難的是 T 字路口（三邊相接）與十字路口：要選往哪走。而且 T 字路口不只出現在題目一開始——走過的路會把旁邊的格子「變成」T 字路口；
         ④ 人類會避免把空格變成「只剩一邊相接」的死巷（那就卡死了）；發現出現死巷就知道錯了，但不一定知道該從哪裡改。
       所以這裡模擬一個人：沿著正確的解一步一步畫，站在路上的每一格問三個問題：
         ⓐ 路口：前面有幾個空格可以走？（≥ 2 就是 T 字或十字路口——包括「走過的路把旁邊變成 T 字」的情況）
         ⓑ 一眼看得出錯嗎？走了之後，剛走過的兩格旁邊有空格被完全圍死（沒有相接），或新的線頭旁邊有 2 格「只能靠線頭進去」（不可能兩格都走到）——這些人一眼就看得出來；
            但「身後」的格子變成死巷（例如參考題 Level 2：起點往左之後，往下、往左都會讓上面那格變成死巷），人常常沒注意到，所以不算一眼看得出；
         ⓒ 細心想得出錯嗎？再加上「全盤數死巷」：每個只剩一邊相接的空格都一定是終點，所以死巷不能比還在畫的路多（解題器的 level 1）。
         · 多色填滿還可以「在這裡結束這條路」，也算一個方向（結束後線頭旁邊的空格沒有被圍死才算看不出錯）；
         · 好幾條路時，人會先畫「沒得選」的那條，所以每一步挑「看不出錯的方向最少」的那條路；
         · 一眼看不出錯的方向 ≥ 2 → **抉擇點**。每個錯的方向，用 level 1 的搜尋量「要試多少步才會發現錯」（cost）與「最遠能走幾步才卡住」（陷阱深度）。
       回傳：
         raw    路口數：路上前面有 2 個以上空格（或可以結束）的格子數；rawBits＝這些路口方向數相乘取 log2
         dec    抉擇點數：一眼看不出錯的方向 ≥ 2 的格子數；d3＝其中 ≥ 3 個方向的；bits＝方向數相乘取 log2（bits 10 ≈ 1024 種組合）
         guess  連細心的人（全盤數死巷）都還有 2 個以上方向的格子數（真的要猜）
         deep   深陷阱數：錯的方向裡，要走 3 步以上才會卡住的個數（「知道錯了但不知道哪裡錯」）；trap＝最深的陷阱走幾步
         hx     人類試錯量：每一步算 1，加上每個抉擇點的每個錯方向「一半的機會先試到它 × 試多少步才發現錯」（越大越難）
         vis    看得出的終點數：一開始就只有一邊相接的格子（起點不算）；hid＝藏起來的終點數＝路數 − vis（0 以下算 0）
       opts.detail＝true 時，多回傳 steps：每個路口的位置與每個方向的情況（給研究筆記用）。 */
    FP.human = function (p, sol, opts) {
        opts = opts || {};
        var g = FP.graph(p), k = p.k, budget = opts.budget || 20000, w = p.w, N = p.w * p.h, c, i;
        var paths = [], done = [], pos = [], cover = new Int8Array(N), left = g.cells.length - k;
        for (i = 0; i < N; i++) cover[i] = -1;
        for (c = 0; c < k; c++) { paths.push([p.starts[c]]); done.push(0); pos.push(0); cover[p.starts[c]] = c; }
        var heads = function () { return paths.map(function (a) { return a[a.length - 1]; }); };
        /* 空格 x 現在有幾個能接的：沒蓋到的鄰格，或還在畫的線頭 */
        function deg(x, hs) { var a = g.nb[x], d = 0; for (var q = 0; q < a.length; q++) { var y = a[q]; if (cover[y] < 0) d++; else if (!done[cover[y]] && hs[cover[y]] === y) d++; } return d; }
        /* ⓑ 一眼看得出錯嗎（只看剛走過的地方）：hd＝原來的線頭、v＝新的線頭（結束這條路時 v＝−1） */
        function obviousBad(hd, v) {
            var hs = heads(), ring = g.nb[hd].concat(v >= 0 ? g.nb[v] : []), q, x, single = 0;
            for (q = 0; q < ring.length; q++) { x = ring[q]; if (cover[x] < 0 && deg(x, hs) === 0) return true; }
            if (v >= 0) { var a = g.nb[v]; for (q = 0; q < a.length; q++) { x = a[q]; if (cover[x] < 0 && deg(x, hs) === 1) single++; } if (single >= 2) return true; }
            if (left === 0) return false;
            for (q = 0; q < k; q++) if (!done[q]) return false;
            return true;                                               /* 每條路都結束了、卻還有空格 */
        }
        /* 某個方向（移動到 v、或結束）試著做下去，回傳 { seen 一眼看得出錯, careful 細心想得出錯 }，然後還原 */
        function probe(col, op) {
            var pa = paths[col], hd = pa[pa.length - 1], res;
            if (op.end) { done[col] = 1; res = { seen: obviousBad(hd, -1), careful: !FP.solve(g, p.starts, { paths: paths, done: done, check: true, level: 1 }).ok }; done[col] = 0; }
            else { cover[op.v] = col; pa.push(op.v); left--; res = { seen: obviousBad(hd, op.v), careful: !FP.solve(g, p.starts, { paths: paths, done: done, check: true, level: 1 }).ok }; left++; pa.pop(); cover[op.v] = -1; }
            return res;
        }
        /* 這條路現在的所有方向（前面的空格；多色填滿再加上「結束」） */
        function options(col) {
            var pa = paths[col], hd = pa[pa.length - 1], a = g.nb[hd], list = [], q;
            for (q = 0; q < a.length; q++) if (cover[a[q]] < 0) list.push({ v: a[q] });
            if (k > 1) list.push({ end: true });
            list.forEach(function (op) { var r = probe(col, op); op.seen = r.seen; op.careful = r.careful || r.seen; });
            return list;
        }
        function correct(col) { return pos[col] < sol[col].length - 1 ? { v: sol[col][pos[col] + 1] } : { end: true }; }
        function same(a, b) { return a.end ? !!b.end : (!b.end && a.v === b.v); }
        var raw = 0, rawBits = 0, dec = 0, d3 = 0, bits = 0, guess = 0, deep = 0, trap = 0, hx = left, steps = [];
        while (left > 0) {
            var col = -1, best = null, bestN = 99;
            for (c = 0; c < k; c++) {
                if (done[c]) continue;
                var o = options(c), n = o.filter(function (op) { return !op.seen; }).length;
                if (n < bestN) { best = o; col = c; bestN = n; }
                if (n <= 1) break;
            }
            if (col < 0) break;
            var corr = correct(col), live = best.filter(function (op) { return !op.seen; }), nRaw = best.filter(function (op) { return !op.end || !op.seen; }).length;
            var nCare = best.filter(function (op) { return !op.careful; }).length;
            if (nRaw >= 2) { raw++; rawBits += Math.log(nRaw) / Math.LN2; }
            if (nCare >= 2) guess++;
            var hd = paths[col][paths[col].length - 1], rec = { cell: hd, r: (hd / w) | 0, c: hd % w, col: col, raw: nRaw, n: live.length, care: nCare, opts: [] };
            if (live.length >= 2) {
                dec++; if (live.length >= 3) d3++; bits += Math.log(live.length) / Math.LN2;
                live.forEach(function (op) {
                    if (same(op, corr)) { rec.opts.push({ end: !!op.end, v: op.v, ok: true }); return; }
                    var r = FP.solve(g, p.starts, op.end ? { paths: paths, done: withEnd(col), limit: 1, budget: budget, level: 1 } : { paths: withMove(col, op.v), done: done, limit: 1, budget: budget, level: 1 });
                    var cost = r.aborted ? budget * 1.5 : r.nodes, depth = r.depth + (op.end ? 0 : 1);
                    if (r.count > 0) { rec.opts.push({ end: !!op.end, v: op.v, alt: true, cost: cost }); return; }   /* 走這個方向也有解（題目不只一種解） */
                    hx += 0.5 * cost; if (depth >= 3) deep++; if (depth > trap) trap = depth;
                    rec.opts.push({ end: !!op.end, v: op.v, cost: cost, depth: depth, careful: op.careful });
                });
            }
            best.forEach(function (op) { if (op.seen && !op.end) rec.opts.push({ v: op.v, seen: true }); });
            if (opts.detail && nRaw >= 2) steps.push(rec);
            if (corr.end) done[col] = 1;
            else { paths[col].push(corr.v); cover[corr.v] = col; pos[col]++; left--; }
        }
        function withMove(col, v) { var pp = paths.map(function (a) { return a.slice(); }); pp[col].push(v); return pp; }
        function withEnd(col) { var dd = done.slice(); dd[col] = 1; return dd; }
        var vis = 0;
        g.cells.forEach(function (x) { if (g.nb[x].length === 1 && p.starts.indexOf(x) < 0) vis++; });
        var out = { raw: raw, rawBits: Math.round(rawBits * 10) / 10, dec: dec, d3: d3, bits: Math.round(bits * 10) / 10, guess: guess, deep: deep, trap: trap, hx: Math.round(hx), vis: vis, hid: Math.max(0, k - vis) };
        if (opts.detail) out.steps = steps;
        return out;
    };

    /* ═══ 三、玩家畫線的規則（跟接電線很像）═══
       state：{ p 題目, g 相鄰圖, cover[格子] ＝ 蓋住那格的顏色（沒有＝−1；起點一開始就蓋著自己的顏色）, paths[顏色] ＝ 這條路走過的格子（從起點開始，一開始只有起點） } */
    FP.newState = function (p) {
        var g = FP.graph(p), cover = new Int8Array(p.w * p.h), paths = [], c, i;
        for (i = 0; i < cover.length; i++) cover[i] = -1;
        for (c = 0; c < p.starts.length; c++) { cover[p.starts[c]] = c; paths.push([p.starts[c]]); }
        return { p: p, g: g, cover: cover, paths: paths };
    };
    /* 手指在格子 cell 按下：回傳這一筆畫的顏色（−1＝按在空格或空洞，不能開始）。
       按在起點：這條路整條收回、從起點重新開始；按在這條路中間的某一格：那一格之後的路收回、從這裡接著畫；按在最前端：接著畫。 */
    FP.startDraw = function (st, cell) {
        var c = st.cover[cell];
        if (c < 0) return -1;
        var path = st.paths[c], idx = path.indexOf(cell);
        if (idx < 0) return -1;
        while (path.length > idx + 1) st.cover[path.pop()] = -1;
        return c;
    };
    /* 這一筆畫（顏色 c）拖到格子 cell：回傳 'add'（往沒蓋到的格子走一步）／'back'（拖回上一格＝收回最後一格）／null（不動：不相鄰、被擋住、是空洞） */
    FP.applyDrag = function (st, c, cell) {
        var path = st.paths[c], head = path[path.length - 1];
        if (path.length >= 2 && cell === path[path.length - 2]) { st.cover[path.pop()] = -1; return 'back'; }
        if (!st.p.mask[cell] || st.cover[cell] >= 0) return null;
        if (st.g.nb[head].indexOf(cell) < 0) return null;
        st.cover[cell] = c; path.push(cell);
        return 'add';
    };
    /* 全部清掉，回到一開始（只剩起點） */
    FP.reset = function (st) {
        for (var c = 0; c < st.paths.length; c++) { while (st.paths[c].length > 1) st.cover[st.paths[c].pop()] = -1; }
    };
    /* 已經蓋到的格子數 */
    FP.filled = function (st) { var f = 0; for (var i = 0; i < st.cover.length; i++) if (st.cover[i] >= 0) f++; return f; };
    /* 過關：每一格都蓋到了 */
    FP.isSolved = function (st) { return FP.filled(st) === st.p.tiles; };

    /* ═══ 四、題庫 ═══
       global.FM_FILLPATH_BANK（js/fillpath_bank.js）：{ block: [第 0 級的題目們, 第 1 級…], multi: […] }，每一題 { s: 題目字串, c: 解數（最多數到 3）, e: 人類試錯量（FP.human 的 hx，越大越難）, t: 格子數, k: 起點數,
       m: 結構數字（lo／hi 最短最長路、t3 T 字格、x4／x4d 十字格（斜方向有格子的）＝FP.analyze；raw 路口、dec／d3 抉擇點、bits 組合、guess 要猜、deep 深陷阱、trap 最深陷阱、hid 藏起來的終點＝FP.human）}。
       遊戲挑題用 FP.select（依難度參數，見第五節）；FP.pick（依級數隨機挑）留給測試與簡單用途。 */
    FP.TIERS = 13;                                      /* 難度級數（0～12；V1.57.3.2 玩家把格子數封頂調到 72，多了 3 級大棋盤） */
    FP.bank = function () { return global.FM_FILLPATH_BANK || { block: [], multi: [] }; };
    /* 第 level 關對應第幾級（0～TIERS−1）：線性，到 rampLevels 關到頂 */
    FP.tierFor = function (level, rampLevels) {
        var t = Math.round((Math.max(1, level) - 1) / Math.max(1, rampLevels - 1) * (FP.TIERS - 1));
        return Math.max(0, Math.min(FP.TIERS - 1, t));
    };
    /* 從題庫挑一題（kind＝'block' 或 'multi'；tier＝級數；rand＝亂數），隨機翻轉旋轉，回傳 { p 題目物件, s 原字串, c 解數, e 效果, t 用了哪一種翻轉旋轉, tier, idx 是第幾題 } */
    FP.pick = function (kind, tier, rand, avoid) {
        rand = rand || Math.random;
        var banks = FP.bank()[kind];
        if (!banks || tier < 0 || tier >= FP.TIERS) return null;
        var list = banks[tier] || [], d;
        for (d = 1; !list.length && d < FP.TIERS; d++) list = (banks[tier - d] && banks[tier - d].length) ? banks[tier - d] : (banks[tier + d] || []);   /* 這一級的題庫是空的（不該發生）：借最近的一級 */
        if (!list.length) return null;
        var idx = Math.floor(rand() * list.length), tries = 0;
        while (avoid != null && idx === avoid && list.length > 1 && tries++ < 8) idx = Math.floor(rand() * list.length);   /* 盡量不要連續兩關出同一題 */
        var e = list[idx], t = Math.floor(rand() * 8);
        return { p: FP.transform(FP.parse(e.s), t), s: e.s, c: e.c, e: e.e, t: t, tier: tier, idx: idx };
    };

    /* ═══ 五、依「難度參數」挑題（V1.57.3.1；V1.57.3.2 改用人類視角的數字）═══
       題庫每一題都附著結構數字 m（見第四節）。遊戲不再「這一關第幾級就從那一級隨便挑」，而是每一關算出一組「想要的樣子」，從整個題庫挑最符合的：
         want = { tiles 想要的格子數, e 想要的人類試錯量（越大越難）, k 想要的路數,
                  min: { 結構數字的名字: 至少要這麼多 }（例如 raw 路口、guess 要猜的路口、deep 深陷阱、hid 藏起來的終點、lo 最短路、t3 T 字格）,
                  max: { 結構數字的名字: 最多這麼多 }（例如 hi 最長路、trap 最深陷阱、hid 藏起來的終點）,
                  sol 解數上限 }
       評分（越小越好）：違反「至少／最多」的程度 × 8（相對差距：差多少 ÷ 門檻；「最多 0 個」差 1 個算 1）＋ 離想要的格子數／難度／路數多遠。
       題庫是有限的：條件太嚴、題庫裡沒有題目全部符合時，就挑「違反最少」的；條件寬鬆時，離想要的樣子最近的幾題裡隨機挑一題，並盡量不連續出同一題。
       回傳 { p 題目物件（隨機翻轉旋轉過）, s 原字串, c 解數, e 難度, m 結構, t 用了哪一種翻轉旋轉, tier 題庫的級數, idx 第幾題, score 評分, viol 違反程度 }；題庫是空的回傳 null。 */
    FP.violation = function (e, want) {
        var v = 0, key, t, x;
        for (key in (want.min || {})) { t = want.min[key]; x = e.m[key]; if (t > 0 && x < t) v += (t - x) / t; }
        for (key in (want.max || {})) { t = want.max[key]; x = e.m[key]; if (t >= 0 && x > t) v += (x - t) / Math.max(t, 1); }   /* 「最多 0 個」也算數（例如終點一個都不藏） */
        if (want.sol && e.c > want.sol) v += (e.c - want.sol) * 0.5;
        return v;
    };
    FP.select = function (kind, want, rand, avoid) {
        rand = rand || Math.random;
        var banks = FP.bank()[kind], cand = [], n = 0;
        if (!banks) return null;
        banks.forEach(function (list, tier) {
            list.forEach(function (e) {
                var viol = FP.violation(e, want);
                var close = Math.abs(e.t - want.tiles) / 4 + Math.abs(Math.log(1 + e.e) - Math.log(1 + want.e)) / 0.5 + (want.k ? Math.abs(e.k - want.k) * 1.2 : 0);
                cand.push({ e: e, tier: tier, idx: n++, viol: viol, score: viol * 8 + close });
            });
        });
        if (!cand.length) return null;
        cand.sort(function (a, b) { return a.score - b.score; });
        var best = cand[0].score, pool = cand.filter(function (c, i) { return i < 6 && c.score <= best + 0.6; });
        if (pool.length > 1 && avoid != null) { var other = pool.filter(function (c) { return c.idx !== avoid; }); if (other.length) pool = other; }   /* 盡量不要連續兩關出同一題 */
        var c = pool[Math.floor(rand() * pool.length)], p0 = FP.parse(c.e.s), t = Math.floor(rand() * 8);
        if (p0.w !== p0.h && (t % 2 === 1) === (p0.w < p0.h)) t ^= 1;   /* 不是正方形的棋盤一律轉成「直的」（手機是直的，格子才大；t 是奇數＝轉 90／270 度、寬高對調） */
        return { p: FP.transform(p0, t), s: c.e.s, c: c.e.c, e: c.e.e, m: c.e.m, t: t, tier: c.tier, idx: c.idx, score: c.score, viol: c.viol };
    };

    global.Reaction = global.Reaction || {};
    global.Reaction.fillPath = FP;
})(window);
