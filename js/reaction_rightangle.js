/* ═══════════════════════════════════════════════════════════════════
   reaction_rightangle.js — 秒反應・畫成直角
   螢幕下方中間是起點，一條題目線段從起點往左上延伸（角度隨機）；手指從起點往右拖，
   畫出一條和題目線段「垂直」的答案線段。放開手指就是答案，只有一次機會。
   ───────────────────────────────────────────────────────────────────
   · 題目線段方向角 θ（數學角：向右 0°、逆時針為正）在 ANG_MIN～ANG_MAX 度（左上），並避開 135°±AVOID
     （剛好 45° 的角太好猜）；答案方向是 θ − 90°（右上）。
   · 背景有淡淡的斜紋（和題目線夾角 20°～40°），製造方向錯覺。
   · 玩家的線是「起點到手指」的一條直線，可以來回調整，放開才算；長度要 ≥ LEN_MIN。
   · 成績 ＝ 玩家線方向與標準垂線的夾角差（度，越小越好）。
   · 揭曉：標準垂線（綠色虛線）＋玩家的線（橘色）＋直角記號；兩條線的末端距離很近時鏡頭放大（ZOOM）。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var ID = 'rightangle';
    var SCORE = { better: 'min', decimals: 4, format: '{v} 度', label: '角度差', min: 0, max: 180 };
    var h = UI.h, kit = Reaction.kit;

    /* ═══ 可以自己調的參數 ═══ */
    var S = { x: 236, y: 560 };             /* 起點（舞台座標） */
    var Q_LEN = 300;                        /* 題目線段長度（太靠左時會縮短，免得超出畫面） */
    var ANG_MIN = 100, ANG_MAX = 170;       /* 題目線段方向角範圍（度） */
    var AVOID = 8;                          /* 避開 135° 上下幾度 */
    var LEN_MIN = 120;                      /* 玩家的線至少要拖多長（px） */
    var START_R = 60;                       /* 手指要在起點多近的地方按下才算 */
    var ZOOM_REF = 140;                     /* ZOOM 時，兩個末端的距離放大到螢幕上約幾 px */
    var ZOOM_GAP_MAX = 100;                 /* 兩個末端距離超過這個值就不 ZOOM */

    /* ═══ 純函式（也給 Node 測試用）═══ */
    function rad(d) { return d * Math.PI / 180; }
    /* 兩個角度（度）的最短夾角（0～180） */
    function angDiff(a, b) { var d = ((a - b) % 360 + 360) % 360; return d > 180 ? 360 - d : d; }
    /* 有號差：a − b 正規化到 (-180, 180] */
    function signedDiff(a, b) { return ((a - b + 540) % 360) - 180; }
    function makeRound(rand) {
        rand = rand || Math.random;
        var th;
        do { th = kit.randFloat(ANG_MIN, ANG_MAX, rand); } while (Math.abs(th - 135) < AVOID);
        var c = Math.abs(Math.cos(rad(th)));
        var len = Math.min(Q_LEN, (S.x - 24) / Math.max(c, 1e-6));
        var stripe = th + (rand() < 0.5 ? 1 : -1) * kit.randFloat(20, 40, rand);
        return { th: th, ans: th - 90, len: len, stripe: stripe };
    }
    /* 手指位置 → 數學角（度）：y 軸朝下，所以 dy 要反過來 */
    function angleOf(p) { return Math.atan2(S.y - p.y, p.x - S.x) * 180 / Math.PI; }
    function errDeg(thPlayer, ans) { return angDiff(thPlayer, ans); }
    /* ZOOM 倍率：兩個末端（距離起點 R）相距 gap；gap 太大就不 ZOOM（回傳 1） */
    function zoomFor(err, R) {
        var gap = 2 * R * Math.sin(rad(err) / 2);
        if (gap >= ZOOM_GAP_MAX) return 1;
        return kit.clamp(ZOOM_REF / Math.max(gap, 0.05), 1.5, 40);
    }
    function rating(e) {
        if (e < 0.2) return '神乎其技！';
        if (e < 0.7) return '高手！';
        if (e < 2) return '很準！';
        if (e < 5) return '不錯喔！';
        return '再試一次，會更準！';
    }

    function mount(root, ctx) {
        kit.single(root, ctx, {
            id: ID, G: G, better: 'min', max: SCORE.max,
            title: '從起點往右拖，畫出和左上題目線垂直的線',
            numText: function (v) { return v.toFixed(4) + ' 度'; },
            rating: rating,
            sfx: function (v) { return v < 1 ? 'perfect' : (v < 4 ? 'win' : 'fail'); },
            setup: setup
        });
    }

    function setup(api) {
        var stage = api.stage, my = api.my;
        var W = stage.clientWidth || 472, H = stage.clientHeight || 640;
        var cfg = makeRound(), drawing = false, locked = false, hint = null, pid = null, tp = null;
        var s = { x: S.x, y: Math.min(S.y, H - 60) };
        var off = s.y - S.y;       /* 舞台比預設矮時整體上移（座標一律用 S，畫的時候加 off） */
        console.log('[畫成直角] 題目線角度 ' + cfg.th.toFixed(2) + '°，標準垂線 ' + cfg.ans.toFixed(2) + '°');

        var svg = kit.svg('svg', { 'class': 'ra-svg', viewBox: '0 0 ' + W + ' ' + H, width: W, height: H }, stage);
        var full = { vx: 0, vy: 0, vw: W, vh: H };
        /* 背景斜紋 */
        var gBg = kit.svg('g', { transform: 'rotate(' + (-cfg.stripe).toFixed(2) + ' ' + s.x + ' ' + s.y + ')' }, svg);
        for (var k = -14; k <= 14; k++) kit.svg('line', { x1: s.x - 700, x2: s.x + 700, y1: s.y + k * 46, y2: s.y + k * 46, 'class': 'ra-stripe' }, gBg);
        /* 題目線段 */
        var qx = s.x + cfg.len * Math.cos(rad(cfg.th)), qy = s.y - cfg.len * Math.sin(rad(cfg.th));
        kit.svg('line', { x1: s.x, y1: s.y, x2: qx, y2: qy, 'class': 'ra-q' }, svg);
        var gRev = kit.svg('g', {}, svg);
        var mine = kit.svg('line', { x1: s.x, y1: s.y, x2: s.x, y2: s.y, 'class': 'ra-mine' }, svg);
        var dot = kit.svg('circle', { cx: s.x, cy: s.y, r: 13, 'class': 'ra-start' }, svg);
        var msg = h('div', { 'class': 'ra-msg' });
        stage.appendChild(msg);

        /* 操作提示：拖曳（手指從起點往右上來回移動；方向只是示範，不是答案） */
        hint = kit.fingerHint(stage, { mode: 'drag', x: s.x, y: s.y, dx: 90, dy: -30, delay: 300 });
        function hideHint() { if (hint) { hint.remove(); hint = null; } }
        function say(t) { msg.textContent = t; msg.classList.toggle('ra-msg--on', !!t); }
        function pos(e) { var p = kit.localPt(e, stage); return { x: p.x, y: p.y - off }; }

        stage.addEventListener('pointerdown', function (e) {
            if (locked || drawing) return;
            var p = pos(e), dx = p.x - S.x, dy = p.y - S.y;
            if (Math.sqrt(dx * dx + dy * dy) > START_R) { say('請從下方中間的起點開始拖'); return; }
            e.preventDefault();
            try { stage.setPointerCapture(e.pointerId); } catch (err) { }
            drawing = true; pid = e.pointerId; tp = null; hideHint(); say('');
        });
        stage.addEventListener('pointermove', function (e) {
            if (!drawing || e.pointerId !== pid) return;
            tp = pos(e);
            mine.setAttribute('x2', tp.x); mine.setAttribute('y2', tp.y + off);
        });
        function end(e) {
            if (!drawing || e.pointerId !== pid) return;
            drawing = false;
            var len = tp ? Math.sqrt(Math.pow(tp.x - S.x, 2) + Math.pow(tp.y - S.y, 2)) : 0;
            if (!tp || len < LEN_MIN) { say('再拖長一點'); mine.setAttribute('x2', s.x); mine.setAttribute('y2', s.y); tp = null; Sfx.play('bad'); return; }
            submit();
        }
        stage.addEventListener('pointerup', end);
        stage.addEventListener('pointercancel', end);

        function submit() {
            if (locked) return;
            locked = true; hideHint();
            Sfx.play('click');
            var thp = angleOf(tp), real = errDeg(thp, cfg.ans);
            var Rz = 280;
            var ix = s.x + Rz * Math.cos(rad(cfg.ans)), iy = s.y - Rz * Math.sin(rad(cfg.ans));
            var ux = s.x + Rz * Math.cos(rad(thp)), uy = s.y - Rz * Math.sin(rad(thp));
            /* 標準垂線（綠色虛線）、直角記號 */
            kit.svg('line', { x1: s.x, y1: s.y, x2: ix, y2: iy, 'class': 'ra-ideal' }, gRev);
            var a1 = rad(cfg.th), a2 = rad(cfg.ans), m = 34;
            var p1 = { x: s.x + m * Math.cos(a1), y: s.y - m * Math.sin(a1) }, p2 = { x: s.x + m * Math.cos(a2), y: s.y - m * Math.sin(a2) };
            kit.svg('polyline', { points: [p1.x, p1.y, p1.x + p2.x - s.x, p1.y + p2.y - s.y, p2.x, p2.y].map(function (v) { return v.toFixed(1); }).join(','), 'class': 'ra-sq' }, gRev);
            kit.svg('circle', { cx: ix, cy: iy, r: 6, 'class': 'ra-endi' }, gRev);
            kit.svg('circle', { cx: ux, cy: uy, r: 6, 'class': 'ra-endu' }, gRev);
            var side = signedDiff(thp, cfg.ans) > 0 ? '逆時針' : '順時針';
            var z = zoomFor(real, Rz);
            var mid = { x: (ix + ux) / 2, y: (iy + uy) / 2 };
            var done = function () {
                say('差了 ' + real.toFixed(4) + ' 度（你的線偏' + side + '）');
                my.after(2000, function () {
                    api.finish(real, { lines: [
                        '你的線比標準垂線偏' + side + ' ' + real.toFixed(4) + ' 度',
                        '只有一次機會，想拚更準就再挑戰一次'
                    ] });
                });
            };
            my.wait(500).then(function () {
                if (z <= 1) { done(); return; }
                var vw = W / z, vh = H / z;
                var to = { vx: mid.x - vw / 2, vy: mid.y - vh / 2, vw: vw, vh: vh };
                Sfx.play('zoom');
                kit.tweenViewBox(my, svg, full, to, 1100, kit.easeInOutCubic).then(function () { my.after(500, done); });
            });
        }

        function fire(type, x, y) {
            var r = stage.getBoundingClientRect(), sc = r.width / (stage.clientWidth || r.width);
            stage.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 9, clientX: r.left + x * sc, clientY: r.top + (y + off) * sc }));
        }
        function drawAngle(deg, len) {
            len = len || 260;
            fire('pointerdown', S.x, S.y);
            for (var i = 1; i <= 10; i++) fire('pointermove', S.x + len * i / 10 * Math.cos(rad(deg)), S.y - len * i / 10 * Math.sin(rad(deg)));
            fire('pointerup', S.x + len * Math.cos(rad(deg)), S.y - len * Math.sin(rad(deg)));
        }
        G.debug = {
            state: function () { return { cfg: cfg, locked: locked }; },
            drawAngle: drawAngle,
            solve: function () { drawAngle(cfg.ans); },
            wrong: function () { drawAngle(cfg.ans + 20); }
        };
    }

    var G = {
        id: ID,
        name: '畫成直角',
        rule: '畫面下方中間是起點，左上方有一條題目線。手指從起點往右拖，拖出一條和題目線垂直的線，可以來回調整，放開手指就是答案。沒有任何量角器，只有一次機會，目標是 0.0000 度。',
        mount: mount,
        score: SCORE,
        test: { makeRound: makeRound, angleOf: angleOf, errDeg: errDeg, angDiff: angDiff, signedDiff: signedDiff, zoomFor: zoomFor, rating: rating, S: S, ANG_MIN: ANG_MIN, ANG_MAX: ANG_MAX, AVOID: AVOID, Q_LEN: Q_LEN }
    };
    Reaction.register(G);
})();
