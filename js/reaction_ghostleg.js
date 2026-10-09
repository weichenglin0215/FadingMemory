/* ═══════════════════════════════════════════════════════════════════
   reaction_ghostleg.js — 秒反應・鬼腳圖
   台灣童玩「阿彌陀佛」鬼腳圖：上方 5 個起點、下方 5 個終點，系統指定一個起點（橘色發亮），
   手指從那裡沿著線往下描，遇到橫線就轉過去，一路描到最下面。關卡制，成績＝通過關數。
   ───────────────────────────────────────────────────────────────────
   · 5 條直線 × ROWS 層；橫線連接相鄰兩條直線，同一層的橫線不可相鄰（不然路徑不明確）；
     橫線總數 RUNGS 6→30（線性）。
   · 正確路徑由程式模擬（遇到橫線就轉）；手指離正確路徑超過 TOL px 就算走偏、當關失敗；
     放開手指＝放棄；描到終點才過關。
   · 「遮」：橫線很細、顏色接近直線，對比隨關卡降低（RUNG_ALPHA 0.9→0.55）；
     另有 FAKES 條「假橫線」（只有半段、不連到鄰線）當干擾，數量 0→8。
   · 起點盡量選「終點和起點不同欄」的（不會直直走到底）。限時 TIME_S 30→18 秒。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'ghostleg';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 30 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 15;                       /* 幾關之後難度到頂（也是最後一關） */
    var COLS = 5, ROWS = 16;                    /* 直線數、層數 */
    var X0 = 52, DX = 92, Y_TOP = 76, Y_BOT = 520;   /* 第 1 條直線的 x、直線間距、上下端 y（舞台座標） */
    var RUNGS = [6, 30];                        /* 橫線數：第 1 關 → 到頂 */
    var FAKES = [0, 8];                         /* 假橫線數 */
    var RUNG_ALPHA = [0.9, 0.55];               /* 橫線的不透明度（越低越難看見） */
    var TIME_S = [30, 18];                      /* 每關限時（秒） */
    var TOL = 36;                               /* 手指離正確路徑多遠算走偏（px） */
    var START_R = 50;                           /* 要在起點多近的地方按下 */
    var LABELS = ['甲', '乙', '丙', '丁', '戊'];

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function colX(c) { return X0 + c * DX; }
    function rowY(r) { return Y_TOP + (r + 0.5) * (Y_BOT - Y_TOP) / ROWS; }
    function rungCount(level) { return Math.round(kit.ramp(level, RUNGS[0], RUNGS[1], RAMP_LEVELS)); }
    function fakeCount(level) { return Math.round(kit.ramp(level, FAKES[0], FAKES[1], RAMP_LEVELS)); }
    function alphaAt(level) { return kit.ramp(level, RUNG_ALPHA[0], RUNG_ALPHA[1], RAMP_LEVELS); }
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
    /* 產生橫線：n 條，同一層不相鄰，回傳 [{row, col}]（col 是左邊那條直線的欄，0～COLS−2）。
       做法：先把 n 條分配到各層（每層最多 2 條），再在每一層挑不相鄰的位置，所以最多可以放 2×ROWS 條 */
    var PAIRS = [[0, 2], [0, 3], [1, 3]];           /* 一層放兩條時，不相鄰的位置組合 */
    function makeRungs(n, rand) {
        rand = rand || Math.random;
        n = Math.min(n, 2 * ROWS);
        var slots = [], r;
        for (r = 0; r < ROWS; r++) slots.push(r, r);
        var chosen = kit.shuffle(slots, rand).slice(0, n), perRow = {};
        chosen.forEach(function (row) { perRow[row] = (perRow[row] || 0) + 1; });
        var rungs = [];
        Object.keys(perRow).forEach(function (k) {
            var row = Number(k);
            var cols = perRow[k] === 2 ? kit.pick(PAIRS, rand) : [kit.randInt(0, COLS - 2, rand)];
            cols.forEach(function (c) { rungs.push({ row: row, col: c }); });
        });
        return rungs;
    }
    /* 假橫線：只有半段（從某條直線伸出去 40% 的間距），所在層在那條直線上沒有真橫線 */
    function makeFakes(n, rungs, rand) {
        rand = rand || Math.random;
        var s = rungSet(rungs), out = [], tries = 0;
        while (out.length < n && tries++ < 3000) {
            var row = kit.randInt(0, ROWS - 1, rand), col = kit.randInt(0, COLS - 1, rand), dir = rand() < 0.5 ? 1 : -1;
            if (col + dir < 0 || col + dir > COLS - 1) continue;
            /* 這一層、這條直線的兩側都沒有真橫線（不然會跟真橫線疊在一起） */
            if (s[row + ',' + col] || s[row + ',' + (col - 1)]) continue;
            if (out.some(function (f) { return f.row === row && f.col === col; })) continue;
            out.push({ row: row, col: col, dir: dir });
        }
        return out;
    }
    /* 出題：回傳 { rungs, fakes, start, end, route } */
    function makeLevel(level, rand) {
        rand = rand || Math.random;
        var rungs, cand, all;
        for (var tries = 0; tries < 60; tries++) {
            rungs = makeRungs(rungCount(level), rand); cand = []; all = [];
            for (var s0 = 0; s0 < COLS; s0++) { all.push(s0); if (follow(rungs, s0).end !== s0) cand.push(s0); }
            if (cand.length) break;                 /* 橫線兩兩抵銷、每個起點都直走到底的盤面不要 */
        }
        var fakes = makeFakes(fakeCount(level), rungs, rand);
        var start = kit.pick(cand.length ? cand : all, rand), f = follow(rungs, start);
        return { rungs: rungs, fakes: fakes, start: start, end: f.end, route: f.route };
    }
    /* 點到線段的距離，以及該點投影在線段上的位置（0～1） */
    function segDist(p, a, b) {
        var dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy, t = l2 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2 : 0;
        t = kit.clamp(t, 0, 1);
        var x = a.x + t * dx, y = a.y + t * dy;
        return { d: Math.sqrt((p.x - x) * (p.x - x) + (p.y - y) * (p.y - y)), t: t };
    }
    /* 手指離折線 route 最近的距離，以及最近點沿折線走了多遠（px） */
    function nearest(p, route) {
        var best = { d: 1e9, s: 0 }, acc = 0;
        for (var i = 1; i < route.length; i++) {
            var a = route[i - 1], b = route[i], len = Math.sqrt((b.x - a.x) * (b.x - a.x) + (b.y - a.y) * (b.y - a.y)), r = segDist(p, a, b);
            if (r.d < best.d) best = { d: r.d, s: acc + r.t * len };
            acc += len;
        }
        return best;
    }
    function routeLength(route) {
        var s = 0; for (var i = 1; i < route.length; i++) s += Math.sqrt(Math.pow(route[i].x - route[i - 1].x, 2) + Math.pow(route[i].y - route[i - 1].y, 2));
        return s;
    }
    function rating(n) {
        if (n >= 15) return '鬼腳圖大師！全部通關！';
        if (n >= 10) return '高手！';
        if (n >= 6) return '不錯喔！';
        if (n >= 3) return '再接再厲！';
        return '看清楚橫線再描，再來一次！';
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
        var stage = api.stage, level = api.level;
        var q = makeLevel(level, api.rand), alpha = alphaAt(level), total = routeLength(q.route);
        api.info = q;
        console.log('[鬼腳圖] 第 ' + level + ' 關：橫線 ' + q.rungs.length + ' 條、假橫線 ' + q.fakes.length + ' 條；起點 ' + LABELS[q.start] + ' → 終點 ' + (q.end + 1) + '；橫線不透明度 ' + alpha.toFixed(2) + '；限時 ' + timeMs(level) + ' ms');

        var W = stage.clientWidth || 472, H = stage.clientHeight || 640;
        var svg = kit.svg('svg', { 'class': 'gl-svg', viewBox: '0 0 ' + W + ' ' + H, width: W, height: H }, stage);
        var c;
        for (c = 0; c < COLS; c++) kit.svg('line', { x1: colX(c), x2: colX(c), y1: Y_TOP, y2: Y_BOT, 'class': 'gl-col' }, svg);
        q.rungs.forEach(function (g) { kit.svg('line', { x1: colX(g.col), x2: colX(g.col + 1), y1: rowY(g.row), y2: rowY(g.row), 'class': 'gl-rung', opacity: alpha }, svg); });
        q.fakes.forEach(function (f) { kit.svg('line', { x1: colX(f.col), x2: colX(f.col) + f.dir * DX * 0.4, y1: rowY(f.row), y2: rowY(f.row), 'class': 'gl-rung', opacity: alpha }, svg); });
        var gAns = kit.svg('g', {}, svg), trail = kit.svg('polyline', { 'class': 'gl-trail', points: '' }, svg);
        for (c = 0; c < COLS; c++) {
            var top = kit.svg('circle', { cx: colX(c), cy: Y_TOP - 28, r: 22, 'class': 'gl-token' + (c === q.start ? ' gl-token--start' : '') }, svg);
            var t1 = kit.svg('text', { x: colX(c), y: Y_TOP - 20, 'text-anchor': 'middle', 'class': 'gl-label' + (c === q.start ? ' gl-label--start' : '') }, svg); t1.textContent = LABELS[c];
            kit.svg('rect', { x: colX(c) - 22, y: Y_BOT + 8, width: 44, height: 44, rx: 8, 'class': 'gl-end' }, svg);
            var t2 = kit.svg('text', { x: colX(c), y: Y_BOT + 40, 'text-anchor': 'middle', 'class': 'gl-label' }, svg); t2.textContent = String(c + 1);
        }
        var msg = h('div', { 'class': 'gl-msg', text: '從橘色的起點，沿線往下描，遇到橫線就轉過去' });
        stage.appendChild(msg);
        var hint = null;
        if (level === 1) hint = kit.fingerHint(stage, { mode: 'drag', x: colX(q.start), y: Y_TOP - 28, dx: 0, dy: 110, delay: 300 });

        var drawing = false, pid = null, pts = [], progress = 0;
        stage.addEventListener('pointerdown', function (e) {
            if (api.over || drawing) return;
            var p = kit.localPt(e, stage);
            if (Math.sqrt(Math.pow(p.x - colX(q.start), 2) + Math.pow(p.y - (Y_TOP - 10), 2)) > START_R + 18) return;
            e.preventDefault();
            try { stage.setPointerCapture(e.pointerId); } catch (err) { }
            drawing = true; pid = e.pointerId; pts = [p]; progress = 0;
            if (hint) { hint.remove(); hint = null; }
            paintTrail();
        });
        stage.addEventListener('pointermove', function (e) {
            if (!drawing || e.pointerId !== pid || api.over) return;
            var p = kit.localPt(e, stage), n = nearest(p, q.route);
            pts.push(p); paintTrail();
            if (n.d > TOL) { drawing = false; failAt(p, '手指偏離了路線'); return; }
            if (n.s > progress) progress = n.s;
            var endp = q.route[q.route.length - 1];
            if (progress >= total - 24 && Math.sqrt(Math.pow(p.x - endp.x, 2) + Math.pow(p.y - endp.y, 2)) <= TOL + 10) { drawing = false; win(); }
        });
        function up(e) {
            if (!drawing || e.pointerId !== pid) return;
            drawing = false;
            if (!api.over) failAt(pts[pts.length - 1], '中途放開手指了');
        }
        stage.addEventListener('pointerup', up);
        stage.addEventListener('pointercancel', up);
        function paintTrail() { trail.setAttribute('points', pts.map(function (p) { return p.x.toFixed(1) + ',' + p.y.toFixed(1); }).join(' ')); }
        function showRoute() {
            kit.svg('polyline', { points: q.route.map(function (p) { return p.x + ',' + p.y; }).join(' '), 'class': 'gl-route' }, gAns);
        }
        function win() {
            showRoute(); trail.setAttribute('class', 'gl-trail gl-trail--ok');
            msg.textContent = '描到了！起點 ' + LABELS[q.start] + ' → 終點 ' + (q.end + 1);
            api.pass({ delay: 900 });
        }
        function failAt(p, why) {
            showRoute(); trail.setAttribute('class', 'gl-trail gl-trail--bad');
            if (p) kit.svg('circle', { cx: p.x, cy: p.y, r: 16, 'class': 'gl-miss' }, svg);
            msg.textContent = why + '：正確路線是綠色的線';
            api.fail({ delay: 2000, lines: [why, '正確的路線從起點 ' + LABELS[q.start] + ' 走到終點 ' + (q.end + 1), '這一關有 ' + q.rungs.length + ' 條橫線' + (q.fakes.length ? '、' + q.fakes.length + ' 條只有半段的假橫線' : '')] });
        }
        api.timer(timeMs(level), function () { drawing = false; failAt(pts.length ? pts[pts.length - 1] : null, '時間到了'); });

        /* 驗證用：用真的 PointerEvent 沿著路線（或故意偏離）描一遍 */
        function fire(type, x, y) {
            var r = stage.getBoundingClientRect(), sc = r.width / (stage.clientWidth || r.width);
            stage.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 9, clientX: r.left + x * sc, clientY: r.top + y * sc }));
        }
        function trace(offX) {
            var rt = q.route, first = rt[0];
            fire('pointerdown', first.x, Y_TOP - 10);
            for (var i = 1; i < rt.length; i++) {
                var a = rt[i - 1], b = rt[i], steps = Math.max(1, Math.ceil(Math.sqrt(Math.pow(b.x - a.x, 2) + Math.pow(b.y - a.y, 2)) / 12));
                for (var k = 1; k <= steps; k++) fire('pointermove', a.x + (b.x - a.x) * k / steps + (offX || 0), a.y + (b.y - a.y) * k / steps);
            }
            fire('pointerup', rt[rt.length - 1].x, rt[rt.length - 1].y);
        }
        api.solve = function () { trace(0); };
        api.wrong = function () { trace(90); };
    }

    var G = {
        id: ID,
        name: '鬼腳圖',
        rule: '這是台灣童玩「阿彌陀佛」。系統指定上方橘色的起點，手指從那裡沿著線往下描，遇到橫線就轉過去，一路描到最下面。手指偏離路線、中途放開、或時間到就失敗。小心，有些橫線很淡，還有只畫一半的假橫線！',
        mount: mount,
        score: SCORE,
        test: { colX: colX, rowY: rowY, rungCount: rungCount, fakeCount: fakeCount, alphaAt: alphaAt, timeMs: timeMs, follow: follow, makeRungs: makeRungs, makeFakes: makeFakes, makeLevel: makeLevel, segDist: segDist, nearest: nearest, routeLength: routeLength, rating: rating, COLS: COLS, ROWS: ROWS, RAMP_LEVELS: RAMP_LEVELS, TOL: TOL, Y_TOP: Y_TOP, Y_BOT: Y_BOT, RUNGS: RUNGS, FAKES: FAKES, RUNG_ALPHA: RUNG_ALPHA }
    };
    Reaction.register(G);
})();
