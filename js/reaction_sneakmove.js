/* ═══════════════════════════════════════════════════════════════════
   reaction_sneakmove.js — 秒反應・誰在偷偷動（企劃 152）
   畫面上散著一堆圓點，其中有幾個會「偷偷地」極慢移動，其他全部靜止，在限時內把會動的點出來。
   越後面，圓點越多、會動的越多、漂移越慢（每秒 20 像素 → 2 像素）。關卡制：點錯或來不及就結束，成績＝通過幾關。
   ───────────────────────────────────────────────────────────────────
   · V1.29（玩家意見）改玩法：
       - 圓點個數 N_DOTS ＝ [第 1 關, 到頂關卡] 線性增加（預設 10 → 30）；
       - 會動的圓點個數 MOVE_DOTS ＝ [1, 3]（隨關卡增加）；
       - 不是持續移動：每顆會動的圓點「輪流」移動 MOVE_TIME 秒（預設 3 → 1 秒）：
           只有 1 顆會動時：移動 MOVE_TIME 秒之後暫停 PAUSE_S（1）秒，再接著動；
           有 2 顆以上會動時：一顆移動 MOVE_TIME 秒之後，立刻換下一顆接著動，輪流不停；
       - 限時 TIME_S 是「只有 1 顆會動」的限制秒數；有 k 顆會動就延長成 k 倍（2 顆＝2 倍、3 顆＝3 倍）。
       - 點到任何一顆會動的圓點就算對（點到不動的或時間到就失敗）。
   · 出題（規範 Q1、Q15：先決定結果、再驗證玩家辦得到）：先決定「哪幾顆會動、各往哪個方向、每秒多快」，
     再排圓點的位置：圓點之間至少相距 MIN_GAP（圓點很多時自動縮小，最小 MIN_GAP_FLOOR）；
     每顆會動的圓點，整個限時內會走的路徑都要在畫面裡，而且離其他圓點、離其他會動的圓點的路徑至少 PATH_CLEAR，
     不會撞到或擠到別人（那樣會害人看不出來是誰在動）。
   · 位置是時間的純函式（規範 T3）：第 i 顆會動的圓點在第 t 秒的位置 ＝ 起點 ＋ 方向 × 速度 × 它「已經動了幾秒」（movedTime），畫面只是把它畫出來。
   · 難度線性（RAMP_LEVELS 關走到頂）：漂移速度 SPEED 20 → 2 像素／秒。
   · 揭曉：每一顆會動的圓點的軌跡畫成一條細線，寫出各自「漂移了 X.XXXX 像素」（到你點下去的那一刻為止）。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'sneakmove';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 60 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 30;                       /* 幾關之後難度到頂 */
    var SPEED = [20, 2];                        /* 漂移速度（像素／秒）：第 1 關 → 到頂 */
    var TIME_S = 15;                            /* 作答限時（秒）：只有 1 顆會動時的限制秒數；k 顆會動就乘 k */
    var N_DOTS = [10, 30];                      /* 圓點個數：第 1 關 → 到頂關卡 */
    var MOVE_DOTS = [1, 3];                     /* 會動的圓點個數：第 1 關 → 到頂關卡 */
    var MOVE_TIME = [3, 1];                     /* 每顆會動的圓點，一次連續移動幾秒：第 1 關 → 到頂關卡 */
    var PAUSE_S = 1;                            /* 只有 1 顆會動時，移動之後暫停幾秒（2 顆以上時不暫停，立刻換下一顆） */
    var DOT_R = 18;                             /* 圓點畫出來的半徑 */
    var HIT_R = 40;                             /* 命中半徑（比畫出來的大，手指好點） */
    var MIN_GAP = 74;                           /* 任兩顆圓點圓心至少相距多少 */
    var MIN_GAP_FLOOR = 58;                     /* 圓點太多排不下時，間距最小縮到多少 */
    var PATH_CLEAR = 52;                        /* 漂移路徑離其他圓點（與其他會動的圓點的路徑）至少多遠 */
    var MARGIN = 34;                            /* 圓點離遊戲區邊緣至少多遠 */
    var MAX_LEVEL = 60;

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function speedFor(level) { return kit.ramp(level, SPEED[0], SPEED[1], RAMP_LEVELS); }
    function dotCountFor(level) { return Math.round(kit.ramp(level, N_DOTS[0], N_DOTS[1], RAMP_LEVELS)); }
    function moverCountFor(level) { return Math.max(1, Math.round(kit.ramp(level, MOVE_DOTS[0], MOVE_DOTS[1], RAMP_LEVELS))); }
    function moveTimeFor(level) { return Math.round(kit.ramp(level, MOVE_TIME[0], MOVE_TIME[1], RAMP_LEVELS) * 100) / 100; }
    /* 限時（秒）：1 顆會動＝TIME_S，k 顆＝TIME_S × k */
    function limitFor(k) { return TIME_S * Math.max(1, k); }
    /* 點 (px,py) 到線段 (ax,ay)-(bx,by) 的最短距離 */
    function segDist(px, py, ax, ay, bx, by) {
        var dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
        var t = l2 === 0 ? 0 : kit.clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1);
        return kit.dist(px, py, ax + t * dx, ay + t * dy);
    }
    /* 兩條線段的最短距離（相交＝0） */
    function segsDist(a, b, c, d) {
        function cross(p, q, r) { return (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x); }
        var d1 = cross(a, b, c), d2 = cross(a, b, d), d3 = cross(c, d, a), d4 = cross(c, d, b);
        if (d1 * d2 < 0 && d3 * d4 < 0) return 0;
        return Math.min(segDist(a.x, a.y, c.x, c.y, d.x, d.y), segDist(b.x, b.y, c.x, c.y, d.x, d.y), segDist(c.x, c.y, a.x, a.y, b.x, b.y), segDist(d.x, d.y, a.x, a.y, b.x, b.y));
    }
    /* 第 idx 顆會動的圓點（0～k−1），到第 t 秒為止「已經動了幾秒」：
       k＝1：動 moveTime 秒、停 PAUSE_S 秒，重複；k≥2：0 號動 moveTime 秒 → 立刻換 1 號 → … → 最後一號動完又換回 0 號，輪流不停 */
    function movedTime(k, moveTime, idx, t) {
        if (t <= 0) return 0;
        if (k <= 1) {
            var cyc = moveTime + PAUSE_S, full = Math.floor(t / cyc), rem = t - full * cyc;
            return full * moveTime + Math.min(rem, moveTime);
        }
        var cycle = k * moveTime, f = Math.floor(t / cycle), r = t - f * cycle;
        return f * moveTime + kit.clamp(r - idx * moveTime, 0, moveTime);
    }
    /* 第 t 秒有哪一顆（會動的第幾顆）正在動；沒有（暫停中）回傳 −1 */
    function activeAt(k, moveTime, t) {
        if (t < 0) return -1;
        if (k <= 1) { var cyc = moveTime + PAUSE_S; return (t % cyc) < moveTime ? 0 : -1; }
        return Math.floor((t % (k * moveTime)) / moveTime);
    }
    /* 第 idx 顆會動的圓點在第 t 秒的位置 */
    function posAt(q, idx, t) {
        var m = q.movers[idx], d = q.speed * movedTime(q.movers.length, q.moveTime, idx, t);
        return { x: m.x0 + m.dx * d, y: m.y0 + m.dy * d };
    }
    /* 在 W×H 裡放 n 顆圓點，彼此至少相距 gap；放不下回傳 null */
    function placeDots(n, W, H, gap, rand) {
        var dots = [], guard = 0;
        while (dots.length < n && guard++ < 4000) {
            var x = kit.randFloat(MARGIN, W - MARGIN, rand), y = kit.randFloat(MARGIN, H - MARGIN, rand);
            if (dots.every(function (d) { return kit.dist(x, y, d.x, d.y) >= gap; })) dots.push({ x: x, y: y });
        }
        return dots.length === n ? dots : null;
    }
    /* 出一關：{ W, H, dots:[{x,y}], movers:[{idx（是第幾顆圓點）, dx, dy（單位方向）, x0, y0}], speed, moveTime, limitS, gap } */
    function makeLevel(level, W, H, rand) {
        rand = rand || Math.random;
        var speed = speedFor(level), n = dotCountFor(level), k = Math.min(moverCountFor(level), n - 1), mt = moveTimeFor(level), limit = limitFor(k);
        for (var gap = MIN_GAP; gap >= MIN_GAP_FLOOR - 1e-9; gap -= 4) {
            for (var tr = 0; tr < 120; tr++) {
                var dots = placeDots(n, W, H, gap, rand);
                if (!dots) continue;
                var ids = kit.shuffle(dots.map(function (d, i) { return i; }), rand).slice(0, k), movers = [], good = true;
                for (var m = 0; m < k && good; m++) {
                    var di = ids[m], found = false;
                    var len = speed * movedTime(k, mt, m, limit);                       /* 整個限時內這一顆總共會走多遠 */
                    for (var a = 0; a < 40 && !found; a++) {
                        var ang = rand() * Math.PI * 2, dx = Math.cos(ang), dy = Math.sin(ang);
                        var s = { x: dots[di].x, y: dots[di].y }, e = { x: s.x + dx * len, y: s.y + dy * len };
                        if (e.x < MARGIN || e.x > W - MARGIN || e.y < MARGIN || e.y > H - MARGIN) continue;
                        var clear = dots.every(function (d, i) { return i === di || ids.indexOf(i) >= 0 && ids.indexOf(i) < m || segDist(d.x, d.y, s.x, s.y, e.x, e.y) >= PATH_CLEAR; });
                        if (!clear) continue;
                        /* 跟前面已經決定好的其他會動圓點的路徑也要夠遠（它們整條路徑 vs 這一條路徑） */
                        for (var p = 0; p < m && clear; p++) {
                            var o = movers[p], oe = { x: o.x0 + o.dx * speed * movedTime(k, mt, p, limit), y: o.y0 + o.dy * speed * movedTime(k, mt, p, limit) };
                            if (segsDist(s, e, { x: o.x0, y: o.y0 }, oe) < PATH_CLEAR) clear = false;
                        }
                        if (!clear) continue;
                        movers.push({ idx: di, dx: dx, dy: dy, x0: s.x, y0: s.y }); found = true;
                    }
                    if (!found) good = false;
                }
                if (good) return { W: W, H: H, dots: dots, movers: movers, speed: speed, moveTime: mt, limitS: limit, gap: gap };
            }
        }
        /* 保底：圓點排成格子，會動的那幾顆在最上面一排往下走（路徑短、一定放得下） */
        var fb = [];
        for (var i = 0; i < n; i++) fb.push({ x: MARGIN + 30 + (i % 5) * 80, y: MARGIN + 30 + Math.floor(i / 5) * 76 });
        var fm = []; for (var j = 0; j < k; j++) fm.push({ idx: j, dx: 0, dy: 1, x0: fb[j].x, y0: fb[j].y });
        return { W: W, H: H, dots: fb, movers: fm, speed: speed, moveTime: mt, limitS: limit, gap: 0 };
    }
    function rating(n) {
        if (n >= 25) return '火眼金睛！';
        if (n >= 15) return '觀察力很強！';
        if (n >= 8) return '不錯喔！';
        if (n >= 3) return '再接再厲！';
        return '盯住整個畫面找不對勁的地方，再來一次！';
    }

    function mount(root, ctx) {
        kit.run(root, ctx, {
            id: ID, G: G, maxLevel: MAX_LEVEL, goodAt: 6,
            numText: function (v) { return v + ' 關'; },
            rating: rating,
            lines: function (S) { return ['通過 ' + S.cleared + ' 關']; },
            setup: setup
        });
    }

    function setup(api) {
        var stage = api.stage, level = api.level;
        var W = stage.clientWidth || 472, H = (stage.clientHeight || 640) - 64;          /* 下面留 64 像素放說明文字 */
        var q = makeLevel(level, W, H, api.rand), k = q.movers.length, moverOf = {};
        q.movers.forEach(function (m, i) { moverOf[m.idx] = i; });
        api.info = q;
        console.log('[誰在偷偷動] 第 ' + level + ' 關：' + q.dots.length + ' 顆圓點，會動的 ' + k + ' 顆（第 ' + q.movers.map(function (m) { return m.idx + 1; }).join('、') + ' 顆），每顆輪流動 ' + q.moveTime + ' 秒，速度 ' + q.speed.toFixed(4) + ' 像素/秒；限時 ' + q.limitS + ' 秒');

        var svg = kit.svg('svg', { 'class': 'snk-svg', viewBox: '0 0 ' + W + ' ' + H, width: W, height: H }, stage);
        var gTrail = kit.svg('g', {}, svg);
        var circles = q.dots.map(function (d) { return kit.svg('circle', { cx: d.x, cy: d.y, r: DOT_R, 'class': 'snk-dot' }, svg); });
        var tip = h('div', { 'class': 'qz-note snk-tip', text: k > 1 ? '有幾個圓點會輪流慢慢移動，找出其中一個！' : '有一個圓點在慢慢移動，找出它！' });
        stage.appendChild(tip);
        var t0 = performance.now();
        function nowSec() { return (performance.now() - t0) / 1000; }
        var loop = api.my.loop(function () {
            if (api.over) return false;
            var t = nowSec();
            q.movers.forEach(function (m, i) { var p = posAt(q, i, t); circles[m.idx].setAttribute('cx', p.x); circles[m.idx].setAttribute('cy', p.y); });
        });
        api.timer(q.limitS * 1000, function () { judge(-1, q.limitS); });
        if (level === 1 && kit.once('sneakmove.hint')) kit.hintOn(stage, null, { mode: 'tap', x: q.movers[0].x0, y: q.movers[0].y0, delay: 800, text: '請點擊正在移動的圓點' });
        /* 點擊：找離手指最近的圓點（在 HIT_R 以內才算點到）；點到任何一顆會動的都算對 */
        kit.onTap(stage, function (e) {
            if (api.over) return;
            var pt = kit.localPt(e, stage), t = nowSec();
            var best = -1, bd = 1e9;
            q.dots.forEach(function (d, i) {
                var p = moverOf[i] != null ? posAt(q, moverOf[i], t) : d, dd = kit.dist(pt.x, pt.y, p.x, p.y);
                if (dd < bd) { bd = dd; best = i; }
            });
            if (bd <= HIT_R) judge(best, t);
        });

        function judge(i, t) {
            if (api.over) return;
            loop.stop();
            t = Math.min(t, q.limitS);
            var lines = [];
            q.movers.forEach(function (m, mi) {
                var p = posAt(q, mi, t), moved = q.speed * movedTime(k, q.moveTime, mi, t);
                circles[m.idx].setAttribute('cx', p.x); circles[m.idx].setAttribute('cy', p.y);
                circles[m.idx].classList.add('snk-dot--mover');
                kit.svg('line', { x1: m.x0, y1: m.y0, x2: p.x, y2: p.y, 'class': 'snk-trail' }, gTrail);
                kit.svg('circle', { cx: m.x0, cy: m.y0, r: 5, 'class': 'snk-start' }, gTrail);
                lines.push('第 ' + (m.idx + 1) + ' 顆漂移了 ' + moved.toFixed(4) + ' 像素');
            });
            var ok = moverOf[i] != null;
            if (i >= 0 && !ok) circles[i].classList.add('snk-dot--wrong');
            tip.textContent = (k > 1 ? '共 ' + k + ' 顆會動，輪流各動 ' + q.moveTime.toFixed(4) + ' 秒；' : '') + '每秒漂移 ' + q.speed.toFixed(4) + ' 像素，' + t.toFixed(4) + ' 秒內：' + lines.join('、');
            if (ok) { kit.flash(stage, true, api.my); api.pass({ delay: 1700 }); return; }
            kit.flash(stage, false, api.my);
            api.fail({
                delay: 2600, lines: [
                    (i < 0 ? '時間到！' : '那一顆是靜止的') + '，會動的是第 ' + q.movers.map(function (m) { return m.idx + 1; }).join('、') + ' 顆（已標出）',
                    '它們每秒漂移 ' + q.speed.toFixed(4) + ' 像素，' + t.toFixed(4) + ' 秒內：' + lines.join('、')
                ]
            });
        }
        api.solve = function () { judge(q.movers[0].idx, nowSec()); };
        api.wrong = function () {
            var still = 0; while (moverOf[still] != null) still++;
            judge(still, nowSec());
        };
    }

    var G = {
        id: ID,
        name: '誰在偷偷動',
        rule: '畫面上有一堆圓點，其中**有幾個會輪流慢慢移動**，其他都不動。一顆動一下就換下一顆，**在限時內點出任何一顆會動的圓點**。越後面，圓點越多、會動的越多、漂移得越慢！會動的圓點越多，限時就越長。點錯或來不及就結束，看你能過幾關。',
        mount: mount,
        score: SCORE,
        test: {
            speedFor: speedFor, dotCountFor: dotCountFor, moverCountFor: moverCountFor, moveTimeFor: moveTimeFor, limitFor: limitFor, segDist: segDist, segsDist: segsDist, movedTime: movedTime, activeAt: activeAt, posAt: posAt, placeDots: placeDots, makeLevel: makeLevel, rating: rating,
            RAMP_LEVELS: RAMP_LEVELS, SPEED: SPEED, TIME_S: TIME_S, N_DOTS: N_DOTS, MOVE_DOTS: MOVE_DOTS, MOVE_TIME: MOVE_TIME, PAUSE_S: PAUSE_S, MIN_GAP: MIN_GAP, MIN_GAP_FLOOR: MIN_GAP_FLOOR, PATH_CLEAR: PATH_CLEAR, MARGIN: MARGIN, HIT_R: HIT_R, MAX_LEVEL: MAX_LEVEL
        }
    };
    Reaction.register(G);
})();
