/* ═══════════════════════════════════════════════════════════════════
   reaction_sneakmove.js — 秒反應・誰在偷偷動（企劃 152）
   畫面上散著 20 個圓點，其中「有一個」正在極慢地漂移，其他全部靜止，在 6 秒內把它點出來。
   越後面，漂移越慢（每秒 20 像素 → 2 像素）。關卡制：點錯或來不及就結束，成績＝通過幾關。
   ───────────────────────────────────────────────────────────────────
   · 出題（規範 Q1、Q15：先決定結果、再驗證玩家辦得到）：先決定「哪一顆在動、往哪個方向、每秒多快」，
     再排 20 顆圓點的位置：圓點之間至少相距 MIN_GAP；漂移那顆的整條路徑（6 秒走完的線段）要全部在畫面裡，
     而且離其他圓點至少 PATH_CLEAR，不會撞到或擠到別人（那樣會害人看不出來是誰在動）。
   · 漂移位置是時間的純函式：pos(t) ＝ 起點 ＋ 方向 × 速度 × t（規範 T3），畫面只是把它畫出來。
   · 難度線性（RAMP_LEVELS 關走到頂）：漂移速度 SPEED 20 → 2 像素／秒；限時固定 6 秒（企劃指定）。
   · 揭曉：那顆圓點的軌跡畫成一條細線，寫出「漂移了 X.XXXX 像素」（到你點下去的那一刻為止）。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'sneakmove';
    var SCORE = { better: 'max', decimals: 0, format: '{v} 關', label: '關卡', min: 1, max: 60 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var RAMP_LEVELS = 25;                       /* 幾關之後難度到頂 */
    var SPEED = [20, 2];                        /* 漂移速度（像素／秒）：第 1 關 → 到頂 */
    var TIME_S = 6;                             /* 作答限時（秒，企劃指定 6 秒） */
    var N_DOTS = 20;                            /* 圓點個數 */
    var DOT_R = 18;                             /* 圓點畫出來的半徑 */
    var HIT_R = 40;                             /* 命中半徑（比畫出來的大，手指好點） */
    var MIN_GAP = 74;                           /* 任兩顆圓點圓心至少相距多少 */
    var PATH_CLEAR = 52;                        /* 漂移路徑離其他圓點至少多遠 */
    var MARGIN = 34;                            /* 圓點離遊戲區邊緣至少多遠 */
    var MAX_LEVEL = 60;

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function speedFor(level) { return kit.ramp(level, SPEED[0], SPEED[1], RAMP_LEVELS); }
    /* 點 (px,py) 到線段 (ax,ay)-(bx,by) 的最短距離 */
    function segDist(px, py, ax, ay, bx, by) {
        var dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
        var t = l2 === 0 ? 0 : kit.clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1);
        return kit.dist(px, py, ax + t * dx, ay + t * dy);
    }
    /* 漂移那顆在第 t 秒的位置 */
    function posAt(q, t) { return { x: q.x0 + q.dx * q.speed * t, y: q.y0 + q.dy * q.speed * t }; }
    /* 出一關：{ W, H, dots:[{x,y}], mover（漂移的是第幾顆）, dx, dy（單位方向）, speed, x0, y0 } */
    function makeLevel(level, W, H, rand) {
        rand = rand || Math.random;
        var speed = speedFor(level), len = speed * TIME_S;
        for (var tr = 0; tr < 400; tr++) {
            var dots = [], guard = 0;
            while (dots.length < N_DOTS && guard++ < 4000) {
                var x = kit.randFloat(MARGIN, W - MARGIN, rand), y = kit.randFloat(MARGIN, H - MARGIN, rand);
                if (dots.every(function (d) { return kit.dist(x, y, d.x, d.y) >= MIN_GAP; })) dots.push({ x: x, y: y });
            }
            if (dots.length < N_DOTS) continue;
            var mover = kit.randInt(0, N_DOTS - 1, rand);
            /* 挑一個方向，讓整條路徑在畫面內、而且離別的圓點夠遠；試 40 個方向 */
            for (var k = 0; k < 40; k++) {
                var ang = rand() * Math.PI * 2, dx = Math.cos(ang), dy = Math.sin(ang);
                var ex = dots[mover].x + dx * len, ey = dots[mover].y + dy * len;
                if (ex < MARGIN || ex > W - MARGIN || ey < MARGIN || ey > H - MARGIN) continue;
                var clear = dots.every(function (d, i) { return i === mover || segDist(d.x, d.y, dots[mover].x, dots[mover].y, ex, ey) >= PATH_CLEAR; });
                if (!clear) continue;
                return { W: W, H: H, dots: dots, mover: mover, dx: dx, dy: dy, speed: speed, x0: dots[mover].x, y0: dots[mover].y };
            }
        }
        /* 保底：圓點排成格子，漂移那顆在最上面一排往下走 */
        var fb = [];
        for (var i = 0; i < N_DOTS; i++) fb.push({ x: MARGIN + 60 + (i % 5) * 80, y: MARGIN + 40 + Math.floor(i / 5) * 90 });
        return { W: W, H: H, dots: fb, mover: 0, dx: 0, dy: 1, speed: speed, x0: fb[0].x, y0: fb[0].y };
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
        var q = makeLevel(level, W, H, api.rand);
        api.info = q;
        console.log('[誰在偷偷動] 第 ' + level + ' 關：第 ' + (q.mover + 1) + ' 顆在漂移，速度 ' + q.speed.toFixed(4) + ' 像素/秒，方向 (' + q.dx.toFixed(3) + ',' + q.dy.toFixed(3) + ')');

        var svg = kit.svg('svg', { 'class': 'snk-svg', viewBox: '0 0 ' + W + ' ' + H, width: W, height: H }, stage);
        var gTrail = kit.svg('g', {}, svg);
        var circles = q.dots.map(function (d) { return kit.svg('circle', { cx: d.x, cy: d.y, r: DOT_R, 'class': 'snk-dot' }, svg); });
        var tip = h('div', { 'class': 'qz-note snk-tip', text: '有一個圓點在慢慢移動，找出它！' });
        stage.appendChild(tip);
        var t0 = performance.now();
        var loop = api.my.loop(function () {
            if (api.over) return false;
            var p = posAt(q, (performance.now() - t0) / 1000);
            circles[q.mover].setAttribute('cx', p.x); circles[q.mover].setAttribute('cy', p.y);
        });
        api.timer(TIME_S * 1000, function () { judge(-1, TIME_S); });
        if (level === 1 && kit.once('sneakmove.hint')) kit.hintOn(stage, null, { mode: 'tap', x: q.x0, y: q.y0, delay: 800, text: '請點擊正在移動的圓點' });
        /* 點擊：找離手指最近的圓點（在 HIT_R 以內才算點到） */
        kit.onTap(stage, function (e) {
            if (api.over) return;
            var pt = kit.localPt(e, stage), t = (performance.now() - t0) / 1000;
            var best = -1, bd = 1e9;
            q.dots.forEach(function (d, i) {
                var p = i === q.mover ? posAt(q, t) : d, dd = kit.dist(pt.x, pt.y, p.x, p.y);
                if (dd < bd) { bd = dd; best = i; }
            });
            if (bd <= HIT_R) judge(best, t);
        });

        function judge(i, t) {
            if (api.over) return;
            loop.stop();
            t = Math.min(t, TIME_S);
            var p = posAt(q, t), moved = q.speed * t;
            circles[q.mover].setAttribute('cx', p.x); circles[q.mover].setAttribute('cy', p.y);
            circles[q.mover].classList.add('snk-dot--mover');
            kit.svg('line', { x1: q.x0, y1: q.y0, x2: p.x, y2: p.y, 'class': 'snk-trail' }, gTrail);
            kit.svg('circle', { cx: q.x0, cy: q.y0, r: 5, 'class': 'snk-start' }, gTrail);
            var ok = i === q.mover;
            if (i >= 0 && !ok) circles[i].classList.add('snk-dot--wrong');
            tip.textContent = '那一顆每秒漂移 ' + q.speed.toFixed(4) + ' 像素，' + (t >= TIME_S ? '6 秒' : t.toFixed(4) + ' 秒') + '內漂移了 ' + moved.toFixed(4) + ' 像素';
            if (ok) { kit.flash(stage, true, api.my); api.pass({ delay: 1700 }); return; }
            kit.flash(stage, false, api.my);
            api.fail({ delay: 2600, lines: [
                (i < 0 ? '時間到！' : '那一顆是靜止的') + '，在漂移的是第 ' + (q.mover + 1) + ' 顆（已標出）',
                '它每秒漂移 ' + q.speed.toFixed(4) + ' 像素，' + t.toFixed(4) + ' 秒漂移了 ' + moved.toFixed(4) + ' 像素'
            ] });
        }
        api.solve = function () { judge(q.mover, (performance.now() - t0) / 1000); };
        api.wrong = function () { judge((q.mover + 1) % N_DOTS, (performance.now() - t0) / 1000); };
    }

    var G = {
        id: ID,
        name: '誰在偷偷動',
        rule: '畫面上有 20 個圓點，其中有一個正在極慢地漂移，其他都不動。在 6 秒內把它點出來。點錯或來不及就結束，看你能過幾關。越後面，漂移得越慢，越難察覺！',
        mount: mount,
        score: SCORE,
        test: {
            speedFor: speedFor, segDist: segDist, posAt: posAt, makeLevel: makeLevel, rating: rating,
            RAMP_LEVELS: RAMP_LEVELS, SPEED: SPEED, TIME_S: TIME_S, N_DOTS: N_DOTS, MIN_GAP: MIN_GAP, PATH_CLEAR: PATH_CLEAR, MARGIN: MARGIN, HIT_R: HIT_R, MAX_LEVEL: MAX_LEVEL
        }
    };
    Reaction.register(G);
})();
