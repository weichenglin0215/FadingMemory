/* ═══════════════════════════════════════════════════════════════════
   reaction_oneway.js — 秒反應・單行道（企劃 224）
   俯視的棋盤式街道，每一段路上都畫著單行道的箭頭。計程車在左下角，客人要去右上角的醫院。
   手指從計程車開始，沿著街道拖出路線，**只能順著箭頭的方向走**，逆向的路段拖不過去（會閃紅）。到得了醫院就過關。
   ───────────────────────────────────────────────────────────────────
   · 難度：路口 3×3 → 7×7（N）、限時 20 → 12 秒（TIME_S）、一定要繞的遠路 0 → 6 格（DETOUR）、「死巷」（走進去就出不來的路口）0 → 4 個（TRAPS），都是線性。
   · 出題（makeLevel）：先隨機走出一條從計程車到醫院的「自己不交叉的路」（至少要有 manhattan ＋ 繞路格數 那麼長），沿著這條路把每一段設成順著走的方向，
     其他每一段隨機決定方向；再檢查：
       ① 最短的合法路線至少比直線距離多繞 DETOUR 格（所以最直的那條路一定有一段是逆向的）；
       ② 第 2 關起，只往右、往上走的「最直路線」一定走不通（沒有任何一條單調路線）；
       ③ 「死巷」（從起點走得到、卻走不到醫院的路口）至少有 TRAPS 個：走進去只能往回退。
     條件做不到就重抽，所以每一題一定有解。
   · 操作：手指拖到相鄰的路口＝往前走（要順著箭頭）；拖回上一個路口＝退回一格（這是改規劃，不是開倒車）；不能走回已經走過的路口。
   · 失敗（時間到）：把一條可以到醫院的路線用綠色畫出來，你停下來的地方打紅圈（如果停在死巷裡，就是「卡在這裡」），停格 2.8 秒。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'oneway';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 60 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 20;                       /* 幾關之後難度到頂 */
    var N = [3, 7];                             /* 路口的行列數：第 1 關 → 到頂 */
    var TIME_S = [20, 12];                      /* 每關限時（秒）：第 1 關 → 到頂 */
    var DETOUR = [0, 6];                        /* 最短的合法路線，比直線距離（|列差|＋|欄差|）至少多繞幾格：第 1 關 → 到頂（會調成偶數） */
    var TRAPS = [0, 4];                         /* 「死巷」路口（走得到、卻到不了醫院）至少幾個：第 1 關 → 到頂 */
    var WARMUP = 1;                             /* 前幾關是暖身：不要求「最直的路走不通」 */
    var MAX_LEVEL = 60;
    var neighbors = kit.gridNeighbors, adjacent = kit.gridAdjacent;

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function sizeFor(level) { return Math.round(kit.ramp(level, N[0], N[1], RAMP_LEVELS)); }
    function timeMs(level) { return Math.round(kit.ramp(level, TIME_S[0], TIME_S[1], RAMP_LEVELS) * 1000); }
    function detourFor(level) { return 2 * Math.round(kit.ramp(level, DETOUR[0], DETOUR[1], RAMP_LEVELS) / 2); }
    function trapsFor(level) { return Math.round(kit.ramp(level, TRAPS[0], TRAPS[1], RAMP_LEVELS)); }
    /* 路口編號 i ＝ 列 × n ＋ 欄；起點在左下角、醫院在右上角 */
    function startOf(n) { return (n - 1) * n; }
    function goalOf(n) { return n - 1; }
    function manhattan(n, a, b) { return Math.abs(Math.floor(a / n) - Math.floor(b / n)) + Math.abs(a % n - b % n); }
    /* 這一段路能不能從 a 開到 b（相鄰、而且箭頭是 a→b）。q.allow 是 Set，放 'a,b' 字串 */
    function canMove(q, a, b) { return q.allow.has(a + ',' + b); }
    function outgoing(q, a) { return neighbors(q.n, a).filter(function (b) { return canMove(q, a, b); }); }
    /* 從 from 出發能走到的所有路口（有向的 BFS）；回傳每個路口離 from 的步數（走不到＝−1）*/
    function distFrom(q, from) {
        var d = new Array(q.n * q.n).fill(-1), queue = [from]; d[from] = 0;
        for (var i = 0; i < queue.length; i++) { var a = queue[i]; outgoing(q, a).forEach(function (b) { if (d[b] < 0) { d[b] = d[a] + 1; queue.push(b); } }); }
        return d;
    }
    /* 哪些路口走得到醫院（反向 BFS） */
    function canReachGoal(q) {
        var ok = new Array(q.n * q.n).fill(false), queue = [q.goal]; ok[q.goal] = true;
        for (var i = 0; i < queue.length; i++) { var b = queue[i]; neighbors(q.n, b).forEach(function (a) { if (!ok[a] && canMove(q, a, b)) { ok[a] = true; queue.push(a); } }); }
        return ok;
    }
    /* 死巷：從起點走得到、卻到不了醫院的路口 */
    function trapNodes(q) {
        var d = distFrom(q, q.start), ok = canReachGoal(q), out = [];
        for (var i = 0; i < d.length; i++) if (d[i] >= 0 && !ok[i]) out.push(i);
        return out;
    }
    /* 只往右、往上走的「最直路線」能不能走到醫院（有一條就是 true） */
    function monotoneExists(q) {
        var n = q.n, reach = new Array(n * n).fill(false);
        reach[q.start] = true;
        for (var r = n - 1; r >= 0; r--) for (var c = 0; c < n; c++) {
            var i = r * n + c;
            if (!reach[i]) continue;
            if (c + 1 < n && canMove(q, i, i + 1)) reach[i + 1] = true;
            if (r - 1 >= 0 && canMove(q, i, i - n)) reach[i - n] = true;
        }
        return reach[q.goal];
    }
    /* 一條最短的合法路線（路口編號陣列，從起點到醫院）；走不到回傳 null */
    function solutionPath(q) {
        var prev = new Array(q.n * q.n).fill(-2), queue = [q.start]; prev[q.start] = -1;
        for (var i = 0; i < queue.length; i++) { var a = queue[i]; if (a === q.goal) break; outgoing(q, a).forEach(function (b) { if (prev[b] === -2) { prev[b] = a; queue.push(b); } }); }
        if (prev[q.goal] === -2) return null;
        var path = [], cur = q.goal;
        while (cur !== -1) { path.push(cur); cur = prev[cur]; }
        return path.reverse();
    }
    /* 隨機走一條「自己不交叉」的路：從起點到醫院、至少 minLen 格（醫院要等走夠長了才可以踏進去）；失敗回傳 null */
    function randomRoute(n, minLen, rand) {
        var start = startOf(n), goal = goalOf(n), vis = new Uint8Array(n * n), path = [start], guard = 0;
        vis[start] = 1;
        while (guard++ < n * n * 8) {
            var cur = path[path.length - 1];
            if (cur === goal) return path;
            var cand = neighbors(n, cur).filter(function (b) { return !vis[b] && (b !== goal || path.length >= minLen); });
            if (!cand.length) return null;
            /* 比較偏好朝醫院的方向走，但也常常岔出去（繞遠路） */
            cand.sort(function (a, b) { return manhattan(n, a, goal) - manhattan(n, b, goal); });
            var pick = rand() < 0.55 ? cand[0] : kit.pick(cand, rand);
            vis[pick] = 1; path.push(pick);
        }
        return null;
    }
    /* 出一關：{ n, start, goal, allow（Set：'a,b' ＝ 可以從路口 a 開到相鄰路口 b）, solution（一條最短合法路線）, traps（死巷路口陣列）, level } */
    function makeLevel(level, rand) {
        rand = rand || Math.random;
        var n = sizeFor(level), start = startOf(n), goal = goalOf(n), need = detourFor(level), minTraps = trapsFor(level), man = manhattan(n, start, goal);
        for (var tr = 0; tr < 3000; tr++) {
            var route = randomRoute(n, man + need + (rand() < 0.5 ? 0 : 2), rand);
            if (!route) continue;
            var allow = new Set(), onRoute = new Set();
            for (var t = 0; t + 1 < route.length; t++) { allow.add(route[t] + ',' + route[t + 1]); onRoute.add(Math.min(route[t], route[t + 1]) + ',' + Math.max(route[t], route[t + 1])); }
            for (var a = 0; a < n * n; a++) neighbors(n, a).forEach(function (b) {
                if (b < a) return;
                var key = a + ',' + b;
                if (onRoute.has(key)) return;
                if (rand() < 0.5) allow.add(a + ',' + b); else allow.add(b + ',' + a);
            });
            var q = { n: n, start: start, goal: goal, allow: allow, level: level };
            var sol = solutionPath(q);
            if (!sol || sol.length - 1 < man + need) continue;                                   /* ① 要繞夠遠 */
            if (level > WARMUP && monotoneExists(q)) continue;                                   /* ② 最直的路走不通 */
            var traps = trapNodes(q);
            if (traps.length < minTraps) continue;                                               /* ③ 死巷夠多 */
            q.solution = sol; q.traps = traps;
            return q;
        }
        /* 保底（極少用到）：整條路是順著蛇行的（先往右、再往上…），一定走得通 */
        var allow2 = new Set(), route2 = [], r2, c2;
        for (r2 = n - 1; r2 >= 0; r2--) for (c2 = 0; c2 < n; c2++) route2.push(r2 * n + ((n - 1 - r2) % 2 ? n - 1 - c2 : c2));
        for (var u = 0; u + 1 < route2.length; u++) allow2.add(route2[u] + ',' + route2[u + 1]);
        var q2 = { n: n, start: start, goal: goal, allow: allow2, level: level }; q2.solution = route2.slice(0, route2.indexOf(goal) + 1); q2.traps = trapNodes(q2);
        return q2;
    }
    /* 目前的路線：path（路口編號，第 0 個是起點，最後一個是計程車的位置）。往 node 拖：回傳 'add'（順著箭頭走一格）／'back'（拖回上一個路口＝退一格）／'blocked'（相鄰但逆向、或是已經走過的路口）／null（不相鄰） */
    function drag(q, path, node) {
        var head = path[path.length - 1];
        if (path.length >= 2 && node === path[path.length - 2]) { path.pop(); return 'back'; }
        if (!adjacent(q.n, head, node)) return null;
        if (path.indexOf(node) >= 0) return 'blocked';
        if (!canMove(q, head, node)) return 'blocked';
        path.push(node);
        return 'add';
    }
    function rating(n) {
        if (n >= 20) return '老司機！';
        if (n >= 12) return '認路高手！';
        if (n >= 6) return '不錯喔！';
        if (n >= 3) return '再接再厲！';
        return '先看哪裡有死巷，再來一次！';
    }

    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 5, stageClass: 'owy-stage',
            numText: function (v) { return v + ' 關'; },
            rating: rating,
            lines: function (S) { return ['通過 ' + S.cleared + ' 關']; },
            setup: setup
        });
    }

    function setup(api) {
        var stage = api.stage, level = api.level;
        var q = makeLevel(level, api.rand), n = q.n, path = [q.start], over = false;
        api.info = q;
        console.log('[單行道] 第 ' + level + ' 關：' + n + '×' + n + ' 個路口，最短路線 ' + (q.solution.length - 1) + ' 段（直線距離 ' + manhattan(n, q.start, q.goal) + '），死巷 ' + q.traps.length + ' 個；限時 ' + timeMs(level) + ' ms');

        var W = stage.clientWidth || 472, H = stage.clientHeight || 640, topPad = 56, pad = 44;
        var sp = Math.floor(Math.min((W - 2 * pad) / (n - 1), (H - topPad - 2 * pad) / (n - 1), 120)), BW = sp * (n - 1), ox = Math.round((W - BW) / 2), oy = topPad + Math.round((H - topPad - BW) / 2) - 8;
        function px(i) { return ox + (i % n) * sp; }
        function py(i) { return oy + Math.floor(i / n) * sp; }
        var tip = h('div', { 'class': 'qz-note owy-tip', text: '順著箭頭，把計程車帶到醫院' });
        stage.appendChild(tip);
        var svg = kit.svg('svg', { 'class': 'owy-svg', viewBox: '0 0 ' + W + ' ' + H, width: W, height: H }, stage);
        var gRoad = kit.svg('g', {}, svg), gSol = kit.svg('g', {}, svg), gRoute = kit.svg('g', {}, svg), gSign = kit.svg('g', {}, svg), gNode = kit.svg('g', {}, svg);
        var rw = Math.max(16, sp * 0.3);
        /* 路：每一段畫一條白色粗線；中間放一個藍色圓形的單行道標誌，箭頭指向可以開的方向 */
        for (var a = 0; a < n * n; a++) neighbors(n, a).forEach(function (b) {
            if (b < a) return;
            var from = canMove(q, a, b) ? a : b, to = from === a ? b : a;
            var road = kit.svg('line', { x1: px(a), y1: py(a), x2: px(b), y2: py(b), 'class': 'owy-road' }, gRoad);
            road.setAttribute('stroke-width', rw.toFixed(1));
            var mx = (px(a) + px(b)) / 2, my = (py(a) + py(b)) / 2, ang = Math.atan2(py(to) - py(from), px(to) - px(from)) * 180 / Math.PI;
            var g = kit.svg('g', { 'class': 'owy-sign', transform: 'translate(' + mx.toFixed(1) + ' ' + my.toFixed(1) + ') rotate(' + ang.toFixed(1) + ')' }, gSign);
            kit.svg('circle', { 'class': 'owy-sign-bg', cx: 0, cy: 0, r: rw * 0.46 }, g);
            kit.svg('path', { 'class': 'owy-sign-arrow', d: 'M' + (-rw * 0.24) + ' 0 H' + (rw * 0.14) + ' M' + (rw * 0.02) + ' ' + (-rw * 0.16) + ' L' + (rw * 0.22) + ' 0 L' + (rw * 0.02) + ' ' + (rw * 0.16) }, g);
        });
        for (var i = 0; i < n * n; i++) kit.svg('circle', { 'class': 'owy-node', cx: px(i), cy: py(i), r: rw * 0.42 }, gNode);
        /* 醫院：紅十字的小房子（畫在右上角路口的外面）；計程車：黃色的小車，停在路線的最前端 */
        var hos = kit.svg('g', { 'class': 'owy-hospital', transform: 'translate(' + px(q.goal) + ' ' + py(q.goal) + ')' }, gNode);
        kit.svg('rect', { 'class': 'owy-hos-body', x: -rw * 0.62, y: -rw * 0.62, width: rw * 1.24, height: rw * 1.24, rx: 5 }, hos);
        kit.svg('path', { 'class': 'owy-hos-cross', d: 'M' + (-rw * 0.4) + ' 0 H' + (rw * 0.4) + ' M0 ' + (-rw * 0.4) + ' V' + (rw * 0.4) }, hos);
        var taxi = kit.svg('g', { 'class': 'owy-taxi' }, gNode);
        kit.svg('rect', { 'class': 'owy-taxi-body', x: -rw * 0.55, y: -rw * 0.34, width: rw * 1.1, height: rw * 0.68, rx: 7 }, taxi);
        kit.svg('rect', { 'class': 'owy-taxi-win', x: -rw * 0.28, y: -rw * 0.22, width: rw * 0.56, height: rw * 0.3, rx: 3 }, taxi);
        var bad = kit.svg('circle', { 'class': 'owy-bad', cx: -99, cy: -99, r: rw * 0.9 }, gNode);
        var routeLine = kit.svg('path', { 'class': 'owy-route', d: '' }, gRoute);
        routeLine.setAttribute('stroke-width', (rw * 0.34).toFixed(1));
        function paint() {
            var head = path[path.length - 1];
            routeLine.setAttribute('d', path.map(function (k, j) { return (j ? 'L' : 'M') + px(k) + ' ' + py(k); }).join(' '));
            taxi.setAttribute('transform', 'translate(' + px(head) + ' ' + py(head) + ')');
        }
        paint();
        api.timer(timeMs(level), function () { finish('time'); });
        if (level === 1 && kit.once('oneway.hint')) {
            var s1 = q.solution[0], s2 = q.solution[1];
            kit.hintOn(stage, null, { mode: 'drag', x: px(s1), y: py(s1), dx: px(s2) - px(s1), dy: py(s2) - py(s1), delay: 500, text: '順著箭頭拖到醫院' });
        }

        var pid = null, lastPt = null, lastBadAt = 0;
        function nodeAt(x, y) {
            var best = -1, bd = sp * 0.42;
            for (var k = 0; k < n * n; k++) { var d = kit.dist(x, y, px(k), py(k)); if (d < bd) { bd = d; best = k; } }
            return best;
        }
        function flashBad(a, b) {
            var now = performance.now();
            if (now - lastBadAt < 350) return;
            lastBadAt = now; Sfx.play('bad');
            var l = kit.svg('line', { x1: px(a), y1: py(a), x2: px(b), y2: py(b), 'class': 'owy-road--bad' }, gRoute);
            l.setAttribute('stroke-width', (rw * 0.7).toFixed(1));
            api.after(450, function () { if (l.parentNode) l.parentNode.removeChild(l); });
        }
        function feed(p) {
            if (over || api.over) return;
            var from = lastPt || p, dist = kit.dist(from.x, from.y, p.x, p.y), steps = Math.max(1, Math.ceil(dist / (sp / 8)));
            for (var s = 1; s <= steps && !over && !api.over; s++) {
                var x = from.x + (p.x - from.x) * s / steps, y = from.y + (p.y - from.y) * s / steps, k = nodeAt(x, y);
                if (k < 0) continue;
                var head = path[path.length - 1];
                var act = drag(q, path, k);
                if (act === 'add' || act === 'back') { Sfx.play(act === 'add' ? 'tick' : 'flip'); paint(); if (path[path.length - 1] === q.goal) finish('ok'); }
                else if (act === 'blocked') flashBad(head, k);
            }
            lastPt = p;
        }
        stage.addEventListener('pointerdown', function (e) {
            if (over || api.over || pid != null) return;
            var p = kit.localPt(e, stage), k = nodeAt(p.x, p.y);
            if (k !== path[path.length - 1]) return;                    /* 要從計程車（路線的最前端）開始拖 */
            e.preventDefault(); pid = e.pointerId; lastPt = p;
            try { stage.setPointerCapture(e.pointerId); } catch (err) { }
        });
        stage.addEventListener('pointermove', function (e) { if (pid === e.pointerId) feed(kit.localPt(e, stage)); });
        function up(e) { if (pid === e.pointerId) { pid = null; lastPt = null; } }
        stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up);

        /* 結束：kind＝'ok'（到醫院了）／'time'（時間到） */
        function finish(kind) {
            if (over || api.over) return;
            over = true; pid = null;
            if (kind === 'ok') {
                tip.textContent = '平安送到醫院了！';
                kit.flash(stage, true, api.my);
                api.pass({ delay: 1500 });
                return;
            }
            var head = path[path.length - 1], stuck = outgoing(q, head).every(function (b) { return path.indexOf(b) >= 0; });
            bad.setAttribute('cx', px(head)); bad.setAttribute('cy', py(head));
            var sol = kit.svg('path', { 'class': 'owy-sol', d: q.solution.map(function (k, j) { return (j ? 'L' : 'M') + px(k) + ' ' + py(k); }).join(' '), pathLength: 1 }, gSol);
            sol.setAttribute('stroke-width', (rw * 0.34).toFixed(1));
            gSol.classList.add('owy-sol--draw');
            tip.textContent = '時間到！綠線是可以開到醫院的路';
            kit.flash(stage, false, api.my);
            api.fail({ delay: 2800, lines: ['時間到，' + (stuck ? '你卡在死巷裡了（紅圈）' : '你停在紅圈的地方，還沒到醫院'), '最短的合法路線要 ' + (q.solution.length - 1) + ' 段（直線距離只有 ' + manhattan(n, q.start, q.goal) + '）'] });
        }
        /* 驗證用：api.solve 照最短合法路線一格一格開到醫院；api.wrong 直接當作時間到 */
        api.solve = function () { path.length = 1; q.solution.slice(1).forEach(function (k) { drag(q, path, k); }); paint(); if (path[path.length - 1] === q.goal) finish('ok'); };
        api.wrong = function () { finish('time'); };
    }

    var G = {
        id: ID,
        name: '單行道',
        rule: '街道上畫滿了單行道的箭頭。**手指從左下角的計程車開始，沿著街道拖出路線，只能順著箭頭的方向走**，逆向的路段拖不過去。**把計程車帶到右上角的醫院**就過關。拖回上一個路口，路線就退回一格。最直的那條路一定有一段是逆向的，還要小心**走進去就出不來的死巷**。來不及就結束，看你能過幾關。越後面，路口越多、繞的路越遠！',
        mount: mount,
        score: SCORE,
        test: {
            sizeFor: sizeFor, timeMs: timeMs, detourFor: detourFor, trapsFor: trapsFor, startOf: startOf, goalOf: goalOf, manhattan: manhattan, canMove: canMove, outgoing: outgoing, distFrom: distFrom, canReachGoal: canReachGoal,
            trapNodes: trapNodes, monotoneExists: monotoneExists, solutionPath: solutionPath, randomRoute: randomRoute, makeLevel: makeLevel, drag: drag, rating: rating,
            RAMP_LEVELS: RAMP_LEVELS, N: N, TIME_S: TIME_S, DETOUR: DETOUR, TRAPS: TRAPS, WARMUP: WARMUP, MAX_LEVEL: MAX_LEVEL
        }
    };
    Reaction.register(G);
})();
