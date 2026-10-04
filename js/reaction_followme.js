/* ═══════════════════════════════════════════════════════════════════
   reaction_followme.js — 秒反應・照著走
   格子地圖，小人固定從最下面正中間出發。先看小人示範走一遍到終點（地圖上看得到旗子和陷阱），
   然後小人回到起點，**旗子和陷阱全部消失**；你用下方三顆按鈕（左方、前進、右方）自己走：
   不一定要照示範的路線，但**步數要跟示範一樣**（畫面顯示剩餘步數）。步數用完，終點指示牌再出現，
   小人站在終點就成功。走進陷阱格就失敗（失敗或過關時，陷阱才會顯示出來）。
   ───────────────────────────────────────────────────────────────────
   · 按鈕：左方＝往左走一格、前進＝往上走一格、右方＝往右走一格（不能後退）。走出地圖外的按鈕沒有作用，也不扣步數。
   · 陷阱怎麼放（makeTraps：**用陷阱「逼」路線轉彎**）：
        陷阱排成一道道「牆」，放在起點與終點之間，牆之間隔一列空地（讓小人可以橫著走）：
        每道牆是一整列，只留 1 格缺口；缺口一左一右輪流開在地圖的最外側（欄 0～1／最右 2 欄），
        所以每過一道牆，路線就要先橫著走到缺口、穿過去、再橫著走到下一道牆的缺口——
        **每多一道牆就多兩個轉彎**。陷阱的數量決定牆的數量（每道整牆用 cols−1 個陷阱），
        不足一整道牆的零頭放在下一列「最靠近目前位置」的格子，逼路線繞開。
        終點只選在最後一道牆的上面，所以不管怎麼走都得穿過每一個缺口。
   · 出題（makeLevel）：先放陷阱，用廣度優先搜尋算出每一格的最短步數；在牆上方挑一個最短步數剛好等於 stepsWanted 的格子
     當終點（沒有就挑最接近、但不超過的）；示範路線是其中一條最短路線（隨機挑）。步數＝最短步數，
     所以玩家一定走得到，而且只能走最短路線（但可能有很多條）。
   · 難度（第 1 → LEVEL_RAMP 關線性）：步數 STEPS_START → STEPS_END、陷阱 TRAPS_START → TRAPS_END、地圖列數 ROWS_START → ROWS_END；
     地圖寬 5 格（第 8 關起 7 格）。
   · 不限時。進陷阱、或步數用完沒站在終點就失敗（只有一次機會），成績＝通過關數（越多越好）；失敗後可從「失敗關卡 − 5」繼續。
   ═══════════════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    var ID = 'followme';
    var h = UI.h;
    var kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var LEVEL_RAMP = 30;
    var STEPS_START = 3, STEPS_END = 30;       /* 要走幾步 */
    var TRAPS_START = 0, TRAPS_END = 30;       /* 陷阱數量 */
    var ROWS_START = 6, ROWS_END = 10;         /* 地圖列數 */
    var COLS_NARROW = 5, COLS_WIDE = 7, WIDE_FROM = 8;
    var DEMO_STEP_MS = 480;                    /* 示範每一步的時間 */
    var DEMO_LEAD_MS = 900, DEMO_END_MS = 800;
    var NEXT_MS = 1300;
    var MOVES = { L: [0, -1], F: [-1, 0], R: [0, 1] };     /* [dRow, dCol] */
    var MOVE_NAME = { L: '左方', F: '前進', R: '右方' };

    function fmtBest(v) { return v == null ? '' : '最佳 ' + v + ' 關'; }

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function stepsWanted(level) { return Math.round(kit.ramp(level, STEPS_START, STEPS_END, LEVEL_RAMP)); }
    function trapsWanted(level) { return Math.round(kit.ramp(level, TRAPS_START, TRAPS_END, LEVEL_RAMP)); }
    function rowsFor(level) { return Math.round(kit.ramp(level, ROWS_START, ROWS_END, LEVEL_RAMP)); }
    function colsFor(level) { return level >= WIDE_FROM ? COLS_WIDE : COLS_NARROW; }
    function cellKey(r, c) { return r + ',' + c; }
    /* 廣度優先：從 (r0,c0) 出發，回傳每一格的最短步數 dist[r][c]（到不了＝-1）*/
    function bfs(rows, cols, start, traps) {
        var dist = [], r, c;
        for (r = 0; r < rows; r++) { dist.push([]); for (c = 0; c < cols; c++) dist[r].push(-1); }
        dist[start.r][start.c] = 0;
        var q = [[start.r, start.c]];
        for (var qi = 0; qi < q.length; qi++) {
            var cur = q[qi];
            for (var m in MOVES) {
                var nr = cur[0] + MOVES[m][0], nc = cur[1] + MOVES[m][1];
                if (nr < 0 || nr >= rows || nc < 0 || nc >= cols || traps[cellKey(nr, nc)] || dist[nr][nc] >= 0) continue;
                dist[nr][nc] = dist[cur[0]][cur[1]] + 1;
                q.push([nr, nc]);
            }
        }
        return dist;
    }
    /* 從終點往回走，隨機挑一條最短路線；回傳走法陣列（'L'／'F'／'R'）*/
    function randomShortestPath(dist, start, target, traps, rand) {
        var path = [], cur = { r: target.r, c: target.c };
        while (!(cur.r === start.r && cur.c === start.c)) {
            var d = dist[cur.r][cur.c], preds = [];
            for (var m in MOVES) {
                var pr = cur.r - MOVES[m][0], pc = cur.c - MOVES[m][1];
                if (pr < 0 || pr >= dist.length || pc < 0 || pc >= dist[0].length || traps[cellKey(pr, pc)]) continue;
                if (dist[pr][pc] === d - 1) preds.push({ m: m, r: pr, c: pc });
            }
            var p = kit.pick(preds, rand);
            path.unshift(p.m);
            cur = { r: p.r, c: p.c };
        }
        return path;
    }
    function applyMoves(start, moves) {
        var r = start.r, c = start.c;
        moves.forEach(function (m) { r += MOVES[m][0]; c += MOVES[m][1]; });
        return { r: r, c: c };
    }
    /* 放陷阱：一道道「牆」，缺口一左一右輪流開在最外側。回傳 { traps, trapList, wallRows, gaps, lastWallRow }；
       lastWallRow＝最上面那一道牆（含零頭）的列，沒有陷阱時是 rows（表示終點可以選任何一列）。 */
    function makeTraps(rows, cols, start, nTraps, rand) {
        rand = rand || Math.random;
        var traps = {}, list = [], wallRows = [], gaps = [], remaining = nTraps, side = rand() < 0.5 ? -1 : 1, prevCol = start.c, lastWallRow = rows;
        for (var r = start.r - 2; r >= 1 && remaining > 0; r -= 2) {
            var gap = side < 0 ? kit.randInt(0, 1, rand) : kit.randInt(cols - 2, cols - 1, rand), cs = [], c;
            for (c = 0; c < cols; c++) if (c !== gap) cs.push(c);
            if (remaining < cs.length) {
                /* 不足一整道牆：放在最靠近「目前所在欄」的格子（逼路線繞開）*/
                cs.sort(function (x, y) { return Math.abs(x - prevCol) - Math.abs(y - prevCol) || x - y; });
                cs = cs.slice(0, remaining);
            }
            cs.forEach(function (cc) { traps[cellKey(r, cc)] = true; list.push([r, cc]); });
            remaining -= cs.length;
            wallRows.push(r); gaps.push(gap); lastWallRow = r;
            prevCol = gap; side = -side;
        }
        return { traps: traps, trapList: list, wallRows: wallRows, gaps: gaps, lastWallRow: lastWallRow };
    }
    /* 出一關：回傳 { rows, cols, start, target, traps:{key:true}, trapList, steps, path, wallRows, gaps, dist }*/
    function makeLevel(level, rand) {
        rand = rand || Math.random;
        var rows = rowsFor(level), cols = colsFor(level), want = stepsWanted(level), nTraps = trapsWanted(level);
        var start = { r: rows - 1, c: (cols - 1) / 2 };
        /* 牆太多、要穿過全部的牆至少要走的步數就超過 want 時，一次拿掉最上面的一道牆（或零頭）再試 */
        for (var nt = nTraps; nt >= 0; nt = nt > cols - 1 ? nt - (cols - 1) : (nt > 0 ? 0 : -1)) {
            var T = makeTraps(rows, cols, start, nt, rand);
            var dist = bfs(rows, cols, start, T.traps), best = null, cand = [];
            /* 終點只選在最後一道牆的上面（沒有牆就整張地圖）；最短步數剛好等於 want 的優先，沒有就挑最接近但不超過的 */
            for (var rr = 0; rr < Math.min(T.lastWallRow, rows - 1); rr++) for (var cc = 0; cc < cols; cc++) {
                var d = dist[rr][cc];
                if (d < 1 || d > want) continue;
                if (!best || d > best.d) { best = { d: d }; cand = []; }
                if (d === best.d) cand.push({ r: rr, c: cc });
            }
            if (cand.length) {
                var target = kit.pick(cand, rand);
                return { rows: rows, cols: cols, start: start, target: target, traps: T.traps, trapList: T.trapList, steps: best.d, path: randomShortestPath(dist, start, target, T.traps, rand), wallRows: T.wallRows, gaps: T.gaps, dist: dist };
            }
        }
        /* 保底：沒有陷阱，直走（步數取地圖允許的最大值）*/
        var steps = Math.min(want, rows - 1);
        var path = []; for (var i = 0; i < steps; i++) path.push('F');
        return { rows: rows, cols: cols, start: start, target: applyMoves(start, path), traps: {}, trapList: [], steps: steps, path: path, wallRows: [], gaps: [], dist: null };
    }

    /* 圖示 */
    function drawMan(g) {
        kit.svg('circle', { cx: 0, cy: -16, r: 11, fill: 'hsl(28,62%,80%)', stroke: 'hsl(24,40%,22%)', 'stroke-width': 3 }, g);
        kit.svg('rect', { x: -12, y: -5, width: 24, height: 26, rx: 8, fill: 'hsl(210,62%,52%)', stroke: 'hsl(24,40%,22%)', 'stroke-width': 3 }, g);
    }

    function mount(root, ctx) {
        var R = null;

        /* startAt：從第幾關開始（失敗後可從前 5 關繼續）*/
        function round(startAt) {
            if (R) R.dispose();
            R = kit.round();
            var my = R;
            root.innerHTML = '';

            var level = startAt || 1, cleared = level - 1, newRec = false, state = 'idle', lvId = 0, L = null, pos = null, remain = 0, CELL = 40;
            var head = h('div', { 'class': 'fw-head' });
            var banner = h('div', { 'class': 'fw-banner' });
            var field = h('div', { 'class': 'fw-field' });
            var bL = h('button', { 'class': 'btn btn--sky fw-btn', text: '◀ 左方' });
            var bF = h('button', { 'class': 'btn btn--go fw-btn', text: '▲ 前進' });
            var bR = h('button', { 'class': 'btn btn--sky fw-btn', text: '右方 ▶' });
            var btns = h('div', { 'class': 'fw-btns' }, [bL, bF, bR]);
            [head, banner, field, btns].forEach(function (n) { root.appendChild(n); });
            var svg = null, man = null, flag = null, trapEls = {};

            function meta() { ctx.setMeta(kit.meta(['第 ' + level + ' 關'])); }
            function setMan(r, c, animate) {
                man.style.transition = animate ? 'transform ' + (DEMO_STEP_MS * 0.8) + 'ms linear' : 'none';
                man.style.transform = 'translate(' + ((c + 0.5) * CELL) + 'px,' + ((r + 0.62) * CELL) + 'px)';
            }

            function build() {
                if (svg && svg.parentNode) svg.parentNode.removeChild(svg);
                CELL = 64;                       /* 地圖用固定的「格子單位」畫，整張 SVG 再用 viewBox 縮放到欄位大小 */
                var W = CELL * L.cols, H = CELL * L.rows;
                svg = kit.svg('svg', { 'class': 'fw-svg', viewBox: '0 0 ' + W + ' ' + H, preserveAspectRatio: 'xMidYMid meet' }, field);
                for (var r = 0; r < L.rows; r++) for (var c = 0; c < L.cols; c++) {
                    kit.svg('rect', { 'class': 'fw-cell fw-cell--' + ((r + c) % 2), x: c * CELL, y: r * CELL, width: CELL, height: CELL }, svg);
                }
                trapEls = {};
                L.trapList.forEach(function (t) {
                    var g = kit.svg('g', { 'class': 'fw-trap', transform: 'translate(' + ((t[1] + 0.5) * CELL) + ' ' + ((t[0] + 0.5) * CELL) + ')' }, svg);
                    kit.svg('rect', { x: -CELL * 0.42, y: -CELL * 0.42, width: CELL * 0.84, height: CELL * 0.84, rx: 6 }, g);
                    [-1, 0, 1].forEach(function (k) { var x = k * CELL * 0.25; kit.svg('polygon', { 'class': 'fw-trap__spike', points: (x - CELL * 0.11) + ',' + (CELL * 0.22) + ' ' + x + ',' + (-CELL * 0.2) + ' ' + (x + CELL * 0.11) + ',' + (CELL * 0.22) }, g); });
                    trapEls[cellKey(t[0], t[1])] = g;
                });
                showTraps(true);
                var s = kit.svg('text', { 'class': 'fw-startlbl', x: (L.start.c + 0.5) * CELL, y: (L.start.r + 0.94) * CELL, 'text-anchor': 'middle' }, svg);
                s.textContent = '起點';
                flag = kit.svg('g', { 'class': 'fw-flag', transform: 'translate(' + ((L.target.c + 0.5) * CELL) + ' ' + ((L.target.r + 0.5) * CELL) + ')', opacity: 0 }, svg);
                kit.svg('line', { x1: -CELL * 0.18, y1: CELL * 0.42, x2: -CELL * 0.18, y2: -CELL * 0.4, 'class': 'fw-flag__pole' }, flag);
                kit.svg('polygon', { points: (-CELL * 0.18) + ',' + (-CELL * 0.4) + ' ' + (CELL * 0.4) + ',' + (-CELL * 0.2) + ' ' + (-CELL * 0.18) + ',' + (CELL * 0.02), 'class': 'fw-flag__cloth' }, flag);
                man = kit.svg('g', { 'class': 'fw-man' }, svg);
                man.style.transformBox = 'view-box';
                drawMan(man);
                setMan(L.start.r, L.start.c, false);
            }

            function showTraps(on) { Object.keys(trapEls).forEach(function (k) { trapEls[k].setAttribute('opacity', on ? 1 : 0); }); }
            function setButtons(on) { [bL, bF, bR].forEach(function (b) { b.disabled = !on; }); }
            function paintHead() {
                head.textContent = state === 'play' ? '剩餘步數 ' + remain + ' ／ ' + L.steps : '第 ' + level + ' 關　要走 ' + L.steps + ' 步';
            }

            function startLevel() {
                if (my.dead) return;
                var id = ++lvId;
                L = makeLevel(level);
                pos = { r: L.start.r, c: L.start.c };
                remain = L.steps;
                build();
                state = 'demo'; setButtons(false); paintHead(); meta();
                banner.textContent = '看小人走到旗子那裡，記住陷阱的位置';
                try { console.info('[照著走] 第 ' + level + ' 關：' + L.rows + '×' + L.cols + '、陷阱 ' + L.trapList.length + ' 個、要走 ' + L.steps + ' 步；終點 (列' + L.target.r + ',欄' + L.target.c + ')；示範 ' + L.path.map(function (m) { return MOVE_NAME[m]; }).join('→')); } catch (e) { }
                flag.setAttribute('opacity', 1);
                var t = DEMO_LEAD_MS, r = L.start.r, c = L.start.c;
                L.path.forEach(function (m) {
                    r += MOVES[m][0]; c += MOVES[m][1];
                    var rr = r, cc = c;
                    my.after(t, function () { if (id !== lvId) return; setMan(rr, cc, true); Sfx.play('tick'); });
                    t += DEMO_STEP_MS;
                });
                my.after(t + DEMO_END_MS - DEMO_STEP_MS / 2, function () {
                    if (id !== lvId) return;
                    flag.setAttribute('opacity', 0);
                    showTraps(false);                      /* 示範完：旗子和陷阱都消失，只剩玩家的記憶 */
                    setMan(L.start.r, L.start.c, true);
                });
                my.after(t + DEMO_END_MS + DEMO_STEP_MS, function () {
                    if (id !== lvId) return;
                    state = 'play'; setButtons(true); paintHead();
                    banner.textContent = '換你走！旗子和陷阱都藏起來了，只能走 ' + L.steps + ' 步';
                    Sfx.play('go');
                });
            }

            function press(m) {
                if (state !== 'play') return;
                var nr = pos.r + MOVES[m][0], nc = pos.c + MOVES[m][1];
                if (nr < 0 || nr >= L.rows || nc < 0 || nc >= L.cols) { Sfx.play('click'); banner.textContent = '那邊是地圖外面'; return; }
                pos = { r: nr, c: nc };
                remain--;
                setMan(nr, nc, true);
                if (L.traps[cellKey(nr, nc)]) { finish(false, 'trap'); return; }
                Sfx.play('click');
                paintHead();
                if (remain <= 0) finish(pos.r === L.target.r && pos.c === L.target.c, 'steps');
            }

            function finish(ok, why) {
                if (state !== 'play') return;
                state = 'end'; setButtons(false);
                flag.setAttribute('opacity', 1);
                showTraps(true);                           /* 結束：陷阱的位置全部亮出來 */
                paintHead();
                if (ok) {
                    cleared = level;
                    if (Reaction.setBest(ID, cleared, function (v, b) { return v > b; })) newRec = true;
                    banner.textContent = '到了！過關！';
                    Sfx.play('win');
                    level++;
                    meta();
                    my.after(NEXT_MS, startLevel);
                    return;
                }
                Sfx.play('bad');
                if (why === 'trap') { var tg = trapEls[cellKey(pos.r, pos.c)]; if (tg) tg.classList.add('fw-trap--hit'); }
                banner.textContent = why === 'trap' ? '踩到陷阱了！' : '步數用完了，旗子在這裡';
                my.after(1900, function () {
                    var back = kit.resumeFrom(level);
                    kit.result(root, {
                        num: cleared + ' 關', label: cleared >= 8 ? '記路高手！' : (cleared >= 4 ? '方向感不錯！' : '再試一次，會更穩！'),
                        lines: ['第 ' + level + ' 關：' + (why === 'trap' ? '走進了陷阱格' : '步數用完沒到終點'), '要走 ' + L.steps + ' 步，陷阱 ' + L.trapList.length + ' 個'],
                        isNew: newRec, sfx: cleared >= 5 ? 'win' : 'fail', onAgain: function () { round(1); },
                        resume: { level: back, run: function () { round(back); } }
                    });
                });
            }
            bL.addEventListener('pointerdown', function (e) { e.preventDefault(); press('L'); });
            bF.addEventListener('pointerdown', function (e) { e.preventDefault(); press('F'); });
            bR.addEventListener('pointerdown', function (e) { e.preventDefault(); press('R'); });

            G.debug = {
                state: function () { return { level: level, state: state, remain: remain, pos: pos, L: L, cleared: cleared }; },
                press: press,
                waitPlay: function () { return state; },
                /* 依示範路線（或自訂走法）按完 */
                play: function (moves) { (moves || L.path).forEach(function (m) { press(m); }); return state; }
            };
            my.after(300, startLevel);
        }

        round(1);
    }

    var G = {
        id: ID,
        name: '照著走',
        rule: '先看小人示範走到有旗子的地方，要記住旗子和陷阱的位置。然後小人回到起點，旗子和陷阱都消失。用「左方、前進、右方」自己走，步數要跟示範一樣。不要踩到陷阱，步數用完要站在剛才的終點！',
        mount: mount,
        test: { makeTraps: makeTraps, stepsWanted: stepsWanted, trapsWanted: trapsWanted, rowsFor: rowsFor, colsFor: colsFor, bfs: bfs, randomShortestPath: randomShortestPath, applyMoves: applyMoves, makeLevel: makeLevel, cellKey: cellKey, MOVES: MOVES, LEVEL_RAMP: LEVEL_RAMP }
    };
    Reaction.register(G);
})();
