/* ═══════════════════════════════════════════════════════════════════
   reaction_carpet.js — 秒反應・鋪地毯（企劃 221「割草機」改題材）
   一個方格的房間，門口（黃色的地毯捲）在起點格。手指從地毯捲開始往上下左右的相鄰格拖，一路把地毯鋪出去，
   **每一格地板都要剛好鋪到一次**，放家具（灰色方塊）的格子不能走。手指往回拖＝把地毯一格一格捲回來。
   整個房間鋪滿就過關；走進死路（捲頭旁邊沒有可以鋪的格子，房間卻還沒鋪滿）或時間到就失敗。
   ───────────────────────────────────────────────────────────────────
   · 為什麼從「割草機」改成「鋪地毯」（使用者的疑問）：原企劃的割草機可以「往回拖收回路線」，
     可是割掉的草不可能長回來，題材跟操作矛盾。鋪地毯就沒有這個問題——地毯本來就可以捲回去，往回拖＝捲回來，很自然。
   · 玩法與難度：房間 N×N（第 1 關 N_RANGE[0] → 第 RAMP_LEVELS 關 N_RANGE[1]）、家具 STONES[0] → STONES[1] 個、限時跟著要鋪的格數放寬（TIME_BASE ＋ TIME_PER_CELL × 格數）。
   · 出題（makeLevel）：先放家具、挑起點（兩色空地一樣多，見 pickLayout），再用「隨機＋剪枝的深度優先搜尋」（findPath）找出一條走遍每一格空地的路（一筆畫，漢米爾頓路徑），
     找不到就換一個配置；保證每一題至少有一條解。
   · 封偷吃步：第 WARMUP + 1 關起，如果「沿著邊繞圈」「蛇行」這類不用動腦的走法（greedyWalk：直走優先、右轉優先、左轉優先…，四個初始方向）
     任何一種就能鋪滿，這題就不要（最順手的走法一定會在最後留下一格孤島）；前 WARMUP 關是暖身，不檢查。
   · 判定都是純函式：applyMove（往相鄰格鋪，或往回捲）、isStuck（走進死路）、isDone（鋪滿）；畫面只是把狀態畫出來。
   · 失敗時：沒鋪到的格子閃紅，再用綠色的線畫出一條正確的路（動畫），停格 2.8 秒讓玩家看清楚。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'carpet';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 60 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 30;                       /* 幾關之後難度到頂 */
    var N_RANGE = [4, 9];                       /* 房間邊長（格）：第 1 關 → 到頂 */
    var STONES = [3, 20];                        /* 家具（不能走的格子）個數：第 1 關 → 到頂 */
    var WARMUP = 1;                             /* 前幾關是暖身，不檢查「偷吃步」 */
    var TIME_BASE = 15, TIME_PER_CELL = 1.5;    /* 限時（秒）＝ TIME_BASE ＋ TIME_PER_CELL × 要鋪的格數 */
    var MIN_FREE = 8;                           /* 空地至少幾格（家具太多會讓房間太小） */
    var MAX_LEVEL = 60;
    var GEN_TRIES = 300, GEN_BUDGET_MS = 150;   /* 出題：先「隨機放家具再找路」最多試幾次；整個出題最多花幾毫秒（超過就用保底題；平常幾次就出得來） */
    var BITE_TRIES = 400;                       /* 「隨機放家具」出不了題時，改用「先造一條路再決定家具」最多試幾次 */
    var DIRS = [[-1, 0], [0, 1], [1, 0], [0, -1]];      /* 上、右、下、左（順時針） */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function sizeFor(level) { return Math.round(kit.ramp(level, N_RANGE[0], N_RANGE[1], RAMP_LEVELS)); }
    function stonesFor(level) { return Math.round(kit.ramp(level, STONES[0], STONES[1], RAMP_LEVELS)); }
    /* 限時（毫秒）：free＝要鋪的格數 */
    function timeMs(free) { return Math.round((TIME_BASE + TIME_PER_CELL * free) * 1000); }
    var neighbors = kit.gridNeighbors, adjacent = kit.gridAdjacent, connected = kit.gridConnected, parityOk = kit.gridParityOk, findPath = kit.hamPath;       /* 方格地圖的共用函式（js/reaction_kit4.js） */
    /* 「不動腦」的走法：從 start、朝 heading0（0 上 1 右 2 下 3 左）出發，每一步依 order（相對方向的優先順序：0 直走、1 右轉、2 迴轉、3 左轉）
       挑第一個可以走的格子，走到沒路為止；回傳鋪到幾格 */
    function greedyWalk(n, blocked, start, order, heading0) {
        var vis = new Uint8Array(n * n), cur = start, heading = heading0, count = 1, moved = true;
        vis[start] = 1;
        while (moved) {
            moved = false;
            for (var k = 0; k < order.length; k++) {
                var d = (heading + order[k]) % 4, r = Math.floor(cur / n) + DIRS[d][0], c = cur % n + DIRS[d][1];
                if (r < 0 || r >= n || c < 0 || c >= n) continue;
                var nx = r * n + c;
                if (blocked[nx] || vis[nx]) continue;
                vis[nx] = 1; cur = nx; heading = d; count++; moved = true;
                break;
            }
        }
        return count;
    }
    var GREEDY_ORDERS = [[0, 1, 3], [1, 0, 3], [3, 0, 1], [0, 3, 1]];       /* 直走優先（蛇行）、右轉優先（繞圈）、左轉優先、直走再左轉 */
    /* 這一題有沒有被「不動腦的走法」鋪滿？（有＝太容易，不要） */
    function shortcutWorks(n, blocked, start, free) {
        for (var o = 0; o < GREEDY_ORDERS.length; o++) for (var d = 0; d < 4; d++) if (greedyWalk(n, blocked, start, GREEDY_ORDERS[o], d) === free) return true;
        return false;
    }
    /* 隨機放家具、挑起點——但「兩種顏色的空地一樣多」（棋盤格塗色，相差最多 1）。
       為什麼要這樣放：走遍每一格的路，一定是黑白交替的，所以兩色空地數量相差超過 1 就一定無解。
       完全隨機放家具時，家具一多（例如 10 格以上）有八成以上的配置因為這一條被淘汰，第 13 關起幾乎湊不出題目，
       只好退回「空房間蛇行」的保底題（等於沒有難度）。先把兩色的家具數量配好，幾乎每一次都能通過奇偶檢查。
       回傳 { stones: 家具格編號陣列, start: 起點格 }；起點挑在「空地比較多的那個顏色」（兩色一樣多就任意挑）。 */
    function pickLayout(n, ns, rand) {
        var total = n * n, A = [], B = [], i;
        for (i = 0; i < total; i++) ((Math.floor(i / n) + i % n) % 2 === 0 ? A : B).push(i);       /* A：(0,0) 同色的格子，B：另一色 */
        A = kit.shuffle(A, rand); B = kit.shuffle(B, rand);        /* kit.shuffle 回傳洗好的新陣列 */
        var diff = A.length - B.length, ds = [];
        for (var d = -1; d <= 1; d++) {            /* d ＝ 空地 A 的格數 − 空地 B 的格數；家具數 sA ＋ sB ＝ ns，要整數、不超過各色的格數 */
            var sA2 = ns + diff - d;
            if (sA2 % 2 !== 0) continue;
            var sA = sA2 / 2, sB = ns - sA;
            if (sA >= 0 && sA <= A.length && sB >= 0 && sB <= B.length) ds.push([d, sA, sB]);
        }
        if (!ds.length) {                          /* 配不出來（家具數太極端）：回到完全隨機放 */
            var all = kit.shuffle(A.concat(B), rand);
            return { stones: all.slice(0, ns), start: all[ns] };
        }
        var pick = ds[Math.floor(rand() * ds.length)], remA = A.slice(pick[1]), remB = B.slice(pick[2]);
        var pool = pick[0] > 0 ? remA : pick[0] < 0 ? remB : remA.concat(remB);       /* 某一色空地多 1 格時，起點一定要在那一色 */
        return { stones: A.slice(0, pick[1]).concat(B.slice(0, pick[2])), start: pool[Math.floor(rand() * pool.length)] };
    }
    /* 隨機造一條走遍 n×n 全部格子的一筆畫（漢米爾頓路徑）：從蛇行的路開始，一直做「咬尾巴」的變形（backbite）——
       挑路徑的一端（頭或尾），看它旁邊的一格 c（不是路徑上它的下一格），讓這一端改接到 c，
       於是原路徑從 c 到這一端之間的那一段整段倒過來，仍然是一條走遍每一格的路。重複幾十倍格數次，就是一條很隨機、彎彎曲曲的路。
       為什麼需要它：家具多的關卡，「隨機放家具再去找有沒有一筆畫」幾乎都失敗（家具會把空地切成好幾塊、或讓某些格子變成死巷）；
       反過來「先有一條路，家具是路沒走到的格子」就一定有解。 */
    function randomHamPath(n, rand) {
        var total = n * n, P = [], r, c, i;
        for (r = 0; r < n; r++) for (c = 0; c < n; c++) P.push(r * n + (r % 2 ? n - 1 - c : c));
        for (var it = 0; it < total * 30; it++) {
            var pos = new Int32Array(total);
            for (i = 0; i < total; i++) pos[P[i]] = i;
            if (rand() < 0.5) {
                /* 尾巴：旁邊的格子 c（不是倒數第二格）在路徑第 k 個位置；把第 k+1 個到最後倒過來 */
                var nb = neighbors(n, P[total - 1]).filter(function (x) { return x !== P[total - 2]; });
                if (!nb.length) continue;
                var k = pos[nb[Math.floor(rand() * nb.length)]];
                P = P.slice(0, k + 1).concat(P.slice(k + 1).reverse());
            } else {
                /* 頭：旁邊的格子 c（不是第 2 格）在第 k 個位置；把第 0 個到第 k−1 個倒過來 */
                var nb2 = neighbors(n, P[0]).filter(function (x) { return x !== P[1]; });
                if (!nb2.length) continue;
                var k2 = pos[nb2[Math.floor(rand() * nb2.length)]];
                P = P.slice(0, k2).reverse().concat(P.slice(k2));
            }
        }
        return P;
    }
    /* 出一關：{ n, stones（家具格編號陣列）, start, free（空地格數）, solution（一條正確的路，從 start 開始）, level } */
    function makeLevel(level, rand) {
        rand = rand || Math.random;
        var n = sizeFor(level), ns = Math.min(stonesFor(level), n * n - MIN_FREE), total = n * n, t0 = Date.now();
        for (var tr = 0; tr < GEN_TRIES; tr++) {
            if (tr > 20 && Date.now() - t0 > GEN_BUDGET_MS) break;         /* 試太久就停（改用下面的保底），不讓玩家等 */
            var lay = pickLayout(n, ns, rand);
            var blocked = new Uint8Array(total), stones = lay.stones, start = lay.start;
            stones.forEach(function (i) { blocked[i] = 1; });
            var free = total - ns;
            if (!parityOk(n, blocked, start) || !connected(n, blocked, start)) continue;
            if (level > WARMUP && shortcutWorks(n, blocked, start, free)) continue;
            var path = findPath(n, blocked, start, rand);
            if (!path) continue;
            return { n: n, stones: stones.slice().sort(function (a, b) { return a - b; }), start: start, free: free, solution: path, level: level };
        }
        /* 第二階段：先造一條走遍全部格子的路 P，取其中連續的 free 格當「要鋪的地」（路的前後 ns 格就是家具），這樣一定有解、空地一定連在一起 */
        var free2 = total - ns;
        for (var tb = 0; tb < BITE_TRIES; tb++) {
            if (Date.now() - t0 > GEN_BUDGET_MS * 2) break;
            var P = randomHamPath(n, rand), a = Math.floor(rand() * (ns + 1)), sub = P.slice(a, a + free2);
            var blocked2 = new Uint8Array(total), stones2 = P.slice(0, a).concat(P.slice(a + free2));
            stones2.forEach(function (i) { blocked2[i] = 1; });
            if (level > WARMUP && shortcutWorks(n, blocked2, sub[0], free2)) continue;
            return { n: n, stones: stones2.sort(function (x, y) { return x - y; }), start: sub[0], free: free2, solution: sub, level: level };
        }
        /* 保底（極少用到）：空房間、從角落蛇行就鋪得完 */
        var sol = []; for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) sol.push(r * n + (r % 2 ? n - 1 - c : c));
        return { n: n, stones: [], start: 0, free: total, solution: sol, level: level };
    }
    /* 目前的鋪法：{ path（已鋪的格子，第 0 個是起點，最後一個是捲頭）, vis（Uint8Array：1＝已鋪或家具）, free } */
    function newState(q) {
        var vis = new Uint8Array(q.n * q.n);
        q.stones.forEach(function (i) { vis[i] = 2; });
        vis[q.start] = 1;
        return { n: q.n, path: [q.start], vis: vis, free: q.free };
    }
    /* 手指拖到格子 cell：是上一格（路徑倒數第二個）＝把地毯捲回一格；是捲頭的相鄰空格＝再鋪一格；其他不動。回傳 'add'／'back'／null */
    function applyMove(s, cell) {
        var p = s.path, head = p[p.length - 1];
        if (p.length >= 2 && cell === p[p.length - 2]) { s.vis[head] = 0; p.pop(); return 'back'; }
        if (adjacent(s.n, head, cell) && !s.vis[cell]) { s.vis[cell] = 1; p.push(cell); return 'add'; }
        return null;
    }
    function isDone(s) { return s.path.length === s.free; }
    /* 走進死路：還沒鋪滿，而且捲頭旁邊已經沒有可以鋪的空格 */
    function isStuck(s) {
        if (isDone(s)) return false;
        var head = s.path[s.path.length - 1];
        return neighbors(s.n, head).every(function (j) { return s.vis[j]; });
    }
    function rating(n) {
        if (n >= 25) return '地毯大師！';
        if (n >= 15) return '腦袋很會繞！';
        if (n >= 8) return '不錯喔！';
        if (n >= 3) return '再接再厲！';
        return '先看哪一格最容易變成孤島，再來一次！';
    }

    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 5, stageClass: 'cpt-stage',
            numText: function (v) { return v + ' 關'; },
            rating: rating,
            lines: function (S) { return ['通過 ' + S.cleared + ' 關']; },
            setup: setup
        });
    }

    function setup(api) {
        var stage = api.stage, level = api.level;
        var q = makeLevel(level, api.rand), n = q.n, st = newState(q), done = false;
        api.info = q;
        console.log('[鋪地毯] 第 ' + level + ' 關：' + n + '×' + n + '，家具 ' + q.stones.length + ' 個，要鋪 ' + q.free + ' 格，起點第 ' + (q.start + 1) + ' 格；限時 ' + timeMs(q.free) + ' ms');

        var W = stage.clientWidth || 472, H = stage.clientHeight || 640, topPad = 56;
        var cell = Math.floor(Math.min((W - 20) / n, (H - topPad - 20) / n, 96)), BS = cell * n, bx = Math.round((W - BS) / 2), by = topPad + Math.round((H - topPad - BS) / 2) - 8;
        var tip = h('div', { 'class': 'qz-note cpt-tip', text: '' });
        stage.appendChild(tip);
        var board = h('div', { 'class': 'cpt-board' });
        board.style.cssText = 'left:' + bx + 'px;top:' + by + 'px;width:' + BS + 'px;height:' + BS + 'px;';
        stage.appendChild(board);
        var cells = [];
        for (var i = 0; i < n * n; i++) {
            var r = Math.floor(i / n), c = i % n, el = h('div', { 'class': 'cpt-cell ' + ((r + c) % 2 ? 'cpt-cell--b' : 'cpt-cell--a') });
            el.style.cssText = 'left:' + c * cell + 'px;top:' + r * cell + 'px;width:' + cell + 'px;height:' + cell + 'px;';
            if (st.vis[i] === 2) el.appendChild(h('div', { 'class': 'cpt-stone' }));
            board.appendChild(el); cells.push(el);
        }
        function cx(i) { return (i % n + 0.5) * cell; }
        function cy(i) { return (Math.floor(i / n) + 0.5) * cell; }
        var svg = kit.svg('svg', { 'class': 'cpt-svg', viewBox: '0 0 ' + BS + ' ' + BS, width: BS, height: BS }, board);
        var solLine = kit.svg('path', { 'class': 'cpt-sol', d: '', pathLength: 1 }, svg);
        var rug = kit.svg('path', { 'class': 'cpt-rug', d: '' }, svg);
        var rugPat = kit.svg('path', { 'class': 'cpt-rug-pat', d: '' }, svg);
        rug.setAttribute('stroke-width', (cell * 0.64).toFixed(1)); rugPat.setAttribute('stroke-width', (cell * 0.34).toFixed(1));
        var roll = kit.svg('circle', { 'class': 'cpt-roll', r: cell * 0.33, cx: 0, cy: 0 }, svg), rollIn = kit.svg('circle', { 'class': 'cpt-roll-in', r: cell * 0.14, cx: 0, cy: 0 }, svg);
        function pathD(p) { return p.map(function (k, j) { return (j ? 'L' : 'M') + cx(k).toFixed(1) + ' ' + cy(k).toFixed(1); }).join(' '); }
        function paint() {
            var d = pathD(st.path), head = st.path[st.path.length - 1];
            if (st.path.length === 1) d += ' L' + (cx(head) + 0.01) + ' ' + cy(head);              /* 只有一格時畫一個圓點 */
            rug.setAttribute('d', d); rugPat.setAttribute('d', d);
            roll.setAttribute('cx', cx(head)); roll.setAttribute('cy', cy(head)); rollIn.setAttribute('cx', cx(head)); rollIn.setAttribute('cy', cy(head));
            tip.textContent = '已鋪 ' + st.path.length + '／' + st.free + ' 格　往回拖＝把地毯捲回來';
        }
        paint();
        api.timer(timeMs(q.free), function () { finish('time'); });
        if (level === 1 && kit.once('carpet.hint')) {
            var nb = neighbors(n, q.start).filter(function (j) { return !st.vis[j]; })[0];
            kit.hintOn(stage, null, { mode: 'drag', x: bx + cx(q.start), y: by + cy(q.start), dx: cx(nb) - cx(q.start), dy: cy(nb) - cy(q.start), delay: 500, text: '從地毯捲往旁邊拖，每格都要鋪' });
        }

        /* 手指：從捲頭按下才開始鋪；移動時把手指經過的每一格依序處理（手指一次跨好幾格，也不會漏格） */
        var pid = null, lastPt = null;
        function cellAt(x, y) {
            var c = Math.floor((x - bx) / cell), r = Math.floor((y - by) / cell);
            return c < 0 || c >= n || r < 0 || r >= n ? -1 : r * n + c;
        }
        function feed(p) {
            if (api.over || done) return;
            var from = lastPt || p, dist = kit.dist(from.x, from.y, p.x, p.y), steps = Math.max(1, Math.ceil(dist / (cell / 4)));
            for (var s = 1; s <= steps && !done && !api.over; s++) {
                var x = from.x + (p.x - from.x) * s / steps, y = from.y + (p.y - from.y) * s / steps, k = cellAt(x, y);
                if (k < 0) continue;
                var act = applyMove(st, k);
                if (act) { Sfx.play(act === 'add' ? 'tick' : 'flip'); paint(); check(); }
            }
            lastPt = p;
        }
        stage.addEventListener('pointerdown', function (e) {
            if (api.over || done || pid != null) return;
            var p = kit.localPt(e, stage), k = cellAt(p.x, p.y), head = st.path[st.path.length - 1];
            if (k !== head) return;                                    /* 要從捲頭（黃色地毯捲）開始拖 */
            e.preventDefault(); pid = e.pointerId; lastPt = p;
            try { stage.setPointerCapture(e.pointerId); } catch (err) { }
        });
        stage.addEventListener('pointermove', function (e) { if (pid === e.pointerId) feed(kit.localPt(e, stage)); });
        function up(e) { if (pid === e.pointerId) { pid = null; lastPt = null; } }
        stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up);

        function check() {
            if (isDone(st)) finish('ok');
            else if (isStuck(st)) finish('stuck');
        }
        /* 結束：kind＝'ok'（鋪滿了）／'stuck'（走進死路）／'time'（時間到） */
        function finish(kind) {
            if (done || api.over) return;
            done = true; pid = null;
            if (kind === 'ok') {
                cells.forEach(function (el) { el.classList.add('cpt-cell--ok'); });
                tip.textContent = '整個房間都鋪好了！';
                kit.flash(stage, true, api.my);
                api.pass({ delay: 1500 });
                return;
            }
            /* 失敗：沒鋪到的格子閃紅，再用綠線畫出一條正確的路，停格 2.8 秒 */
            var miss = 0;
            for (var k = 0; k < n * n; k++) if (st.vis[k] === 0) { cells[k].classList.add('cpt-cell--miss'); miss++; }
            solLine.setAttribute('d', pathD(q.solution));
            solLine.classList.add('cpt-sol--draw');
            tip.textContent = kind === 'time' ? '時間到！綠線是其中一種鋪法' : '走進死路了！綠線是其中一種鋪法';
            kit.flash(stage, false, api.my);
            api.fail({ delay: 2800, lines: [(kind === 'time' ? '時間到，' : '走進死路，') + '還有 ' + miss + ' 格沒鋪到', '房間 ' + n + '×' + n + '、家具 ' + q.stones.length + ' 個、要鋪 ' + q.free + ' 格'] });
        }
        /* 驗證用：api.solve 照正確的路一格一格鋪完；api.wrong 往最容易走進死路的方向鋪（不動腦的走法）直到被困住 */
        api.solve = function () { q.solution.slice(1).forEach(function (k) { if (!done) { applyMove(st, k); } }); paint(); check(); };
        api.wrong = function () {
            var guard = 0;
            while (!done && guard++ < 400) {
                var head = st.path[st.path.length - 1], nb = neighbors(n, head).filter(function (j) { return !st.vis[j]; });
                if (!nb.length) { check(); break; }
                nb.sort(function (a, b) { return neighbors(n, a).filter(function (j) { return !st.vis[j]; }).length - neighbors(n, b).filter(function (j) { return !st.vis[j]; }).length; });
                applyMove(st, nb[nb.length - 1]); paint();
                if (isDone(st)) break;
            }
            if (!done) { if (isDone(st)) check(); else finish('time'); }
        };
    }

    var G = {
        id: ID,
        name: '鋪地毯',
        rule: '房間裡要鋪地毯。**手指從黃色的地毯捲開始，往上下左右的相鄰格拖，一路把地毯鋪出去**。**每一格地板都要剛好鋪到一次**，放著家具（灰色方塊）的格子不能走。**往回拖就是把地毯捲回來**。整個房間鋪滿就過關；走進死路或來不及就結束，看你能過幾關。越後面，房間越大、家具越多！',
        mount: mount,
        score: SCORE,
        test: {
            sizeFor: sizeFor, stonesFor: stonesFor, timeMs: timeMs, parityOk: parityOk, neighbors: neighbors, adjacent: adjacent, connected: connected, findPath: findPath, greedyWalk: greedyWalk, shortcutWorks: shortcutWorks,
            makeLevel: makeLevel, pickLayout: pickLayout, randomHamPath: randomHamPath, GEN_TRIES: GEN_TRIES, newState: newState, applyMove: applyMove, isDone: isDone, isStuck: isStuck, rating: rating,
            RAMP_LEVELS: RAMP_LEVELS, N_RANGE: N_RANGE, STONES: STONES, WARMUP: WARMUP, TIME_BASE: TIME_BASE, TIME_PER_CELL: TIME_PER_CELL, MIN_FREE: MIN_FREE, GREEDY_ORDERS: GREEDY_ORDERS, MAX_LEVEL: MAX_LEVEL
        }
    };
    Reaction.register(G);
})();
