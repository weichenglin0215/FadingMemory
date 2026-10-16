/* ═══════════════════════════════════════════════════════════════════
   reaction_ghostleg.js — 秒反應・鬼腳圖
   台灣童玩「阿彌陀佛」鬼腳圖：5 條直線、一堆橫線；上方有一個「起點」、下方有一個「終點」（都是綠底黑字），
   但照著現有的橫線走，從起點走不到終點。玩家要「畫上一條橫線」，讓起點接到終點。關卡制，成績＝通過關數。
   ───────────────────────────────────────────────────────────────────
   · V1.28（玩家意見）整個改玩法（以前是手指沿著線描一遍）：
       - 題目一開始就標出起點與終點（綠底黑字），現有的線走不到終點；
       - 玩家用手指先按住某一條直線，再往左或往右拖到相鄰的直線，就畫上一條很粗的藍色橫線
         （從按下的位置畫到隔壁那條直線；只有一次機會；拖到一半放開＝取消，可以重畫）；
       - 畫好之後開始「評審動畫」：從起點開始畫出一條綠色粗虛線，經過每個轉折點，看看最後能不能抵達終點，抵達就過關；
       - 操作提示改成鉛筆圖示畫出一條藍色水平橫線（取消手指圖示）。
   · 5 條直線 × ROWS 層；橫線連接相鄰兩條直線，同一層的橫線不可相鄰（不然路徑不明確）；
     現有橫線總數 RUNGS 4→24（線性）。玩家畫的橫線會貼齊到最近的一層（snapRow），那一層的那個位置要是空的（canPlace）。
   · V1.32（玩家意見：難度太低，橫線密集堆在同一欄之間；正確路線應該經過甲乙丙丁戊五條直線、橫線平均分布；
     難度在於「不容易看出轉折點」；正確橫線的上下要留出空間，避免手指誤畫）出題改成「先定路線、再撒橫線」：
       1. 先隨機決定一條「正確路線」：從起點走過 VISIT（3→5）條不同的直線、共轉 TURNS（3→7）次彎（5＝甲乙丙丁戊全部都經過），
          每個轉彎各占一層，平均分散在整張圖上；其中一個轉彎就是玩家要畫的那一條，其他的轉彎先畫好。
       2. 其餘的橫線（湊滿 RUNGS 條）平均撒在四個「縫」（相鄰兩條直線之間）：各縫的橫線數最多差 1 條；挑橫線最少的那一層、離同一條直線上其他橫線最遠的位置放，
          而且不碰到正確路線走過的直線（不會擋住路線，只是用來混淆，讓人不容易看出轉折點）。
       3. 玩家要畫的位置，上下 SOL_GAP 層以內、跟它相接的兩條直線上都不放其他橫線（留出空間，手指不容易畫錯）。
       4. 驗證（窮舉）：現有的橫線走不到終點；畫對的位置數在 1～MAX_SOL 之間（第 1 關可以多一點、越後面越少）；
          每一種畫對的位置，畫上去之後的路線都經過 VISIT 條以上的直線、而且上下都留得出空間。
          RUNGS 太大（ROWS 太少）放不下時，會自動少放幾條（出題記錄會顯示實際放了幾條）。
   · 限時 TIME_S 40→25 秒。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'ghostleg';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 30 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 30;                       /* 幾關之後難度到頂（也是最後一關） */
    var COLS = 5, ROWS = 12;                    /* 直線數、層數 */
    var X0 = 52, DX = 92, Y_TOP = 76, Y_BOT = 520;   /* 第 1 條直線的 x、直線間距、上下端 y（舞台座標） */
    var RUNGS = [4, 24];                        /* 現有橫線數：第 1 關 → 到頂 */
    var MAX_SOL = [8, 2];                       /* 「畫哪裡才對」的位置數上限：第 1 關 → 到頂（越後面越少種畫法） */
    var VISIT = [3, 5];                         /* 正確路線（畫對之後的路線）要經過幾條不同的直線：第 1 關 → 到頂（5＝甲乙丙丁戊全部都經過） */
    var TURNS = [3, 7];                         /* 正確路線轉幾次彎（含玩家要畫的那一條）：第 1 關 → 到頂，轉彎越多越不容易看出轉折點 */
    var DENSITY_MAX = 1.5;                      /* 橫線數上限 ＝ 層數 × 這個值（每一層平均最多幾條）：太多會放不下（要留白、又不能擋住正確路線），RUNGS 設得比這個大會自動壓低 */
    var SOL_GAP = 2;                            /* 玩家要畫的位置，跟它相接的兩條直線上，上下幾層以內不放其他橫線（2＝上下各空 1 層；1＝不特別空出來） */
    var TIME_S = [30, 60];                      /* 每關限時（秒） */
    var TOUCH_X = 30;                           /* 手指按在直線的左右多遠以內，算按到那條直線（px） */
    var DRAG_MIN = 14;                          /* 往左右拖超過多遠，才決定要往哪邊畫（px） */
    var JOIN_FRAC = 0.8;                        /* 拖到隔壁直線的幾成距離，就算接上了 */
    var ROUTE_MS = [1500, 3200];                /* 評審動畫（畫出綠色虛線）的時間範圍 */
    var HOLD_MS = 2000;                         /* 動畫畫完後停多久才進下一關／結算 */
    var LABELS = ['甲', '乙', '丙', '丁', '戊'];

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function colX(c) { return X0 + c * DX; }
    function rowY(r) { return Y_TOP + (r + 0.5) * (Y_BOT - Y_TOP) / ROWS; }
    /* y 座標最近的一層（0～ROWS−1） */
    function snapRow(y) { return kit.clamp(Math.round((y - Y_TOP) * ROWS / (Y_BOT - Y_TOP) - 0.5), 0, ROWS - 1); }
    function rungCap() { return Math.floor(ROWS * DENSITY_MAX); }
    function rungCount(level) { return Math.min(rungCap(), Math.round(kit.ramp(level, RUNGS[0], RUNGS[1], RAMP_LEVELS))); }
    function maxSolAt(level) { return Math.max(1, Math.round(kit.ramp(level, MAX_SOL[0], MAX_SOL[1], RAMP_LEVELS))); }
    function timeMs(level) { return Math.round(kit.ramp(level, TIME_S[0], TIME_S[1], RAMP_LEVELS) * 1000); }
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
        var s = rungSet(rungs);
        return !s[row + ',' + col] && !s[row + ',' + (col - 1)] && !s[row + ',' + (col + 1)];
    }
    /* 玩家能畫的每一條橫線（row, col），以及畫上去之後從 start 走到哪一欄 */
    function placements(rungs, start) {
        var out = [];
        for (var r = 0; r < ROWS; r++) for (var c = 0; c <= COLS - 2; c++) {
            if (!canPlace(rungs, r, c)) continue;
            out.push({ row: r, col: c, end: follow(rungs.concat([{ row: r, col: c }]), start).end });
        }
        return out;
    }
    function visitAt(level) { return Math.round(kit.ramp(level, VISIT[0], VISIT[1], RAMP_LEVELS)); }
    function turnsAt(level) { return Math.round(kit.ramp(level, TURNS[0], TURNS[1], RAMP_LEVELS)); }
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
    /* 試著出一題（先定路線、再撒橫線）：n＝現有橫線數，limit＝畫對的位置數上限，vNeed＝正確路線至少經過幾條直線；失敗回傳 null */
    function buildLevel(level, n, limit, vNeed, rand) {
        var start = kit.randInt(0, COLS - 1, rand), walk = makeWalk(start, vNeed, turnsAt(level), rand);
        if (!walk) return null;
        var m = walk.length - 1;
        if (m > ROWS || m - 1 > n) return null;
        var rows = spreadRows(m, rand);
        if (!rows) return null;
        var cand = [];                                                              /* 玩家要畫的那一個轉彎：跟前後的轉彎都隔至少 SOL_GAP 層 */
        for (var j = 0; j < m; j++) if ((j === 0 || rows[j] - rows[j - 1] >= SOL_GAP) && (j === m - 1 || rows[j + 1] - rows[j] >= SOL_GAP)) cand.push(j);
        if (!cand.length) return null;
        var sj = kit.pick(cand, rand), turns = rows.map(function (r, i) { return { row: r, col: Math.min(walk[i], walk[i + 1]) }; });
        var sol = turns[sj], rungs = turns.filter(function (g, i) { return i !== sj; });
        var colAt = [], r, i2;                                                      /* 正確路線在每一層（轉彎之前）在哪一條直線上 */
        for (r = 0; r < ROWS; r++) { var passed = 0; for (i2 = 0; i2 < m; i2++) if (rows[i2] < r) passed++; colAt.push(walk[passed]); }
        var rowLoad = []; for (r = 0; r < ROWS; r++) rowLoad.push(0);
        rungs.forEach(function (g) { rowLoad[g.row]++; });
        while (rungs.length < n) {
            var cnt = gapCounts(rungs), cands = [];
            for (r = 0; r < ROWS; r++) for (var g = 0; g <= COLS - 2; g++) {
                if (!canPlace(rungs, r, g) || g === colAt[r] || g + 1 === colAt[r]) continue;      /* 不碰到正確路線走的直線（不擋路線） */
                if (Math.abs(r - sol.row) < SOL_GAP && g >= sol.col - 1 && g <= sol.col + 1) continue;   /* 玩家要畫的位置上下留白 */
                cands.push({ row: r, col: g });
            }
            if (!cands.length) return null;
            var minG = Math.min.apply(null, cands.map(function (x) { return cnt[x.col]; }));
            cands = cands.filter(function (x) { return cnt[x.col] === minG; });                  /* 四個縫的橫線數最多差 1 條 */
            cands.forEach(function (x) {
                var near = ROWS;
                rungs.forEach(function (o) { if (o.col >= x.col - 1 && o.col <= x.col + 1) near = Math.min(near, Math.abs(o.row - x.row)); });
                x.key = rowLoad[x.row] * 100 - Math.min(near, 5) * 10 + rand();                    /* 先挑橫線最少的那一層、再挑離同一條直線上其他橫線最遠的 */
            });
            cands.sort(function (u, v) { return u.key - v.key; });
            var pk = cands[0]; rungs.push({ row: pk.row, col: pk.col }); rowLoad[pk.row]++;
        }
        var f0 = follow(rungs, start), full = rungs.concat([sol]), f1 = follow(full, start), target = f1.end;
        if (target === f0.end || visitedCols(full, start).length < vNeed) return null;
        var sols = placements(rungs, start).filter(function (p) { return p.end === target; }).map(function (p) { return { row: p.row, col: p.col }; });
        if (!sols.length || sols.length > limit) return null;
        if (crowded(rungs, sol.row, sol.col) || !sols.some(function (p) { return p.row === sol.row && p.col === sol.col; })) return null;      /* 原本設計的那個位置（上下留白）一定要在解答裡 */
        var cc = gapCounts(rungs);
        if (Math.max.apply(null, cc) - Math.min.apply(null, cc) > 1) return null;
        return { rungs: rungs, start: start, target: target, end0: f0.end, solutions: sols };
    }
    /* 出題：回傳 { rungs, start, target（終點欄）, end0（現有橫線走到的欄）, solutions: [{row, col}] }。
       target ≠ end0（現有的線走不到終點）；畫哪裡才對的位置數在 1～maxSolAt(level) 之間；正確路線經過 visitAt(level) 條以上的直線。
       橫線數先照參數試，找不到才逐步放寬（位置數上限、經過的直線數）；真的放不下才一條一條少放（DENSITY_MAX 已經把橫線數壓在放得下的範圍，通常用不到）。 */
    var TRIES_STAGE = 60;
    function makeLevel(level, rand) {
        rand = rand || Math.random;
        var limit = maxSolAt(level), want = rungCount(level), v0 = visitAt(level);
        var relax = [[v0, limit, 150], [v0, limit + 2, TRIES_STAGE], [v0 - 1, limit + 2, TRIES_STAGE], [v0 - 2, limit + 4, TRIES_STAGE]];
        for (var nn = want; nn >= Math.max(1, want - 14); nn--) {
            for (var st = 0; st < relax.length; st++) {
                for (var tries = 0; tries < relax[st][2]; tries++) {
                    var lv = buildLevel(level, nn, relax[st][1], Math.max(2, relax[st][0]), rand);
                    if (lv) return lv;
                }
            }
        }
        var r0 = [{ row: 4, col: 2 }], f0 = follow(r0, 0);                          /* 保底：很簡單的一題（現有 1 條橫線，把起點接到隔壁） */
        return { rungs: r0, start: 0, target: 1, end0: f0.end, solutions: placements(r0, 0).filter(function (p) { return p.end === 1; }).map(function (p) { return { row: p.row, col: p.col }; }) };
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
    /* 評審動畫花多久：路線越長越久（每 px 約 2.4 毫秒），夾在 ROUTE_MS 範圍內 */
    function routeMs(route) { return Math.round(kit.clamp(routeLength(route) * 2.4, ROUTE_MS[0], ROUTE_MS[1])); }
    function rating(n) {
        if (n >= 15) return '鬼腳圖大師！全部通關！';
        if (n >= 10) return '高手！';
        if (n >= 6) return '不錯喔！';
        if (n >= 3) return '再接再厲！';
        return '想一想橫線要畫在哪裡，再來一次！';
    }

    function mount(root, ctx) {
        /* V1.28 起鬼腳圖整個改玩法（畫一條橫線把起點接到終點；以前是手指沿線描），舊版的最佳紀錄不能比：第一次進來清掉（只清一次） */
        Reaction.migrateBest(ID, function () { return null; }, '.v128');
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
        console.log('[鬼腳圖] 第 ' + level + ' 關：現有橫線 ' + q.rungs.length + ' 條；起點 ' + LABELS[q.start] + '、終點 ' + (q.target + 1) + '（現有的線走到 ' + (q.end0 + 1) + '）；畫對的位置 ' + q.solutions.length + ' 種：' + q.solutions.map(function (s) { return '第 ' + (s.row + 1) + ' 層第 ' + (s.col + 1) + '～' + (s.col + 2) + ' 欄'; }).join('、') + '；正確路線經過 ' + visitedCols(q.rungs.concat([q.solutions[0]]), q.start).map(function (x) { return LABELS[x]; }).join('') + '；各縫橫線數 ' + gapCounts(q.rungs).join(',') + '；限時 ' + timeMs(level) + ' ms');

        var W = stage.clientWidth || 472, H = stage.clientHeight || 640;
        var svg = kit.svg('svg', { 'class': 'gl-svg', viewBox: '0 0 ' + W + ' ' + H, width: W, height: H }, stage);
        var c;
        for (c = 0; c < COLS; c++) kit.svg('line', { x1: colX(c), x2: colX(c), y1: Y_TOP, y2: Y_BOT, 'class': 'gl-col' }, svg);
        q.rungs.forEach(function (g) { kit.svg('line', { x1: colX(g.col), x2: colX(g.col + 1), y1: rowY(g.row), y2: rowY(g.row), 'class': 'gl-rung' }, svg); });
        var gUser = kit.svg('g', {}, svg), gRoute = kit.svg('g', {}, svg), gHint = kit.svg('g', {}, svg);
        var endBoxes = [];
        for (c = 0; c < COLS; c++) {
            kit.svg('circle', { cx: colX(c), cy: Y_TOP - 28, r: 22, 'class': 'gl-token' + (c === q.start ? ' gl-token--go' : '') }, svg);
            var t1 = kit.svg('text', { x: colX(c), y: Y_TOP - 20, 'text-anchor': 'middle', 'class': 'gl-label' }, svg); t1.textContent = LABELS[c];
            endBoxes.push(kit.svg('rect', { x: colX(c) - 22, y: Y_BOT + 8, width: 44, height: 44, rx: 8, 'class': 'gl-end' + (c === q.target ? ' gl-end--go' : '') }, svg));
            var t2 = kit.svg('text', { x: colX(c), y: Y_BOT + 40, 'text-anchor': 'middle', 'class': 'gl-label' }, svg); t2.textContent = String(c + 1);
        }
        var msg = h('div', { 'class': 'gl-msg', text: '照現有的線走不到終點！按住一條直線、往旁邊拖，畫上一條橫線' });
        stage.appendChild(msg);

        /* 操作提示（只在第一次進遊戲時）：鉛筆圖示在「正確位置」畫出一條藍色水平橫線，重複播放（沒有手指圖示）；玩家一按下去就消失 */
        var hintOn = false, pencil = null;
        if (level === 1 && kit.once('ghostleg.hint') && q.solutions.length) {
            var sol = q.solutions[0], hy = rowY(sol.row), hx1 = colX(sol.col), hx2 = colX(sol.col + 1);
            var hl = kit.svg('line', { x1: hx1, y1: hy, x2: hx1, y2: hy, 'class': 'gl-user gl-user--hint' }, gHint);
            pencil = h('div', { 'class': 'gl-pencil', text: String.fromCodePoint(0x270F) + String.fromCodePoint(0xFE0F) });
            stage.appendChild(pencil);
            hintOn = true;
            var t0h = performance.now();
            my.loop(function (now) {
                if (!hintOn) return false;
                var p = ((now - t0h) % 2400) / 2400, e = Math.min(1, p / 0.7);
                var x2 = hx1 + (hx2 - hx1) * e;
                hl.setAttribute('x2', x2.toFixed(1)); hl.setAttribute('opacity', p > 0.9 ? Math.max(0, (1 - p) / 0.1) : 1);
                pencil.style.left = (x2 - 6) + 'px'; pencil.style.top = (hy - 34) + 'px';
            });
        }
        function hideHint() { hintOn = false; if (pencil) { if (pencil.parentNode) pencil.parentNode.removeChild(pencil); pencil = null; } while (gHint.firstChild) gHint.removeChild(gHint.firstChild); }

        /* 畫橫線：按住某一條直線 → 往左或往右拖到相鄰的直線 → 畫上一條粗藍線（貼齊最近的一層）；拖到一半放開＝取消 */
        var drag = null, locked = false, placed = null;
        function colAt(x, y) {
            if (y < Y_TOP - 6 || y > Y_BOT + 6) return -1;
            var best = -1, bd = 1e9;
            for (var k = 0; k < COLS; k++) { var d = Math.abs(x - colX(k)); if (d < bd) { bd = d; best = k; } }
            return bd <= TOUCH_X ? best : -1;
        }
        stage.addEventListener('pointerdown', function (e) {
            if (api.over || locked || drag) return;
            var p = kit.localPt(e, stage), col = colAt(p.x, p.y);
            if (col < 0) return;
            e.preventDefault();
            try { stage.setPointerCapture(e.pointerId); } catch (err) { }
            hideHint();
            drag = { id: e.pointerId, col: col, row: snapRow(p.y), x0: p.x, dir: 0, line: null };
        });
        stage.addEventListener('pointermove', function (e) {
            if (!drag || e.pointerId !== drag.id || locked) return;
            var p = kit.localPt(e, stage), dx = p.x - drag.x0;
            if (!drag.dir) {
                if (Math.abs(dx) < DRAG_MIN) return;
                var dir = dx > 0 ? 1 : -1, nb = drag.col + dir;
                if (nb < 0 || nb > COLS - 1) return;                       /* 那一邊沒有直線 */
                drag.dir = dir;
                var y = rowY(drag.row);
                drag.line = kit.svg('line', { x1: colX(drag.col), y1: y, x2: colX(drag.col), y2: y, 'class': 'gl-user' }, gUser);
            }
            var from = colX(drag.col), to = colX(drag.col + drag.dir), f = kit.clamp((p.x - from) / (to - from), 0, 1);
            drag.line.setAttribute('x2', (from + (to - from) * f).toFixed(1));
            if (f >= JOIN_FRAC) { var d0 = drag; drag = null; commit(d0); }
        });
        function up(e) {
            if (!drag || e.pointerId !== drag.id) return;
            if (drag.line) gUser.removeChild(drag.line);                   /* 沒拖到隔壁的直線：取消，可以重畫 */
            drag = null;
        }
        stage.addEventListener('pointerup', up);
        stage.addEventListener('pointercancel', up);

        function flash(text) { msg.textContent = text; }
        function commit(d) {
            var col = Math.min(d.col, d.col + d.dir), row = d.row;
            if (!canPlace(q.rungs, row, col)) {                            /* 那一層那個位置已經有橫線（或緊鄰）：不算，請換個位置 */
                gUser.removeChild(d.line); Sfx.play('bad');
                flash('那裡已經有橫線了，換個位置畫');
                return;
            }
            locked = true; placed = { row: row, col: col };
            var y = rowY(row);
            d.line.setAttribute('x1', colX(col)); d.line.setAttribute('x2', colX(col + 1)); d.line.setAttribute('y1', y); d.line.setAttribute('y2', y);
            Sfx.play('click'); api.stopTimer();
            msg.textContent = '';
            judge();
        }
        /* 評審動畫：從起點開始畫出一條綠色粗虛線，經過每個轉折點，看看最後能不能抵達終點 */
        function judge() {
            var f = follow(q.rungs.concat([placed]), q.start), ms = routeMs(f.route), total = routeLength(f.route);
            var line = kit.svg('polyline', { points: '', 'class': 'gl-route' }, gRoute);
            my.tween(ms, function (e) {
                line.setAttribute('points', partialRoute(f.route, total * e).map(function (p) { return p.x.toFixed(1) + ',' + p.y.toFixed(1); }).join(' '));
            }, kit.linear).then(function () {
                var win = f.end === q.target;
                endBoxes[f.end].classList.add(win ? 'gl-end--ok' : 'gl-end--bad');
                if (win) { Sfx.play('ok'); } else { Sfx.play('bad'); endBoxes[q.target].classList.add('gl-end--want'); }
                api.after(HOLD_MS, function () {
                    if (win) api.pass({ delay: 0 });
                    else api.fail({ delay: 0, lines: ['這條橫線畫在這裡，會走到終點 ' + (f.end + 1) + '，不是綠色的終點 ' + (q.target + 1), '只有一次機會，要想清楚橫線畫在哪一層、哪兩條直線之間'] });
                });
            });
        }
        api.timer(timeMs(level), function () {
            hideHint(); locked = true;
            if (drag && drag.line) gUser.removeChild(drag.line);
            drag = null;
            msg.textContent = '';
            api.fail({ delay: 600, lines: ['時間到了', '這一關有 ' + q.solutions.length + ' 種畫法：' + q.solutions.slice(0, 3).map(function (s) { return '第 ' + (s.row + 1) + ' 層的 ' + LABELS[s.col] + '～' + LABELS[s.col + 1]; }).join('、')] });
        });

        /* 驗證用：用真的 PointerEvent 畫一條橫線（往右拖到隔壁的直線） */
        function fire(type, x, y) {
            var r = stage.getBoundingClientRect(), sc = r.width / (stage.clientWidth || r.width);
            stage.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 9, clientX: r.left + x * sc, clientY: r.top + y * sc }));
        }
        function drawAt(row, col, dir) {
            var y = rowY(row), a = colX(dir > 0 ? col : col + 1), b = colX(dir > 0 ? col + 1 : col);
            fire('pointerdown', a, y);
            for (var k = 1; k <= 10; k++) fire('pointermove', a + (b - a) * k / 10, y);
            fire('pointerup', b, y);
        }
        api.solve = function () { var s = q.solutions[0]; drawAt(s.row, s.col, 1); };
        api.wrong = function () {
            var bad = placements(q.rungs, q.start).filter(function (p) { return p.end !== q.target; })[0];
            if (bad) drawAt(bad.row, bad.col, 1);
        };
        api.draw = drawAt;
    }

    var G = {
        id: ID,
        name: '鬼腳圖',
        rule: '這是台灣童玩「阿彌陀佛」。上方有綠色的起點，下方有綠色的終點，但照著現有的橫線走，**從起點到不了終點**。請你**按住一條直線，往左或往右拖到隔壁的直線，畫上一條橫線**，讓起點接到終點。**只有一次機會**，畫好後會從起點開始一路走下去，遇到橫線就轉彎，看能不能走到終點。',
        mount: mount,
        score: SCORE,
        test: { colX: colX, rowY: rowY, snapRow: snapRow, rungCount: rungCount, rungCap: rungCap, DENSITY_MAX: DENSITY_MAX, maxSolAt: maxSolAt, timeMs: timeMs, follow: follow, canPlace: canPlace, visitAt: visitAt, turnsAt: turnsAt, visitedCols: visitedCols, gapCounts: gapCounts, makeWalk: makeWalk, spreadRows: spreadRows, crowded: crowded, placements: placements, makeLevel: makeLevel, routeLength: routeLength, partialRoute: partialRoute, routeMs: routeMs, rating: rating, COLS: COLS, ROWS: ROWS, RAMP_LEVELS: RAMP_LEVELS, Y_TOP: Y_TOP, Y_BOT: Y_BOT, RUNGS: RUNGS, MAX_SOL: MAX_SOL, VISIT: VISIT, TURNS: TURNS, SOL_GAP: SOL_GAP, TIME_S: TIME_S, HOLD_MS: HOLD_MS, ROUTE_MS: ROUTE_MS }
    };
    Reaction.register(G);
})();
