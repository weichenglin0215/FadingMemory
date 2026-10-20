/* ═══════════════════════════════════════════════════════════════════
   reaction_checkers.js — 秒反應・跳棋跳最遠（企劃 262）
   跳棋盤上，你的棋子（紅色彈珠）可以**跳過相鄰的任何一顆棋子、落到後面的空位**，而且可以一直**連跳**。
   **點出哪一顆紅棋能連跳最多次**。點下去，彈珠就沿著路線連跳一遍。
   ───────────────────────────────────────────────────────────────────
   · 規則（longest）：往上、下、左、右四個方向，隔壁（距離 1）有棋子（紅、藍都算）、正後面（距離 2）是空格，就能跳過去。
     棋子不會被吃掉，所以盤面在連跳過程中不變；為了不會永遠繞圈，**同一個格子不能降落兩次**（包含出發的那一格）。
     最多能連跳幾次＝在「跳躍圖」上找最長的不重複路線（深度優先搜尋，窮舉）。
   · 出題（makeLevel）：先用隨機漫步造一條 k 次連跳的路線（路過的棋子放好、降落的格子保持空），再隨機放其他紅棋、藍棋；
     最後算出每顆紅棋的最大連跳數，要求：最多的那一顆**唯一**、最多的連跳數至少 MIN_BEST、與第二名的差距在 1～GAP_MAX、最長路線至少轉 MIN_TURNS 個彎。
   · 難度（線性）：棋盤 7×7 → 10×10（SIZE）、紅棋 3 → 8 顆（REDS）、藍棋 6 → 24 顆（BLUES）、最多連跳至少 2 → 6 次（MIN_BEST）、
     與第二名差距上限 3 → 1（GAP_MAX）、路線至少轉 0 → 3 個彎（MIN_TURNS）、限時 15 → 6 秒（TIME_S）。
   · 揭曉：每顆紅棋旁邊標出能連跳幾次（最多的是綠色），最多的那一顆用動畫連跳一遍（彈珠跳的時候有弧線）。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'checkers';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 60 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 24;                       /* 幾關之後難度到頂 */
    var SIZE = [7, 10];                         /* 棋盤邊長（格）：第 1 關 → 到頂 */
    var REDS = [3, 8];                          /* 紅棋顆數：第 1 關 → 到頂 */
    var BLUES = [6, 24];                        /* 藍棋顆數（至少；連跳路線經過的棋子也算在裡面）：第 1 關 → 到頂 */
    var MIN_BEST = [2, 6];                      /* 最多的連跳數至少幾次：第 1 關 → 到頂 */
    var GAP_MAX = [3, 1];                       /* 最多與第二多的差距上限：第 1 關 → 到頂（差 1 跳最難分辨） */
    var MIN_TURNS = [0, 3];                     /* 最長路線至少轉幾個彎：第 1 關 → 到頂 */
    var TIME_S = [15, 6];                       /* 每題限時（秒）：第 1 關 → 到頂 */
    var HOP_MS = 420;                           /* 揭曉時彈珠每跳一次的時間（毫秒） */
    var MAX_LEVEL = 60;
    var EMPTY = 0, RED = 1, BLUE = 2;
    var DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];       /* 上、下、左、右 */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function ramp(level, pair) { return Math.round(kit.ramp(level, pair[0], pair[1], RAMP_LEVELS)); }
    function sizeFor(level) { return ramp(level, SIZE); }
    function redsFor(level) { return ramp(level, REDS); }
    function bluesFor(level) { return ramp(level, BLUES); }
    function minBestFor(level) { return ramp(level, MIN_BEST); }
    function gapMaxFor(level) { return ramp(level, GAP_MAX); }
    function minTurnsFor(level) { return ramp(level, MIN_TURNS); }
    function timeMs(level) { return Math.round(kit.ramp(level, TIME_S[0], TIME_S[1], RAMP_LEVELS) * 1000); }
    function inb(n, r, c) { return r >= 0 && r < n && c >= 0 && c < n; }
    /* 從 start（格子編號）出發最多能連跳幾次：回傳 { jumps, path（依序降落的格子編號）}。
       被跳的棋子不會被吃掉；同一個格子不能降落兩次（含出發那格，它在跳起來之後是空的但不能回去）。 */
    function longest(board, n, start) {
        var best = { jumps: 0, path: [] }, visited = {}, path = [];
        visited[start] = true;
        function dfs(cur) {
            var r = Math.floor(cur / n), c = cur % n;
            if (path.length > best.jumps) best = { jumps: path.length, path: path.slice() };
            for (var d = 0; d < 4; d++) {
                var mr = r + DIRS[d][0], mc = c + DIRS[d][1], lr = r + 2 * DIRS[d][0], lc = c + 2 * DIRS[d][1];
                if (!inb(n, lr, lc)) continue;
                var mid = mr * n + mc, land = lr * n + lc;
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
    function turnsOf(n, start, path) {
        var prev = null, turns = 0, cur = start;
        for (var i = 0; i < path.length; i++) {
            var dr = Math.sign(Math.floor(path[i] / n) - Math.floor(cur / n)), dc = Math.sign(path[i] % n - cur % n), key = dr + ',' + dc;
            if (prev !== null && key !== prev) turns++;
            prev = key; cur = path[i];
        }
        return turns;
    }
    /* 用隨機漫步造一條 k 次連跳：回傳 { start, lands（降落格）, mids（被跳過的棋子所在格）}，造不出來回傳 null */
    function buildChain(n, k, rand) {
        var start = kit.randInt(0, n * n - 1, rand), cur = start, lands = [], mids = [], landSet = {}, midSet = {};
        landSet[start] = true;
        for (var i = 0; i < k; i++) {
            var opts = [];
            for (var d = 0; d < 4; d++) {
                var r = Math.floor(cur / n), c = cur % n, mr = r + DIRS[d][0], mc = c + DIRS[d][1], lr = r + 2 * DIRS[d][0], lc = c + 2 * DIRS[d][1];
                if (!inb(n, lr, lc)) continue;
                var mid = mr * n + mc, land = lr * n + lc;
                if (landSet[land] || midSet[land] || landSet[mid]) continue;      /* 降落的格子要空、不能是已經降落過的、被跳的棋子的格子不能是降落格 */
                opts.push({ mid: mid, land: land });
            }
            if (!opts.length) return null;
            var o = kit.pick(opts, rand);
            mids.push(o.mid); lands.push(o.land); midSet[o.mid] = true; landSet[o.land] = true; cur = o.land;
        }
        return { start: start, lands: lands, mids: mids };
    }
    /* 出一關：{ n, board, reds（紅棋的格子編號）, jumps（每顆紅棋的最大連跳數）, paths, best（最多的那顆在 reds 裡的位置）, bestJumps, second, gap, turns, level } */
    function makeLevel(level, rand) {
        rand = rand || Math.random;
        var n = sizeFor(level), R = redsFor(level), B = bluesFor(level), minBest = minBestFor(level), gapMax = gapMaxFor(level), minTurns = minTurnsFor(level);
        for (var tr = 0; tr < 6000; tr++) {
            var k = Math.min(minBest + kit.randInt(0, 1, rand), 12), ch = buildChain(n, k, rand);
            if (!ch) continue;
            var board = new Int8Array(n * n), blocked = {}, i;
            ch.lands.forEach(function (l) { blocked[l] = true; });                 /* 路線上降落的格子要保持空 */
            blocked[ch.start] = false;
            var mids = ch.mids.filter(function (m, j) { return ch.mids.indexOf(m) === j; });                /* 同一顆棋子可能被跳過兩次，只放一次 */
            board[ch.start] = RED; mids.forEach(function (m) { board[m] = rand() < 0.35 ? RED : BLUE; });
            var reds = [ch.start]; mids.forEach(function (m) { if (board[m] === RED) reds.push(m); });
            var blues = mids.filter(function (m) { return board[m] === BLUE; }).length, guard = 0;
            while ((reds.length < R || blues < B) && guard++ < 400) {
                var cell = kit.randInt(0, n * n - 1, rand);
                if (board[cell] !== EMPTY || blocked[cell]) continue;
                if (reds.length < R && (blues >= B || rand() < 0.4)) { board[cell] = RED; reds.push(cell); } else { board[cell] = BLUE; blues++; }
            }
            if (reds.length !== R || blues < B) continue;
            var res = reds.map(function (cc) { return longest(board, n, cc); });
            var order = res.map(function (x, j) { return j; }).sort(function (a, b) { return res[b].jumps - res[a].jumps; });
            var bi = order[0], b1 = res[bi].jumps, b2 = res[order[1]].jumps, gap = b1 - b2;
            if (b1 < minBest || gap < 1 || gap > gapMax) continue;
            var turns = turnsOf(n, reds[bi], res[bi].path);
            if (turns < minTurns) continue;
            return { n: n, board: board, reds: reds, jumps: res.map(function (x) { return x.jumps; }), paths: res.map(function (x) { return x.path; }), best: bi, bestJumps: b1, second: b2, gap: gap, turns: turns, level: level };
        }
        /* 保底（極少用到）：一排棋，最左邊的紅棋連跳 3 次，另一顆紅棋只能跳 1 次 */
        var fn = 7, fb = new Int8Array(fn * fn); [[3, 0, RED], [3, 1, BLUE], [3, 3, BLUE], [3, 5, BLUE], [0, 0, RED], [0, 1, BLUE]].forEach(function (a) { fb[a[0] * fn + a[1]] = a[2]; });
        var fr = [3 * fn, 0], fres = fr.map(function (cc) { return longest(fb, fn, cc); });
        return { n: fn, board: fb, reds: fr, jumps: fres.map(function (x) { return x.jumps; }), paths: fres.map(function (x) { return x.path; }), best: 0, bestJumps: fres[0].jumps, second: fres[1].jumps, gap: fres[0].jumps - fres[1].jumps, turns: 0, level: level };
    }
    function rating(n) {
        if (n >= 25) return '跳棋大師！';
        if (n >= 15) return '路線看得很準！';
        if (n >= 8) return '不錯喔！';
        if (n >= 3) return '再接再厲！';
        return '多看幾步：跳過去之後還能再跳！';
    }

    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 5, stageClass: 'chk-stage',
            numText: function (v) { return v + ' 關'; },
            rating: rating,
            lines: function (S) { return ['通過 ' + S.cleared + ' 關']; },
            setup: setup
        });
    }

    function setup(api) {
        var stage = api.stage, level = api.level;
        var q = makeLevel(level, api.rand), n = q.n, board = q.board;
        api.info = q;
        console.log('[跳棋跳最遠] 第 ' + level + ' 關：' + n + '×' + n + '，紅棋 ' + q.reds.length + ' 顆，各能連跳 ' + q.jumps.join('、') + ' 次；最多 ' + q.bestJumps + '（第二多 ' + q.second + '，差 ' + q.gap + '，路線轉 ' + q.turns + ' 個彎）；限時 ' + timeMs(level) + ' ms');

        var W = stage.clientWidth || 472, H = stage.clientHeight || 640, cs = Math.floor(Math.min((W - 16) / n, (H - 150) / n, 60)), BS = cs * n, bx = Math.round((W - BS) / 2), by = 62, ps = Math.round(cs * 0.78), off = (cs - ps) / 2;
        var field = h('div', { 'class': 'chk-field' });
        stage.appendChild(field);
        field.appendChild(h('div', { 'class': 'qz-note chk-tip', text: '點出能連跳最多次的紅棋' }));
        var bd = h('div', { 'class': 'chk-board' });
        bd.style.cssText = 'left:' + bx + 'px;top:' + by + 'px;width:' + BS + 'px;height:' + BS + 'px;background-size:' + cs + 'px ' + cs + 'px;';
        field.appendChild(bd);
        var pcs = {};                                                       /* 格子編號 → 棋子的元素 */
        function place(el, cell) { el.style.left = (cell % n) * cs + off + 'px'; el.style.top = Math.floor(cell / n) * cs + off + 'px'; }
        for (var cell = 0; cell < n * n; cell++) if (board[cell] !== EMPTY) {
            var el = h('div', { 'class': 'chk-pc ' + (board[cell] === RED ? 'chk-pc--red' : 'chk-pc--blue') });
            el.style.width = el.style.height = ps + 'px';
            el.appendChild(h('div', { 'class': 'chk-pc__in' }));
            place(el, cell); bd.appendChild(el); pcs[cell] = el;
        }
        var info = h('div', { 'class': 'qz-note chk-info', text: '' });
        info.style.top = (by + BS + 10) + 'px';
        field.appendChild(info);
        var done = false;
        api.timer(timeMs(level), function () { judge(-1); });
        if (level === 1 && kit.once('checkers.hint')) kit.hintOn(stage, pcs[q.reds[q.best]], { mode: 'tap', delay: 700, text: '請點能連跳最多次的紅棋' });
        q.reds.forEach(function (cellNo, ri) { kit.onTap(pcs[cellNo], function () { judge(ri); }); });

        /* 彈珠沿著路線連跳（外層直線移動、內層做弧線）；跳完呼叫 done */
        function hop(ri, onEnd) {
            var el = pcs[q.reds[ri]], path = q.paths[ri], k = 0;
            el.classList.add('chk-pc--go');
            el.style.zIndex = '20';
            function next() {
                if (k >= path.length) { onEnd && onEnd(); return; }
                var inner = el.firstChild;
                el.style.transition = 'left ' + HOP_MS + 'ms linear, top ' + HOP_MS + 'ms linear';
                place(el, path[k]);
                inner.classList.remove('chk-pc__in--arc'); void inner.offsetWidth; inner.classList.add('chk-pc__in--arc'); inner.style.animationDuration = HOP_MS + 'ms';
                Sfx.play('pop'); k++;
                api.after(HOP_MS + 40, next);
            }
            next();
        }
        function judge(ri) {
            if (done || api.over) return;
            done = true;
            var ok = ri >= 0 && q.jumps[ri] === q.bestJumps;
            /* 每顆紅棋旁邊標出能跳幾次（最多的是綠色） */
            q.reds.forEach(function (cellNo, j) {
                var b = h('div', { 'class': 'chk-badge' + (q.jumps[j] === q.bestJumps ? ' chk-badge--best' : ''), text: String(q.jumps[j]) });
                pcs[cellNo].appendChild(b);
            });
            if (ri >= 0) pcs[q.reds[ri]].classList.add(ok ? 'chk-pc--ok' : 'chk-pc--bad');
            var go = ok ? ri : q.best;
            info.textContent = ok ? '連跳 ' + q.jumps[ri] + ' 次，是最多的！' : (ri >= 0 ? '你選的只能連跳 ' + q.jumps[ri] + ' 次，最多是 ' + q.bestJumps + ' 次' : '時間到！最多能連跳 ' + q.bestJumps + ' 次');
            kit.flash(stage, ok, api.my);
            api.after(500, function () { hop(go); });
            var hopMs = 500 + q.paths[go].length * (HOP_MS + 40);
            if (ok) { api.pass({ delay: hopMs + 900 }); return; }
            api.fail({ delay: hopMs + 1800, lines: [ri >= 0 ? '你選的只能連跳 ' + q.jumps[ri] + ' 次' : '時間到！', '最多能連跳 ' + q.bestJumps + ' 次（第二多 ' + q.second + ' 次）'] });
        }
        api.solve = function () { judge(q.best); };
        api.wrong = function () { var w = q.jumps.findIndex(function (v) { return v !== q.bestJumps; }); judge(w >= 0 ? w : 0); };
    }

    var G = {
        id: ID,
        name: '跳棋跳最遠',
        rule: '這是方格版的跳棋。**紅色彈珠可以跳過相鄰的任何一顆棋子**（往上下左右），落到後面的空格，而且可以**一直連跳**（同一個格子不能降落兩次）。**點出哪一顆紅棋能連跳最多次**，點下去它就連跳一遍。最靠前的常常只能跳 1 次，能跳最多的那一顆要轉好幾個彎。點錯或來不及就結束，看你能過幾關。越後面，棋盤越滿、第一名和第二名只差 1 跳！',
        mount: mount,
        score: SCORE,
        test: {
            sizeFor: sizeFor, redsFor: redsFor, bluesFor: bluesFor, minBestFor: minBestFor, gapMaxFor: gapMaxFor, minTurnsFor: minTurnsFor, timeMs: timeMs, longest: longest, turnsOf: turnsOf, buildChain: buildChain, makeLevel: makeLevel, rating: rating,
            RAMP_LEVELS: RAMP_LEVELS, SIZE: SIZE, REDS: REDS, BLUES: BLUES, MIN_BEST: MIN_BEST, GAP_MAX: GAP_MAX, MIN_TURNS: MIN_TURNS, TIME_S: TIME_S, HOP_MS: HOP_MS, MAX_LEVEL: MAX_LEVEL, EMPTY: EMPTY, RED: RED, BLUE: BLUE
        }
    };
    Reaction.register(G);
})();
